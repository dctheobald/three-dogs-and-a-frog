# 0. Tell Terraform to grab state from Google Storage bucket
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
      -e STRIPE_SECRET_KEY="${data.google_secret_manager_secret_version.stripe_key.secret_data}" \
      -e PORT="3000" \
      -e NODE_ENV="${var.node_env}" \
      $APP_IMAGE
        
      docker run -d --name caddy-ssl --network frog-net --restart always -p 443:443 \
        caddy:alpine caddy reverse-proxy --from https://www.${var.domain_name} --to http://retail-app:3000 --internal-certs
    EOT
  }
 
   lifecycle {
     ignore_changes = [
       metadata["app_image"],
     ]
   }
}

# 2. THE FASTLY SERVICE (Edge Compute & Security)
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

  # --- NEW: Secure Dictionary for Demo Auth ---
  dictionary {
    name       = "demo_auth_secrets_v2"
  }

  # --- NEW: Intercept /scenarios logic ---
  snippet {
    name     = "require-demo-auth"
    type     = "recv"
    priority = 90
    content  = <<EOF
  if (req.url ~ "^/scenarios") {
    declare local var.expected_auth STRING;
    set var.expected_auth = "Basic " + table.lookup(demo_auth_secrets_v2, "demo_credentials");

    if (!req.http.Authorization || req.http.Authorization != var.expected_auth) {
      error 401 "Restricted Demo";
    }
  }
EOF
  }

  # --- NEW: Generate basic auth prompt ---
  snippet {
    name     = "demo-auth-challenge"
    type     = "error"
    priority = 90
    content  = <<EOF
  if (obj.status == 401 && obj.response == "Restricted Demo") {
    set obj.http.WWW-Authenticate = "Basic realm=""Enterprise Demos""";
    set obj.http.Content-Type = "text/plain";
    synthetic {"Authentication required to access Enterprise Demos."};
    return (deliver);
  }
EOF
  }

  # Standard HTTPS redirection
  snippet {
    name     = "force-https-and-www"
    type     = "recv"
    priority = 10
    content  = <<EOF
  if (!req.http.Fastly-SSL || req.http.host == "${var.domain_name}") {
    set req.http.X-Forwarded-Host = "www.${var.domain_name}";
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
    # Use the forwarded host we just set, ensuring HTTPS
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

  force_destroy = true
}

# --- NEW: Populate the Fastly Edge Dictionary ---
resource "fastly_service_dictionary_items" "demo_secrets_items" {
  for_each = {
    for d in fastly_service_vcl.retail_fastly.dictionary : d.name => d if d.name == "demo_auth_secrets_v2"
  }

  service_id    = fastly_service_vcl.retail_fastly.id
  dictionary_id = each.value.dictionary_id
  manage_items  = true

  items = {
    "demo_credentials" = var.demo_auth_base64_secret 
  }
}

# 3. DOMAINS AND ROUTING
resource "fastly_domain" "apex" {
  fqdn = var.domain_name

  lifecycle {
    ignore_changes = [service_id]
  }
}

resource "fastly_domain" "www" {
  fqdn = "www.${var.domain_name}"

  lifecycle {
    ignore_changes = [service_id]
  }
}

resource "fastly_domain_service_link" "apex_link" {
  domain_id  = fastly_domain.apex.id
  service_id = fastly_service_vcl.retail_fastly.id
}

resource "fastly_domain_service_link" "www_link" {
  domain_id  = fastly_domain.www.id
  service_id = fastly_service_vcl.retail_fastly.id
}
