#!/usr/bin/env bash
set -euo pipefail

# Build everything into a deploy-ready folder structure for Plesk.
#
# The folder structure mirrors the monorepo layout so that compiled
# path references (../../contracts, ../public etc.) resolve correctly.
#
# Result:
#   deploy/
#   ├── app.js                              ← Plesk entry point
#   ├── package.json                        ← Production deps only
#   ├── .env                                ← Must be created on the server
#   ├── node_modules/
#   └── packages/
#       ├── backend/
#       │   ├── dist/                       ← Compiled backend
#       │   └── public/                     ← Built frontend (SPA)
#       └── contracts/
#           └── artifacts/contracts/…       ← Contract ABI

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"

echo "=== Building for Plesk deployment ==="

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

# 4. Assemble deploy folder (mirror monorepo structure for correct paths)
echo "[4/5] Assembling deploy folder..."

# Backend compiled output → packages/backend/dist/
mkdir -p "$DEPLOY/packages/backend"
cp -r "$ROOT/packages/backend/dist" "$DEPLOY/packages/backend/dist"

# Frontend build → packages/backend/public/ (server.ts resolves ../public relative to dist/)
cp -r "$ROOT/packages/frontend/dist" "$DEPLOY/packages/backend/public"

# Contract ABI → packages/contracts/artifacts/ (blockchain.ts resolves ../../../contracts relative to dist/services/)
mkdir -p "$DEPLOY/packages/contracts/artifacts/contracts/SurveyPoints.sol"
cp "$ROOT/packages/contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json" \
   "$DEPLOY/packages/contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json"

# Production package.json
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

# Plesk entry point — loads dotenv with explicit path, then starts the server
cat > "$DEPLOY/app.js" << 'APPJS'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(__dirname, '.env') })

try {
  const { createApp } = await import('./packages/backend/dist/server.js')
  const app = createApp()
  const port = process.env.PORT || 3000

  app.listen(port, () => {
    console.log(`VPP Backend listening on port ${port}`)
  })
} catch (err) {
  console.error('Failed to start VPP Backend:', err)
  process.exit(1)
}
APPJS

# .env template
if [ -f "$ROOT/packages/backend/.env.example" ]; then
  cp "$ROOT/packages/backend/.env.example" "$DEPLOY/.env.example"
fi

echo ""
echo "=== Deploy folder ready: $DEPLOY (without node_modules) ==="
echo ""
echo "Next steps:"
echo "  1. Upload the deploy/ folder contents to /httpdocs/ on Plesk"
echo "  2. In Plesk: set Application startup file to 'app.js'"
echo "  3. In Plesk: set Document root to '/httpdocs/packages/backend/public'"
echo "  4. In Plesk: click 'NPM install' then 'Restart'"
