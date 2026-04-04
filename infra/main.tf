# 1. THE GCP VM
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
      # 1. Point Docker to a writable directory on Container-Optimized OS
      export DOCKER_CONFIG=/tmp/.docker
      mkdir -p $DOCKER_CONFIG

      # 2. Auth Docker to Artifact Registry
      docker-credential-gcr configure-docker --registries="us-central1-docker.pkg.dev"
      
      # 3. Create a shared Docker network
      docker network create frog-net || true
      
      # 4. Clean up any old containers
      docker rm -f retail-app || true
      docker rm -f caddy-ssl || true
      
      # 5. Run your Node App
      APP_IMAGE=$(curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/attributes/app_image)

      docker run -d --name retail-app --network frog-net --restart always \
      -e STRIPE_SECRET_KEY="${data.google_secret_manager_secret_version.stripe_key.secret_data}" \
      -e PORT="3000" \
      -e NODE_ENV="${var.node_env}" \
      $APP_IMAGE
        
      # 6. Run the Caddy SSL Proxy
      docker run -d --name caddy-ssl --network frog-net --restart always -p 443:443 \
        caddy:alpine caddy reverse-proxy --from https://www.${var.domain_name} --to http://retail-app:3000 --internal-certs
    EOT
  }
}

# 2.  THE FASTLY SERVICE (Notice: Domain blocks are removed)
resource "fastly_service_vcl" "retail_fastly" {
  name = "three-dogs-frog-store-production"

  backend {
    address        = google_compute_instance.retail_origin.network_interface[0].access_config[0].nat_ip
    name           = "gcp-origin-secure"
    port           = 443
    use_ssl        = true
    ssl_check_cert = false
    ssl_sni_hostname = "www.${var.domain_name}"
  }

  snippet {
    name     = "force-https-and-www"
    type     = "recv"
    priority = 100
    content  = <<EOF
  # If it's HTTP OR if it's the apex domain, trigger the single redirect
  if (!req.http.Fastly-SSL || req.http.host == "${var.domain_name}") {
    error 801 "Redirect to Secure WWW";
  }
EOF
  }

  snippet {
    name     = "redirect-logic"
    type     = "error"
    priority = 100
    content  = <<EOF
  if (obj.status == 801) {
    set obj.status = 301;
    # Hardcode the final destination scheme and subdomain
    set obj.http.Location = "https://www.${var.domain_name}" req.url;
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
    # 1. Strip cookies so Fastly doesn't panic and bypass the cache
    unset beresp.http.Set-Cookie;
    
    # 2. Strip Vary headers to prevent cache fragmentation
    unset beresp.http.Vary;

    # 3. Force the TTL and tell the browser to cache it too
    set beresp.ttl = 86400s;
    set beresp.http.Cache-Control = "public, max-age=86400";
    
    # 4. Deliver immediately
    return(deliver);
  }
EOF
  }

  force_destroy = true
}

# 3. THE VERSIONLESS DOMAINS (The new API method)
resource "fastly_domain" "apex" {
  fqdn = var.domain_name
}

resource "fastly_domain" "www" {
  fqdn = "www.${var.domain_name}"
}

# 4. LINKING THE DOMAINS TO THE SERVICE
resource "fastly_domain_service_link" "apex_link" {
  domain_id  = fastly_domain.apex.id
  service_id = fastly_service_vcl.retail_fastly.id
}

resource "fastly_domain_service_link" "www_link" {
  domain_id  = fastly_domain.www.id
  service_id = fastly_service_vcl.retail_fastly.id
}
