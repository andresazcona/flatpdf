# Worker: SQS-triggered Lambda running the container image from ECR. A container image
# (not a zip) because @napi-rs/canvas ships a native binary and pdfjs needs its font and
# cmap assets next to it; the Dockerfile worker target bundles both and stays well under 10 GB.

locals {
  app_env = {
    QUEUE_URL      = aws_sqs_queue.jobs.url
    UPLOADS_BUCKET = aws_s3_bucket.uploads.id
    RESULTS_BUCKET = aws_s3_bucket.results.id
    RESULT_TTL_SEC = tostring(var.result_ttl_sec)
    URL_TTL_SEC    = tostring(var.url_ttl_sec)
    MAX_PAGES      = tostring(var.max_pages)
    DPI            = tostring(var.dpi)
    MAX_ATTEMPTS   = "3" # equals maxReceiveCount on the queue
  }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${var.name_prefix}-worker"
  retention_in_days = 14
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "${var.name_prefix}-worker"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "worker" {
  statement {
    sid       = "ReadAndDeleteUploads"
    actions   = ["s3:GetObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }
  statement {
    sid       = "ReadAndWriteResults"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.results.arn}/*"]
  }
  statement {
    sid       = "ListForNoSuchKey" # without it S3 answers 403 instead of 404 for a missing key
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.uploads.arn, aws_s3_bucket.results.arn]
  }
  statement {
    sid       = "ConsumeJobs"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.jobs.arn]
  }
  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.worker.arn}:*"]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "worker"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}

resource "aws_lambda_function" "worker" {
  function_name = "${var.name_prefix}-worker"
  role          = aws_iam_role.worker.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.worker.repository_url}:${var.image_tag}"
  architectures = ["x86_64"]
  memory_size   = var.worker_memory_mb
  timeout       = var.worker_timeout_sec

  # Reserved concurrency caps parallel renders, so a flood of uploads queues instead of
  # exhausting the account concurrency pool or the bill.
  reserved_concurrent_executions = var.worker_max_concurrency

  environment {
    variables = local.app_env
  }

  depends_on = [aws_cloudwatch_log_group.worker, aws_iam_role_policy.worker]
}

resource "aws_lambda_event_source_mapping" "jobs" {
  event_source_arn        = aws_sqs_queue.jobs.arn
  function_name           = aws_lambda_function.worker.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = max(2, var.worker_max_concurrency)
  }
}
