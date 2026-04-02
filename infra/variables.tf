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
}

variable "domain_name" {
  type        = string
  default     = "3dogsandafrog.com"
}

variable "node_env" {
  type        = string
  default     = "production"
  description = "Switch between 'production' and 'development'"
}
