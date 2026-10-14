locals {
  uploads_bucket = "${var.name_prefix}-uploads-${data.aws_caller_identity.current.account_id}"
  results_bucket = "${var.name_prefix}-results-${data.aws_caller_identity.current.account_id}"
  result_days    = max(1, ceil(var.result_ttl_sec / 86400))
}

resource "aws_s3_bucket" "uploads" {
  bucket = local.uploads_bucket
}

resource "aws_s3_bucket" "results" {
  bucket = local.results_bucket
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each = { uploads = aws_s3_bucket.uploads.id, results = aws_s3_bucket.results.id }

  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = { uploads = aws_s3_bucket.uploads.id, results = aws_s3_bucket.results.id }

  bucket = each.value
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = { uploads = aws_s3_bucket.uploads.id, results = aws_s3_bucket.results.id }

  bucket = each.value
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# The expiry that replaces the old per-file timer: S3 deletes every object after the TTL,
# even if nothing is running. The worker deletes uploads on success; this is the backstop.
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "expire-uploads"
    status = "Enabled"
    filter {}
    expiration {
      days = 1
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "results" {
  bucket = aws_s3_bucket.results.id

  rule {
    id     = "expire-results"
    status = "Enabled"
    filter {}
    expiration {
      days = local.result_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "tls_only" {
  for_each = { uploads = aws_s3_bucket.uploads.arn, results = aws_s3_bucket.results.arn }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [each.value, "${each.value}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "tls_only" {
  for_each = { uploads = aws_s3_bucket.uploads.id, results = aws_s3_bucket.results.id }

  bucket     = each.value
  policy     = data.aws_iam_policy_document.tls_only[each.key].json
  depends_on = [aws_s3_bucket_public_access_block.this]
}
