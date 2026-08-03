variable "project_id" {
  type        = string
  description = "The GCP Project ID"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "zone" {
  type    = string
  default = "us-central1-c"
}

variable "machine_type" {
  type    = string
  default = "e2-micro"
}

variable "app_image" {
  type        = string
  description = "The full Docker image path"
  default     = "us-central1-docker.pkg.dev/three-dogs-frog-store/retail-repo/retail-app-image"
}

variable "domain_name" {
  type    = string
  default = "3dogsandafrog.com"
}

variable "node_env" {
  type        = string
  default     = "production"
  description = "Switch between 'production' and 'development'"
}

variable "billing_account_id" {
  description = "The GCP Billing Account ID for budget alerts"
  type        = string
  sensitive   = true
}

# --- Fastly Edge Authentication Secret ---
variable "demo_auth_base64_secret" {
  description = "Base64 encoded string of username:password for Enterprise Demos"
  type        = string
  sensitive   = true
}
