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
