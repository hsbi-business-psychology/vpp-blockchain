#!/usr/bin/env bash
set -euo pipefail

# Assemble the deploy/ folder from already-built artifacts (CI use).
# Expects contracts, backend, and frontend to be built already.
#
# Plesk sets Anwendungsstamm = parent of Dokumentenstamm.
# With Dokumentenstamm = /httpdocs/packages/backend/public,
# Plesk expects app.js + package.json at /httpdocs/packages/backend/.
#
# node_modules are NOT included — run "NPM install" in Plesk.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"

rm -rf "$DEPLOY"
mkdir -p "$DEPLOY/packages/backend"
mkdir -p "$DEPLOY/packages/contracts/artifacts/contracts/SurveyPoints.sol"

# Backend compiled output
cp -r "$ROOT/packages/backend/dist" "$DEPLOY/packages/backend/dist"

# Frontend build → packages/backend/public/
cp -r "$ROOT/packages/frontend/dist" "$DEPLOY/packages/backend/public"

# Contract ABI (blockchain.ts: resolve(__dirname, '../../../contracts/artifacts/...'))
cp "$ROOT/packages/contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json" \
   "$DEPLOY/packages/contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json"

# package.json at the Plesk app root (packages/backend/)
cat > "$DEPLOY/packages/backend/package.json" << 'PKGJSON'
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

# Plesk entry point at the Plesk app root (packages/backend/)
cat > "$DEPLOY/packages/backend/app.js" << 'APPJS'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(__dirname, '.env') })

// server.js auto-starts when NODE_ENV !== 'test'
try {
  await import('./dist/server.js')
} catch (err) {
  console.error('Failed to start VPP Backend:', err)
  process.exit(1)
}
APPJS

echo "Deploy folder ready: $DEPLOY (without node_modules)"
