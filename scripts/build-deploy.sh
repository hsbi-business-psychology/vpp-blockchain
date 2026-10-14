#!/usr/bin/env bash
# Local counterpart of .github/workflows/deploy.yml: builds everything and
# assembles deploy/. With FTP_USERNAME and FTP_PASSWORD set it also uploads
# the changed files (scripts/deploy-ftp.sh). Use DRY_RUN=1 to see the plan.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUILD_ID="$(git rev-parse --short HEAD)"
export VPP_BUILD_ID="$BUILD_ID"

pnpm --filter @vpp/contracts run compile
pnpm --filter @vpp/frontend run build
pnpm --filter @vpp/backend run bundle
bash scripts/build-deploy-ci.sh

if [ -n "${FTP_USERNAME:-}" ]; then
  BUILD_ID="$BUILD_ID" bash scripts/deploy-ftp.sh
fi
