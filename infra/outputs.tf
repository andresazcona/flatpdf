output "api_url" {
  description = "Base URL of the API"
  value       = "${var.certificate_arn == "" ? "http" : "https"}://${aws_lb.api.dns_name}"
}

output "api_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "worker_repository_url" {
  value = aws_ecr_repository.worker.repository_url
}

output "jobs_queue_url" {
  value = aws_sqs_queue.jobs.url
}

output "dlq_url" {
  value = aws_sqs_queue.dlq.url
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.id
}

output "results_bucket" {
  value = aws_s3_bucket.results.id
}

output "github_deploy_role_arn" {
  description = "Set this as the AWS_ROLE_ARN repository variable to enable the CI deploy job"
  value       = aws_iam_role.github_deploy.arn
}
