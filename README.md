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



### The Golden Flow:
1.  **Developer Push:** Code is pushed to GitHub.
2.  **GitHub Actions:** Executes a two-stage deployment:
    * **Terraform:** Provisions/updates GCP infrastructure and core Fastly VCL logic.
    * **Security Layering:** Executes `setup-fastly.sh` to layer on Edge Rate Limiting policies.
3.  **Zero-Trust Delivery:** Users hit the Fastly Edge. Fastly collapses redirects and fetches misses from the GCP Origin (VM) over **strict HTTPS (Port 443)**. 
4.  **Sidecar Proxy & Backend:** A **Caddy** container on the VM terminates TLS and proxies traffic to the Node.js container over an isolated internal Docker network (`frog-net`). The Node.js application operates as a pure backend service on **Port 3000**, completely decoupled from SSL duties.

---

## ☁️ Infrastructure State

This project utilizes **Remote State** to allow seamless synchronization across multiple development environments.

* **Backend:** Google Cloud Storage (`gs://three-dogs-tf-state`).
* **State Locking:** Terraform automatically locks the state in GCS during an `apply` to prevent concurrent configuration changes from different machines.

---

## ⚡ CDN & Caching Logic (Fastly Edge)
Our edge configuration is defined in `infra/main.tf` to ensure high performance and origin shielding through custom VCL.

### Cache Rules:
* **Collapsed Redirects:** HTTP and Apex domain requests are redirected to Secure WWW in a single hop to reduce latency.
* **Aggressive Static Caching:** We explicitly strip origin cookies from static assets (JPG, PNG, JS, CSS) at the edge, forcing a **24-hour (86400s) TTL**. 
* **Origin Shielding:** By stripping `Set-Cookie` and `Vary` headers for static files, we maximize Cache Hit Ratios (CHR) and protect the `e2-micro` origin from unnecessary load.
* **Automated Purging:** Every successful GitHub deployment triggers a `PURGE ALL` API call, ensuring users see new code instantly.

---

## 🛠️ Local Development
Follow these steps to replicate the "3 Dogs & a Frog" local build and test environment on a new macOS machine.

1.  **Clone the Repository:**
        git clone https://github.com/dctheobald/three-dogs-and-a-frog.git

2.  **Install Prerequisites:**
    * **Docker Desktop:** To run and test containers locally.
    * **Node.js:** For local dependency management (`npm install`).
    * **direnv:** To automatically load environment variables and infrastructure secrets.
    * **Google Cloud SDK:** To authenticate with GCP.

3.  **Sync Secrets:**
    * Manually copy the `.envrc` (root), `.env` (root), and `infra/.envrc` files from an authorized machine.
    * Run `direnv allow` in both the project root and the `infra/` directory.

4.  **Initialize Infrastructure:**
        cd infra
        gcloud auth application-default login
        terraform init
        terraform apply
        ./setup-fastly.sh
    *This will connect your local environment to the shared GCS state bucket and layer on the Edge Rate Limiter.*

### 🏃‍♂️ Running the Application Locally
Because this application uses Server-Side Rendering (EJS) for modular components, it must be served via Node.js.

1. Ensure your `.env` file is populated with your Stripe keys.
2. Run the application:
        npm install
        npm start
3. Open your browser to `http://localhost:3000`

---

## 🚀 How to Deploy Changes
Infrastructure and application deployments can be managed via **GitHub Actions** (fully automated) or **Locally** (manual) using the same underlying logic.

### 1. Application Updates (Node.js, HTML, CSS)
Application updates are fully automated via CI/CD.
* **Process:** Simply commit your code and `git push origin main`.
* **Automation:** GitHub Actions will automatically trigger, build the new Docker image, and deploy it to the GCP VM.

### 2. Infrastructure Updates (Terraform, Fastly VCL, Edge Rate Limiting)
Infrastructure changes can be deployed manually from your terminal for rapid testing, or via the automated GitHub Actions pipeline. The two-stage deployment sequence must be maintained to ensure all security layers (WAF + Edge Rate Limiting) are correctly applied:
* **Step 1: Foundational Infra:** `cd infra && terraform apply`
* **Step 2: Security Layering:** `./setup-fastly.sh` (This layers the Edge Rate Limiter configuration on top of the Terraform-managed service).

---

## 📁 Project Structure
* `infra/`: Terraform HCL files and the `setup-fastly.sh` security script.
* `views/`: EJS template files, including reusable components (header/footer).
* `public/`: Static assets (images, CSS, client-side JS).
* `server.js`: Express.js server logic and pure backend entry point.
* `.github/workflows/`: YAML definitions for CI/CD, automation, and Purging.
* `Dockerfile`: Container instructions for the highly-secured Node.js environment.

---

## ⚠️ Security Requirements
* **Infrastructure Secrets:** `infra/.envrc` (managed via `direnv`). Contains the GCP Project ID, Fastly API Key, and Terraform variables. This file is ignored by Git to prevent credential leaks.
* **GCP Secrets:** `STRIPE_SECRET_KEY` is stored in GCP Secret Manager and injected at runtime via the VM's startup script.
* **CI Secrets:** `FASTLY_API_KEY` and `FASTLY_SERVICE_ID` must be configured in GitHub Repository Secrets.
* **Terraform Metadata:** The `app_image` tag on the GCP VM is dynamically injected by GitHub Actions. Terraform explicitly ignores this tag using a lifecycle block to prevent overwriting the active container image.
* **Docker Security:** The container runs strictly as the non-root `node` user. A strict .dockerignore file ensures local .env and infra/ files never leak into the production build.
* **Threat Neutralization:** SQL injection attempts trigger custom, user-friendly block pages rendered directly at the Fastly Edge.
