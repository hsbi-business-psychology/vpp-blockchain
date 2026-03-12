#!/usr/bin/env bash
set -euo pipefail

# Build everything into a deploy-ready folder structure for Plesk.
#
# Plesk sets Anwendungsstamm = parent of Dokumentenstamm.
# With Dokumentenstamm = /httpdocs/packages/backend/public,
# Plesk expects app.js + package.json at /httpdocs/packages/backend/.
#
# Result:
#   deploy/
#   └── packages/
#       ├── backend/
#       │   ├── app.js              ← Plesk entry point
#       │   ├── package.json        ← Production deps
#       │   ├── dist/               ← Compiled backend
#       │   └── public/             ← Built frontend (SPA)
#       └── contracts/
#           └── artifacts/…         ← Contract ABI

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"

echo "=== Building for Plesk deployment ==="

rm -rf "$DEPLOY"
mkdir -p "$DEPLOY"

# 1. Compile contracts (needed for ABI artifact)
echo "[1/4] Compiling contracts..."
pnpm --filter @vpp/contracts run compile

# 2. Build backend
echo "[2/4] Building backend..."
pnpm --filter @vpp/backend run build

# 3. Build frontend
echo "[3/4] Building frontend..."
pnpm --filter @vpp/frontend run build

# 4. Assemble deploy folder
echo "[4/4] Assembling deploy folder..."

mkdir -p "$DEPLOY/packages/backend"
mkdir -p "$DEPLOY/packages/contracts/artifacts/contracts/SurveyPoints.sol"

# Backend compiled output
cp -r "$ROOT/packages/backend/dist" "$DEPLOY/packages/backend/dist"

# Frontend build → packages/backend/public/
cp -r "$ROOT/packages/frontend/dist" "$DEPLOY/packages/backend/public"

# Contract ABI
cp "$ROOT/packages/contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json" \
   "$DEPLOY/packages/contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json"

# package.json at Plesk app root (CJS — Passenger can't load ESM entry points)
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

echo ""
echo "=== Deploy folder ready: $DEPLOY ==="
echo ""
echo "Next steps:"
echo "  1. Upload deploy/ contents to /httpdocs/ on Plesk"
echo "  2. In Plesk: set Dokumentenstamm to '/httpdocs/packages/backend/public'"
echo "  3. In Plesk: set Anwendungsstartdatei to 'app.js'"
echo "  4. In Plesk: click 'NPM install' then 'Restart'"
