terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    fastly = {
      source  = "fastly/fastly"
      version = ">=5.12.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "project" {}

data "google_secret_manager_secret_version" "stripe_key" {
  secret  = "stripe-secret-key"
  version = "latest"
}

provider "fastly" {
  # No api_key line here. It will pull from your shell's FASTLY_API_KEY
}
