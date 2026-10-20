# Getting Started

This guide walks you through setting up the VPP Blockchain development environment from scratch.

## Prerequisites

| Tool    | Version               | Install                                                                                             |
| ------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| Git     | any recent            | [git-scm.com](https://git-scm.com/downloads). On Windows, choose “Git from the command line”.       |
| Node.js | 22.14+, 24, 25, or 26 | [nodejs.org](https://nodejs.org/), the **LTS** button, if `node -v` is missing or outside that set. |

The Dockerfile only builds the API for a server. It is not used to run the
test system.

After installing Git and Node.js, close the terminal and open a new one.
Check the versions:

```bash
git --version
node --version
```

`node -v` may print v22.14 or later on the 22 line, or v24, v25, or v26.
Any of those can run the two commands below. You do not run `npm install`
yourself. Node.js includes npm, and the bootstrap script uses it once to
install pnpm 9.15.4.

## Installation

```bash
git clone https://github.com/hsbi-business-psychology/vpp-blockchain.git
cd vpp-blockchain
node scripts/bootstrap.mjs
```

Bootstrap installs pnpm 9.15.4 and the project dependencies. Run it once
per clone, then start the test system in the same terminal:

```bash
node scripts/dev.mjs
```

## Project Layout

```
vpp-blockchain/
├── packages/contracts/   # Solidity smart contract
├── packages/backend/     # Node.js API server
├── packages/frontend/    # React SPA
└── docs/                 # Documentation
```

## Running Tests

```bash
# Run all tests across every package
pnpm test

# Run tests for a single package
pnpm --filter @vpp/contracts test
pnpm --filter @vpp/backend test
pnpm --filter @vpp/frontend test
```

## Smart Contract Development

```bash
# Compile the Solidity contract
pnpm --filter @vpp/contracts run compile

# Run contract tests with gas report
REPORT_GAS=true pnpm --filter @vpp/contracts test

# Local chain, contract, API and website
node scripts/dev.mjs

# Deploy to Base Sepolia testnet (requires .env)
cp packages/contracts/.env.example packages/contracts/.env
# Fill in DEPLOYER_PRIVATE_KEY and BASESCAN_API_KEY
pnpm --filter @vpp/contracts run deploy:sepolia
```

## Backend Development

```bash
# Create .env from template
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env` with your values:

| Variable             | Description                                        |
| -------------------- | -------------------------------------------------- |
| `PORT`               | Server port (default: 3000)                        |
| `RPC_URL`            | Base RPC endpoint                                  |
| `CONTRACT_ADDRESS`   | Deployed SurveyPoints contract address             |
| `MINTER_PRIVATE_KEY` | Backend wallet private key (must have MINTER_ROLE) |
| `EXPLORER_BASE_URL`  | Block explorer URL for transaction links           |
| `FRONTEND_URL`       | Frontend URL for CORS and template redirects       |

```bash
# Start the dev server (hot-reload)
pnpm --filter @vpp/backend dev

# Build for production
pnpm --filter @vpp/backend build

# Start the production build
pnpm --filter @vpp/backend start
```

## Frontend Development

```bash
# Create .env from template
cp packages/frontend/.env.example packages/frontend/.env
```

Edit `packages/frontend/.env`:

| Variable                | Description                                   |
| ----------------------- | --------------------------------------------- |
| `VITE_APP_NAME`         | Application name shown in the UI              |
| `VITE_API_URL`          | Backend API base URL                          |
| `VITE_RPC_URL`          | Base RPC endpoint for direct blockchain reads |
| `VITE_CONTRACT_ADDRESS` | Deployed SurveyPoints contract address        |
| `VITE_EXPLORER_URL`     | Block explorer base URL                       |
| `VITE_DEFAULT_LOCALE`   | Default language (`en` or `de`)               |

```bash
# Start the Vite dev server (port 5173)
pnpm --filter @vpp/frontend dev

# Build for production
pnpm --filter @vpp/frontend build

# Preview the production build
pnpm --filter @vpp/frontend preview
```

The dev server proxies `/api` requests to `http://localhost:3000` automatically.

## Full local stack (with test data)

```bash
node scripts/dev.mjs
```

This starts Hardhat, deploys SurveyPointsV3 at
`0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`, registers five test surveys,
and starts the API and the website. Open
[http://localhost:5173](http://localhost:5173). Stop it with Ctrl+C.

The keys below are Hardhat's published defaults. They control nothing
outside this local chain:

| Role                | Private Key                                                          |
| ------------------- | -------------------------------------------------------------------- |
| **Admin**           | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| **Student** (7 pts) | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |

Admin access is verified **on-chain** — only wallets with `ADMIN_ROLE` on the smart contract can access the Lecturers' Area. Admins can grant/revoke `ADMIN_ROLE` for other wallets directly from the dashboard.

## Change a text and open a pull request

Any editor works, including Notepad++. Leave `node scripts/dev.mjs` running.
Saving a file under `packages/frontend` reloads the website.

1. Create a branch:

   ```bash
   git checkout -b docs/my-change
   ```

2. Edit a visible string, for example `home.hero.title` in
   `packages/frontend/src/locales/de.json` (the large heading on the start
   page). Save the file and look at http://localhost:5173.
3. Commit. The message has to look like the examples in
   [CONTRIBUTING.md](../CONTRIBUTING.md). The hook rejects other messages.

   ```bash
   git add packages/frontend/src/locales/de.json
   git commit -m "docs(frontend): change the German start-page heading"
   ```

4. Push the branch and open a pull request on GitHub:

   ```bash
   git push -u origin HEAD
   ```

   GitHub prints a link to open the pull request. You need a GitHub account
   and write access to this repository, or your own fork. Merging is a
   separate step and is done by a maintainer after the checks pass.

## Linting & Formatting

```bash
# Check lint errors
pnpm lint

# Auto-fix lint errors
pnpm lint:fix

# Check formatting
pnpm format:check

# Auto-format all files
pnpm format
```

## IDE Setup

Recommended VS Code extensions:

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
- [Solidity](https://marketplace.visualstudio.com/items?itemName=JuanBlanco.solidity)

The repository includes an `.editorconfig` file for consistent whitespace settings across editors.
