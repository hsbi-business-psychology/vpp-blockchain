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

Plesk with the Node.js extension runs the backend and serves the frontend from the same domain. A GitHub Actions workflow deploys automatically on every push to `main`.

#### Initial Setup (one-time)

1. Log in to your Plesk panel (e.g., `https://hosting.hsbi.de:8443/`)
2. Go to your domain → **Node.js**
3. Configure:
   - **Node.js-Version**: 21+ (or highest available)
   - **Package Manager**: npm
   - **Application root**: `/httpdocs`
   - **Application startup file**: `app.js`
   - **Application mode**: production
4. Set **environment variables** in the Plesk Node.js panel (see `.env.production.example`):
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
   - `RPC_URL` = your Base RPC endpoint
   - `CONTRACT_ADDRESS` = your deployed contract
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
5. Click **Enable Node.js** and then **NPM Install**

#### GitHub Actions Deployment

The repository includes a `.github/workflows/deploy.yml` workflow that:

1. Builds contracts, backend, and frontend
2. Assembles everything into a deploy folder
3. Uploads via FTP to the Plesk server

Set these **GitHub Secrets** (Repository → Settings → Secrets and variables → Actions):

| Secret                       | Value                          |
| ---------------------------- | ------------------------------ |
| `FTP_USERNAME`               | Your Plesk FTP username        |
| `FTP_PASSWORD`               | Your Plesk FTP password        |
| `VITE_RPC_URL`               | `https://mainnet.base.org`     |
| `VITE_CONTRACT_ADDRESS`      | Your deployed contract address |
| `VITE_CONTRACT_DEPLOY_BLOCK` | Block number at deployment     |
| `VITE_EXPLORER_URL`          | `https://basescan.org`         |

The workflow runs on every push to `main` and can also be triggered manually via the Actions tab.

#### Manual Deployment

```bash
# Build everything into deploy/ folder
bash scripts/build-deploy.sh

# Upload deploy/ contents to /httpdocs/ via FTP or Plesk File Manager
# Then restart the Node.js app in the Plesk panel
```

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

| Variable                     | Required | Description                                                                 |
| ---------------------------- | -------- | --------------------------------------------------------------------------- |
| `PORT`                       | No       | Server port (default: `3000`)                                               |
| `RPC_URL`                    | Yes      | Base RPC endpoint                                                           |
| `CONTRACT_ADDRESS`           | Yes      | Deployed SurveyPoints address                                               |
| `MINTER_PRIVATE_KEY`         | Yes      | Backend wallet private key (MINTER_ROLE)                                    |
| `CONTRACT_DEPLOY_BLOCK`      | No       | Block number at contract deployment (speeds up event queries; default: `0`) |
| `EXPLORER_BASE_URL`          | Yes      | Block explorer URL                                                          |
| `FRONTEND_URL`               | Yes      | Frontend URL (CORS + template redirects)                                    |
| `CLAIM_RATE_LIMIT_WINDOW_MS` | No       | Rate limit window for claims (default: `60000`)                             |
| `CLAIM_RATE_LIMIT_MAX`       | No       | Max claims per window (default: `5`)                                        |
| `API_RATE_LIMIT_WINDOW_MS`   | No       | Rate limit window for API (default: `60000`)                                |
| `API_RATE_LIMIT_MAX`         | No       | Max API requests per window (default: `100`)                                |

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
curl https://vpp.your-university.edu/api/health
```

Expected response:

```json
{
  "status": "ok",
  "uptime": 3600,
  "blockchain": {
    "connected": true,
    "network": "base",
    "blockNumber": 12345678
  }
}
```

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
