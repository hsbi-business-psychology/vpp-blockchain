# @vpp/contracts

Solidity smart contract for the VPP (Verifiable Participant Points) system, built with [Hardhat](https://hardhat.org/) and deployed on [Base L2](https://base.org/).

## Overview

The `SurveyPoints` contract manages survey registration and point distribution on-chain. It uses simple mappings instead of token standards (ERC-721/ERC-1155) to minimize gas costs.

### Key Features

- **Role-based access control** — `ADMIN_ROLE` for survey management, `MINTER_ROLE` for point distribution
- **On-chain secret verification** — Survey secrets are stored as keccak256 hashes
- **Double-claim prevention** — Each wallet can only claim points once per survey
- **Max claims limit** — Surveys can cap the number of participants
- **Survey lifecycle** — Surveys can be deactivated by admins

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Setup

```bash
# From the repository root
pnpm install

# Or from this directory
cd packages/contracts
```

### Commands

```bash
# Compile contracts
pnpm compile

# Run tests
pnpm test

# Run tests with coverage
pnpm coverage

# Deploy to local Hardhat node
pnpm deploy:local

# Deploy to Base Sepolia testnet
pnpm deploy:sepolia

# Deploy to Base mainnet
pnpm deploy:mainnet
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable               | Description                                   |
| ---------------------- | --------------------------------------------- |
| `DEPLOYER_PRIVATE_KEY` | Private key of the deploying wallet           |
| `BASE_SEPOLIA_RPC_URL` | RPC endpoint for Base Sepolia testnet         |
| `BASE_MAINNET_RPC_URL` | RPC endpoint for Base mainnet                 |
| `BASESCAN_API_KEY`     | API key for contract verification on BaseScan |
| `REPORT_GAS`           | Set to `true` to enable gas usage reports     |

## Contract API

### Write Functions (require roles)

| Function                                                   | Role          | Description                       |
| ---------------------------------------------------------- | ------------- | --------------------------------- |
| `registerSurvey(id, secretHash, points, maxClaims, title)` | `ADMIN_ROLE`  | Register a new survey             |
| `awardPoints(student, surveyId, secret)`                   | `MINTER_ROLE` | Award points to a student         |
| `deactivateSurvey(surveyId)`                               | `ADMIN_ROLE`  | Deactivate a survey               |
| `addAdmin(account)`                                        | `ADMIN_ROLE`  | Grant ADMIN_ROLE to an address    |
| `removeAdmin(account)`                                     | `ADMIN_ROLE`  | Revoke ADMIN_ROLE from an address |
| `markWalletSubmitted(wallet)`                              | `ADMIN_ROLE`  | Mark wallet as submitted          |
| `unmarkWalletSubmitted(wallet)`                            | `ADMIN_ROLE`  | Remove submission mark            |

### Read Functions (public)

| Function                         | Description                              |
| -------------------------------- | ---------------------------------------- |
| `totalPoints(wallet)`            | Get total points for a wallet            |
| `surveyPoints(wallet, surveyId)` | Get points for a specific survey         |
| `getSurveyInfo(surveyId)`        | Get survey details (incl. title)         |
| `claimed(wallet, surveyId)`      | Check if a wallet has claimed a survey   |
| `isAdmin(account)`               | Check if an address holds ADMIN_ROLE     |
| `isWalletSubmitted(wallet)`      | Check if a wallet is marked as submitted |

### Events

| Event                                                  | Description                          |
| ------------------------------------------------------ | ------------------------------------ |
| `SurveyRegistered(surveyId, points, maxClaims, title)` | Emitted when a survey is registered  |
| `PointsAwarded(wallet, surveyId, points)`              | Emitted when points are awarded      |
| `SurveyDeactivated(surveyId)`                          | Emitted when a survey is deactivated |
| `WalletSubmitted(wallet, markedBy)`                    | Emitted when a wallet is marked      |
| `WalletUnsubmitted(wallet, unmarkedBy)`                | Emitted when a mark is removed       |

## Gas Costs (Base L2)

| Operation          | Estimated Gas  | Estimated Cost |
| ------------------ | -------------- | -------------- |
| Deploy contract    | ~500,000       | ~$0.50         |
| `registerSurvey()` | ~80,000        | ~$0.005        |
| `awardPoints()`    | ~45,000–65,000 | ~$0.002–0.003  |
| Read functions     | 0              | Free           |

## License

[MIT](../../LICENSE)
