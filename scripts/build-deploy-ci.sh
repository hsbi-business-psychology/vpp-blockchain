#!/usr/bin/env bash
set -euo pipefail

# Assemble the deploy/ folder from already-built artifacts (CI use).
# Expects contracts, backend, and frontend to be built already.
# Mirrors the monorepo layout so compiled path references resolve correctly.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"

rm -rf "$DEPLOY"
mkdir -p "$DEPLOY/packages/backend"
mkdir -p "$DEPLOY/packages/contracts/artifacts/contracts/SurveyPoints.sol"

# Backend compiled output
cp -r "$ROOT/packages/backend/dist" "$DEPLOY/packages/backend/dist"

# Frontend build → packages/backend/public/ (server.ts: resolve(__dirname, '../public'))
cp -r "$ROOT/packages/frontend/dist" "$DEPLOY/packages/backend/public"

# Contract ABI (blockchain.ts: resolve(__dirname, '../../../contracts/artifacts/...'))
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

# Plesk entry point
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

# Install production dependencies
cd "$DEPLOY" && npm install --omit=dev

echo "Deploy folder ready: $DEPLOY"
