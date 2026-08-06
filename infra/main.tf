# Build GCP and Fastly Infra
terraform {
  backend "gcs" {
    bucket  = "three-dogs-tf-state"
    prefix  = "terraform/state"
  }
}

# 1. THE GCP VM (Origin Server)
resource "google_compute_instance" "retail_origin" {
  name         = "three-dog-one-frog-prod"
  machine_type = var.machine_type
  zone         = var.zone
  tags         = ["http-server", "https-server"]

  boot_disk {
    initialize_params {
      image = "cos-cloud/cos-stable"
    }
  }

  network_interface {
    network = "default"
    access_config {}
  }

  service_account {
    email  = "${data.google_project.project.number}-compute@developer.gserviceaccount.com"
    scopes = ["cloud-platform"]
  }

  metadata = {
    app_image = var.app_image
    
    startup-script = <<-EOT
      #!/bin/bash
      export DOCKER_CONFIG=/tmp/.docker
      mkdir -p $DOCKER_CONFIG
      docker-credential-gcr configure-docker --registries="us-central1-docker.pkg.dev"
      docker network create frog-net || true
      docker rm -f retail-app || true
      docker rm -f caddy-ssl || true
      APP_IMAGE=$(curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/attributes/app_image)
      docker run -d --name retail-app --network frog-net --restart always \
      --env DOTENVX_IGNORE=true \
      -e STRIPE_SECRET_KEY="${data.google_secret_manager_secret_version.stripe_key.secret_data}" \
      -e GCP_PROJECT_ID="${var.project_id}" \
      -e PORT="3000" \
      -e NODE_ENV="${var.node_env}" \
      $APP_IMAGE 
      docker run -d --name caddy-ssl --network frog-net --restart always -p 443:443 \
        caddy:alpine caddy reverse-proxy --from https://www.${var.domain_name} --to http://retail-app:3000 --internal-certs
    EOT
  }

  lifecycle {
    ignore_changes = [metadata["app_image"]]
  }
}

# 2. THE FASTLY SERVICE
resource "fastly_service_vcl" "retail_fastly" {
  name = "three-dogs-frog-store-production"

  backend {
    address          = google_compute_instance.retail_origin.network_interface[0].access_config[0].nat_ip
    name             = "gcp-origin-secure"
    port             = 443
    use_ssl          = true
    ssl_check_cert   = false
    ssl_sni_hostname = "www.${var.domain_name}"
  }

  rate_limiter {
    name                 = "three-dogs-rate-limiter"
    action               = "response"
    penalty_box_duration = 60
    rps_limit            = 100
    window_size          = 1
    http_methods         = "GET,POST"
    client_key           = "req.http.Fastly-Client-IP"

    # Define the response inline to avoid creation order dependencies
    response {
      status       = 429
      content_type = "application/json"
      content      = jsonencode({
        error = "Ribbit... The Wise Frog is taking a break!"
      })
    }
  }

  # --- RECONCILED (v9): Bot Management + ContentGuard, declaratively managed ---
  product_enablement {
    bot_management {
      enabled      = true
      contentguard = "on"
    }
  }

  snippet {
    name     = "force-https-and-www"
    type     = "recv"
    priority = 10
    content  = <<EOF
      if (!req.http.Fastly-SSL || req.http.host == "${var.domain_name}") {
        set req.http.X-Forwarded-Host = "www.${var.domain_name}";
        set req.http.X-Frog-Class = "redirect";
        error 802 "Redirect to Secure WWW";
      }
EOF
  }

  snippet {
    name     = "redirect-logic"
    type     = "error"
    priority = 100
    content  = <<EOF
      if (obj.status == 802) {
        set obj.status = 301;
        set obj.http.Location = "https://" + req.http.X-Forwarded-Host + req.url;
        return(deliver);
      }
EOF
  }

  snippet {
    name     = "force-cache-static-assets"
    type     = "fetch"
    priority = 100
    content  = <<EOF
      if (req.url.ext ~ "^(jpg|jpeg|gif|png|webp|svg|css|js|JPG|JPEG|PNG)$") {
        unset beresp.http.Set-Cookie;
        unset beresp.http.Vary;
        set beresp.ttl = 86400s;
        set beresp.http.Cache-Control = "public, max-age=86400";
        return(deliver);
      }
EOF
  }

  snippet {
    name     = "The Threat Detection"
    type     = "recv"
    priority = 50
    content  = <<EOT
      if (req.url ~ "(?i)(%27)|(\')|(--)|(%23)|(#)") {
        error 403 "Forbidden";
      }
EOT
  }

  snippet {
    name     = "The Custom Block Page"
    type     = "error"
    priority = 50
    content  = <<EOT
      if (obj.status == 403 && obj.response == "Forbidden") {
        set obj.http.Content-Type = "text/html; charset=utf-8";
        synthetic {"<!DOCTYPE html><html><head><title>WAF Block</title></head><body style='background-color:#ffebee; text-align:center; padding:50px; font-family:sans-serif;'><h1>🚨 THREAT NEUTRALIZED AT THE EDGE 🚨</h1><p>The Fastly Web Application Firewall has blocked this request due to malicious SQL injection patterns.</p></body></html>"};
        return (deliver);
      }
EOT
  }

  # --- RECONCILED: Build 1 classification snippet (live since v56) ---
  snippet {
    name     = "frog-classify"
    type     = "recv"
    priority = 5
    content  = file("${path.module}/vcl/frog-classify.vcl")
  }

  # --- RECONCILED: Build 3 telemetry endpoint (impersonation auth, no stored key) ---
  # --- Build 2: Runtime Governance -- differential enforcement on X-Frog-Class ---
  snippet {
    name     = "frog-govern-init"
    type     = "init"
    priority = 100
    content  = file("${path.module}/vcl/frog-govern-init.vcl")
  }

  snippet {
    name     = "frog-govern"
    type     = "recv"
    priority = 30
    content  = file("${path.module}/vcl/frog-govern.vcl")
  }

  snippet {
    name     = "frog-govern-error"
    type     = "error"
    priority = 30
    content  = file("${path.module}/vcl/frog-govern-error.vcl")
  }

  snippet {
    name     = "frog-govern-deliver"
    type     = "deliver"
    priority = 30
    content  = file("${path.module}/vcl/frog-govern-deliver.vcl")
  }

  dictionary {
    name = "frog_config"
  }

  dictionary {
    name = "frog_catalog"
  }

  snippet {
    name     = "frog-agent-recv"
    type     = "recv"
    priority = 15
    content  = file("${path.module}/vcl/frog-agent-recv.vcl")
  }

  snippet {
    name     = "frog-agent-error"
    type     = "error"
    priority = 20
    content  = file("${path.module}/vcl/frog-agent-error.vcl")
  }

  logging_bigquery {
    name           = "agentops-bq"
    project_id     = var.project_id
    dataset        = "agentops"
    table          = "edge_requests"
    account_name   = "fastly-logging"
    format         = file("${path.module}/logging/bq-logformat.json")
  }
  
  force_destroy = true
}

# 3. DOMAINS
resource "fastly_domain" "apex" {
  fqdn = var.domain_name
  lifecycle { ignore_changes = [service_id] }
}

resource "fastly_domain" "www" {
  fqdn = "www.${var.domain_name}"
  lifecycle { ignore_changes = [service_id] }
}

resource "fastly_domain_service_link" "apex_link" {
  domain_id  = fastly_domain.apex.id
  service_id = fastly_service_vcl.retail_fastly.id
}

resource "fastly_domain_service_link" "www_link" {
  domain_id  = fastly_domain.www.id
  service_id = fastly_service_vcl.retail_fastly.id
}

# 4. LAYER 2: GCP BILLING BUDGET
data "google_billing_account" "account" {
  billing_account = var.billing_account_id
}

resource "google_billing_budget" "agent_budget" {
  billing_account = data.google_billing_account.account.id
  display_name    = "3 Dogs AI Agent Safeguard"
  budget_filter { projects = ["projects/${data.google_project.project.number}"] }
  amount {
    specified_amount {
      currency_code = "USD"
      units         = "10"
    }
  }
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
}

resource "fastly_service_dictionary_items" "frog_config_items" {
  for_each = {
    for d in fastly_service_vcl.retail_fastly.dictionary : d.name => d if d.name == "frog_config"
  }
  service_id    = fastly_service_vcl.retail_fastly.id
  dictionary_id = each.value.dictionary_id
  items = {
    "enforce" = "false"
  }
  manage_items = false
}

locals {
  catalog_full  = jsondecode(file("${path.module}/../data/products.json"))
  catalog_agent = [for p in local.catalog_full : {
    id        = p.id
    name      = p.name
    price     = p.price
    currency  = p.currency
    in_stock  = p.stock_qty > 0
    stock_qty = p.stock_qty
    image     = "https://www.3dogsandafrog.com${p.image}"
  }]
}

resource "fastly_service_dictionary_items" "frog_catalog_items" {
  for_each = {
    for d in fastly_service_vcl.retail_fastly.dictionary : d.name => d if d.name == "frog_catalog"
  }
  service_id    = fastly_service_vcl.retail_fastly.id
  dictionary_id = each.value.dictionary_id
  manage_items  = true
  items = {
    catalog = jsonencode(local.catalog_agent)
  }
}
