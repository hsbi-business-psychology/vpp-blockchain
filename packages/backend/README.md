# @vpp/backend

Node.js/Express API server that acts as a relayer between the VPP frontend (or any client) and the `SurveyPoints` smart contract on Base L2.

## Overview

The backend handles three core responsibilities:

1. **Transaction relay** — Receives signed claim requests from students, verifies them, and submits the on-chain transaction (paying gas on behalf of the user)
2. **Admin operations** — Allows authorized wallets to register surveys on-chain and download SoSci Survey templates
3. **Data aggregation** — Reads points and survey data from the blockchain and returns it in a structured format

All persistent data lives on the blockchain. The backend maintains a local **event store** (`data/events.json`) as a cache for fast queries — this file is rebuilt automatically from the chain if deleted.

## API Endpoints

All endpoints are versioned under `/api/v1`. Legacy `/api/*` requests are redirected via `308`.

| Method | Path                           | Auth             | Description                          |
| ------ | ------------------------------ | ---------------- | ------------------------------------ |
| `POST` | `/api/v1/claim`                | Wallet signature | Claim points for a completed survey  |
| `GET`  | `/api/v1/points/:wallet`       | None             | Get total points and claim history   |
| `POST` | `/api/v1/surveys`              | Admin signature  | Register a new survey on-chain       |
| `GET`  | `/api/v1/surveys`              | None             | List all registered surveys          |
| `POST` | `/api/v1/surveys/:id/template` | Admin signature  | Download SoSci Survey XML template   |
| `GET`  | `/api/v1/admin`                | Admin signature  | List current admin addresses         |
| `POST` | `/api/v1/admin/add`            | Admin signature  | Grant admin role to an address       |
| `POST` | `/api/v1/admin/remove`         | Admin signature  | Revoke admin role from an address    |
| `GET`  | `/api/v1/health/live`          | None             | Liveness probe (always 200)          |
| `GET`  | `/api/v1/health/ready`         | None             | Readiness probe (blockchain + store) |

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

| Variable                     | Required | Default                        | Description                                                                                 |
| ---------------------------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| `PORT`                       | No       | `3000`                         | Server port                                                                                 |
| `RPC_URL`                    | **Yes**  | —                              | Base RPC endpoint                                                                           |
| `CONTRACT_ADDRESS`           | **Yes**  | —                              | Deployed SurveyPoints contract address                                                      |
| `MINTER_PRIVATE_KEY`         | **Yes**  | —                              | Private key of the backend wallet (MINTER_ROLE)                                             |
| `CONTRACT_DEPLOY_BLOCK`      | No       | `0`                            | Block number of contract deploy (speeds up event queries)                                   |
| `EXPECTED_CHAIN_ID`          | No       | —                              | If set, validates RPC chain ID at startup (e.g. `84532`)                                    |
| `EXPLORER_BASE_URL`          | No       | `https://sepolia.basescan.org` | Block explorer URL for transaction links                                                    |
| `FRONTEND_URL`               | No       | `http://localhost:5173`        | Frontend URL for CORS                                                                       |
| `LOG_LEVEL`                  | No       | `info`                         | Pino log level (`fatal`/`error`/`warn`/`info`/`debug`/`trace`)                              |
| `TRUST_PROXY`                | No       | `false`                        | Express trust proxy setting for reverse proxies                                             |
| `MAX_MESSAGE_AGE_MS`         | No       | `60000`                        | Max age (ms) for signed claim/admin messages (60 s; raise carefully — widens replay window) |
| `SYNC_INTERVAL_MS`           | No       | `60000`                        | Event store sync interval (ms)                                                              |
| `CACHE_TTL_MS`               | No       | `30000`                        | Survey cache TTL (ms)                                                                       |
| `CHUNK_SIZE`                 | No       | `9000`                         | Block range per RPC query chunk                                                             |
| `CLAIM_RATE_LIMIT_WINDOW_MS` | No       | `60000`                        | Claim rate limit window (ms)                                                                |
| `CLAIM_RATE_LIMIT_MAX`       | No       | `5`                            | Max claims per window                                                                       |
| `API_RATE_LIMIT_WINDOW_MS`   | No       | `60000`                        | API rate limit window (ms)                                                                  |
| `API_RATE_LIMIT_MAX`         | No       | `100`                          | Max API requests per window                                                                 |
| `RATE_LIMIT_STORE`           | No       | `memory`                       | Rate limit backend (`memory` or `redis`)                                                    |
| `REDIS_URL`                  | No       | —                              | Redis URL (required when `RATE_LIMIT_STORE=redis`)                                          |

## Docker

### Build & Run

```bash
# Build from the repository root (context must be repo root for monorepo layout)
docker build -f packages/backend/Dockerfile -t vpp-backend .

# Run with a named volume for persistent event store data
docker run -d \
  --name vpp-backend \
  -p 3000:3000 \
  -v vpp-data:/app/packages/backend/data \
  --env-file packages/backend/.env \
  vpp-backend
```

### Volumes

| Mount Point                  | Purpose                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `/app/packages/backend/data` | Event store cache (`events.json`). Survives container restarts. Auto-rebuilt from chain if missing. |

### Health Checks

The Dockerfile includes a built-in `HEALTHCHECK` against `/api/v1/health/live`. For Kubernetes or Docker Compose, use:

- **Liveness**: `GET /api/v1/health/live` — always returns 200 if the process is alive
- **Readiness**: `GET /api/v1/health/ready` — returns 200 only when blockchain is reachable and event store is synced

### Graceful Shutdown

The container uses `STOPSIGNAL SIGTERM`. The server drains active connections and stops the event store sync before exiting. The default timeout is 10 seconds.

## Architecture

```
Request → Express → Middleware (rate-limit, pino-http, auth) → Route Handler → Blockchain Service → Response
                                                                                    ↕
                                                                              Event Store (data/events.json)
```

Admin access is managed on-chain via `ADMIN_ROLE` in the smart contract — no `ADMIN_WALLETS` env var needed.

## License

[MIT](../../LICENSE)
