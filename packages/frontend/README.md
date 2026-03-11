# @vpp/frontend

Reference frontend for the VPP Blockchain system — a React SPA built with [shadcn/ui](https://ui.shadcn.com), Tailwind CSS, and ethers.js.

## Features

- **Wallet Management** — Create and import wallets directly in the browser (no MetaMask required)
- **Points Claiming** — Claim survey participation points via signed transactions
- **Points Dashboard** — View your points and transaction history
- **Public Explorer** — Look up points for any wallet address
- **Admin Dashboard** — Register surveys, download SoSci templates, monitor claims
- **Dark/Light Theme** — Professional UI with both modes
- **Internationalization** — English and German (i18next)
- **Mobile-First** — Fully responsive on all devices

## Quick Start

```bash
# From the monorepo root
pnpm install

# Start the dev server
pnpm --filter @vpp/frontend dev
```

The app runs at [http://localhost:5173](http://localhost:5173). API requests are proxied to the backend at `http://localhost:3000`.

## Environment Variables

Copy `.env.example` to `.env` and adjust the values:

| Variable | Description | Default |
|---|---|---|
| `VITE_APP_NAME` | Display name in the UI | `VPP Blockchain` |
| `VITE_API_URL` | Backend API base URL | `http://localhost:3000` |
| `VITE_RPC_URL` | Base L2 RPC endpoint | `https://sepolia.base.org` |
| `VITE_CONTRACT_ADDRESS` | Deployed SurveyPoints contract | — |
| `VITE_EXPLORER_URL` | Block explorer base URL | `https://sepolia.basescan.org` |
| `VITE_DEFAULT_LOCALE` | Default language (`en` or `de`) | `en` |

## Build

```bash
pnpm --filter @vpp/frontend build
```

The output is a static SPA in `dist/` that can be deployed to any static hosting (Vercel, Netlify, Nginx, etc.).

## For Other Universities

This frontend is designed to be deployed by any institution. No HSBI-specific content is hardcoded — all branding and configuration is injected via environment variables. See the root [README](../../README.md) for the full integration guide.
