# AgentOps telemetry infrastructure (Build 3) — reconciled into Terraform.
# NOTE: the BigQuery table schema is intentionally NOT managed here. Columns
# evolve via bq/console migrations (that's how client_country was added).
# Terraform owns resource existence; schema drift is ignored to avoid churn.

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
  account_id = "fastly-logging"
  project    = var.project_id
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
