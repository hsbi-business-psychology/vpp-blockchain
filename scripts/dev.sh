#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "=== VPP Blockchain — Local Development ==="
echo ""

# Free ports 8545 (chain) and 3000 (backend) if occupied
for PORT in 8545 3000; do
  PID=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "Killing existing process on port $PORT (pid $PID)..."
    kill -9 $PID 2>/dev/null || true
    sleep 0.5
  fi
done

# Copy .env.development → .env for backend if not present
cp -n packages/backend/.env.development packages/backend/.env 2>/dev/null || true

echo "Starting Hardhat node, deploying contract, and launching backend + frontend..."
echo ""

pnpm exec concurrently \
  --names "chain,backend,frontend" \
  --prefix-colors "yellow,cyan,green" \
  --kill-others-on-fail \
  "pnpm --filter @vpp/contracts exec hardhat node" \
  "sleep 4 && pnpm dev:deploy && pnpm --filter @vpp/backend dev" \
  "sleep 8 && pnpm --filter @vpp/frontend dev"
