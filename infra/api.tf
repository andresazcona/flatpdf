# API: the same Express app as a container on ECS Fargate behind an ALB.
# Not API Gateway + Lambda: uploads go up to MAX_UPLOAD_MB (20 by default) in one multipart request,
# and API Gateway caps payloads at 10 MB (6 MB for a synchronous Lambda invoke).

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.name_prefix}-api"
  retention_in_days = 14
}

resource "aws_ssm_parameter" "api_keys" {
  name        = "/${var.name_prefix}/api-key-sha256"
  description = "SHA-256 digests of the accepted API keys"
  type        = "SecureString"
  value       = var.api_key_sha256
}

resource "aws_ecs_cluster" "main" {
  name = var.name_prefix
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: what ECS itself needs to start the task (pull image, write logs, read the secret).
resource "aws_iam_role" "api_execution" {
  name               = "${var.name_prefix}-api-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "api_execution" {
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    resources = [aws_ecr_repository.api.arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }
  statement {
    actions   = ["ssm:GetParameters"]
    resources = [aws_ssm_parameter.api_keys.arn]
  }
}

resource "aws_iam_role_policy" "api_execution" {
  name   = "execution"
  role   = aws_iam_role.api_execution.id
  policy = data.aws_iam_policy_document.api_execution.json
}

# Task role: what the application code may do. It queues work and reads results; it never
# reads uploads and cannot delete anything.
resource "aws_iam_role" "api_task" {
  name               = "${var.name_prefix}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "api_task" {
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }
  statement {
    sid       = "JobRecordsAndPresign"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.results.arn}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.results.arn]
  }
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.jobs.arn]
  }
}

resource "aws_iam_role_policy" "api_task" {
  name   = "task"
  role   = aws_iam_role.api_task.id
  policy = data.aws_iam_policy_document.api_task.json
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024 # an upload is buffered in memory, up to MAX_UPLOAD_MB
  execution_role_arn       = aws_iam_role.api_execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{ containerPort = 3000, protocol = "tcp" }]

    environment = concat(
      [for k, v in local.app_env : { name = k, value = v }],
      [
        { name = "PORT", value = "3000" },
        { name = "AWS_REGION", value = var.region },
      ],
    )
    secrets = [{ name = "API_KEY_SHA256", valueFrom = aws_ssm_parameter.api_keys.arn }]

    readonlyRootFilesystem = true
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_lb" "api" {
  name                       = "${var.name_prefix}-api"
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "api" {
  name        = "${var.name_prefix}-api"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  deregistration_delay = 30

  health_check {
    path                = "/healthz"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  count = var.certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.certificate_arn == "" ? [] : [1]
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = var.certificate_arn == "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.api.arn
    }
  }
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = 30

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http, aws_iam_role_policy.api_execution, aws_iam_role_policy.api_task]
}
