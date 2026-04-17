#!/usr/bin/env bash
set -euo pipefail

# Assemble the deploy/ folder from already-built artifacts (CI use).
# Expects contracts, backend, and frontend to be built already.
#
# Plesk sets Anwendungsstamm = parent of Dokumentenstamm.
# With Dokumentenstamm = /httpdocs/packages/backend/public,
# Plesk expects app.js + package.json at /httpdocs/packages/backend/.
#
# We bundle production node_modules here so Passenger does not depend on
# Plesk having run "NPM install" with the right registry / lockfile.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
BACKEND_DEPLOY="$DEPLOY/packages/backend"

rm -rf "$DEPLOY"
mkdir -p "$BACKEND_DEPLOY"
mkdir -p "$DEPLOY/packages/contracts/artifacts/contracts/SurveyPointsV2.sol"

# Backend compiled output
cp -r "$ROOT/packages/backend/dist" "$BACKEND_DEPLOY/dist"

# Frontend build → packages/backend/public/
cp -r "$ROOT/packages/frontend/dist" "$BACKEND_DEPLOY/public"

# Contract ABI (blockchain.ts loads SurveyPointsV2 via
# resolve(__dirname, '../../../contracts/artifacts/contracts/SurveyPointsV2.sol/SurveyPointsV2.json'))
# V1 was retired in the V2 cutover (see docs/v2-migration-runbook.md).
cp "$ROOT/packages/contracts/artifacts/contracts/SurveyPointsV2.sol/SurveyPointsV2.json" \
   "$DEPLOY/packages/contracts/artifacts/contracts/SurveyPointsV2.sol/SurveyPointsV2.json"

# Generate a self-contained package.json:
#  - same dependencies as the backend (so prod installs everything pino etc. need)
#  - workspace: deps stripped (only @vpp/shared, which is type-only)
#  - devDependencies stripped
#  - "type" omitted at this level — the CJS app.js loads the ESM dist
#  - scripts include "start" so Plesk and `npm start` both work
node - "$ROOT/packages/backend/package.json" "$BACKEND_DEPLOY/package.json" <<'NODE'
const fs = require('node:fs')
const [, , src, dst] = process.argv
const pkg = JSON.parse(fs.readFileSync(src, 'utf8'))
const deps = Object.fromEntries(
  Object.entries(pkg.dependencies || {}).filter(([, v]) => !String(v).startsWith('workspace:')),
)
const out = {
  name: 'vpp-blockchain-deploy',
  version: pkg.version || '1.0.0',
  private: true,
  scripts: { start: 'node app.js' },
  dependencies: deps,
}
fs.writeFileSync(dst, JSON.stringify(out, null, 2) + '\n')
NODE

# dist/ files are ESM (compiled TypeScript), so they need their own type marker
cat > "$BACKEND_DEPLOY/dist/package.json" << 'DISTPKG'
{ "type": "module" }
DISTPKG

# Plesk entry point — CJS wrapper that dynamically imports the ESM backend
cat > "$BACKEND_DEPLOY/app.js" << 'APPJS'
const { config: loadEnv } = require('dotenv')
const { resolve } = require('path')

loadEnv({ path: resolve(__dirname, '.env') })

import('./dist/server.js')
  .then(() => console.log('VPP Backend started'))
  .catch((err) => {
    console.error('Failed to start VPP Backend:', err)
    process.exit(1)
  })
APPJS

# Install production deps INSIDE the deploy folder, using npm so Plesk's
# Node.js runtime (which only ships npm by default) sees a valid layout.
# --omit=dev: skip vitest, tsx, etc.
# --no-audit / --no-fund / --loglevel=error: keep CI logs clean
echo "Installing production dependencies into $BACKEND_DEPLOY ..."
(
  cd "$BACKEND_DEPLOY"
  npm install --omit=dev --no-audit --no-fund --loglevel=error
)

# .htaccess at httpdocs root — override any leftover WordPress/legacy rules
cat > "$DEPLOY/.htaccess" << 'HTACCESS'
RewriteEngine On
RewriteRule ^gsn/ - [L,NC]
RewriteRule ^vpp/ - [L,NC]
RewriteRule ^kits/ - [L,NC]
AddType application/javascript .js
AddType application/xml .xml
HTACCESS

BACKEND_NM_SIZE=$(du -sh "$BACKEND_DEPLOY/node_modules" 2>/dev/null | cut -f1 || echo "?")
echo "Deploy folder ready: $DEPLOY (backend node_modules: $BACKEND_NM_SIZE)"
