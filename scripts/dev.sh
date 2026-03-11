#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "=== VPP Blockchain — Local Development ==="
echo ""
echo "Starting Hardhat node, deploying contract, and launching backend + frontend..."
echo ""

# Copy .env.development → .env for backend if not present
cp -n packages/backend/.env.development packages/backend/.env 2>/dev/null || true

# Start Hardhat node, wait for it, deploy, then start backend + frontend
npx concurrently \
  --names "chain,backend,frontend" \
  --prefix-colors "yellow,cyan,green" \
  --kill-others-on-fail \
  "npx --filter @vpp/contracts hardhat node" \
  "sleep 3 && pnpm dev:deploy && pnpm --filter @vpp/backend dev" \
  "sleep 6 && pnpm --filter @vpp/frontend dev"
