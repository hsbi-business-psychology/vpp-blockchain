# Deployment

This guide covers deploying the complete VPP system to production.

## Prerequisites

- A deployed and verified `SurveyPoints` contract on Base (testnet or mainnet)
- A server with Node.js 20+ (or Docker support)
- A domain name configured to point to your server
- A backend wallet funded with ETH on Base (~$10 is sufficient)

## 1. Deploy the Smart Contract

### Testnet (Base Sepolia)

```bash
cd packages/contracts
cp .env.example .env
```

Edit `.env`:

```
DEPLOYER_PRIVATE_KEY=<your-deployer-private-key>
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=<your-basescan-api-key>
```

```bash
pnpm run deploy:sepolia
```

### Mainnet (Base)

```bash
pnpm run deploy:mainnet
```

The deploy script will output a **Deployment Summary** including the contract address, deploy block number, and ready-to-use environment variables. Save these — you need them for both the backend and frontend configuration.

### Verify the Contract

```bash
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS> <ADMIN_WALLET> <MINTER_WALLET>
```

## 2. Deploy the Backend

### Option A: Docker

```bash
# Build the Docker image
docker build -t vpp-backend -f packages/backend/Dockerfile .

# Run the container
docker run -d \
  --name vpp-backend \
  -p 3000:3000 \
  -e PORT=3000 \
  -e RPC_URL=https://mainnet.base.org \
  -e CONTRACT_ADDRESS=0x_YOUR_CONTRACT \
  -e MINTER_PRIVATE_KEY=0x_YOUR_KEY \
  -e EXPLORER_BASE_URL=https://basescan.org \
  -e FRONTEND_URL=https://vpp.your-university.edu \
  vpp-backend
```

### Option B: Manual (Node.js)

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Compile the contract (needed for ABI)
pnpm --filter @vpp/contracts run compile

# Build the backend
pnpm --filter @vpp/backend build

# Configure environment
cp packages/backend/.env.example packages/backend/.env
# Edit .env with production values

# Start with a process manager (e.g., pm2)
pm2 start packages/backend/dist/server.js --name vpp-backend
```

### Option C: Plesk (Recommended for HSBI)

Plesk with the Node.js extension (Phusion Passenger) runs the backend and serves the frontend from the same domain. Deploys upload only changed files over FTPS from the HSBI network (see below).

#### Initial Setup (one-time)

1. Log in to your Plesk panel (e.g., `https://hosting.hsbi.de:8443/`)
2. Go to your domain → **Node.js**
3. Configure:
   - **Node.js-Version**: 20 or newer
   - **Application root**: `/httpdocs/packages/backend`
   - **Document root**: `/httpdocs/packages/backend/public`
   - **Application startup file**: `app.js`
   - **Application mode**: production
4. Set **environment variables** in the Plesk Node.js panel (see `.env.production.example`). Do not set `PORT`; Passenger assigns it.
   - `NODE_ENV` = `production`
   - `RPC_URL` = your Base RPC endpoint
   - `CONTRACT_ADDRESS` = your deployed contract
   - `CONTRACT_DEPLOY_BLOCK` = block of the contract deployment
   - `MINTER_PRIVATE_KEY` = your backend wallet key
   - `EXPLORER_BASE_URL` = `https://basescan.org`
   - `FRONTEND_URL` = `https://vpstunden.hsbi.de`
   - `TRUST_PROXY` = `1` — **REQUIRED on Plesk** so Express reads the
     real client IP from `X-Forwarded-For` (Plesk fronts Phusion
     Passenger with Apache/Nginx). Without this, every request appears
     to come from the loopback address and the rate limiter cannot
     distinguish students.
   - `EXPECTED_CHAIN_ID` = `8453` (Base Mainnet) or `84532` (Sepolia) —
     fail-fast guard against an `RPC_URL` that points at the wrong chain.
5. Click **Enable Node.js**. No **NPM install** is needed: the deployed backend is a single bundled file without dependencies.

#### What gets deployed

`scripts/build-deploy-ci.sh` assembles `deploy/` in the layout of `/httpdocs`: the backend bundled into `packages/backend/dist/server.mjs` (esbuild, no `node_modules`), the frontend in `packages/backend/public/` without source maps, the contract ABI, a CommonJS `app.js` launcher for Passenger and `.deploy-manifest.json` with a hash of every file. About 40 files in total.

`scripts/deploy-ftp.sh` then uploads only files whose hash differs from the manifest on the server, in this order: assets, backend, Passenger restart (`tmp/restart.txt`), `index.html`, manifest. Files dropped from a build are deleted one deploy later, so browsers that still hold the previous `index.html` can load its chunks. Finally it waits until `/api/v1/health/live` reports the new build and checks that `index.html` loads its entry chunk. `packages/backend/data/` is never part of the upload and is never deleted.

#### Deploying from the HSBI network

`hosting.hsbi.de` completes the FTPS handshake only for clients inside the HSBI network or VPN. From elsewhere, GitHub-hosted runners included, the server answers the greeting and `FEAT` but never `AUTH TLS` (measured on 2026-10-14). Plain FTP would send the password unencrypted, so deploys run from a machine in the HSBI network or VPN. With the bundled backend that takes about a minute.

`.github/workflows/deploy.yml` does the same build and upload but is started by hand only (`gh workflow run deploy.yml -f ref=<sha-or-tag>`). It fails within minutes if the runner cannot reach the host. It needs these **GitHub Secrets**:

| Secret         | Value                   |
| -------------- | ----------------------- |
| `FTP_USERNAME` | Your Plesk FTP username |
| `FTP_PASSWORD` | Your Plesk FTP password |

The frontend settings (`VITE_*`) come from the committed `packages/frontend/.env.production`; they are public anyway because they end up in the browser bundle. `VITE_RPC_URL` may list several RPCs separated by commas.

#### Manual Deployment

From a machine in the HSBI network or VPN with `lftp` installed, after checking out the commit to deploy (usually `main`):

```bash
# Build and show what would be uploaded
FTP_USERNAME=... FTP_PASSWORD=... DRY_RUN=1 bash scripts/build-deploy.sh

# Build and upload
FTP_USERNAME=... FTP_PASSWORD=... bash scripts/build-deploy.sh
```

Never mirror `deploy/` with `--delete`: it would remove `packages/backend/data/`, which holds the survey HMAC keys.

## 3. Deploy the Frontend

### Standalone (without Plesk)

If running the backend separately, the frontend is a static SPA served by any web server.

```bash
pnpm --filter @vpp/frontend build
```

The build output is in `packages/frontend/dist/`. Set `VITE_API_URL` to your backend URL at build time.

### Combined with Backend (Plesk)

When using Plesk deployment (Option C above), the frontend is automatically bundled with the backend and served from the same Node.js process. Set `VITE_API_URL=""` (empty) so API calls use relative URLs.

### Serve with Nginx (alternative)

```nginx
server {
    listen 80;
    server_name vpp.your-university.edu;

    root /var/www/vpp-frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 4. Environment Variables Reference

### Backend

| Variable                     | Required | Description                                                                                   |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `PORT`                       | No       | Server port (default: `3000`)                                                                 |
| `RPC_URL`                    | Yes      | Base RPC endpoint                                                                             |
| `CONTRACT_ADDRESS`           | Yes      | Deployed SurveyPoints address                                                                 |
| `MINTER_PRIVATE_KEY`         | Yes      | Backend wallet private key (MINTER_ROLE)                                                      |
| `CONTRACT_DEPLOY_BLOCK`      | No       | Block number at contract deployment (speeds up event queries; default: `0`)                   |
| `EVENT_RPC_URL`              | No       | RPC URL(s) for `eth_getLogs`, comma-separated (default: `RPC_URL` + public fallbacks)         |
| `CHUNK_SIZE`                 | No       | Largest block range per `eth_getLogs`; halves automatically when refused (default: `2000000`) |
| `SYNC_INTERVAL_MS`           | No       | Background event sync interval (default: `300000`, five minutes)                              |
| `MAX_EVENT_LAG_BLOCKS`       | No       | Health reports degraded beyond this event-cache lag (default: `1800`, ~1 h)                   |
| `EXPECTED_CHAIN_ID`          | No       | Refuse to start on a different chain; also skips network detection                            |
| `EXPLORER_BASE_URL`          | Yes      | Block explorer URL                                                                            |
| `FRONTEND_URL`               | Yes      | Frontend URL (CORS + template redirects)                                                      |
| `CLAIM_RATE_LIMIT_WINDOW_MS` | No       | Rate limit window for claims (default: `60000`)                                               |
| `CLAIM_RATE_LIMIT_MAX`       | No       | Max claims per window (default: `5`)                                                          |
| `API_RATE_LIMIT_WINDOW_MS`   | No       | Rate limit window for API (default: `60000`)                                                  |
| `API_RATE_LIMIT_MAX`         | No       | Max API requests per window (default: `100`)                                                  |

### Frontend

| Variable                     | Required | Description                                                                 |
| ---------------------------- | -------- | --------------------------------------------------------------------------- |
| `VITE_APP_NAME`              | No       | Application name (default: `VPP Blockchain`)                                |
| `VITE_API_URL`               | Yes      | Backend API base URL                                                        |
| `VITE_RPC_URL`               | Yes      | Base RPC endpoint                                                           |
| `VITE_CONTRACT_ADDRESS`      | Yes      | Deployed SurveyPoints address                                               |
| `VITE_CONTRACT_DEPLOY_BLOCK` | No       | Block number at contract deployment (speeds up event queries; default: `0`) |
| `VITE_EXPLORER_URL`          | Yes      | Block explorer base URL                                                     |
| `VITE_DEFAULT_LOCALE`        | No       | Default language `en` or `de` (default: `en`)                               |

## 5. Post-Deployment Checklist

- [ ] Smart contract deployed and verified on BaseScan
- [ ] Backend wallet has MINTER_ROLE on the contract
- [ ] Backend wallet is funded with ETH on Base
- [ ] Backend health check returns `200 OK` at `/api/health`
- [ ] Frontend loads and theme toggle works
- [ ] Admin can register a survey
- [ ] `CONTRACT_DEPLOY_BLOCK` is set for faster event queries
- [ ] Test claim flow works end-to-end
- [ ] CORS is configured correctly (no cross-origin errors)
- [ ] HTTPS is enabled (required for wallet signing in production)
- [ ] Rate limiting is active

## 6. Monitoring

### Health Check

```bash
curl https://vpp.your-university.edu/api/v1/health/ready
```

Expected response:

```json
{
  "status": "ok",
  "uptime": 3600,
  "blockchain": { "connected": true, "network": "base", "blockNumber": 52585277 },
  "eventStore": { "ready": true, "lastSyncedBlock": 52585270, "lagBlocks": 7 }
}
```

`/ready` answers `503` with `"status": "degraded"` when the RPC is unreachable or the event cache trails the chain by more than `MAX_EVENT_LAG_BLOCKS`. `/api/v1/health/live` only says the process is up and reports the deployed `build`. `/api/v1/health/diag` probes every configured RPC and shows the event-sync state.

The workflow `.github/workflows/health.yml` probes `/ready` twice an hour. A failed run makes GitHub notify whoever last changed its schedule. GitHub pauses scheduled workflows after 60 days without repository activity and sends an email first; re-enable it in the Actions tab.

### RPC provider

Reads (`eth_call`) work on any public Base RPC. Event history needs `eth_getLogs` over old blocks, which the free public endpoints refuse (October 2026: publicnode wants a token, drpc's free plan caps the range, mainnet.base.org rate-limits; Alchemy Free allows 10 blocks per call). Put an endpoint that accepts wide ranges first in `RPC_URL` (or in `EVENT_RPC_URL`). On Alchemy Pay-as-you-go one call covers any range up to 10,000 logs; with the five-minute sync, VPP uses roughly 2-3 million compute units a month, about 1-2 USD. Set a usage limit in the Alchemy dashboard. If every source refuses a range, the backend halves it and keeps going, so a free endpoint still works, only slower to catch up.

### Backend Wallet Balance

Monitor the backend wallet balance on [BaseScan](https://basescan.org). When balance drops below $1, top up to continue processing claims.

### Logs

If using Docker:

```bash
docker logs vpp-backend --follow
```

If using pm2:

```bash
pm2 logs vpp-backend
```
