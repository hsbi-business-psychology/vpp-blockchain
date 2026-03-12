#!/usr/bin/env bash
set -euo pipefail

# Build everything into a deploy-ready folder structure for Plesk.
#
# Result:
#   deploy/
#   ├── app.js              ← Plesk entry point
#   ├── package.json        ← Production deps only
#   ├── .env                ← Must be created on the server
#   ├── dist/               ← Compiled backend
#   │   └── public/         ← Built frontend (SPA)
#   └── contracts/artifacts ← Contract ABI

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"

echo "=== Building for Plesk deployment ==="

# Clean previous build
rm -rf "$DEPLOY"
mkdir -p "$DEPLOY"

# 1. Compile contracts (needed for ABI artifact)
echo "[1/5] Compiling contracts..."
pnpm --filter @vpp/contracts run compile

# 2. Build backend
echo "[2/5] Building backend..."
pnpm --filter @vpp/backend run build

# 3. Build frontend
echo "[3/5] Building frontend..."
pnpm --filter @vpp/frontend run build

# 4. Assemble deploy folder
echo "[4/5] Assembling deploy folder..."

# Backend compiled output
cp -r "$ROOT/packages/backend/dist" "$DEPLOY/dist"

# Frontend build → dist/public/ (so the backend serves it)
cp -r "$ROOT/packages/frontend/dist" "$DEPLOY/dist/public"

# Contract ABI (relative path expected by blockchain.ts)
mkdir -p "$DEPLOY/contracts/artifacts/contracts/SurveyPoints.sol"
cp "$ROOT/packages/contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json" \
   "$DEPLOY/contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json"

# Production package.json (backend deps only)
cat > "$DEPLOY/package.json" << 'PKGJSON'
{
  "name": "vpp-blockchain-deploy",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.0",
    "ethers": "^6.13.0",
    "express": "^4.21.0",
    "express-rate-limit": "^7.5.0",
    "helmet": "^8.0.0",
    "zod": "^3.24.0"
  }
}
PKGJSON

# Plesk entry point
cat > "$DEPLOY/app.js" << 'APPJS'
import { createApp } from './dist/server.js'

const app = createApp()
const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`VPP Backend listening on port ${port}`)
})
APPJS

# .env template
cp "$ROOT/packages/backend/.env.example" "$DEPLOY/.env.example"

echo "[5/5] Installing production dependencies..."
cd "$DEPLOY" && npm install --omit=dev

echo ""
echo "=== Deploy folder ready: $DEPLOY ==="
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and fill in production values"
echo "  2. Upload the deploy/ folder contents to /httpdocs/ on Plesk"
echo "  3. In Plesk: set Application startup file to 'app.js'"
echo "  4. In Plesk: set Document root to '/httpdocs/dist/public'"
echo "  5. Click 'Restart' in the Node.js panel"
