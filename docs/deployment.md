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

Save the deployed contract address — you will need it for the backend and frontend configuration.

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

### Option C: Plesk / Shared Hosting

1. Upload the built backend (`packages/backend/dist/`) to the server
2. Configure the Node.js application in Plesk
3. Set environment variables in the Plesk panel
4. Point the domain to the Node.js application

## 3. Deploy the Frontend

The frontend is a static SPA — it can be served by any web server.

### Build

```bash
# Set production environment variables
cp packages/frontend/.env.example packages/frontend/.env
# Edit with production values:
#   VITE_API_URL=https://vpp.your-university.edu/api
#   VITE_RPC_URL=https://mainnet.base.org
#   VITE_CONTRACT_ADDRESS=0x_YOUR_CONTRACT

# Build
pnpm --filter @vpp/frontend build
```

The build output is in `packages/frontend/dist/`.

### Serve with Nginx

```nginx
server {
    listen 80;
    server_name vpp.your-university.edu;

    # Frontend (static files)
    root /var/www/vpp-frontend;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to the backend
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Copy Build Files

```bash
cp -r packages/frontend/dist/* /var/www/vpp-frontend/
```

## 4. Environment Variables Reference

### Backend

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `3000`) |
| `RPC_URL` | Yes | Base RPC endpoint |
| `CONTRACT_ADDRESS` | Yes | Deployed SurveyPoints address |
| `MINTER_PRIVATE_KEY` | Yes | Backend wallet private key (MINTER_ROLE) |
| `EXPLORER_BASE_URL` | Yes | Block explorer URL |
| `FRONTEND_URL` | Yes | Frontend URL (CORS + template redirects) |
| `CLAIM_RATE_LIMIT_WINDOW_MS` | No | Rate limit window for claims (default: `60000`) |
| `CLAIM_RATE_LIMIT_MAX` | No | Max claims per window (default: `5`) |
| `API_RATE_LIMIT_WINDOW_MS` | No | Rate limit window for API (default: `60000`) |
| `API_RATE_LIMIT_MAX` | No | Max API requests per window (default: `100`) |

### Frontend

| Variable | Required | Description |
|---|---|---|
| `VITE_APP_NAME` | No | Application name (default: `VPP Blockchain`) |
| `VITE_API_URL` | Yes | Backend API base URL |
| `VITE_RPC_URL` | Yes | Base RPC endpoint |
| `VITE_CONTRACT_ADDRESS` | Yes | Deployed SurveyPoints address |
| `VITE_EXPLORER_URL` | Yes | Block explorer base URL |
| `VITE_DEFAULT_LOCALE` | No | Default language `en` or `de` (default: `en`) |

## 5. Post-Deployment Checklist

- [ ] Smart contract deployed and verified on BaseScan
- [ ] Backend wallet has MINTER_ROLE on the contract
- [ ] Backend wallet is funded with ETH on Base
- [ ] Backend health check returns `200 OK` at `/api/health`
- [ ] Frontend loads and theme toggle works
- [ ] Admin can register a survey
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
