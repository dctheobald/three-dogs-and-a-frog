# AgentOps telemetry plane — split OUT of the CI-applied infra/ stack so that
# github-actions-deployer no longer needs project-level IAM / serviceAccountAdmin /
# BigQuery grants. These are static, set-once resources; applied MANUALLY with
# Owner creds:   cd infra/telemetry && terraform init && terraform apply
# State: gs://three-dogs-tf-state/terraform/telemetry
# NOTE: BigQuery table schema is intentionally NOT managed here (evolves via bq/console).

terraform {
  backend "gcs" {
    bucket = "three-dogs-tf-state"
    prefix = "terraform/telemetry"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project               = var.project_id
  user_project_override = true
  billing_project       = var.project_id
}

variable "project_id" {
  type        = string
  description = "The GCP Project ID"
}

resource "google_bigquery_dataset" "agentops" {
  dataset_id = "agentops"
  project    = var.project_id
  location   = "US"
}

resource "google_bigquery_table" "edge_requests" {
  dataset_id          = google_bigquery_dataset.agentops.dataset_id
  table_id            = "edge_requests"
  project             = var.project_id
  deletion_protection = true

  lifecycle {
    ignore_changes = [schema]
  }
}

resource "google_service_account" "fastly_logging" {
  account_id   = "fastly-logging"
  project      = var.project_id
  display_name = "Fastly BigQuery logging (AgentOps)"
}

resource "google_project_iam_member" "fastly_logging_bq_editor" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.fastly_logging.email}"
}

resource "google_service_account_iam_member" "fastly_impersonation" {
  service_account_id = google_service_account.fastly_logging.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:fastly-logging@datalog-bulleit-9e86.iam.gserviceaccount.com"
}
