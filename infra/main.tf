# 1. The Google Cloud VM (Origin)
 resource "google_compute_instance" "retail_origin" {
  name                      = "three-dog-one-frog-demo"
  machine_type              = "e2-micro"
  allow_stopping_for_update = true

  # This tells GCP this is a Container VM
  metadata = {
    gce-container-declaration = "spec:\n  containers:\n    - name: retail-app\n      image: gcr.io/${var.gcp_project_id}/retail-app:latest\n      ports:\n        - containerPort: 8080\n      restartPolicy: Always\n  volumes: []\n"
  }

  boot_disk {
    initialize_params {
      image = "cos-cloud/cos-stable"
    }
  }

  network_interface {
    network = "default"
    access_config {}
  }

  tags = ["http-server", "https-server"]
}

# 2. The Fastly CDN (Edge)
resource "fastly_service_vcl" "retail_cdn" {
  name = "3 Dogs and a Frog CDN (Terraform)"

  lifecycle {
    ignore_changes = [
      domain
    ]
  }

  # The WWW Domain
  domain {
    name = "www.3dogsandafrog.com"
  }

  # The Apex Domain (Missing from original code)
  domain {
    name = "3dogsandafrog.com"
  }

  backend {
    # Dynamically grabs the IP from the GCP resource above
    address           = google_compute_instance.retail_origin.network_interface.0.access_config.0.nat_ip
    name              = "GCP Origin"
    port              = 443
    use_ssl           = true
    ssl_cert_hostname = var.domain_name
    ssl_sni_hostname  = var.domain_name
    override_host     = var.domain_name
  }

  # Force Cache Rule
  request_setting {
    name          = "Force Cache for Frontend"
    action        = "lookup"
    max_stale_age = 3600
    force_miss    = false
  }

  condition {
    name      = "Only Cache GET Requests"
    statement = "req.request == \"GET\""
    type      = "REQUEST"
  }
}
