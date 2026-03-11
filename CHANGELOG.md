# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-03-11

First public release of VPP Blockchain.

### Added

#### Smart Contract (`@vpp/contracts`)

- `SurveyPoints` Solidity contract on Base L2 with OpenZeppelin `AccessControl` and `ReentrancyGuard`
- Survey registration with title, points, and keccak256 secret hash
- Point claiming with EIP-191 signature verification and double-claim prevention
- On-chain admin role management (`addAdmin` / `removeAdmin`)
- Survey deactivation (`deactivateSurvey`)
- Wallet submission tracking for thesis admission
- Deployment scripts for Base Sepolia, Base Mainnet, and local Hardhat
- Local development seed script with 5 test surveys and pre-claimed points
- Comprehensive test suite with gas reporting and coverage

#### Backend (`@vpp/backend`)

- Express.js relayer API with TypeScript
- EIP-191 signature verification for all claim requests
- Admin authentication via on-chain `hasRole` check (headers or body)
- REST endpoints: claim, points, surveys, wallet submissions, system status
- Survey template generator (SoSci-compatible redirect URLs)
- Survey cache with 30 s TTL for read performance
- Rate limiting, CORS, and central error handling
- Contract revert error parsing into structured HTTP responses
- Dockerfile for containerised deployment

#### Frontend (`@vpp/frontend`)

- React 19 + Vite 6 SPA with TypeScript and Tailwind CSS v4
- shadcn/ui component library with custom dark/light themes
- Bilingual UI (German / English) via i18next
- Browser wallet creation and import (localStorage-backed)
- MetaMask integration as optional wallet alternative with network change detection
- Wallet creation confirmation dialog with security guidance
- Claim page with automatic secret extraction from URL parameters
- Points page with transaction history, progressive loading, and wallet search
- Admin dashboard with survey table (pagination, sorting, filtering)
- Admin survey deactivation, template download, and role management
- Wallet submission management UI
- System status panel with backend wallet balance
- In-app documentation with 16 bilingual articles
- Homepage with device mockup, scroll animations, and gradient backgrounds
- Mobile-first responsive design with redesigned mobile navigation
- WCAG accessibility: skip link, ARIA labels, semantic HTML, keyboard navigation
- SEO: Open Graph, Twitter Cards, JSON-LD, sitemap.xml, robots.txt, PWA manifest
- Dynamic i18n page titles and 404 catch-all route
- Route-based code splitting and LCP image preloading
- Legal pages (imprint, privacy, accessibility statement)

#### Infrastructure & Tooling

- pnpm workspace monorepo with shared tooling
- GitHub Actions CI: lint, format, contract tests, backend tests, frontend build & tests
- ESLint + Prettier configuration with Solidity support
- `.editorconfig`, `.nvmrc`, and `.prettierrc`
- GitHub issue templates (bug report, feature request) and PR template
- `pnpm dev` single-command local development stack

#### Documentation

- `docs/architecture.md` — system design and data flow
- `docs/getting-started.md` — development setup guide
- `docs/api-reference.md` — REST API documentation
- `docs/smart-contract.md` — on-chain contract details
- `docs/sosci-integration.md` — survey platform setup
- `docs/deployment.md` — production deployment guide
- `docs/security.md` — security architecture and threat model
- `docs/for-universities.md` — adoption guide for other institutions
- `docs/e2e-testing.md` — end-to-end test scenarios
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE` (MIT)

[1.0.0]: https://github.com/hsbi-business-psychology/vpp-blockchain/releases/tag/v1.0.0
