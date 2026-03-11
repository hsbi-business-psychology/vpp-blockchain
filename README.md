# VPP Blockchain

**Verifiable Participant Points** — A blockchain-based system for awarding tamper-proof, pseudonymous survey participation points.

[![CI](https://github.com/hsbi-business-psychology/vpp-blockchain/actions/workflows/ci.yml/badge.svg)](https://github.com/hsbi-business-psychology/vpp-blockchain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green)](https://nodejs.org/)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.24-363636)](https://soliditylang.org/)
[![Base L2](https://img.shields.io/badge/Chain-Base%20L2-0052FF)](https://base.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-F69220)](https://pnpm.io/)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

---

## What is VPP?

VPP lets students earn points for completing surveys. Points are recorded on a public blockchain (Base L2), making them **transparent, tamper-proof, and pseudonymous**. No cryptocurrency knowledge is required — wallets can be created in-app or connected via MetaMask, and all transaction fees are covered by the system.

### Key Principles

- **Pseudonymous** — Points are tied to wallet addresses, not real identities
- **Transparent** — All points are publicly verifiable on-chain
- **Self-sovereign** — Students own their private keys and control their wallets
- **Free for participants** — No gas fees, no crypto required
- **Flexible** — Browser wallets for beginners, MetaMask for advanced users
- **Accessible** — WCAG-compliant, mobile-first, bilingual (DE/EN)

## Architecture

```
┌─────────────┐    Redirect     ┌──────────────────────────────────┐
│ SoSci Survey │ ─────────────→ │  VPP Web App                     │
│ (external)   │  surveyId +    │                                  │
└─────────────┘  secret         │  Frontend (React + shadcn/ui)    │
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
                                │  └─ addAdmin() / removeAdmin()   │
                                │  └─ totalPoints() / surveyPoints │
                                └──────────────────────────────────┘
```

## Monorepo Structure

| Package | Description |
|---|---|
| [`packages/contracts`](packages/contracts) | Solidity smart contract with Hardhat tooling |
| [`packages/backend`](packages/backend) | Node.js/Express API server (transaction relayer) |
| [`packages/frontend`](packages/frontend) | React + Vite + shadcn/ui reference frontend |

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Solidity 0.8.24, Hardhat, OpenZeppelin, TypeChain |
| Backend | Node.js 20+, Express, ethers.js v6, TypeScript |
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS v4, shadcn/ui, i18next |
| Wallet | Browser wallet (built-in) or MetaMask (optional) |
| Testing | Hardhat + Chai, Vitest, React Testing Library |
| CI/CD | GitHub Actions |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9

### Installation

```bash
git clone https://github.com/hsbi-business-psychology/vpp-blockchain.git
cd vpp-blockchain
pnpm install
```

### Run Tests

```bash
pnpm test
```

### Local Development with Test Data

The fastest way to explore the full application locally, including the admin dashboard and on-chain role management:

```bash
# Single command — starts blockchain, deploys, backend, and frontend
pnpm dev
```

Or manually in separate terminals:

```bash
pnpm dev:node        # Terminal 1 — Local blockchain
pnpm dev:deploy      # Terminal 2 — Deploy + seed test data
pnpm dev:backend     # Terminal 3 — Backend API
pnpm dev:frontend    # Terminal 4 — Frontend
```

The deploy script creates **3 test surveys** and awards **15 points** to a test student. It prints all private keys and secrets you need.

#### Test Accounts (Hardhat Defaults)

| Role | Address | Private Key |
|---|---|---|
| **Admin** (ADMIN_ROLE) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| **Student** (has 15 pts) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |

#### Testing the Admin Flow

1. Open `http://localhost:5173` and create a **new wallet** (Browser Wallet, MetaMask, or import a key)
2. Navigate to **Lecturers' Area** — you will see an "Access Denied" message because the new wallet has no ADMIN_ROLE
3. Switch to the Admin wallet: delete the current wallet and **import the Admin private key** from the table above
4. Navigate to **Lecturers' Area** — the on-chain check passes, authentication happens automatically
5. In the **Admin Role Management** section at the bottom, you can grant ADMIN_ROLE to any other wallet address

#### Testing the Student Flow

1. Import the **Student private key** from the table above
2. Navigate to **My Points** — you will see 15 points and the claim history
3. To test a new claim, visit: `http://localhost:5173/claim?surveyId=3&secret=test-secret-gamma`

#### Test Secrets

| Survey | Secret | Points |
|---|---|---|
| #1 | `test-secret-alpha` | 5 |
| #2 | `test-secret-beta` | 10 |
| #3 | `test-secret-gamma` | 3 |

## Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

- [Architecture](docs/architecture.md) — System design and data flow
- [Getting Started](docs/getting-started.md) — Development setup guide
- [API Reference](docs/api-reference.md) — Backend REST API documentation
- [Smart Contract](docs/smart-contract.md) — On-chain contract details
- [SoSci Survey Integration](docs/sosci-integration.md) — Survey template setup
- [Deployment](docs/deployment.md) — Production deployment guide
- [Security](docs/security.md) — Security architecture and threat model
- [For Universities](docs/for-universities.md) — Adoption guide for other institutions

## Integration Options

VPP is designed as an open-source toolkit. Other universities can integrate at three levels:

### Level 1: Full Deployment

Clone the repo, configure environment variables, and deploy everything.

```bash
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your RPC URL, private key, and contract address
docker build -t vpp-backend packages/backend
docker run -p 3000:3000 --env-file packages/backend/.env vpp-backend
```

### Level 2: Custom Frontend

Use the backend API and smart contract, but build your own frontend.

```bash
# Deploy the backend and contract, then point your frontend at the API
VITE_API_URL=https://vpp.your-university.edu/api
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

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of notable changes.

## Security

To report a vulnerability, please see our [Security Policy](SECURITY.md).

## License

This project is licensed under the [MIT License](LICENSE).
