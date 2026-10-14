variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix for resource names. The deploy role IAM policy is scoped to this prefix."
  type        = string
  default     = "flatpdf"
}

variable "image_tag" {
  description = "Tag of the api and worker images in ECR (the CI deploy job passes the commit SHA)."
  type        = string
}

variable "api_key_sha256" {
  description = "Comma-separated SHA-256 hex digests of the accepted API keys. Stored as an SSM SecureString."
  type        = string
  sensitive   = true
}

variable "certificate_arn" {
  description = "ACM certificate for the ALB. Empty serves plain HTTP on :80, which is for evaluation only."
  type        = string
  default     = ""
}

variable "allowed_cidrs" {
  description = "Source ranges allowed to reach the API load balancer."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "alarm_email" {
  description = "Email subscribed to the alarm topic. Empty creates the topic without a subscriber."
  type        = string
  default     = ""
}

variable "result_ttl_sec" {
  description = "Job and result lifetime. The S3 lifecycle rule deletes objects after ceil(ttl / 1 day) days."
  type        = number
  default     = 3600
}

variable "url_ttl_sec" {
  description = "Lifetime of each presigned download URL."
  type        = number
  default     = 900
}

variable "max_pages" {
  type    = number
  default = 50
}

variable "dpi" {
  type    = number
  default = 150
}

variable "worker_memory_mb" {
  description = "Rendering is CPU bound; Lambda gives CPU in proportion to memory (about 1.1 vCPU at 2 GB)."
  type        = number
  default     = 2048
}

variable "worker_timeout_sec" {
  type    = number
  default = 120
}

variable "worker_max_concurrency" {
  description = "Cap on parallel worker invocations (reserved concurrency). Bounds cost and blast radius."
  type        = number
  default     = 5
}

variable "api_desired_count" {
  type    = number
  default = 1
}

variable "github_repo" {
  description = "owner/name of the repository allowed to assume the deploy role through GitHub OIDC."
  type        = string
  default     = "andresazcona/flatpdf"
}

variable "create_github_oidc_provider" {
  description = "Set to false if the account already has the token.actions.githubusercontent.com provider."
  type        = bool
  default     = true
}
