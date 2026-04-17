# Architecture

This document describes the system architecture of VPP Blockchain, including component responsibilities, data flow, and design decisions.

> **V2 update (April 2026):** Components below describe the current `SurveyPointsV2` deployment with HMAC claim tokens behind a UUPS proxy. For the rationale behind the V1 → V2 cutover, see [ADR 0004](adr/0004-hmac-claim-tokens-and-upgradeable-contract.md). For the on-the-ground deploy steps, see [`v2-migration-runbook.md`](v2-migration-runbook.md).

## System Overview

VPP is a three-tier system: a **React frontend** communicates with a **Node.js backend** (relayer + HMAC verifier), which submits transactions to a **Solidity smart contract** on the Base L2 blockchain. The smart contract sits behind an **ERC-1967 UUPS proxy** so that future logic upgrades do not require a new address or another data migration.

```
┌──────────────┐  Server-side    ┌──────────────────────────────────┐
│ SoSci Survey │  PHP renders    │  VPP Web App                     │
│ /LimeSurvey  │ ──────────────→ │                                  │
│ (external)   │  /claim?s=&n=&t │  Frontend (React SPA)            │
└──────────────┘                 │  ├─ Wallet management            │
                                 │  ├─ Claim flow                   │
                                 │  ├─ Points dashboard             │
                                 │  ├─ Public explorer              │
                                 │  └─ Admin dashboard              │
                                 │                                  │
                                 │  Backend (Node.js API)           │
                                 │  ├─ EIP-191 signature verify     │
                                 │  ├─ HMAC token verify            │
                                 │  ├─ Nonce store (replay guard)   │
                                 │  ├─ Survey-key store (HMAC keys) │
                                 │  ├─ Admin label store            │
                                 │  └─ Transaction submission       │
                                 └──────────────┬───────────────────┘
                                                │
                                                ▼
                                 ┌──────────────────────────────────┐
                                 │  Base L2 Blockchain              │
                                 │  ERC-1967 UUPS Proxy ───────────→│
                                 │     │                            │
                                 │     ▼                            │
                                 │  SurveyPointsV2 Implementation   │
                                 │  ├─ initialize()                 │
                                 │  ├─ registerSurvey()             │
                                 │  ├─ awardPoints()                │
                                 │  ├─ revokePoints()               │
                                 │  ├─ deactivateSurvey()           │
                                 │  ├─ reactivateSurvey()           │
                                 │  └─ totalPoints() / claimed()    │
                                 └──────────────────────────────────┘
```

## Monorepo Structure

```
vpp-blockchain/
├── packages/
│   ├── contracts/           # Solidity smart contract (Hardhat)
│   │   ├── contracts/       # SurveyPoints.sol (legacy V1) + SurveyPointsV2.sol
│   │   ├── test/            # Contract test suite (V1 + V2)
│   │   └── scripts/         # Deployment + upgrade + migration scripts
│   │
│   ├── backend/             # Node.js/Express API server
│   │   ├── src/
│   │   │   ├── routes/      # API endpoint handlers (claim, surveys, admin, …)
│   │   │   ├── services/    # blockchain, hmac, nonce-store, survey-keys,
│   │   │   │                #   admin-labels, template
│   │   │   └── middleware/  # auth, rate-limit, error handling
│   │   ├── data/            # Persistent JSON stores (gitignored)
│   │   ├── test/            # Backend test suite
│   │   └── Dockerfile       # Production container
│   │
│   ├── frontend/            # React + Vite SPA
│   │   ├── src/
│   │   │   ├── pages/       # Route-level components
│   │   │   ├── components/  # UI + layout components
│   │   │   ├── hooks/       # React hooks (wallet, API, blockchain)
│   │   │   ├── lib/         # Utilities, config, i18n
│   │   │   ├── locales/     # DE/EN translation files
│   │   │   └── styles/      # Global CSS + theme
│   │   └── test/            # Frontend test suite
│   │
│   └── shared/              # Shared TypeScript types (@vpp/shared)
│       └── src/             # Type definitions used by backend & frontend
│
├── docs/                    # Project documentation (incl. ADRs + runbooks)
├── .github/                 # CI workflows + issue/PR templates
└── [root config files]      # ESLint, Prettier, tsconfig, etc.
```

## Component Responsibilities

### Smart Contract (`packages/contracts`)

The deployed system is `SurveyPointsV2` behind a UUPS proxy. The implementation is the source of truth for all point data; the proxy preserves the canonical contract address across upgrades.

**On-chain state:**

| Mapping            | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `_surveys`         | Survey configuration (points, maxClaims, claimCount, active)        |
| `_surveyPoints`    | Points per wallet per survey                                        |
| `_totalPoints`     | Accumulated points per wallet                                       |
| `_claimed`         | Boolean: has wallet claimed survey?                                 |
| `_walletSubmitted` | Boolean: has wallet been presented for thesis admission?            |
| `_adminCount`      | Cached count of `ADMIN_ROLE` holders (lockout-prevention invariant) |

> Survey secrets (V1's `secretHash`) are no longer stored on-chain. The HMAC key per survey lives off-chain in the backend's `data/survey-keys.json`. See [ADR 0004](adr/0004-hmac-claim-tokens-and-upgradeable-contract.md) for the security argument.

**Access control** uses OpenZeppelin `AccessControlUpgradeable`:

- `DEFAULT_ADMIN_ROLE` — Can grant/revoke roles. Held by the production admin only after deploy; the deployer wallet renounces it during cutover.
- `ADMIN_ROLE` — Can register/deactivate/reactivate surveys, revoke points, manage admins, mark wallet submissions. The contract refuses to revoke the last `ADMIN_ROLE` holder.
- `MINTER_ROLE` — Can call `awardPoints` (assigned to the backend wallet).
- `UPGRADER_ROLE` — Can authorise UUPS upgrades. Held by the production admin.

**Reentrancy guard:** `ReentrancyGuardTransient` (EIP-1153 transient storage) — chosen over the storage-based variant because it is upgrade-safe and gas-cheap on Base.

**Design decision:** Plain mappings instead of ERC-721/ERC-1155 reduce gas costs by ~75 % and keep balance reads at a single SLOAD.

### Backend (`packages/backend`)

A near-stateless API relayer. It owns three small persistent JSON stores in `data/`, all written atomically (`renameSync`) and gitignored:

| Store                    | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `data/survey-keys.json`  | Per-survey HMAC-SHA256 secret keys (base64url) + creation timestamps.     |
| `data/used-nonces.json`  | Append-only set of `${surveyId}:${nonce}` that have already been claimed. |
| `data/admin-labels.json` | Operator-friendly labels for admin wallet addresses + minter wallet flag. |

All other state — points, surveys, role membership — lives on-chain.

**Core responsibilities:**

1. Verify EIP-191 wallet signatures (prove the request comes from the wallet owner).
2. Verify HMAC-SHA256 claim tokens against the per-survey key, using `crypto.timingSafeEqual`.
3. Mark the participant's nonce as consumed _before_ broadcasting the on-chain TX (fail-closed replay protection).
4. Submit transactions to the blockchain via a resilient `FallbackProvider` (Alchemy + public Base RPCs) and pay gas fees from the minter wallet.
5. Generate SoSci/LimeSurvey templates with embedded PHP that mints per-participant claim URLs.
6. Serve admin-only endpoints for survey lifecycle (`reactivate`, `revoke`, `key`, `key/rotate`) and admin-label management.

### Frontend (`packages/frontend`)

A React single-page application built with Vite, Tailwind CSS v4, and shadcn/ui.

**Features:**

- Flexible wallet connection: Browser wallet (built-in), MetaMask, or private key import
- Claim flow that reads `?s=&n=&t=` URL parameters from the survey redirect
- Points dashboard with on-chain data (read directly from blockchain, no backend needed)
- Public explorer for any wallet address
- Admin dashboard:
  - Register surveys (HMAC key shown once, copy-to-clipboard, rotate-key flow)
  - Deactivate / reactivate surveys
  - Revoke points (with on-chain audit trail)
  - Manage admins (add, remove with last-admin protection, edit human labels, minter wallet pinned)
  - Submission tracking
- Comprehensive in-app documentation with diagrams and guides
- Full i18n support (German / English)
- Dark and light theme
- Mobile-first responsive design
- WCAG-compliant accessibility (skip links, ARIA labels, keyboard navigation)
- SEO optimization (Open Graph, Twitter Cards, JSON-LD, sitemap)
- Route-based code splitting with lazy loading

## Data Flow

### Claim Process (Step by Step)

```
SoSci/LimeSurvey       Browser (Frontend)             Backend                 Blockchain
       │                      │                          │                        │
       │ Goodbye-page PHP runs:                          │                        │
       │  - random_bytes(16) → nonce                     │                        │
       │  - HMAC("v1|sid|nonce", surveyKey) → token      │                        │
       │  - Render <a href="/claim?s=&n=&t="> button     │                        │
       │ ──────────────────→  │                          │                        │
       │                      │ 1. User opens claim URL  │                        │
       │                      │ 2. Load/create wallet    │                        │
       │                      │    (private key from     │                        │
       │                      │     localStorage)        │                        │
       │                      │                          │                        │
       │                      │ 3. Construct & sign      │                        │
       │                      │    "claim:{surveyId}:    │                        │
       │                      │     {nonce}:{timestamp}" │                        │
       │                      │                          │                        │
       │                      │ 4. POST /api/v1/claim    │                        │
       │                      │    { walletAddress, sid, │                        │
       │                      │      nonce, token,       │                        │
       │                      │      signature, message }│                        │
       │                      │ ────────────────────────→│                        │
       │                      │                          │ 5. Verify EIP-191 sig  │
       │                      │                          │ 6. HMAC-verify token   │
       │                      │                          │    (timingSafeEqual)   │
       │                      │                          │ 7. nonce already used? │
       │                      │                          │    → 409 NONCE_USED    │
       │                      │                          │ 8. Mark nonce used     │
       │                      │                          │    (fail-closed)       │
       │                      │                          │ 9. Submit TX:          │
       │                      │                          │    awardPoints(        │
       │                      │                          │      wallet, sid)      │
       │                      │                          │ ──────────────────────→│
       │                      │                          │                        │
       │                      │                          │ 10. TX receipt         │
       │                      │                          │ ←──────────────────────│
       │                      │ 11. Response             │                        │
       │                      │     { txHash, points,    │                        │
       │                      │       explorerUrl }      │                        │
       │                      │ ←────────────────────────│                        │
```

### Read Flow (No Backend Required)

```
Browser (Frontend)                                  Blockchain
       │                                                │
       │ 1. Create JsonRpcProvider                      │
       │    (public Base RPC URL)                       │
       │                                                │
       │ 2. contract.totalPoints(wallet)                │
       │ ──────────────────────────────────────────────→│
       │                                                │
       │ 3. Result: 7                                   │
       │ ←──────────────────────────────────────────────│
```

## Design Decisions

### Why Base L2?

Base is an Ethereum Layer 2 (Optimistic Rollup) operated by Coinbase. It provides:

- Extremely low transaction costs (~$0.002 per claim)
- Security inherited from Ethereum mainnet
- Full Solidity/EVM compatibility (incl. Cancun opcodes — needed for `ReentrancyGuardTransient`)
- Reliable public RPC endpoints + Alchemy as a primary

### Why a UUPS Proxy?

Originally we deployed an immutable contract. The V1 audit revealed three bugs that required code changes — without a proxy each fix would have meant a fresh deploy, a fresh contract address, and a fresh data migration (or accepting that all historical points are lost). UUPS gives us:

- **Stable canonical address** — frontend, backend, and survey templates never need to be re-pointed.
- **Storage preservation** — `_totalPoints`, `_claimed`, etc. survive every upgrade.
- **Lower runtime cost than Transparent Proxy** — the proxy itself contains no upgrade logic; the implementation does.
- **`UPGRADER_ROLE`-gated** — separates routine admin work (survey lifecycle) from the rare and dangerous operation of replacing the implementation.

See ADR 0004 for the trade-offs we considered (Transparent vs. Beacon vs. UUPS).

### Why HMAC Tokens Instead of Shared Secrets?

V1 stored a `keccak256(secret)` on-chain and required the participant's URL to contain the plaintext secret. That meant **anyone with the link could claim** — a screenshot in WhatsApp let arbitrary strangers collect points. V2 replaces this with:

- A **per-survey HMAC key** held only by the backend and the survey server.
- A **per-participant nonce** generated server-side by the survey's PHP end page.
- A **per-participant HMAC token** computed from `(surveyId, nonce, key)`.
- A **single-use** semantic enforced by the backend's nonce store.

The participant's URL is therefore unique and worthless to anyone else. See ADR 0004 for the full threat model.

### Why Both Browser Wallet and MetaMask?

The system offers three wallet options to serve different user needs:

- **Browser wallet** (default): Zero setup, ideal for students with no crypto experience. Keys are generated and stored in `localStorage`.
- **MetaMask** (optional): For users who already have MetaMask installed. Keys are managed securely by the extension with password protection and recovery phrases.
- **Import**: For restoring access on a new device with an existing private key.

All three methods produce identical EIP-191 signatures. The backend cannot distinguish between them — this is by design.

### Why (Almost) No Database?

The blockchain is the database for everything that matters. The backend keeps three small JSON files only because those values are operationally tied to the relayer:

- HMAC keys must never appear in a public ledger (that is the whole point).
- Nonces are write-once and read-once — a flat append-only file is faster and operationally simpler than any DB.
- Admin labels are pure UX sugar; they have no consensus relevance.

This keeps Plesk deployment trivial (no DB container, no migrations) and the system fully auditable from chain data alone.

### Performance & Resilience

- **Survey cache:** The backend caches the survey list with a 30-second TTL. Repeated requests within that window are served from memory, avoiding expensive event queries.
- **Deploy block:** Both backend and frontend accept a `CONTRACT_DEPLOY_BLOCK` setting. Event queries (`queryFilter`) only scan from that block onward, skipping irrelevant blockchain history.
- **Fallback RPC:** The backend uses `ethers.FallbackProvider` with Alchemy as primary and public Base RPCs as automatic backups, so a single provider outage does not take down claims.
- **Dedicated event provider:** `eth_getLogs` traffic is routed to a separate provider with `batchMaxCount: 1` to stay below Alchemy's free-tier limits.
- **Progressive loading:** The frontend renders UI shells immediately and fills in data as it arrives. Metrics cards show skeleton states while surveys load; points and history load independently on the student page.

### Why a Backend Relayer?

Students should not need to hold ETH or pay gas fees. The backend wallet (`MINTER_ROLE`) pays all transaction costs. Students sign messages locally (free) and the backend submits the actual transaction. The HMAC verification step also happens on the relayer, not in the contract — this keeps `awardPoints` cheap (no `keccak256` of a secret) and lets us rotate keys without touching the chain.

## Cost Model

| Operation                         | Estimated Gas | USD Cost (Base, 2026) |
| --------------------------------- | ------------- | --------------------- |
| V2 implementation deployment      | ~2,800,000    | ~$2.50                |
| ERC-1967 proxy deployment         | ~250,000      | ~$0.25                |
| `initialize()` (one-shot)         | ~150,000      | ~$0.15                |
| `registerSurvey()`                | ~75,000       | ~$0.005               |
| `awardPoints()` (first claim)     | ~70,000       | ~$0.003               |
| `awardPoints()` (subsequent)      | ~50,000       | ~$0.002               |
| `revokePoints()`                  | ~35,000       | ~$0.0015              |
| `reactivateSurvey()`              | ~30,000       | ~$0.0012              |
| Future UUPS upgrade (per release) | ~2,800,000    | ~$2.50                |
| Read operations                   | 0             | Free                  |

**Example semester:** 200 participants × 3 surveys = 600 claims ≈ $1.20.
A $10 deposit covers ~8 semesters of normal traffic plus one upgrade.
