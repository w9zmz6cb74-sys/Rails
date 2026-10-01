# AgentRails Protocol

> Autonomous Crypto Wallet Infrastructure, Policy Firewall & ERC-4337 UserOperation Pipeline for AI Agents.

AgentRails provides self-custodied crypto wallet infrastructure, ERC-6551 Token Bound Accounts (TBAs), dynamic policy firewalls, x402 micropayments, and an end-to-end 10-stage execution pipeline for autonomous AI agents.

---

## 🛡️ 10-Stage Agent Execution Pipeline

Every transaction intent issued by an AI agent is processed deterministically through 10 security stages:

```
Agent Request
  → 1. Authenticate session key
  → 2. Decode transaction calldata
  → 3. Reject unknown chain, contract or function
  → 4. Check recipient and token allowlists
  → 5. Apply transaction and daily limits
  → 6. Check velocity and expiry
  → 7. Require human approval when necessary
  → 8. Simulate transaction (gas & asset balance deltas)
  → 9. Submit ERC-4337 UserOperation (bundled mempool broadcast)
  → 10. Save immutable cryptographic audit record
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm` or `bun`

### 2. Installation
```bash
git clone https://github.com/<your-username>/agent-rails.git
cd agent-rails
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your keys:
- `ENCLAVE_SIGNER_SECRET`: Enclave signature HMAC secret key.
- `GEMINI_API_KEY`: (Optional) API key for Gemini LLM models.

### 4. Run Development Server
```bash
npm run dev
```
The server will boot with Express and Vite on `http://localhost:3000`.

---

## 📡 API Endpoints

### Health Check
```http
GET /health
```
Response:
```json
{ "status": "healthy" }
```

### Direct Policy Firewall Evaluation
```http
POST /api/transactions/evaluate
Content-Type: application/json
```
Payload:
```json
{
  "agentId": "agent-datascout-1",
  "sessionKey": "0x5b34b9666735399ec6a117b1897d27e2a9b31170",
  "chainId": 11155111,
  "recipient": "0x1111111111111111111111111111111111111111",
  "contractAddress": "0x2222222222222222222222222222222222222222",
  "functionSelector": "0xa9059cbb",
  "valueWei": "1000000"
}
```
Response Status Codes:
- `200 OK`: Status `ALLOW` (all checks passed)
- `202 Accepted`: Status `REVIEW` (human approval threshold triggered)
- `403 Forbidden`: Status `DENY` (policy violation)

### Full 10-Stage Pipeline Execution
```http
POST /api/pipeline/execute
Content-Type: application/json
```

### Human-in-the-Loop Clearance Queue
- `GET /api/pipeline/approvals`: List pending human reviews.
- `POST /api/pipeline/approvals/:id/resolve`: Approve or reject a flagged transaction.
- `GET /api/pipeline/audit-records`: Retrieve cryptographic audit proofs.

---

## 📁 Repository Structure

```
├── src/
│   ├── firewall.ts              # Deterministic policy firewall engine
│   ├── server.ts                # Express backend + Vite dev middleware
│   ├── App.tsx                  # React UI root
│   ├── components/
│   │   ├── PipelineView.tsx     # Interactive 10-stage visualizer & approval queue
│   │   ├── WalletsView.tsx      # Agent wallet fleet & policy controls
│   │   ├── IdentityView.tsx     # ERC-6551 Token Bound Accounts
│   │   ├── MicropayView.tsx     # x402 HTTP 402 pay-per-call endpoints
│   │   └── SdkView.tsx          # TypeScript & Python SDK snippets
│   ├── services/
│   │   ├── pipelineEngine.ts    # 10-stage execution pipeline implementation
│   │   ├── policyEngine.ts      # Client/server policy validation
│   │   └── firebase.ts          # Firestore persistence & audit records
│   └── types/agent.ts           # Protocol TypeScript definitions
├── firestore.rules              # Hardened Firestore security rules
├── firebase-blueprint.json      # Firestore schema blueprint (IR)
├── package.json
└── vite.config.ts
```

---

## 📜 License
Apache-2.0
