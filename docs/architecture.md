# Architecture

This document describes the system architecture of VPP Blockchain, including component responsibilities, data flow, and design decisions.

## System Overview

VPP is a three-tier system: a **React frontend** communicates with a **Node.js backend** (relayer), which submits transactions to a **Solidity smart contract** on the Base L2 blockchain.

```
┌─────────────┐    Redirect     ┌──────────────────────────────────┐
│ SoSci Survey │ ─────────────→ │  VPP Web App                     │
│ (external)   │  surveyId +    │                                  │
└─────────────┘  secret         │  Frontend (React SPA)            │
                                │  ├─ Wallet management            │
                                │  ├─ Claim flow                   │
                                │  ├─ Points dashboard             │
                                │  ├─ Public explorer              │
                                │  └─ Admin dashboard              │
                                │                                  │
                                │  Backend (Node.js API)           │
                                │  ├─ EIP-191 signature verify     │
                                │  ├─ Secret hash verification     │
                                │  ├─ Double-claim check           │
                                │  └─ Transaction submission       │
                                └──────────────┬───────────────────┘
                                               │
                                               ▼
                                ┌──────────────────────────────────┐
                                │  Base L2 Blockchain              │
                                │  SurveyPoints Smart Contract     │
                                │  ├─ registerSurvey()             │
                                │  ├─ awardPoints()                │
                                │  ├─ deactivateSurvey()           │
                                │  └─ totalPoints() / claimed()    │
                                └──────────────────────────────────┘
```

## Monorepo Structure

```
vpp-blockchain/
├── packages/
│   ├── contracts/           # Solidity smart contract (Hardhat)
│   │   ├── contracts/       # .sol source files
│   │   ├── test/            # Contract test suite
│   │   └── scripts/         # Deployment scripts
│   │
│   ├── backend/             # Node.js/Express API server
│   │   ├── src/
│   │   │   ├── routes/      # API endpoint handlers
│   │   │   ├── services/    # Blockchain + template services
│   │   │   └── middleware/   # Auth, rate-limit, error handling
│   │   ├── test/            # Backend test suite
│   │   └── Dockerfile       # Production container
│   │
│   └── frontend/            # React + Vite SPA
│       ├── src/
│       │   ├── pages/       # Route-level components
│       │   ├── components/  # UI + layout components
│       │   ├── hooks/       # React hooks (wallet, API, blockchain)
│       │   ├── lib/         # Utilities, config, i18n
│       │   ├── locales/     # DE/EN translation files
│       │   └── styles/      # Global CSS + theme
│       └── test/            # Frontend test suite
│
├── docs/                    # Project documentation
├── .github/                 # CI workflows + issue/PR templates
└── [root config files]      # ESLint, Prettier, tsconfig, etc.
```

## Component Responsibilities

### Smart Contract (`packages/contracts`)

The `SurveyPoints` contract is the single source of truth for all point data.

**On-chain state:**

| Mapping | Purpose |
|---|---|
| `_surveys` | Survey configuration (secretHash, points, maxClaims, claimCount, active) |
| `_surveyPoints` | Points per wallet per survey |
| `_totalPoints` | Accumulated points per wallet |
| `_claimed` | Boolean: has wallet claimed survey? |

**Access control** uses OpenZeppelin `AccessControl`:
- `ADMIN_ROLE` — Can register and deactivate surveys
- `MINTER_ROLE` — Can award points (assigned to the backend wallet)

**Design decision:** Simple mappings instead of ERC-721/ERC-1155 tokens reduce gas costs by ~75%.

### Backend (`packages/backend`)

A stateless API relayer. It holds no database — all persistent data lives on-chain.

**Core responsibilities:**
1. Verify EIP-191 wallet signatures (prove the request comes from the wallet owner)
2. Verify survey secrets (hash comparison with on-chain data)
3. Check for duplicate claims
4. Submit transactions to the blockchain (and pay gas fees)
5. Generate SoSci Survey XML templates

### Frontend (`packages/frontend`)

A React single-page application built with Vite, Tailwind CSS v4, and shadcn/ui.

**Features:**
- In-app wallet creation (ethers.js, no MetaMask required)
- Claim flow with URL query parameters from SoSci Survey redirect
- Points dashboard with on-chain data (read directly from blockchain, no backend needed)
- Public explorer for any wallet address
- Admin dashboard for survey management
- Full i18n support (German / English)
- Dark and light theme
- Mobile-first responsive design

## Data Flow

### Claim Process (Step by Step)

```
Browser (Frontend)                    Backend                    Blockchain
       │                                │                          │
       │ 1. Load/create wallet          │                          │
       │    (private key from           │                          │
       │     localStorage)              │                          │
       │                                │                          │
       │ 2. Construct message:          │                          │
       │    "claim:{surveyId}:          │                          │
       │     {secret}:{timestamp}"      │                          │
       │                                │                          │
       │ 3. Sign message locally        │                          │
       │    (ethers.js, no network)     │                          │
       │                                │                          │
       │ 4. POST /api/claim             │                          │
       │    { walletAddress, surveyId,  │                          │
       │      secret, signature, msg }  │                          │
       │ ──────────────────────────────→│                          │
       │                                │ 5. Verify signature      │
       │                                │    (ecrecover → wallet?) │
       │                                │                          │
       │                                │ 6. Verify secret         │
       │                                │    (hash == on-chain?)   │
       │                                │                          │
       │                                │ 7. Check: already        │
       │                                │    claimed?              │
       │                                │                          │
       │                                │ 8. Submit TX             │
       │                                │    awardPoints(wallet,   │
       │                                │      surveyId, secret)   │
       │                                │ ─────────────────────────→
       │                                │                          │
       │                                │ 9. TX receipt            │
       │                                │ ←─────────────────────────
       │                                │                          │
       │ 10. Response                   │                          │
       │     { txHash, points,          │                          │
       │       explorerUrl }            │                          │
       │ ←──────────────────────────────│                          │
```

### Read Flow (No Backend Required)

```
Browser (Frontend)                                  Blockchain
       │                                                │
       │ 1. Create JsonRpcProvider                      │
       │    (public RPC URL)                           │
       │                                                │
       │ 2. contract.totalPoints(wallet)               │
       │ ──────────────────────────────────────────────→│
       │                                                │
       │ 3. Result: 7                                  │
       │ ←──────────────────────────────────────────────│
```

## Design Decisions

### Why Base L2?

Base is an Ethereum Layer 2 (Optimistic Rollup) operated by Coinbase. It provides:
- Extremely low transaction costs (~$0.002 per claim)
- Security inherited from Ethereum mainnet
- Full Solidity/EVM compatibility
- Reliable public RPC endpoints

### Why No MetaMask?

- MetaMask does not work reliably in mobile browsers (iOS/Android)
- Requires extension/app installation
- In-app wallets are more educational (students see raw private keys)
- Zero dependency on third-party wallet software

### Why No Database?

The blockchain **is** the database. The backend is stateless — it only relays verified transactions. This eliminates synchronization issues and makes the system fully auditable.

### Why a Backend Relayer?

Students should not need to hold ETH or pay gas fees. The backend wallet (MINTER_ROLE) pays all transaction costs. Students sign messages locally (free) and the backend submits the actual transaction.

## Cost Model

| Operation | Estimated Gas | USD Cost |
|---|---|---|
| Contract deployment | ~500,000 | ~$0.50 |
| `registerSurvey()` | ~80,000 | ~$0.005 |
| `awardPoints()` (first claim) | ~65,000 | ~$0.003 |
| `awardPoints()` (subsequent) | ~45,000 | ~$0.002 |
| Read operations | 0 | Free |

**Example semester:** 200 participants × 3 surveys = 600 claims ≈ $1.20.
A $10 deposit covers ~8 semesters.
