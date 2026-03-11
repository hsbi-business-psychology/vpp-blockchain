# Guide for Universities

This guide explains how other universities and institutions can adopt VPP Blockchain for their own survey participation tracking.

## Why VPP?

VPP provides a transparent, tamper-proof system for tracking survey participation. Students receive **pseudonymous, verifiable points** on a public blockchain — no personal data is stored, and all points are independently auditable.

## Integration Levels

### Level 1: Full Deployment (Recommended)

Deploy the entire system (frontend + backend + your own contract). This gives you full control.

**What you need:**
- A server with Node.js 20+ (or Docker)
- ~$10 in ETH on Base L2 for gas fees
- A domain name

**Steps:**

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hsbi-business-psychology/vpp-blockchain.git
   cd vpp-blockchain
   pnpm install
   ```

2. **Deploy your own smart contract:**
   ```bash
   cp packages/contracts/.env.example packages/contracts/.env
   # Set DEPLOYER_PRIVATE_KEY
   pnpm --filter @vpp/contracts run deploy:mainnet
   # Note the contract address
   ```

3. **Configure the backend:**
   ```bash
   cp packages/backend/.env.example packages/backend/.env
   ```
   Set `CONTRACT_ADDRESS` to your deployed contract and `MINTER_PRIVATE_KEY` to your backend wallet. Admin access is managed on-chain — use `addAdmin()` on the smart contract to grant `ADMIN_ROLE` to lecturer wallets.

4. **Configure the frontend:**
   ```bash
   cp packages/frontend/.env.example packages/frontend/.env
   ```
   Set `VITE_APP_NAME` to your university name, `VITE_API_URL` to your backend URL, and `VITE_CONTRACT_ADDRESS` to your contract.

5. **Build and deploy:**
   ```bash
   pnpm --filter @vpp/frontend build
   pnpm --filter @vpp/backend build
   ```

6. **Fund the backend wallet** with ~$10 in ETH on Base.

### Level 2: Custom Frontend

Use the backend and smart contract, but build your own UI.

The backend API is fully documented in [API Reference](api-reference.md). Your frontend needs to:
1. Create wallets (ethers.js `Wallet.createRandom()`)
2. Sign claim messages (EIP-191 personal sign)
3. Call `POST /api/claim` with the signed data
4. Read points via `GET /api/points/:wallet` or directly from the blockchain

### Level 3: Direct Contract Interaction

Use only the smart contract. You deploy your own instance and build both frontend and backend.

The contract interface is documented in [Smart Contract](smart-contract.md).

## Multi-University Deployment

**Recommended approach:** Each university deploys its own contract instance.

| Aspect | Own Contract | Shared Contract |
|---|---|---|
| Data isolation | Complete | Requires survey ID namespacing |
| Admin control | Full autonomy | Shared admin management |
| Cost | ~$0.50 deployment | Free (uses existing) |
| Complexity | Simple | Complex coordination |

Deploying your own contract costs approximately $0.50 and provides clean data separation.

## Customization

### Logo

The header displays two PNG logo files from `packages/frontend/public/`:

| File | Usage |
|---|---|
| `hsbi-logo-light.png` | Shown in **light mode** (dark logo on light background) |
| `hsbi-logo-dark.png` | Shown in **dark mode** (light logo on dark background) |

Both images should have a **transparent background**. The switching is handled automatically via Tailwind's `dark:` variant in the header component (`packages/frontend/src/components/layout/header.tsx`).

**To replace the logo with your own institution's logo:**

1. Create two PNG versions of your logo with transparent backgrounds (one for each theme)
2. Replace the files in `packages/frontend/public/`
3. Keep the same filenames, or update the `<img>` references in `header.tsx`

The logo size is controlled via Tailwind classes in the header:
- Mobile: `h-12` (48px height)
- Desktop: `md:h-16` (64px height)

### Branding

The frontend is fully customizable through environment variables:

| Variable | Purpose | Example |
|---|---|---|
| `VITE_APP_NAME` | Application title | `"VPP Uni Hamburg"` |
| `VITE_DEFAULT_LOCALE` | Default language | `de` |

### Theming

The frontend uses Tailwind CSS v4 with CSS custom properties. To customize colors:

1. Edit `packages/frontend/src/styles/globals.css`
2. Modify the CSS variables in `:root` (light) and `.dark` (dark mode)
3. Rebuild the frontend

### Internationalization

The frontend ships with German and English translations. To add a new language:

1. Copy `packages/frontend/src/locales/en.json` to your language code (e.g., `fr.json`)
2. Translate all strings
3. Register the language in `packages/frontend/src/lib/i18n.ts`

## Cost Estimation

| Item | Cost | Frequency |
|---|---|---|
| Contract deployment | ~$0.50 | One-time |
| Register a survey | ~$0.005 | Per survey |
| Award points (claim) | ~$0.002 | Per participant |
| Read points | Free | — |
| Server hosting | Varies | Monthly |

**Example:** 200 participants × 3 surveys per semester = 600 claims ≈ $1.20 in gas fees per semester. A $10 deposit covers approximately 8 semesters.

## Compatibility

- **Survey tools:** Any tool that supports redirect URLs (SoSci Survey, LimeSurvey, Qualtrics, Google Forms)
- **Browsers:** Chrome, Firefox, Safari, Edge (desktop and mobile)
- **No extensions required:** No MetaMask or other wallet software needed

## Support

- [GitHub Issues](https://github.com/hsbi-business-psychology/vpp-blockchain/issues) — Bug reports and feature requests
- [GitHub Discussions](https://github.com/hsbi-business-psychology/vpp-blockchain/discussions) — Questions and ideas
- [Contributing Guide](../CONTRIBUTING.md) — How to contribute code
