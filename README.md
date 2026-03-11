# VPP Blockchain

**Verifiable Participant Points** — A blockchain-based system for awarding tamper-proof, pseudonymous survey participation points.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green)](https://nodejs.org/)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.20-363636)](https://soliditylang.org/)
[![Base L2](https://img.shields.io/badge/Chain-Base%20L2-0052FF)](https://base.org/)

---

## What is VPP?

VPP lets students earn points for completing surveys. Points are recorded on a public blockchain (Base L2), making them **transparent, tamper-proof, and pseudonymous**. No cryptocurrency knowledge is required — wallets are created in-app, and all transaction fees are covered by the system.

### Key Principles

- **Pseudonymous** — Points are tied to wallet addresses, not real identities
- **Transparent** — All points are publicly verifiable on-chain
- **Self-sovereign** — Students own their private keys and control their wallets
- **Free for participants** — No gas fees, no crypto required
- **Educational** — Students learn about wallets, keys, and blockchain transactions hands-on

## Architecture

```
┌─────────────┐    Redirect     ┌──────────────────────────────────┐
│ SoSci Survey │ ─────────────→ │  VPP Web App                     │
│ (external)   │  surveyId +    │                                  │
└─────────────┘  secret         │  Frontend (Vue 3 SPA)            │
                                │  └─ Wallet · Claim · Points     │
                                │                                  │
                                │  Backend (Node.js API)           │
                                │  └─ Signature verification       │
                                │  └─ Transaction relay            │
                                └──────────────┬───────────────────┘
                                               │
                                               ▼
                                ┌──────────────────────────────────┐
                                │  Base L2 Blockchain              │
                                │  SurveyPoints Smart Contract     │
                                │  └─ registerSurvey()             │
                                │  └─ awardPoints()                │
                                │  └─ totalPoints() / surveyPoints │
                                └──────────────────────────────────┘
```

## Monorepo Structure

| Package | Description |
|---|---|
| [`packages/contracts`](packages/contracts) | Solidity smart contract with Hardhat tooling |
| [`packages/sdk`](packages/sdk) | Framework-agnostic TypeScript SDK (`@vpp/sdk`) |
| [`packages/backend`](packages/backend) | Node.js/Express reference backend (transaction relayer) |
| [`packages/frontend`](packages/frontend) | Vue 3 reference frontend |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9

### Installation

```bash
git clone https://github.com/hsbi/vpp-blockchain.git
cd vpp-blockchain
pnpm install
```

### Run Tests

```bash
pnpm test
```

### Local Development

```bash
# Start a local Hardhat node
pnpm --filter @vpp/contracts hardhat node

# Deploy contracts locally
pnpm --filter @vpp/contracts run deploy:local
```

## Integration Options

VPP is designed as an open-source toolkit. Other universities can integrate at three levels:

### Level 1: Full Deployment

Clone the repo, configure environment variables, and deploy everything with Docker Compose.

```bash
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your RPC URL, private key, and contract address
docker-compose up
```

### Level 2: SDK Integration

Install the SDK and build your own frontend.

```bash
npm install @vpp/sdk
```

```typescript
import { VPPWallet, VPPClient, VPPReader } from '@vpp/sdk'

const wallet = VPPWallet.create()
const client = new VPPClient({ backendUrl: 'https://vpp.your-university.edu/api' })
const result = await client.claim(wallet, surveyId, secret)
```

### Level 3: Direct Contract Interaction

Interact with the verified smart contract on Base directly using any Ethereum-compatible library.

## Cost

VPP runs on Base L2, where transaction costs are minimal:

| Operation | Estimated Cost |
|---|---|
| Contract deployment | ~$0.50 |
| Register a survey | ~$0.005 |
| Award points (claim) | ~$0.002 |
| Read points | Free |

A single $10 deposit covers thousands of claims across multiple semesters.

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

## License

This project is licensed under the [MIT License](LICENSE).
