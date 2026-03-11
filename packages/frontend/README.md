# @vpp/frontend

Reference frontend for the VPP Blockchain system — a React SPA built with [shadcn/ui](https://ui.shadcn.com), Tailwind CSS, and ethers.js.

## Features

- **Wallet Management** — Create a browser wallet, connect MetaMask, or import a private key
- **MetaMask Support** — Optional MetaMask integration for secure key management
- **Points Claiming** — Claim survey participation points via signed messages
- **Points Dashboard** — View your points and transaction history
- **Public Explorer** — Look up points for any wallet address
- **Admin Dashboard** — Register surveys, download SoSci templates, monitor claims, manage roles
- **In-App Documentation** — Comprehensive wiki-style docs with diagrams and guides
- **Dark/Light Theme** — Professional UI with both modes
- **Internationalization** — English and German (i18next)
- **Mobile-First** — Fully responsive on all devices
- **Accessible** — WCAG-compliant with skip links, ARIA labels, keyboard navigation
- **SEO Optimized** — Open Graph, Twitter Cards, structured data, dynamic page titles
- **Performance** — Route-based code splitting, lazy loading, image optimization

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

| Variable                     | Description                                             | Default                        |
| ---------------------------- | ------------------------------------------------------- | ------------------------------ |
| `VITE_APP_NAME`              | Display name in the UI                                  | `VPP Blockchain`               |
| `VITE_API_URL`               | Backend API base URL                                    | `http://localhost:3000`        |
| `VITE_RPC_URL`               | Base L2 RPC endpoint                                    | `https://sepolia.base.org`     |
| `VITE_CONTRACT_ADDRESS`      | Deployed SurveyPoints contract                          | —                              |
| `VITE_EXPLORER_URL`          | Block explorer base URL                                 | `https://sepolia.basescan.org` |
| `VITE_CONTRACT_DEPLOY_BLOCK` | Block number of contract deployment (optimizes queries) | `0`                            |
| `VITE_DEFAULT_LOCALE`        | Default language (`en` or `de`)                         | `en`                           |

## Wallet Options

The frontend supports three wallet connection methods:

| Method             | Description                                | Use Case                              |
| ------------------ | ------------------------------------------ | ------------------------------------- |
| **Browser Wallet** | Generated and stored in `localStorage`     | Beginners, no install needed          |
| **MetaMask**       | Connected via `window.ethereum` (EIP-1193) | Advanced users, encrypted key storage |
| **Import**         | Paste an existing private key              | Restoring access on a new device      |

All three methods use EIP-191 message signing. The backend cannot distinguish between wallet types — signatures are verified identically.

## Build

```bash
pnpm --filter @vpp/frontend build
```

The output is a static SPA in `dist/` that can be deployed to any static hosting (Vercel, Netlify, Nginx, Plesk, etc.).

## SEO & Social Media

The frontend includes comprehensive SEO optimization:

- **Open Graph** and **Twitter Cards** for link previews on social media
- **Structured Data** (JSON-LD) for Google Rich Results
- **Dynamic page titles** per route
- **robots.txt** and **sitemap.xml**
- **Web App Manifest** for mobile home screen support

## For Other Universities

This frontend is designed to be deployed by any institution. All branding and configuration is injected via environment variables and i18n files. See the root [README](../../README.md) for the full integration guide.
