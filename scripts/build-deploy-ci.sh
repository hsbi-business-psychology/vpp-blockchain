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

# package.json at the Plesk app root (CJS — Passenger can't load ESM entry points)
cat > "$DEPLOY/packages/backend/package.json" << 'PKGJSON'
{
  "name": "vpp-blockchain-deploy",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node app.js"
  },
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

# dist/ files are ESM (compiled TypeScript), so they need their own type marker
cat > "$DEPLOY/packages/backend/dist/package.json" << 'DISTPKG'
{ "type": "module" }
DISTPKG

# Plesk entry point — CJS wrapper that dynamically imports the ESM backend
cat > "$DEPLOY/packages/backend/app.js" << 'APPJS'
const { config: loadEnv } = require('dotenv')
const { resolve } = require('path')

loadEnv({ path: resolve(__dirname, '.env') })

import('./dist/server.js')
  .then(() => console.log('VPP Backend started'))
  .catch(err => {
    console.error('Failed to start VPP Backend:', err)
    process.exit(1)
  })
APPJS

# .htaccess at httpdocs root — override any leftover WordPress/legacy rules
cat > "$DEPLOY/.htaccess" << 'HTACCESS'
RewriteEngine On
RewriteRule ^gsn/ - [L,NC]
RewriteRule ^vpp/ - [L,NC]
RewriteRule ^kits/ - [L,NC]
AddType application/javascript .js
AddType application/xml .xml
HTACCESS

echo "Deploy folder ready: $DEPLOY (without node_modules)"
