# Stage 1: Build
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/backend/package.json packages/backend/
COPY packages/contracts/package.json packages/contracts/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/contracts/artifacts packages/contracts/artifacts/
COPY packages/backend/ packages/backend/

RUN pnpm --filter @vpp/backend build

# Stage 2: Runtime
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/backend/package.json packages/backend/
COPY packages/contracts/package.json packages/contracts/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/backend/dist packages/backend/dist/
COPY packages/contracts/artifacts packages/contracts/artifacts/

ENV NODE_ENV=production
EXPOSE 3000
STOPSIGNAL SIGTERM

CMD ["node", "packages/backend/dist/server.js"]
