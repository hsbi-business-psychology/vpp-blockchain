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
│   wallet (which ALSO holds ADMIN_ROLE; see Owner-Decision  │
│   note in "Backend Minter Key" below)                      │
│ → ADMIN_ROLE can register/deactivate/revoke + add/remove   │
│   admins; last-admin removal blocked on-chain              │
│ → DEFAULT_ADMIN_ROLE gates `_authorizeUpgrade` (UUPS).     │
│   There is NO separate UPGRADER_ROLE in V2.                │
│ → DEFAULT_ADMIN_ROLE renounced by deployer after cutover   │
├────────────────────────────────────────────────────────────┤
│ Layer 6: Rate Limiting (defaults; tunable via env)         │
│ → Claim endpoint: 100 req / minute / IP                    │
│ → General API:    600 req / minute / IP                    │
│   (sized for classroom test runs behind shared NAT;        │
│   see packages/backend/.env.example + audit F6.6)          │
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

The backend Minter wallet holds **both** `MINTER_ROLE` **and** `ADMIN_ROLE`
on the smart contract. This is a deliberate architectural Owner-Decision
(see [`packages/contracts/scripts/deploy-v2.ts`](../packages/contracts/scripts/deploy-v2.ts)
where both roles are granted on cutover) that enables the relayer
pattern: admins authenticate via off-chain EIP-191 signatures and the
backend wallet executes all on-chain transactions on their behalf, so
admins never need ETH to operate the system.

- **Storage:** Private key stored as a Plesk Node.js environment
  variable on the production server (`MINTER_PRIVATE_KEY`). Plesk's
  per-domain ENV is readable only by the application user and `root`;
  no `.env` file is shipped to disk in production. The development
  setup uses a local `.env` which is gitignored and never committed.
- **Funding:** Must be funded with ETH on Base. The backend's
  balance-monitor (see [`docs/runbooks/eth-refill.md`](runbooks/eth-refill.md))
  emits a structured `MINTER_BALANCE_LOW` log line below 0.025 ETH and
  refuses new transactions with HTTP 503 below 0.005 ETH (audit F2.4).

**Compromise impact (full ADMIN surface, NOT limited to mint):**

A leaked Minter private key gives an attacker on-chain control over
**every** ADMIN-gated contract function, executable directly via
BaseScan / `cast` without any backend involvement:

- `addAdmin(0xATTACKER)` — promote a new wallet to ADMIN
- `removeAdmin(0xLEGIT)` — demote any other admin (the on-chain
  `LastAdmin` invariant only guards the **last** remaining admin,
  not the second-to-last)
- `deactivateSurvey(N)` / `reactivateSurvey(N)` — kill or revive
  any running survey
- `revokePoints(0xVICTIM, surveyId)` — wipe legitimately-earned
  student points
- `markWalletSubmitted(0xANY)` / `unmarkWalletSubmitted(0xANY)` —
  manipulate the HSBI grade-eligibility flag
- `awardPoints(...)` — mint points for any wallet on any active
  survey (the on-chain `_claimed` guard still prevents
  double-claiming for the same `(wallet, surveyId)` pair, but a
  fresh wallet × fresh survey combination is wide open)

**Mitigation — recovery sequence (must be executed from a separate
honest ADMIN wallet, NOT through the compromised backend):**

```text
1. addAdmin(NEW_MINTER_ADDRESS)             // bring new minter under ADMIN
2. grantRole(MINTER_ROLE, NEW_MINTER_ADDRESS)
3. removeAdmin(OLD_MINTER_ADDRESS)
4. revokeRole(MINTER_ROLE, OLD_MINTER_ADDRESS)
5. (parallel) sweep ETH from OLD_MINTER → owner wallet so the
   attacker can no longer pay gas for further reverts
6. Update Plesk MINTER_PRIVATE_KEY → restart backend
   (touch packages/backend/tmp/restart.txt)
```

Steps 1–4 must be issued from the standby admin wallet via
BaseScan's "Write Contract" UI or `cast`; the backend will block
`removeAdmin(OLD_MINTER)` itself via the
`MINTER_PROTECTED` guard in `routes/admin.ts`.
A pre-baked recovery runbook (`docs/runbooks/minter-compromise-recovery.md`)
is on the long-term backlog (audit F2.2).

### HMAC Survey Keys (Server)

- One base64url-encoded 256-bit HMAC key per survey, stored in `packages/backend/data/survey-keys.json` with file mode `0600` and parent directory `0700` (enforced by `lib/atomic-write.ts`; audit F4.5 / M13).
- File is gitignored. **Note:** A previous version of this document
  claimed the file is "backed up through the Plesk filesystem
  snapshots" — this claim was unverified and is intentionally removed.
  Operators must **explicitly** configure a Plesk backup schedule for
  `packages/backend/data/` and **test the restore path** before relying
  on it. Treat survey keys as recoverable only via key rotation
  (`POST /api/v1/surveys/:id/key/rotate`), not via filesystem restore.
- The key is shown to the admin exactly once in the UI at registration time; afterwards it is fetched via authenticated `GET /api/v1/surveys/:id/key`.
- **Compromise impact:** an attacker with the key for one survey can mint valid claim URLs for that survey only. They still cannot claim for any specific wallet unless they also control that wallet (Layer 3 EIP-191 still applies). Mitigation: admin rotates the key via `POST /api/v1/surveys/:id/key/rotate`; all previously distributed links become invalid instantly.
- Keys are **scoped per survey** — a leak of one never compromises any other.

### Admin Keys

- Admin wallets are verified on-chain via `ADMIN_ROLE` on the smart contract.
- Admin actions require EIP-191 signature verification of a freshly signed message (default ≤ 60 seconds old, configurable via `MAX_MESSAGE_AGE_MS`; lowered from the previous 5-minute window in audit F6.11). The 60 s window is a defence-in-depth bound on the replay surface — the primary replay protection is the per-admin server-side nonce store (`data/used-nonces.json`).
- Admins can register/deactivate/reactivate surveys, revoke individual claims, manage admins, and mark wallet submissions.
- Admin role can be granted/revoked via the contract's `AccessControlUpgradeable`. The contract refuses to revoke the **last** admin (`LastAdmin` custom error + `_adminCount` invariant). Note: this guard only protects the _last_ remaining admin — a compromised admin can still demote every other admin one by one until only it remains.

### Upgrade Authorisation (UUPS)

- The UUPS `_authorizeUpgrade` hook is gated by `DEFAULT_ADMIN_ROLE`.
  There is **no separate `UPGRADER_ROLE`** in `SurveyPointsV2`. A
  previous version of this document referenced one; it never existed
  in the deployed contract.
- `DEFAULT_ADMIN_ROLE` is held by the production owner wallet only.
  The deployer renounces it after cutover so a compromise of the
  deploy environment cannot push a malicious implementation.
- **Compromise impact:** an attacker who controls the
  `DEFAULT_ADMIN_ROLE` wallet can replace the implementation with
  arbitrary logic — the worst-case threat in the system, since UUPS
  upgrades preserve storage and roles. Mitigation: the wallet is kept
  offline / in a hardware wallet and is **not** the same as the
  Backend Minter wallet. Moving authorisation behind a multisig is on
  the long-term roadmap (see [ADR 0004](adr/0004-hmac-claim-tokens-and-upgradeable-contract.md) § Future work).

## Threat Model

| Threat                                         | Mitigation                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fake claims (no survey completed)              | HMAC token required; only SoSci/LimeSurvey server can mint valid tokens                                                                                                                                                                                                                                                                                         |
| URL shared with third parties (V1 top issue)   | Nonce is single-use; first redeem consumes it, all copies become invalid                                                                                                                                                                                                                                                                                        |
| Duplicate claims by same wallet                | On-chain `_claimed` mapping prevents re-claiming                                                                                                                                                                                                                                                                                                                |
| Impersonation (claiming for another wallet)    | EIP-191 signature verification proves wallet ownership                                                                                                                                                                                                                                                                                                          |
| Token forgery                                  | HMAC-SHA256 with 256-bit key; `timingSafeEqual` comparison                                                                                                                                                                                                                                                                                                      |
| Replay of old signed messages                  | Server-side single-use nonce per admin (primary defence); messages also include unix timestamp and are rejected if > 60 s old or > 1 min in future (defence in depth, audit F6.11)                                                                                                                                                                              |
| Unauthorized point distribution                | `MINTER_ROLE` access control on `awardPoints()`; rotate role without redeploy                                                                                                                                                                                                                                                                                   |
| Backend key compromise                         | **Full ADMIN surface exposed** (add/remove admins, deactivate surveys, revoke points, manipulate wallet-submitted flag, mint to any wallet on any active survey). Recovery requires a separate honest ADMIN wallet to execute the rotation sequence directly on-chain — the backend itself blocks `removeAdmin(currentMinter)`. See "Backend Minter Key" above. |
| Survey HMAC key compromise                     | Scoped to one survey; rotate via admin UI, all distributed URLs invalidated                                                                                                                                                                                                                                                                                     |
| Unauthorised contract upgrade                  | `DEFAULT_ADMIN_ROLE` gating on `_authorizeUpgrade` + OpenZeppelin storage-layout check on upgrade. Owner wallet held offline / hardware wallet, separate from the Backend Minter                                                                                                                                                                                |
| Admin lockout (all admins revoked by accident) | Contract blocks revocation of the **last** admin (`LastAdmin` error, `_adminCount` invariant). Does not protect against a compromised admin demoting all peers one by one until it is the last                                                                                                                                                                  |
| Reentrancy                                     | `ReentrancyGuardTransient` on every state-changing external function                                                                                                                                                                                                                                                                                            |
| Brute-forcing HMAC token                       | 256-bit key, 128-bit token collision space; rate limiting (default 100 claims / min / IP, see Layer 6)                                                                                                                                                                                                                                                          |
| XSS / injection                                | Helmet security headers; React's built-in XSS protection; Zod input validation                                                                                                                                                                                                                                                                                  |
| CSRF                                           | No cookies used; authentication via EIP-191 signed messages                                                                                                                                                                                                                                                                                                     |
| DDoS                                           | Rate limiting on all API endpoints; Alchemy FallbackProvider with public RPC backups                                                                                                                                                                                                                                                                            |
| Event log tampering on RPC                     | Blockchain consensus; backend cross-validates critical state via `getSurveyInfo` read                                                                                                                                                                                                                                                                           |

## Documented Owner Decisions

The following architectural choices are intentional trade-offs accepted
by the project owner during the V2 design phase. They are listed here
explicitly so external reviewers (HSBI data protection, university IT,
future audits) can evaluate the security model on the **actual**
configuration rather than an idealised one. Any deviation from the
mitigations documented above must be re-evaluated against these
decisions.

| #    | Decision                                                             | Rationale                                                                                                                                                                                                                                            | Required mitigations                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-1 | Backend Minter wallet holds **both** `MINTER_ROLE` and `ADMIN_ROLE`  | Enables the relayer pattern: admins authenticate via off-chain EIP-191 signatures and never need to hold ETH on Base. Without `ADMIN_ROLE` the backend could not relay `addAdmin` / `registerSurvey` / `deactivateSurvey` calls on behalf of admins. | Documented recovery sequence (above) + structured balance monitoring + gas fee hard cap (audit M12). A standby honest ADMIN wallet must always exist for emergency rotation — single-admin setups break the recovery path.      |
| OD-2 | Minter private key stored as plaintext Plesk Node.js ENV variable    | The deployment target (HSBI shared Plesk hosting) does not offer a hardware-backed secret store. Plesk per-domain ENV is at least scoped to the application user.                                                                                    | Logger redaction (audit M13) so a runtime crash never spills the key into worker logs; boot-time format validation (audit F2.7) so a malformed key fails fast with a non-leaking message; no `.env` file shipped in production. |
| OD-3 | No multisig on `DEFAULT_ADMIN_ROLE` (single owner-controlled wallet) | Course-context project; introducing a multisig adds operational complexity that the single-operator setup cannot absorb. Roadmap item, not a current risk acceptance for the role’s blast radius.                                                    | Owner wallet kept offline / on a hardware wallet; never used to sign routine operations; UUPS upgrade-path documented and rehearsed before any production upgrade.                                                              |

## Pseudonymity

- Wallet addresses are not linked to real identities.
- The backend only knows wallet addresses, not student names.
- On-chain data contains only addresses, survey IDs, and points.
- No personal data is stored anywhere in the system.
- Admin labels (`data/admin-labels.json`) are a local UX convenience for the operator and are never published or linked to students.

## Reporting Vulnerabilities

Please report security vulnerabilities responsibly. See [SECURITY.md](../SECURITY.md) for the disclosure process.
