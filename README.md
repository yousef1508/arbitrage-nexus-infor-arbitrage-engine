# Arbitrage Nexus: Information Arbitrage Engine

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fyousef1508%2Farbitrage-nexus-infor-arbitrage-engine)

Arbitrage Nexus is a private, high-fidelity autonomous intelligence and profit execution system designed for a single owner. It leverages a multi-agent architecture to scan the digital landscape for information asymmetries and monetize them across various channels including content arbitrage, affiliate marketing, and lead generation.

Built on Cloudflare Durable Objects and the Agents SDK, the system operates as a closed-loop profit engine that manages an internal treasury, enforces risk governance, and allows for manual PayPal withdrawals.

## 🚀 Core Architecture

The system is designed with a four-layer multi-agent structure:

1.  **Intelligence Layer**: Scout and Analyst agents ingest and validate data from RSS feeds, web hooks, and public price feeds.
2.  **Routing Layer**: The Broker/Router agent classifies opportunities and assigns them to specialized execution agents.
3.  **Monetization Layer**: Independent agents (Content, Affiliate, Lead Gen, Resale) execute strategies based on detected "Arbs".
4.  **Control & Finance Layer**: The Treasury manages internal ledgers, while the Governor enforces deterministic policy rules and budget caps.

## ✨ Key Features

- **Autonomous Opportunity Engine**: Structured detection of opportunities with confidence, risk, and monetization scoring.
- **Private Multi-Agent System**: Specialized agents for Content Arbitrage, Affiliate pathways, and Lead Generation.
- **Deterministic Governance**: Hard-coded spend caps, reserve minimums, and emergency kill-switches that agents cannot bypass.
- **Internal Treasury Ledger**: Automated profit distribution into Reserve (40%), Operating (20%), Reinvestment (15%), Tax Buffer (15%), and Owner (10%) buckets.
- **PayPal Integration**: Secure manual withdrawal flow for the owner with cooldowns and audit logging.
- **High-Density Dashboard**: Professional "Command & Control" UI for real-time oversight of treasury balances and agent activity.

## 🛠️ Technology Stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, Lucide Icons.
- **UI Components**: Shadcn/UI (Radix UI primitives).
- **State Management**: Zustand, TanStack Query.
- **Backend**: Cloudflare Workers, Hono, Cloudflare Agents SDK.
- **Persistence**: Durable Objects (Persistent state for agents and treasury).
- **AI Integration**: OpenAI SDK via Cloudflare AI Gateway, Model Context Protocol (MCP).

## 📦 Setup & Installation

### Prerequisites

- [Bun](https://bun.sh/) runtime installed.
- Cloudflare Account with Workers/Durable Objects enabled.
- PayPal Developer credentials (Client ID and Secret).

### Local Development

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd arbitrage-nexus
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Configure Environment Variables**:
   Update `wrangler.jsonc` or create a `.dev.vars` file with:
   - `CF_AI_BASE_URL`: Your Cloudflare AI Gateway URL.
   - `CF_AI_API_KEY`: Your Cloudflare API Key.
   - `PAYPAL_CLIENT_ID`: Your PayPal credentials.
   - `PAYPAL_CLIENT_SECRET`: Your PayPal secret.

4. **Run the development server**:
   ```bash
   bun run dev
   ```

## 🚢 Deployment

### Cloudflare Workers

The project is designed to be deployed as a Cloudflare Worker using the Agents SDK.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fyousef1508%2Farbitrage-nexus-infor-arbitrage-engine)

To manually deploy:
```bash
bun run deploy
```

## 📖 Usage

### First-Run Wizard
Upon initial deployment, navigate to the dashboard to complete the Setup Wizard:
- Create the primary admin account.
- Configure financial floors (Reserve Minimum).
- Set global budget caps for agents.
- Enable or disable specific monetization modules.

### Managing the Treasury
- View real-time balances in the **Treasury & Ledger** tab.
- Monitor automated reinvestment proposals.
- Initiate manual withdrawals to your configured PayPal account once the minimum threshold is met.

## ⚠️ Important Note
Although this project features advanced AI capabilities, there is a limit on the number of requests that can be made to the AI servers across all user apps in a given time period. Please monitor your usage via the Cloudflare dashboard.

## 🛡️ License
Private and confidential. This system is intended for single-user autonomous operation.