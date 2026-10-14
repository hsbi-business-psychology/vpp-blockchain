#!/usr/bin/env bash
# Assembles deploy/ with the exact layout of /httpdocs on the Plesk host.
#
# Expects the contracts to be compiled, the frontend to be built and the
# backend to be bundled (pnpm --filter @vpp/backend bundle). The result has
# no node_modules: the backend is a single file, so a deploy uploads a few
# dozen files instead of ~4,000.
#
#   deploy/.htaccess
#   deploy/.deploy-manifest.json                  content hashes for the diff upload
#   deploy/packages/backend/app.js                Passenger entry point (CommonJS)
#   deploy/packages/backend/package.json
#   deploy/packages/backend/dist/server.mjs       bundled backend
#   deploy/packages/backend/public/               frontend, without source maps
#   deploy/packages/contracts/artifacts/…/SurveyPointsV3.json   ABI
#
# Never touches packages/backend/data/ on the server: it is not part of
# deploy/ and the uploader only writes files that are.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
BACKEND="$DEPLOY/packages/backend"
ABI_DIR="packages/contracts/artifacts/contracts/SurveyPointsV3.sol"

rm -rf "$DEPLOY"
mkdir -p "$BACKEND/dist" "$DEPLOY/$ABI_DIR"

cp "$ROOT/packages/backend/dist/bundle/server.mjs" "$BACKEND/dist/server.mjs"
cp -R "$ROOT/packages/frontend/dist" "$BACKEND/public"
find "$BACKEND/public" -name '*.map' -delete
cp "$ROOT/$ABI_DIR/SurveyPointsV3.json" "$DEPLOY/$ABI_DIR/SurveyPointsV3.json"

cat > "$BACKEND/app.js" << 'APPJS'
// Phusion Passenger entry point. Passenger loads CommonJS, the bundle is ESM.
process.env.VPP_BACKEND_ROOT = __dirname
import('./dist/server.mjs').catch((err) => {
  console.error('Failed to start VPP Backend:', err)
  process.exit(1)
})
APPJS

cat > "$BACKEND/package.json" << 'PKGJSON'
{
  "name": "vpp-blockchain-deploy",
  "private": true,
  "scripts": {
    "start": "node app.js"
  }
}
PKGJSON

cat > "$DEPLOY/.htaccess" << 'HTACCESS'
RewriteEngine On
RewriteRule ^gsn/ - [L,NC]
RewriteRule ^vpp/ - [L,NC]
RewriteRule ^kits/ - [L,NC]
AddType application/javascript .js
AddType application/xml .xml
HTACCESS

node "$ROOT/scripts/deploy-manifest.mjs" write "$DEPLOY"
echo "Deploy folder ready: $DEPLOY ($(find "$DEPLOY" -type f | wc -l | tr -d ' ') files)"
