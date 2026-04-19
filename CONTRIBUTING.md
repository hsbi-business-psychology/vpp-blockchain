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
- [Branch Protection (required for production instances)](#branch-protection-required-for-production-instances)

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
4. **Verify your setup** — run all tests to confirm everything works:
   ```bash
   pnpm test
   ```
   A successful run shows all test suites passing across `contracts`, `backend`, and `frontend`. If any test fails, check that you have the correct Node.js version (see `.nvmrc`) and that `pnpm install` completed without errors.
5. **Create a branch** for your changes:
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

We follow [Conventional Commits](https://www.conventionalcommits.org/). Commit messages are validated automatically via [commitlint](https://commitlint.js.org/) on every commit:

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

## Branch Protection (required for production instances)

Any fork that runs in production (i.e. accepts real student claims) **must** lock down the `main` branch so unreviewed code cannot reach the deploy pipeline. The reference instance enforces:

| Setting                          | Value                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Required status checks           | `CI` must pass; strict (head must be up to date)                                                                   |
| Required pull request reviews    | 1 approving review; stale reviews dismissed on new push                                                            |
| Required conversation resolution | yes                                                                                                                |
| Required linear history          | yes (no merge commits — squash or rebase)                                                                          |
| Allow force pushes               | no                                                                                                                 |
| Allow deletions                  | no                                                                                                                 |
| Enforce on admins                | **no** for solo-maintainer instances (admin may bypass for hotfix); set to **yes** as soon as 2+ maintainers exist |

### One-shot setup via gh CLI

After forking, run from inside your clone:

```bash
gh auth login              # if not already authenticated
bash scripts/setup-branch-protection.sh main
```

The script applies the policy table above via the GitHub REST API. It is idempotent — re-running updates the protection rule in place.

### Manual setup via GitHub UI

1. Repository → **Settings → Branches**
2. **Add branch protection rule**, branch name pattern `main`
3. Tick:
   - ☑ Require a pull request before merging → **Required approving reviews: 1**
   - ☑ Dismiss stale pull request approvals when new commits are pushed
   - ☑ Require status checks to pass before merging → search & add `CI`
   - ☑ Require branches to be up to date before merging
   - ☑ Require conversation resolution before merging
   - ☑ Require linear history
   - ☐ Do not allow bypassing the above settings (leave unchecked for solo maintainer; check it once a co-maintainer joins)
   - ☐ Allow force pushes
   - ☐ Allow deletions
4. Save

### What this means in practice

| Actor                        | Can push directly to `main`?                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| External contributor (forks) | No — must open PR, get review, pass CI                                                |
| Maintainer (write access)    | No — must open PR, get review, pass CI                                                |
| Repo admin / Owner           | Yes (when bypass is allowed) — recommended only for hotfixes; prefer PR even as admin |

CI is currently the only required status check. If you add new workflows that should also be blocking (e.g. coverage gates, e2e), add them to `required_status_checks.contexts` in `scripts/setup-branch-protection.sh` and re-run.

## Questions?

If you have questions about contributing, feel free to [open a discussion](https://github.com/hsbi-business-psychology/vpp-blockchain/discussions) or reach out via an issue.
