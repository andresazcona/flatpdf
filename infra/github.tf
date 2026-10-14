# GitHub Actions deploys through OIDC: no long-lived keys exist anywhere. The role can be assumed
# only by workflows of var.github_repo running on main. Create it once from an admin session
# (terraform apply), then set the AWS_ROLE_ARN repository variable to the output.

locals {
  oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  prefix_arn        = "${var.name_prefix}-*"
  account           = data.aws_caller_identity.current.account_id
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${var.name_prefix}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

# Scoped to this stack wherever the service supports resource-level permissions: resources named
# with the project prefix. EC2/ELB/ECS actions are listed by name because their create calls do not
# support resource scoping; they cannot touch IAM or data.
data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid = "ScopedByName"
    actions = [
      "s3:*",
      "sqs:*",
      "ecr:*",
      "lambda:*",
      "logs:*",
      "ssm:*",
      "sns:*",
    ]
    resources = [
      "arn:aws:s3:::${local.prefix_arn}",
      "arn:aws:s3:::${local.prefix_arn}/*",
      "arn:aws:sqs:*:${local.account}:${local.prefix_arn}",
      "arn:aws:ecr:*:${local.account}:repository/${local.prefix_arn}",
      "arn:aws:lambda:*:${local.account}:function:${local.prefix_arn}",
      "arn:aws:lambda:*:${local.account}:event-source-mapping:*",
      "arn:aws:logs:*:${local.account}:log-group:*${var.name_prefix}*",
      "arn:aws:ssm:*:${local.account}:parameter/${var.name_prefix}/*",
      "arn:aws:sns:*:${local.account}:${local.prefix_arn}",
    ]
  }

  statement {
    sid       = "IamForThisStackOnly"
    actions   = ["iam:*Role*", "iam:*RolePolicy*", "iam:*OpenIDConnectProvider*", "iam:TagRole"]
    resources = ["arn:aws:iam::${local.account}:role/${local.prefix_arn}", "arn:aws:iam::${local.account}:oidc-provider/token.actions.githubusercontent.com"]
  }

  statement {
    sid       = "PassOnlyThisStackRoles"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.account}:role/${local.prefix_arn}"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com", "ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid = "NetworkAndCompute"
    actions = [
      "ec2:*Vpc*", "ec2:*Subnet*", "ec2:*SecurityGroup*", "ec2:*InternetGateway*", "ec2:*RouteTable*", "ec2:*Route",
      "ec2:*Tags", "ec2:Describe*", "ec2:AttachInternetGateway", "ec2:DetachInternetGateway",
      "ec2:AssociateRouteTable", "ec2:DisassociateRouteTable", "ec2:ModifyVpcAttribute",
      "elasticloadbalancing:*", "ecs:*", "cloudwatch:*", "application-autoscaling:*",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "TerraformState"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = ["arn:aws:s3:::*-terraform-state-*", "arn:aws:s3:::*-terraform-state-*/flatpdf/*"]
  }

  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken", "sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
