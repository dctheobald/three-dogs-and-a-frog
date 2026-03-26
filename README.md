# 🏕️ 3 Dogs and a Frog | Premium E-Commerce Platform

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![Stripe](https://img.shields.io/badge/Stripe-Checkout-blue.svg)](https://stripe.com/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED.svg)](https://www.docker.com/)
[![GCP](https://img.shields.io/badge/Google_Cloud-Compute_Engine-4285F4.svg)](https://cloud.google.com/)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF.svg)](https://github.com/features/actions)

A fully functional, full-stack e-commerce demonstration platform engineered for a luxury outdoor dog gear brand. This project showcases modern web architecture, secure third-party payment integration, containerization, and a fully automated cloud deployment pipeline.

**🌐 Live Demo:** [https://www.3dogsandafrog.com](https://www.3dogsandafrog.com)

---

## 🚀 Key Features

* **Secure Payment Gateway:** Integrates the Stripe API (Test Mode) to handle secure, PCI-compliant checkout sessions without storing sensitive data on the server.
* **Separated Architecture:** Clean separation of concerns featuring a vanilla HTML/CSS/JS frontend communicating with a Node.js/Express backend REST API.
* **State Management:** Utilizes browser `localStorage` to persist the user's shopping cart state across page reloads and different sessions.
* **The "Frog Sherpa" UI:** A custom-built, interactive JavaScript chat widget providing an AI-themed "guide" experience that responds with brand-aligned logic.
* **Automated CI/CD Pipeline:** A GitHub Actions workflow that automatically builds a new Docker image, pushes it to Google Artifact Registry, and updates the live Google Compute Engine VM on every push to the `main` branch.
* **Automated SSL/TLS:** Integrated `greenlock-express` for automatic, on-the-fly Let's Encrypt SSL certificate generation and renewal.

---

## 🛠️ Tech Stack

**Frontend:**
* HTML5 / CSS3 (Custom Responsive Grid layouts, No UI Frameworks)
* Vanilla JavaScript (ES6+)
* DOM Manipulation & Event Handling

**Backend & Payments:**
* Node.js & Express.js
* Stripe API (Stripe Checkout)
* RESTful Route Architecture

**DevOps & Infrastructure:**
* **Containerization:** Docker
* **Hosting:** Google Cloud Platform (Compute Engine / Container-Optimized OS)
* **Registry:** Google Artifact Registry
* **CI/CD:** GitHub Actions

---

## 🏗️ System Architecture

The following diagram maps the dual lifecycles of the platform: the automated DevOps CI/CD deployment pipeline, and the end-user traffic flow through the secure checkout gateway.

```mermaid
graph TD
%% --- Defining Nodes & Subgraphs ---

    %% Developer Environment
    subgraph DevEnv ["1. Developer Environment (Local Mac)"]
        DevCode["Source Code: index.html, server.js, styles.css, etc."]
        DevOS["MacBook Air"]
    end

    %% CI/CD Pipeline (GitHub)
    subgraph CICDPipeline ["2. Automated Deployment Pipeline (GitHub)"]
        GitHubRepo["GitHub Repository"]
        GH_Secrets["GitHub Secrets (GCP_CREDENTIALS)"]
        subgraph GHActions ["GitHub Actions Workflow (deploy.yml)"]
            GHA_Auth["Step: Authenticate to GCP"]
            GHA_Build["Step: Docker Build --platform linux/amd64"]
            GHA_Push["Step: Docker Push Image"]
            GHA_UpdateVM["Step: Trigger VM Update"]
        end
    end

    %% Google Cloud Platform
    subgraph GCP_Cloud ["3. Google Cloud Platform (Infrastructure)"]
        GCP_Artifact["Artifact Registry"]
        subgraph GCP_VM ["Compute Engine Instance (retail-vm)"]
            GCP_COS["Container-Optimized OS"]
            GCP_Metadata["VM Metadata (NODE_ENV=production, STRIPE_SECRET_KEY)"]
            
            subgraph DockerContainer ["Docker Container (retail-app:sha-xyz)"]
                NodeServer["Node.js / Express Server"]
                Greenlock["Greenlock-Express (SSL)"]
                StaticFiles["Static Frontend Files"]
                ServerLogic["Express.js API (Stripe Logic)"]
            end
        end
    end

    %% Third-Party Services
    subgraph ThirdParty ["4. Third-Party Integrations"]
        StripeAPI["Stripe Checkout API (Test Mode)"]
        LetsEncrypt["Let's Encrypt (SSL Authority)"]
    end

    %% End User
    subgraph EndUser ["5. End User Environment (Browser)"]
        UserBrowser["Customer Browser (Mobile/Desktop)"]
        UserCart["Browser LocalStorage"]
    end


%% --- Defining Flows & Connections ---

    %% DevOps Flow
    DevCode -->|"git push -u origin main"| GitHubRepo
    GitHubRepo -->|"Triggers"| GHActions
    GH_Secrets -->|"Injects Credentials"| GHA_Auth
    GHA_Auth -->|"Authenticates"| GHA_Build
    GHA_Build -->|"Pushes New Image"| GCP_Artifact
    GHA_Push -->|"Pushes Image"| GCP_Artifact
    GCP_Artifact -->|"Storage"| GCP_Artifact
    GHA_UpdateVM -->|"Pulls Image / Restarts"| GCP_COS
    GCP_COS -->|"Runs"| DockerContainer
    GCP_Metadata -->|"Injects Env Vars"| DockerContainer

    %% Static Website Traffic Flow
    UserBrowser -->|"HTTPS 443 Request"| Greenlock
    Greenlock -->|"Requests Certificate"| LetsEncrypt
    LetsEncrypt -->|"Issues Certificate"| Greenlock
    Greenlock -->|"Proxy Traffic"| NodeServer
    NodeServer -->|"Serves"| StaticFiles
    StaticFiles -->|"Renders UI"| UserBrowser
    UserBrowser -->|"Saves Cart State"| UserCart

    %% Checkout Traffic Flow
    UserBrowser -->|"POST Checkout /cart"| ServerLogic
    ServerLogic -->|"Calls sk_test_... Key"| StripeAPI
    StripeAPI -->|"Returns Checkout URL"| ServerLogic
    ServerLogic -->|"Redirects User"| UserBrowser
    UserBrowser -->|"Completes Payment"| StripeAPI
    StripeAPI -->|"Redirects back to success.html"| UserBrowser

%% --- Styling ---
    classDef dev fill:#f9f,stroke:#333,stroke-width:2px;
    classDef github fill:#d1e7dd,stroke:#198754,stroke-width:2px;
    classDef gcp fill:#cfe2f3,stroke:#0d6efd,stroke-width:2px;
    classDef 3rdparty fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    classDef browser fill:#fff3cd,stroke:#ffc107,stroke-width:2px;
    classDef server fill:#fff,stroke:#333,stroke-width:1px,stroke-dasharray: 5 5;

    class DevCode,DevOS dev;
    class GitHubRepo,GH_Secrets,GHActions,GHA_Auth,GHA_Build,GHA_Push,GHA_UpdateVM github;
    class GCP_Cloud,GCP_Artifact,GCP_VM,GCP_COS,GCP_Metadata gcp;
    class StripeAPI,LetsEncrypt 3rdparty;
    class UserBrowser,UserCart browser;
    class DockerContainer,NodeServer,Greenlock,ServerLogic,StaticFiles server;
```

---

## 💻 Local Development Setup

To run this storefront locally, you will need Node.js and a Stripe Developer account (for test API keys).

**1. Clone the repository**
```bash
git clone [https://github.com/dctheobald/three-dogs-and-a-frog.git](https://github.com/dctheobald/three-dogs-and-a-frog.git)
cd three-dogs-and-a-frog
```

**2. Install backend dependencies**
```bash
npm install
```

**3. Configure Environment Variables**
Create a `.env` file in the root directory and add your Stripe Secret Test Key:
```text
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
```

**4. Start the local server**
```bash
node server.js
```
The application will bypass the SSL requirement locally and boot up at `http://localhost:3000`.

---

## ⚠️ Disclaimer
**This is a portfolio demonstration project.** The UI, branding, and checkout flows are fully functional, but the Stripe integration is locked in **Test Mode**. No real credit cards are processed, and no physical products are sold or shipped.
