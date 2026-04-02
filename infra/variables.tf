variable "gcp_project_id" {
  description = "The ID of your Google Cloud Project"
  type        = string
}

variable "fastly_api_key" {
  description = "Your Fastly API Key"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "The primary production domain"
  type        = string
  default     = "www.3dogsandafrog.com"
}
