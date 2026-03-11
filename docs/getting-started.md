# Getting Started

This guide walks you through setting up the VPP Blockchain development environment from scratch.

## Prerequisites

| Tool    | Version    | Install                                                      |
| ------- | ---------- | ------------------------------------------------------------ |
| Node.js | >= 20      | [nodejs.org](https://nodejs.org/) or `nvm install`           |
| pnpm    | >= 9       | `corepack enable && corepack prepare pnpm@latest --activate` |
| Git     | any recent | [git-scm.com](https://git-scm.com/)                          |

## Installation

```bash
git clone https://github.com/hsbi-business-psychology/vpp-blockchain.git
cd vpp-blockchain
pnpm install
```

## Project Layout

```
vpp-blockchain/
├── packages/contracts/   # Solidity smart contract
├── packages/backend/     # Node.js API server
├── packages/frontend/    # React SPA
└── docs/                 # Documentation
```

## Running Tests

```bash
# Run all tests across every package
pnpm test

# Run tests for a single package
pnpm --filter @vpp/contracts test
pnpm --filter @vpp/backend test
pnpm --filter @vpp/frontend test
```

## Smart Contract Development

```bash
# Compile the Solidity contract
pnpm --filter @vpp/contracts run compile

# Run contract tests with gas report
REPORT_GAS=true pnpm --filter @vpp/contracts test

# Start a local Hardhat node
pnpm --filter @vpp/contracts hardhat node

# Deploy to the local node
pnpm --filter @vpp/contracts run deploy:local

# Deploy to Base Sepolia testnet (requires .env)
cp packages/contracts/.env.example packages/contracts/.env
# Fill in DEPLOYER_PRIVATE_KEY and BASESCAN_API_KEY
pnpm --filter @vpp/contracts run deploy:sepolia
```

## Backend Development

```bash
# Create .env from template
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env` with your values:

| Variable             | Description                                        |
| -------------------- | -------------------------------------------------- |
| `PORT`               | Server port (default: 3000)                        |
| `RPC_URL`            | Base RPC endpoint                                  |
| `CONTRACT_ADDRESS`   | Deployed SurveyPoints contract address             |
| `MINTER_PRIVATE_KEY` | Backend wallet private key (must have MINTER_ROLE) |
| `EXPLORER_BASE_URL`  | Block explorer URL for transaction links           |
| `FRONTEND_URL`       | Frontend URL for CORS and template redirects       |

```bash
# Start the dev server (hot-reload)
pnpm --filter @vpp/backend dev

# Build for production
pnpm --filter @vpp/backend build

# Start the production build
pnpm --filter @vpp/backend start
```

## Frontend Development

```bash
# Create .env from template
cp packages/frontend/.env.example packages/frontend/.env
```

Edit `packages/frontend/.env`:

| Variable                | Description                                   |
| ----------------------- | --------------------------------------------- |
| `VITE_APP_NAME`         | Application name shown in the UI              |
| `VITE_API_URL`          | Backend API base URL                          |
| `VITE_RPC_URL`          | Base RPC endpoint for direct blockchain reads |
| `VITE_CONTRACT_ADDRESS` | Deployed SurveyPoints contract address        |
| `VITE_EXPLORER_URL`     | Block explorer base URL                       |
| `VITE_DEFAULT_LOCALE`   | Default language (`en` or `de`)               |

```bash
# Start the Vite dev server (port 5173)
pnpm --filter @vpp/frontend dev

# Build for production
pnpm --filter @vpp/frontend build

# Preview the production build
pnpm --filter @vpp/frontend preview
```

The dev server proxies `/api` requests to `http://localhost:3000` automatically.

## Full Local Stack (with Test Data)

The easiest way to run the complete system locally with pre-seeded test data:

```bash
# Terminal 1 — Start local blockchain
pnpm dev:node

# Terminal 2 — Deploy contract + seed 3 surveys + 15 student points
pnpm dev:deploy

# Terminal 3 — Start backend (auto-copies .env.development → .env)
pnpm dev:backend

# Terminal 4 — Start frontend (uses .env.development automatically)
pnpm dev:frontend
```

Open [http://localhost:5173](http://localhost:5173) and import one of the test wallets:

| Role                 | Private Key                                                          |
| -------------------- | -------------------------------------------------------------------- |
| **Admin**            | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| **Student** (15 pts) | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |

Admin access is verified **on-chain** — only wallets with `ADMIN_ROLE` on the smart contract can access the Lecturers' Area. Admins can grant/revoke `ADMIN_ROLE` for other wallets directly from the dashboard.

See the main [README](../README.md#local-development-with-test-data) for detailed testing instructions.

## Linting & Formatting

```bash
# Check lint errors
pnpm lint

# Auto-fix lint errors
pnpm lint:fix

# Check formatting
pnpm format:check

# Auto-format all files
pnpm format
```

## IDE Setup

Recommended VS Code extensions:

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
- [Solidity](https://marketplace.visualstudio.com/items?itemName=JuanBlanco.solidity)

The repository includes an `.editorconfig` file for consistent whitespace settings across editors.
