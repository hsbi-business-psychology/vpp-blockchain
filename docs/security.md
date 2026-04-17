# Security Architecture

This document describes the security model of VPP Blockchain, including threat mitigation, access control, and key management.

> **V2 update (April 2026):** Layer 1 and Layer 4 below describe the HMAC-token flow introduced with `SurveyPointsV2`. Plaintext survey secrets (V1) are no longer used. See [ADR 0004](adr/0004-hmac-claim-tokens-and-upgradeable-contract.md) for the threat-model rationale.

## Layers of Protection

```
┌────────────────────────────────────────────────────────────┐
│ Layer 1: Per-Participant HMAC Claim Token                  │
│ → Survey server (SoSci/LimeSurvey) mints a unique URL per  │
│   participant: /claim?s=<id>&n=<nonce>&t=<hmac>            │
│ → Token = HMAC-SHA256("v1|surveyId|nonce", surveyKey)      │
│ → Backend verifies with timingSafeEqual, rejects on mismatch│
│ → HMAC key never reaches the participant's browser         │
├────────────────────────────────────────────────────────────┤
│ Layer 2: Single-Use Nonce Store (Replay Guard)             │
│ → Each nonce is consumed on first valid claim              │
│ → Nonce marked used BEFORE broadcasting on-chain TX        │
│   (fail-closed — link can never be redeemed twice)         │
├────────────────────────────────────────────────────────────┤
│ Layer 3: Wallet Signature (EIP-191)                        │
│ → Claim request must be signed by the wallet owner         │
│ → Backend verifies signature via ecrecover                 │
│ → Nobody can claim on behalf of another wallet             │
├────────────────────────────────────────────────────────────┤
│ Layer 4: On-Chain Double-Claim + Authorisation Guards      │
│ → mapping(address => mapping(uint256 => bool)) _claimed    │
│ → Contract rejects second claim per (wallet, surveyId)     │
│ → ReentrancyGuardTransient (EIP-1153) on state-changing   │
│   functions                                                │
├────────────────────────────────────────────────────────────┤
│ Layer 5: Contract Role Access Control (OpenZeppelin)       │
│ → MINTER_ROLE can call awardPoints() — held by backend     │
│ → ADMIN_ROLE can register/deactivate/revoke — held by      │
│   human admins; last-admin removal blocked on-chain        │
│ → UPGRADER_ROLE authorises UUPS upgrades                   │
│ → DEFAULT_ADMIN_ROLE renounced by deployer after cutover   │
├────────────────────────────────────────────────────────────┤
│ Layer 6: Rate Limiting                                     │
│ → Claim endpoint: 5 req / minute / IP                     │
│ → General API:   100 req / minute / IP                    │
├────────────────────────────────────────────────────────────┤
│ Layer 7: HTTP Security Headers (Helmet)                    │
│ → Standard security headers (CSP, HSTS, etc.)              │
│ → CORS restricted to configured frontend URL               │
└────────────────────────────────────────────────────────────┘
```

## Key Management

### Student Keys (Frontend)

- Private keys are **never** sent to the server.
- Signing happens entirely in the browser using ethers.js (browser wallet) or MetaMask.
- **Browser wallet:** Keys are stored in `localStorage` (client-side only). Students can export and back up their key. **Key loss = permanent loss of access** (no recovery mechanism by design).
- **MetaMask:** Keys are managed by the MetaMask extension with password protection and optional seed phrase recovery. No private key is stored in `localStorage` — only the wallet address and type.

### Backend Minter Key (Server)

- Server wallet holds `MINTER_ROLE` on the contract.
- Private key stored in `.env` (never committed to the repository).
- This wallet pays gas for all transactions.
- Must be funded with ETH on Base (~$10 for thousands of transactions).
- **Compromise impact:** an attacker can call `awardPoints` freely until the role is revoked. It cannot mint retroactively for wallets that already claimed (on-chain `_claimed` guard still holds), and it cannot modify survey configuration. Mitigation: admin can instantly revoke `MINTER_ROLE` and re-grant it to a new backend wallet; no contract redeploy required.

### HMAC Survey Keys (Server)

- One base64url-encoded 256-bit HMAC key per survey, stored in `packages/backend/data/survey-keys.json`.
- File is gitignored and backed up through the Plesk filesystem snapshots.
- The key is shown to the admin exactly once in the UI at registration time; afterwards it is fetched via authenticated `GET /api/v1/surveys/:id/key`.
- **Compromise impact:** an attacker with the key for one survey can mint valid claim URLs for that survey only. They still cannot claim for any specific wallet unless they also control that wallet (Layer 3 EIP-191 still applies). Mitigation: admin rotates the key via `POST /api/v1/surveys/:id/key/rotate`; all previously distributed links become invalid instantly.
- Keys are **scoped per survey** — a leak of one never compromises any other.

### Admin Keys

- Admin wallets are verified on-chain via `ADMIN_ROLE` on the smart contract.
- Admin actions require EIP-191 signature verification of a freshly signed message (≤ 5 minutes old).
- Admins can register/deactivate/reactivate surveys, revoke individual claims, manage admins, and mark wallet submissions.
- Admin role can be granted/revoked via the contract's `AccessControlUpgradeable`. The contract refuses to revoke the **last** admin (`LastAdmin` custom error + `_adminCount` invariant).

### Upgrader Key (UUPS)

- `UPGRADER_ROLE` is the single role that can authorise a new implementation for the UUPS proxy (`_authorizeUpgrade`).
- Held by the production admin only; the deployer renounces it after cutover.
- **Compromise impact:** an attacker can replace the implementation with malicious logic — the worst-case threat in the system. Mitigation: the role is held by a human-controlled wallet only; in a future iteration this should move behind a multisig (see ADR 0004 § Future work).

## Threat Model

| Threat                                         | Mitigation                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Fake claims (no survey completed)              | HMAC token required; only SoSci/LimeSurvey server can mint valid tokens                    |
| URL shared with third parties (V1 top issue)   | Nonce is single-use; first redeem consumes it, all copies become invalid                   |
| Duplicate claims by same wallet                | On-chain `_claimed` mapping prevents re-claiming                                           |
| Impersonation (claiming for another wallet)    | EIP-191 signature verification proves wallet ownership                                     |
| Token forgery                                  | HMAC-SHA256 with 256-bit key; `timingSafeEqual` comparison                                 |
| Replay of old signed messages                  | Messages include unix timestamp; rejected if > 5 min old or > 1 min in future              |
| Unauthorized point distribution                | `MINTER_ROLE` access control on `awardPoints()`; rotate role without redeploy              |
| Backend key compromise                         | Damage limited to point distribution; revoke `MINTER_ROLE`; no historical damage           |
| Survey HMAC key compromise                     | Scoped to one survey; rotate via admin UI, all distributed URLs invalidated                |
| Unauthorised contract upgrade                  | `UPGRADER_ROLE` gating; OpenZeppelin `_authorizeUpgrade` + storage-layout check on upgrade |
| Admin lockout (all admins revoked by accident) | Contract blocks revocation of the last admin (`LastAdmin` error, `_adminCount` invariant)  |
| Reentrancy                                     | `ReentrancyGuardTransient` on every state-changing external function                       |
| Brute-forcing HMAC token                       | 256-bit key, 128-bit token collision space; rate limiting (5 claims / min / IP)            |
| XSS / injection                                | Helmet security headers; React's built-in XSS protection; Zod input validation             |
| CSRF                                           | No cookies used; authentication via EIP-191 signed messages                                |
| DDoS                                           | Rate limiting on all API endpoints; Alchemy FallbackProvider with public RPC backups       |
| Event log tampering on RPC                     | Blockchain consensus; backend cross-validates critical state via `getSurveyInfo` read      |

## Pseudonymity

- Wallet addresses are not linked to real identities.
- The backend only knows wallet addresses, not student names.
- On-chain data contains only addresses, survey IDs, and points.
- No personal data is stored anywhere in the system.
- Admin labels (`data/admin-labels.json`) are a local UX convenience for the operator and are never published or linked to students.

## Reporting Vulnerabilities

Please report security vulnerabilities responsibly. See [SECURITY.md](../SECURITY.md) for the disclosure process.
