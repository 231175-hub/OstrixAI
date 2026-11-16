# OstrixAi 🦉

> **An offline-first, hybrid AI smart tutor built for the BuildHybridAI 2026 Google · Firebase Hackathon.**

OstrixAi is an educational platform designed to democratize access to artificial intelligence in regions with unstable network connectivity. By leveraging the **Firebase AI Logic SDK**, OstrixAi acts as an intelligent traffic controller: it processes simple, privacy-sensitive tasks directly on the user's device with zero latency, and seamlessly routes complex reasoning tasks to advanced cloud models when an internet connection is available. 

## 📌 Features
* **True Offline-First AI:** Generate summaries, correct grammar, and create short flashcards without any internet connection.
* **Hybrid Routing:** Automatically switches between edge computing (on-device AI) and cloud computing based on task complexity and network status.
* **State Synchronization:** Work offline without fear of data loss. All progress is cached locally and synced to an AWS backend once `navigator.onLine` is detected.
* **Secure by Design:** Cloud inference endpoints are protected using **Firebase App Check** to prevent quota abuse.

---

## 🏗️ Architecture & ADR (Architecture Decision Record)

This project strictly follows an N-tier architecture, separating AI inference from data persistence. 

### Context
Educational AI tools usually fail when internet connectivity drops. Furthermore, sending all student notes to the cloud raises privacy concerns and increases API costs. 

### Decision
We implemented a **Hybrid AI Strategy** using Firebase AI Logic, alongside an independent backend for state persistence.

| Dimension | On-Device AI (Edge) | Cloud AI (Remote) |
| :--- | :--- | :--- |
| **Use Cases** | Quick summaries, grammar checks, autocomplete. | Complex concept explanations, essay evaluation. |
| **Latency** | **Zero (Instant):** Ideal for micro-interactions. | **Variable:** Dependent on network conditions. |
| **Privacy** | **High:** Personal notes never leave the device. | **Medium:** Only explicitly submitted prompts are sent. |
| **Cost** | **Zero:** Utilizes the client's hardware. | **Optimized:** API quota is only consumed for heavy tasks. |

**AWS Data Persistence:** To ensure the AI layer remains stateless and independent, we built a RESTful API deployed on AWS (EC2/RDS) that handles user history and data synchronization.

---

## 🚀 Tech Stack

**Client-Side (Frontend & Edge AI)**
* Angular & TypeScript
* PrimeNG (UI Components)
* Firebase AI Logic SDK (Hybrid Routing)
* Firebase App Check (Security)

**Server-Side (Backend & Cloud Persistence)**
* Python (Flask) - N-Tier Architecture (Controllers, Services, Models)
* AWS EC2 (Hosting)
* MySQL (Database)

---

## ⚙️ Installation & Setup

### Prerequisites
* Node.js & Angular CLI
* Python 3.10+
* Firebase CLI
* An active Google Cloud / Firebase Project with AI Logic enabled.

### 1. Frontend Setup (Angular)
```bash
# Navigate to the frontend directory
cd frontend-ostrix

# Install dependencies
npm install

# Run the development server
ng serve
