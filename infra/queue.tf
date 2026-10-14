resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name_prefix}-jobs-dlq"
  message_retention_seconds = 1209600 # 14 days to investigate
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "jobs" {
  name                       = "${var.name_prefix}-jobs"
  visibility_timeout_seconds = var.worker_timeout_sec * 6 # AWS guidance for Lambda event sources
  message_retention_seconds  = 86400
  sqs_managed_sse_enabled    = true

  # maxReceiveCount matches MAX_ATTEMPTS=3 in the app: the third failed attempt marks the job failed
  # and the message moves to the DLQ.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.jobs.arn]
  })
}
