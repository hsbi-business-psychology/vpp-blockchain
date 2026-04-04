# Contributing to VPP Blockchain

Thank you for your interest in contributing! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Code Style](#code-style)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vpp-blockchain.git
   cd vpp-blockchain
   ```
3. **Install dependencies**:
   ```bash
   pnpm install
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feat/your-feature-name
   ```

## Development Workflow

### Prerequisites

- Node.js >= 20 (see `.nvmrc`)
- pnpm >= 9

### Running Tests

```bash
# Run all tests across packages
pnpm test

# Run tests for a specific package
pnpm --filter @vpp/contracts test
```

### Linting & Formatting

```bash
# Check for lint errors
pnpm lint

# Auto-fix lint errors
pnpm lint:fix

# Check formatting
pnpm format:check

# Auto-format
pnpm format
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

### Types

| Type       | Description                                           |
| ---------- | ----------------------------------------------------- |
| `feat`     | A new feature                                         |
| `fix`      | A bug fix                                             |
| `docs`     | Documentation changes                                 |
| `test`     | Adding or updating tests                              |
| `chore`    | Maintenance tasks (dependencies, CI, tooling)         |
| `refactor` | Code changes that neither fix a bug nor add a feature |
| `ci`       | CI/CD configuration changes                           |

### Scopes

| Scope       | Package              |
| ----------- | -------------------- |
| `contracts` | `packages/contracts` |
| `backend`   | `packages/backend`   |
| `frontend`  | `packages/frontend`  |

### Examples

```
feat(contracts): add survey deactivation function
fix(backend): handle expired signatures gracefully
docs(frontend): add wallet recovery guide
test(contracts): add edge case tests for max claims
```

## Pull Requests

1. Make sure all tests pass: `pnpm test`
2. Make sure linting passes: `pnpm lint`
3. Make sure formatting is correct: `pnpm format:check`
4. Fill out the pull request template completely
5. Link any related issues

### PR Title

Use the same format as commit messages:

```
feat(contracts): add survey deactivation function
```

## Code Style

- **TypeScript** for all JavaScript code (strict mode)
- **Solidity** follows the [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- **Prettier** for auto-formatting (config in `.prettierrc`)
- **ESLint** for static analysis (config in `eslint.config.mjs`)

## Reporting Issues

- Use the [Bug Report](https://github.com/hsbi-business-psychology/vpp-blockchain/issues/new?template=bug_report.md) template for bugs
- Use the [Feature Request](https://github.com/hsbi-business-psychology/vpp-blockchain/issues/new?template=feature_request.md) template for ideas
- Check existing issues before creating a new one

## Project Structure

```
vpp-blockchain/
├── packages/
│   ├── contracts/    # Solidity smart contract (Hardhat)
│   ├── backend/      # Node.js/Express API server
│   └── frontend/     # React + Vite + shadcn/ui SPA
├── docs/             # Project documentation
└── .github/          # CI workflows and templates
```

## Questions?

If you have questions about contributing, feel free to [open a discussion](https://github.com/hsbi-business-psychology/vpp-blockchain/discussions) or reach out via an issue.
