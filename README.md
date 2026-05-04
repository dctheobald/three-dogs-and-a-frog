# 🏕️ 3 Dogs and a Frog | Premium E-Commerce Platform

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![Stripe](https://img.shields.io/badge/Stripe-Checkout-blue.svg)](https://stripe.com/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED.svg)](https://www.docker.com/)
[![GCP](https://img.shields.io/badge/Google_Cloud-Compute_Engine-4285F4.svg)](https://cloud.google.com/)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF.svg)](https://github.com/features/actions)

![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/dctheobald/three-dogs-and-a-frog/deploy.yml?branch=main&style=flat-square&label=Deployment)
![Terraform](https://img.shields.io/badge/Infrastructure-Terraform-623CE4?style=flat-square&logo=terraform)
![Fastly](https://img.shields.io/badge/CDN-Fastly-e61305?style=flat-square&logo=fastly)
![GCP](https://img.shields.io/badge/Cloud-GCP-4285F4?style=flat-square&logo=google-cloud)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

> [!IMPORTANT]
> **DEMO SITE DISCLAIMER:** This is a technical demonstration project for a cloud engineering portfolio. This is **not** a real retail shop. No products are for sale, and no financial transactions are processed.

A fully functional, full-stack e-commerce demonstration platform engineered for a luxury outdoor dog gear brand. This project showcases modern web architecture, secure third-party payment integration, containerization, and a fully automated cloud deployment pipeline.

**🌐 Live Demo:** [https://www.3dogsandafrog.com](https://www.3dogsandafrog.com)

---

## 🏗️ Architecture Diagram
The following diagram illustrates the automated deployment pipeline and the global traffic flow.

![3 Dogs and a Frog Architecture Diagram](architecture.png?v=2)

### The Golden Flow:
1.  **Developer Push:** Code is pushed to GitHub.
2.  **GitHub Actions:** Builds Docker image -> Pushes to Google Artifact Registry -> Updates VM via SSH -> **Purges Fastly Cache** via API.
3.  **Zero-Trust Delivery:** Users hit the Fastly Edge via `www.3dogsandafrog.com`. Fastly collapses redirects and fetches misses from the GCP Origin (VM) over **strict HTTPS (Port 443)**. 
4.  **Sidecar Proxy & Backend:** A **Caddy** container on the VM terminates TLS and proxies traffic to the Node.js container over an isolated internal Docker network (`frog-net`). The Node.js application operates as a pure backend service on **Port 3000**, completely decoupled from SSL duties.

---

## ⚡ CDN & Caching Logic (Fastly Edge)
Our edge configuration is defined in `retail-app/infra/main.tf` to ensure high performance and origin shielding through custom VCL.

### Cache Rules:
* **Collapsed Redirects:** HTTP and Apex domain requests are redirected to Secure WWW in a single hop to reduce latency.
* **Aggressive Static Caching:** We explicitly strip origin cookies from static assets (JPG, PNG, JS, CSS) at the edge, forcing a **24-hour (86400s) TTL**. 
* **Origin Shielding:** By stripping `Set-Cookie` and `Vary` headers for static files, we maximize Cache Hit Ratios (CHR) and protect the `e2-micro` origin from unnecessary load.
* **Automated Purging:** Every successful GitHub deployment triggers a `PURGE ALL` API call, ensuring users see new code instantly despite aggressive caching.

---

## 🛠️ Local Development
Follow these steps to replicate the "3 Dogs & a Frog" local build and test environment on a new macOS machine.

### 1. Install Prerequisites
This project relies on Homebrew, Node.js, `direnv` for secret management, and Docker.

**Install Homebrew** (if not already installed):
```bash
/bin/bash -c "$(curl -fsSL [https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh](https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh))"
```

**Install Core Dependencies:**
```bash
brew install node direnv gh
```

**Configure `direnv` for Zsh:**
Hook `direnv` into your shell so it automatically loads environment variables when entering the directory:
```bash
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
source ~/.zshrc
```

**Install Docker Desktop:**
Download and install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/). Ensure the application is open and running in the background.

### 2. Authenticate and Pull the Codebase
Log in to the GitHub CLI to authorize the machine, configure your Git identity, and clone the repository.

```bash
# Authenticate (Select HTTPS and Login via Browser)
gh auth login

# Set your Git identity
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Clone the repository
git clone [https://github.com/dctheobald/three-dogs-and-a-frog.git](https://github.com/dctheobald/three-dogs-and-a-frog.git)
cd three-dogs-and-a-frog
```

### 3. Recreate Local Secrets
To keep production secrets secure, `.env` files are ignored by Git. You must manually recreate them.

**1. Create the `.env` file:**
Create a `.env` file in the root of the project (`three-dogs-and-a-frog/`) and add your local testing keys (do *not* use the `export` keyword here):
```env
FASTLY_API_KEY="your_fastly_key_here"
STRIPE_SECRET_KEY="sk_test_..."
PORT=3000
NODE_ENV="development"
```

**2. Configure `.envrc` for direnv:**
Create or update the `.envrc` file in the root directory to simply read the `.env` file:
```bash
echo 'dotenv' > .envrc
```

**3. Authorize the directory:**
Tell `direnv` to securely load the variables:
```bash
direnv allow
```

### 4. Spin Up the Environment
You have two options for running the storefront locally.

**Option A: The Docker Way (Full Stack Replication)**
Use standard Docker commands to build and run the container locally, injecting the secrets from your new `.env` file.
```bash
# 1. Build the image
docker build -t three-dogs-app .

# 2. Run the container
docker run -p 3000:3000 --env-file .env three-dogs-app
```

**Option B: The Node Way (Rapid UI Testing)**
If you are rapidly testing CSS or HTML changes natively and want to bypass Docker, run the Express server directly:
```bash
npm install
npm start
```

Once running, navigate to **http://localhost:3000** in your browser to access the storefront.

---

## 🚀 How to Deploy Changes

### 1. Content & Application Changes (HTML, CSS, JS)
* **Action:** `git add .` -> `git commit -m "update"` -> `git push origin main`
* **Effect:** Triggers the automated CI/CD pipeline (Build, Deploy, Purge).
* **Verification:** Check GitHub Actions tab for success. Changes are instant.

### 2. Infrastructure & Networking Changes (VM, Firewall, CDN)
All cloud resources are managed via Terraform in the `retail-app/infra` directory.
* **Action:**
    ```zsh
    cd retail-app/infra
    terraform plan    # Preview what will change
    terraform apply   # Execute changes (type 'yes')
    ```
* **Post-Apply Requirements:**
    * **VM Reboots:** Modifying the VM's `startup-script` via Terraform does not automatically reboot the VM. You must manually power-cycle the instance to read new instructions:
      `gcloud compute instances reset three-dog-one-frog-prod --zone=us-central1-c --project=three-dogs-frog-store`
    * **Fastly Domain Errors:** If Fastly throws a `500 Unknown Domain` error after an update due to versionless domain handoffs, force Terraform to recreate the links:
      `terraform apply -replace="fastly_domain_service_link.apex_link" -replace="fastly_domain_service_link.www_link"`

---

## 📁 Project Structure
* `infra/`: Terraform HCL files (Providers, Variables, and Resources).
* `public/`: Static assets (images, CSS).
* `server.js`: Express.js server logic and pure backend entry point.
* `.github/workflows/`: YAML definitions for CI/CD and Fastly Purging.
* `Dockerfile`: Container instructions for the highly-secured Node.js environment.

---

## ⚠️ Security Requirements
* **Local Secrets:** `infra/terraform.tfvars` (Contains GCP Project ID and Fastly API Key). This file is ignored by Git.
* **GCP Secrets:** `STRIPE_SECRET_KEY` is stored in GCP Secret Manager and injected at runtime via the VM's startup script.
* **CI Secrets:** `FASTLY_API_KEY` and `FASTLY_SERVICE_ID` must be configured in GitHub Repository Secrets.
* **Terraform Metadata:** The `app_image` tag on the GCP VM is dynamically injected by GitHub Actions. Terraform explicitly ignores this tag using a `lifecycle` block to prevent overwriting the active container image.
* **Docker Security:** The application container runs strictly as the non-root `node` user. A strict `.dockerignore` file ensures local `.env` and `infra/` files never leak into the production build.
