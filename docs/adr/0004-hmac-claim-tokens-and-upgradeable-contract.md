# ADR 0004: HMAC Claim Tokens and Upgradeable SurveyPoints Contract (V2)

## Status

Accepted (2026-04, supersedes the V1 secret-based claim flow inherited
from `SurveyPoints` and the non-upgradeable contract layout described
in ADR 0002).

## Context

The V1 design — captured by `SurveyPoints.sol` and the original claim
endpoint — had two operational issues that an external code review
flagged as "blocker before public roll-out":

1. **Secrets on-chain.** Each survey was registered with `secretHash`,
   the keccak-256 of a low-entropy operator-generated string
   (`vpp-...`). Once a single participant clicked their claim link,
   the plaintext travelled through every browser, every URL log, and
   every HTTP intermediary in the chain — so the secret was effectively
   public after the first claim. The on-chain hash gave us nothing.

2. **No replay protection per participant.** The same plaintext URL
   worked for every participant in the survey. A student who shared
   the link on a private channel could let anyone with the URL claim
   the points, bounded only by the survey's `maxClaims`.

3. **Frozen ABI.** `SurveyPoints` was a plain (non-proxied) contract.
   Any change — adding `revokePoints`, fixing a bug, swapping the
   replay-protection scheme — required a redeploy, an admin migration,
   and a discontinuity in the on-chain history. We had already paid
   that cost once for V1; doing it again for every iteration would
   make the system fragile in operator hands.

We also decided early on (see ADR 0003) that the backend stays
stateless from the participant's perspective. We did not want to
introduce a database; the smart contract is still the source of
truth for `points` and `claimed[wallet][survey]`.

## Decision

Two changes, deployed together as **`SurveyPointsV2`** behind a UUPS
proxy:

### 1. HMAC claim tokens

Replace the on-chain `secretHash` with an off-chain per-survey
**HMAC key** held by the backend. Each participant URL carries a
freshly minted `(nonce, token)` pair instead of a static secret:

```
/claim?s=<surveyId>&n=<nonce>&t=<token>

token = base64url( HMAC-SHA256(surveyKey, "v1|" + surveyId + "|" + nonce) )
nonce = base64url(crypto_random(16 bytes))
```

The SoSci/LimeSurvey end page mints `nonce` server-side via PHP's
`random_bytes()` + `hash_hmac()` immediately before redirecting the
participant. The HMAC key is embedded in the survey template once;
participants never see it.

The backend (`POST /api/v1/claim`):

1. Validates the shape of `nonce` (16-128 url-safe base64 chars) and
   `token` (exactly 43 url-safe base64 chars).
2. Looks up the per-survey key in the on-disk `data/survey-keys.json`
   store and recomputes the expected MAC.
3. Compares MACs in constant time (`crypto.timingSafeEqual`).
4. Marks the nonce consumed in `data/used-nonces.json` _before_ the
   on-chain TX (atomic append, fail-closed). A replayed link is
   rejected with HTTP 409 `NONCE_USED`.
5. Calls `awardPoints(wallet, surveyId)` on the V2 contract — the
   contract no longer takes or stores any secret.

### 2. UUPS proxy + revoke + reactivate

`SurveyPointsV2` inherits `Initializable`, `AccessControlUpgradeable`,
`ReentrancyGuardTransient` (EIP-1153, available on Base since
Cancun), and `UUPSUpgradeable`. The deployment script
(`scripts/deploy-v2.ts`) does the V1→V2 cutover atomically:

1. Discovers all V1 `RoleGranted(ADMIN_ROLE, ...)` events.
2. Deploys the V2 implementation + ERC1967 proxy.
3. Replays all admin grants on V2.
4. Calls `deactivateSurvey(...)` on every V1 survey so the old
   contract refuses any further claims.
5. Grants `ADMIN_ROLE` and `MINTER_ROLE` to the production accounts
   (env vars `TARGET_ADMIN`, `TARGET_MINTER`).
6. Renounces the deployer's roles.

The V2 contract also adds:

- `revokePoints(wallet, surveyId)` — admin-only undo for accidental
  awards. Subtracts from `totalPoints[wallet]` and clears
  `hasClaimed[wallet][surveyId]`. Emits `PointsRevoked`.
- `reactivateSurvey(surveyId)` — admin-only inverse of
  `deactivateSurvey`. Required because we now deactivate every V1
  survey during cutover; if any were deactivated by mistake we need
  a way back without redeploying.
- `_adminCount` invariant: `removeAdmin` reverts with `LastAdmin()`
  if it would leave zero admin holders. Combined with the frontend
  protecting the minter row from accidental removal (see commit 4),
  this makes admin lockout impossible from normal flows.
- `version()` returns `"v2.0.0"` for upgrade audit trails.

Future fixes ship via `scripts/upgrade-v2.ts` — a `tsc + hardhat`
upgrade against the existing proxy address, which OpenZeppelin's
storage-layout checks gate so we cannot accidentally corrupt
existing state. The proxy address (and therefore every event link
in BaseScan, every wallet's `totalPoints`, every survey ID) stays
the same forever.

## Consequences

### Security

- **No plaintext secret on-chain or in URLs.** A captured claim URL
  is single-use and reveals nothing about other participants.
- **Replay-safe end-to-end.** The nonce store is fail-closed:
  marked-before-broadcast, append-only on disk, atomic
  (`fs.renameSync`). Even a backend crash after marking but before
  broadcast costs the participant their link, never lets it be
  reused.
- **Constant-time MAC compare.** No timing oracle; an attacker
  cannot brute-force tokens by measuring response latency.
- **Per-survey key isolation.** Compromising one key compromises
  exactly one survey's pool. Operators can `POST /:id/key/rotate`
  to mint a fresh key without touching anything else.
- **No new admin keys for upgrades.** The deployer renounces all
  roles after cutover; only `TARGET_ADMIN` (and any holders the
  admin grants) can call `_authorizeUpgrade`. Multi-sig migration
  is documented in `v2-migration-runbook.md` for when we exit the
  research phase.

### Operations

- **Backend has on-disk state now.** `data/survey-keys.json` and
  `data/used-nonces.json` must survive process restarts. They are
  Plesk-friendly (single mount point, atomic writes), but the
  Plesk backup story now includes them — see `deployment.md`.
- **Survey registration UX changes.** Admins no longer type a
  secret; the server mints it and shows it once in the new
  `SurveyKeyDialog`. Re-fetchable via
  `GET /api/v1/surveys/:id/key`, rotatable via
  `POST /api/v1/surveys/:id/key/rotate`.
- **SoSci/LimeSurvey integration changes.** Generated templates
  embed a PHP snippet rather than a static URL. Operators paste
  the HMAC key into one labelled spot in the template; the snippet
  takes care of nonce generation and URL construction. See
  `sosci-integration.md`.
- **Upgrade path is calm now.** Every future fix is one
  `pnpm hardhat run scripts/upgrade-v2.ts --network base` call.
  No more cutover, no more admin migration, no more "users on
  the old contract" support tail.

### Costs

- One-time: V2 deployment on Base mainnet ≈ 0.00018 ETH (≈ 0.65 USD
  at 4000 USD/ETH and 0.05 gwei). Migration of one V1 admin is
  ≈ 0.00002 ETH per `grantRole` call. Deactivation of one V1 survey
  is ≈ 0.00002 ETH per call. The full migration on the live system
  (4 admins, 11 V1 surveys) cost less than 0.01 USD in the
  Sepolia rehearsal — see `v2-migration-runbook.md`.
- Recurring: same as V1. The HMAC verify and nonce-mark happen
  off-chain; the on-chain footprint of a claim is unchanged
  (`awardPoints` writes one slot for `claimed`, one slot for
  `claimCount`, one event).

### Future work

- **Multi-sig admin.** When we move out of the research phase,
  rotate `TARGET_ADMIN` from the single Hochschule wallet to a
  Safe multi-sig and revoke the single-key admin. Mechanism
  already exists (`grantRole` then `removeAdmin`).
- **HSM-protected minter.** The minter key still lives in
  `MINTER_PRIVATE_KEY` on Plesk. Moving it to a remote signer
  (e.g. AWS KMS, Fireblocks) is a backend-only change and does
  not touch the contract.
- **Per-participant accounts.** Out of scope; the
  pseudonymity-preserving design from the paper still holds.
