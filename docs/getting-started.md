# Getting Started

This guide walks you through setting up the VPP Blockchain development environment from scratch.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | >= 20 | [nodejs.org](https://nodejs.org/) or `nvm install` |
| pnpm | >= 9 | `corepack enable && corepack prepare pnpm@latest --activate` |
| Git | any recent | [git-scm.com](https://git-scm.com/) |

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

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3000) |
| `RPC_URL` | Base RPC endpoint |
| `CONTRACT_ADDRESS` | Deployed SurveyPoints contract address |
| `MINTER_PRIVATE_KEY` | Backend wallet private key (must have MINTER_ROLE) |
| `ADMIN_WALLETS` | Comma-separated admin wallet addresses |
| `EXPLORER_BASE_URL` | Block explorer URL for transaction links |
| `FRONTEND_URL` | Frontend URL for CORS and template redirects |

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

| Variable | Description |
|---|---|
| `VITE_APP_NAME` | Application name shown in the UI |
| `VITE_API_URL` | Backend API base URL |
| `VITE_RPC_URL` | Base RPC endpoint for direct blockchain reads |
| `VITE_CONTRACT_ADDRESS` | Deployed SurveyPoints contract address |
| `VITE_EXPLORER_URL` | Block explorer base URL |
| `VITE_DEFAULT_LOCALE` | Default language (`en` or `de`) |

```bash
# Start the Vite dev server (port 5173)
pnpm --filter @vpp/frontend dev

# Build for production
pnpm --filter @vpp/frontend build

# Preview the production build
pnpm --filter @vpp/frontend preview
```

The dev server proxies `/api` requests to `http://localhost:3000` automatically.

## Full Local Stack

To run the complete system locally:

1. **Terminal 1** — Start a local Hardhat node:
   ```bash
   pnpm --filter @vpp/contracts hardhat node
   ```

2. **Terminal 2** — Deploy the contract locally:
   ```bash
   pnpm --filter @vpp/contracts run deploy:local
   # Note the deployed contract address from the output
   ```

3. **Terminal 3** — Start the backend:
   ```bash
   # Set CONTRACT_ADDRESS in packages/backend/.env to the deployed address
   # Set RPC_URL to http://127.0.0.1:8545
   pnpm --filter @vpp/backend dev
   ```

4. **Terminal 4** — Start the frontend:
   ```bash
   # Set VITE_CONTRACT_ADDRESS in packages/frontend/.env
   # Set VITE_RPC_URL to http://127.0.0.1:8545
   pnpm --filter @vpp/frontend dev
   ```

5. Open [http://localhost:5173](http://localhost:5173)

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
