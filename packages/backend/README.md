# @vpp/backend

Stateless Node.js/Express API server that acts as a relayer between the VPP frontend (or any client) and the `SurveyPoints` smart contract on Base L2.

## Overview

The backend handles three core responsibilities:

1. **Transaction relay** — Receives signed claim requests from students, verifies them, and submits the on-chain transaction (paying gas on behalf of the user)
2. **Admin operations** — Allows authorized wallets to register surveys on-chain and download SoSci Survey templates
3. **Data aggregation** — Reads points and survey data from the blockchain and returns it in a structured format

**No database required** — all persistent data lives on the blockchain. The backend is fully stateless.

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/claim` | Wallet signature | Claim points for a completed survey |
| `GET` | `/api/points/:wallet` | None | Get total points and claim history |
| `POST` | `/api/surveys` | Admin signature | Register a new survey on-chain |
| `GET` | `/api/surveys` | None | List all registered surveys |
| `GET` | `/api/surveys/:id/template` | None | Download SoSci Survey XML template |
| `GET` | `/api/health` | None | Health check |

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- A deployed `SurveyPoints` contract (see `packages/contracts`)

### Setup

```bash
# From the repository root
pnpm install

# Configure environment
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your values
```

### Commands

```bash
# Start development server (with hot reload)
pnpm --filter @vpp/backend dev

# Build for production
pnpm --filter @vpp/backend build

# Start production server
pnpm --filter @vpp/backend start

# Run tests
pnpm --filter @vpp/backend test
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 3000) |
| `RPC_URL` | Yes | Base RPC endpoint |
| `CONTRACT_ADDRESS` | Yes | Deployed SurveyPoints contract address |
| `MINTER_PRIVATE_KEY` | Yes | Private key of the backend wallet (MINTER_ROLE) |
| `ADMIN_WALLETS` | Yes | Comma-separated admin wallet addresses |
| `EXPLORER_BASE_URL` | No | Block explorer URL (default: https://sepolia.basescan.org) |
| `FRONTEND_URL` | No | Frontend URL for CORS (default: http://localhost:5173) |

## Architecture

```
Request → Express → Middleware (rate-limit, auth) → Route Handler → Blockchain Service → Response
```

The backend never stores state. Every read operation queries the blockchain directly, and every write operation submits a transaction through the backend's MINTER wallet.

## License

[MIT](../../LICENSE)
