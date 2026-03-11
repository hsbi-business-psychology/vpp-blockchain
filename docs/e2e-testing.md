# End-to-End Testing

This document describes the end-to-end test plan for VPP Blockchain. It covers the complete flow from survey creation to point verification.

## Test Environment Setup

Before running E2E tests, you need a fully running local stack:

1. **Hardhat node** (local blockchain)
2. **Backend** (API server pointed at local blockchain)
3. **Frontend** (dev server proxying API requests)

See [Getting Started](getting-started.md#full-local-stack) for the full setup instructions.

## Test Scenarios

### 1. Happy Path: Complete Claim Flow

| Step | Action                                                                                     | Expected Result                                       |
| ---- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 1    | Open admin dashboard (`/admin`)                                                            | Admin page loads with empty survey table              |
| 2    | Connect admin wallet (import private key)                                                  | Wallet connected, address shown                       |
| 3    | Register a new survey (ID: 1, Points: 2, Secret: "test-secret", Max Claims: 100)           | Success toast, survey appears in table, TX hash shown |
| 4    | Download SoSci template                                                                    | XML file downloads with correct surveyId and secret   |
| 5    | Open claim page: `/claim?surveyId=1&secret=test-secret`                                    | Claim page shows survey details                       |
| 6    | Create a new wallet                                                                        | Wallet created, address and private key shown         |
| 7    | Click "Claim Points"                                                                       | Loading state → success confirmation with TX hash     |
| 8    | Navigate to Points page (`/points`)                                                        | Shows 2 total points, 1 claim entry                   |
| 9    | On the Points page (`/points`), use the Wallet Search section and enter the wallet address | Shows same 2 points                                   |
| 10   | Verify on local Hardhat node                                                               | `totalPoints(wallet) == 2`                            |

### 2. Double Claim Prevention

| Step | Action                                                             | Expected Result                          |
| ---- | ------------------------------------------------------------------ | ---------------------------------------- |
| 1    | Complete the happy path (claim survey 1)                           | Success                                  |
| 2    | Open `/claim?surveyId=1&secret=test-secret` again with same wallet | Claim page shows "Already Claimed" error |
| 3    | API returns                                                        | `409 ALREADY_CLAIMED`                    |

### 3. Invalid Secret

| Step | Action                                         | Expected Result              |
| ---- | ---------------------------------------------- | ---------------------------- |
| 1    | Register a survey with secret "correct-secret" | Success                      |
| 2    | Open `/claim?surveyId=2&secret=wrong-secret`   | Claim attempt                |
| 3    | Click "Claim Points"                           | Error: "Invalid secret"      |
| 4    | API returns                                    | `400` with blockchain revert |

### 4. Survey Not Found

| Step | Action                                       | Expected Result           |
| ---- | -------------------------------------------- | ------------------------- |
| 1    | Open `/claim?surveyId=99999&secret=anything` | Claim page loads          |
| 2    | Click "Claim Points"                         | Error: "Survey not found" |
| 3    | API returns                                  | `404 SURVEY_NOT_FOUND`    |

### 5. Deactivated Survey

| Step | Action                                  | Expected Result                |
| ---- | --------------------------------------- | ------------------------------ |
| 1    | Register survey and then deactivate it  | Survey status shows "Inactive" |
| 2    | Attempt to claim the deactivated survey | Error: "Survey inactive"       |
| 3    | API returns                             | `400 SURVEY_INACTIVE`          |

### 6. Max Claims Reached

| Step | Action                           | Expected Result             |
| ---- | -------------------------------- | --------------------------- |
| 1    | Register survey with maxClaims=1 | Success                     |
| 2    | Claim with wallet A              | Success                     |
| 3    | Claim with wallet B              | Error: "Max claims reached" |

### 7. Wallet Management

| Step | Action                       | Expected Result                                          |
| ---- | ---------------------------- | -------------------------------------------------------- |
| 1    | Navigate to `/wallet`        | Wallet page loads                                        |
| 2    | Click "Create Wallet"        | New wallet created, address + private key displayed      |
| 3    | Copy private key             | Key copied to clipboard                                  |
| 4    | Delete wallet                | Wallet removed from localStorage, page shows "No wallet" |
| 5    | Click "Import Wallet"        | Import form appears                                      |
| 6    | Paste the copied private key | Wallet restored with same address                        |

### 8. No Wallet on Claim Page

| Step | Action                                      | Expected Result                         |
| ---- | ------------------------------------------- | --------------------------------------- |
| 1    | Clear localStorage (no wallet)              | —                                       |
| 2    | Open `/claim?surveyId=1&secret=test-secret` | Page shows "Create wallet first" prompt |
| 3    | Create wallet on claim page                 | Wallet created, claim button appears    |

### 9. Multiple Surveys

| Step | Action                                             | Expected Result                  |
| ---- | -------------------------------------------------- | -------------------------------- |
| 1    | Register 3 surveys (IDs: 1, 2, 3; Points: 1, 2, 3) | All three appear in admin table  |
| 2    | Claim all three with the same wallet               | Each claim succeeds              |
| 3    | Check points page                                  | Total: 6 points, 3 claim entries |

### 10. Expired Signature

| Step | Action                                                      | Expected Result          |
| ---- | ----------------------------------------------------------- | ------------------------ |
| 1    | Construct a claim with timestamp older than max message age | —                        |
| 2    | Submit to API                                               | Error: `EXPIRED_MESSAGE` |

## Mobile Testing

Test the following on both iOS Safari and Android Chrome:

- [ ] Wallet creation and private key display
- [ ] Claim flow (from redirect URL)
- [ ] Points page rendering
- [ ] Theme toggle (dark/light)
- [ ] Language switcher (DE/EN)
- [ ] Sidebar navigation (should show as bottom sheet on mobile)
- [ ] Copy-to-clipboard functionality
- [ ] All buttons and inputs are tap-friendly (min 44px touch targets)

## Performance Benchmarks

| Metric                           | Target       |
| -------------------------------- | ------------ |
| Claim flow (sign → confirmation) | < 15 seconds |
| Frontend initial load (FCP)      | < 3 seconds  |
| Blockchain read (points query)   | < 2 seconds  |
| Frontend build size (gzipped)    | < 500 KB     |

## API Response Time Testing

```bash
# Health check
time curl -s http://localhost:3000/api/health

# Points query
time curl -s http://localhost:3000/api/points/0x1234...

# Survey list
time curl -s http://localhost:3000/api/surveys
```

## Automated Test Summary

The project includes automated unit and integration tests:

| Package     | Framework                      | Tests                                          |
| ----------- | ------------------------------ | ---------------------------------------------- |
| `contracts` | Hardhat + Chai                 | 42 tests (roles, claims, edge cases, events)   |
| `backend`   | Vitest + Supertest             | 17 tests (all API endpoints, auth, validation) |
| `frontend`  | Vitest + React Testing Library | 20 tests (hooks, pages, config)                |

Run all tests:

```bash
pnpm test
```

## Regression Testing Checklist

Before each release, verify:

- [ ] All automated tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Formatting is correct (`pnpm format:check`)
- [ ] Frontend builds without errors (`pnpm --filter @vpp/frontend build`)
- [ ] Backend builds without errors (`pnpm --filter @vpp/backend build`)
- [ ] Happy path claim flow works end-to-end
- [ ] Admin survey registration works
- [ ] Points display correctly on all pages
- [ ] Dark and light themes render correctly
- [ ] Both languages (DE/EN) display correctly
- [ ] Mobile layout is responsive and usable
