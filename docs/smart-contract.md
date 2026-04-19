# Smart Contract

The `SurveyPointsV2` contract is the core on-chain component of VPP. It manages survey registration, point distribution, and claim tracking. V2 is **upgradeable** (UUPS proxy) and stores **no secrets on-chain** — claim authentication is handled off-chain via HMAC tokens (see ADR 0004).

> The original non-upgradeable `SurveyPoints` (V1) contract is still in `packages/contracts/contracts/SurveyPoints.sol` for the historical migration scripts but is **deactivated in production**: the V2 deploy script flips every V1 survey to `active = false`. New deployments must use V2.

## Contract Details

| Property         | Value                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Name             | `SurveyPointsV2`                                                                                   |
| Solidity Version | `^0.8.24` (`evmVersion: 'cancun'`)                                                                 |
| License          | MIT                                                                                                |
| Inheritance      | `Initializable`, `AccessControlUpgradeable`, `ReentrancyGuardTransient`, `UUPSUpgradeable` (OZ v5) |
| Proxy            | ERC1967 + UUPS — same address forever, implementation swappable by `ADMIN_ROLE`                    |
| Network          | Base L2 (Sepolia testnet / Mainnet)                                                                |

`ReentrancyGuardTransient` uses EIP-1153 transient storage (TSTORE/TLOAD), available on Base since the Cancun upgrade. It costs less gas than the storage-slot guard and — importantly for upgradeable contracts — uses **zero permanent storage slots**, so future implementations cannot collide with the guard.

## Roles

| Role          | Constant             | Purpose                                                                                             |
| ------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| Default Admin | `DEFAULT_ADMIN_ROLE` | Authorises UUPS upgrades (`_authorizeUpgrade`); held by the cold `TARGET_ADMIN` only                |
| Admin         | `ADMIN_ROLE`         | Surveys, admin/minter management, mark/revoke (held by lecturer wallets **and** the backend signer) |
| Minter        | `MINTER_ROLE`        | Calls `awardPoints` (assigned to the backend wallet)                                                |

`ADMIN_ROLE` is its own role admin (`_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE)`); the same applies to `MINTER_ROLE`. The deployer renounces `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE` at the end of `scripts/deploy-v2.ts`. After cutover the privileged accounts are: the production `TARGET_ADMIN` (Hochschule wallet, single-key today, multi-sig planned), the migrated lecturer admins, and the backend signer (holds `MINTER_ROLE` + `ADMIN_ROLE`).

### Why the backend signer holds `ADMIN_ROLE`

The backend is a stateless relayer. Admins sign an EIP-191 message in the frontend; the backend verifies the signature off-chain (`middleware/auth.ts`) and submits the transaction with the single funded backend wallet. Every admin-gated function (`addAdmin`, `removeAdmin`, `deactivateSurvey`, `reactivateSurvey`, `revokePoints`, `markWalletSubmitted`, `unmarkWalletSubmitted`) is `onlyRole(ADMIN_ROLE)` and `msg.sender` is the backend signer — therefore the backend wallet must hold `ADMIN_ROLE`. This is granted explicitly in `scripts/deploy-v2.ts` step 5.

The trade-off is that a backend-key compromise lets the attacker exercise `ADMIN_ROLE` directly. Mitigations:

- **Upgrade authority is segregated.** `DEFAULT_ADMIN_ROLE` lives only on the cold `TARGET_ADMIN` wallet; the minter cannot push a malicious implementation.
- **HMAC keys are off-chain.** `data/survey-keys.json` is unreachable from any on-chain attack — minted points still require a valid HMAC token.
- **`_adminCount` enforces `LastAdmin()`.** The attacker cannot lock out every admin, so the legitimate admin can always revoke the compromised minter via BaseScan and rotate the backend key without a redeploy.
- **Recovery is one BaseScan transaction.** `revokeRole(ADMIN_ROLE, oldMinter)` + `revokeRole(MINTER_ROLE, oldMinter)` from the cold admin wallet, then update `MINTER_PRIVATE_KEY` in Plesk and `grantRole(…)` for the new wallet.

See ADR 0004 for the full discussion.

The contract enforces an **`_adminCount` invariant**: `removeAdmin` and `renounceRole(ADMIN_ROLE, …)` revert with `LastAdmin()` if they would leave zero `ADMIN_ROLE` holders. Combined with the frontend hiding the minter-wallet "remove" button, this makes admin lockout impossible from any normal flow.

## Data Structures

### Survey Struct

```solidity
struct Survey {
    uint8   points;        // Points per claim (1–255)
    uint256 maxClaims;     // Maximum claims allowed (0 = unlimited)
    uint256 claimCount;    // Current number of claims
    bool    active;        // Toggleable via deactivateSurvey / reactivateSurvey
    uint256 registeredAt;  // Block timestamp of registration
    string  title;         // Human-readable survey title
}
```

> **Difference vs V1:** the `bytes32 secretHash` field is gone. The survey's HMAC key lives off-chain in the backend's `data/survey-keys.json` store and never touches the blockchain.

### State Mappings

| Mapping            | Type                        | Purpose                              |
| ------------------ | --------------------------- | ------------------------------------ |
| `_surveys`         | `uint256 → Survey`          | Survey configuration by ID           |
| `_surveyPoints`    | `address → uint256 → uint8` | Points per wallet per survey         |
| `_totalPoints`     | `address → uint256`         | Total accumulated points per wallet  |
| `_claimed`         | `address → uint256 → bool`  | Claim status per wallet per survey   |
| `_walletSubmitted` | `address → bool`            | Wallet submission status             |
| `_adminCount`      | `uint256`                   | Live invariant for `LastAdmin` check |

## Functions

### Initialization

#### `initialize(initialAdmin, initialMinter)`

Called once via the proxy by the OpenZeppelin `ERC1967Proxy` constructor. Replaces the V1 constructor for upgradeable contracts. Grants `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE` to `initialAdmin`, `MINTER_ROLE` to `initialMinter`, and sets `_adminCount = 1`.

### Write Functions (claim flow)

#### `awardPoints(student, surveyId)`

Award points to a student. Requires `MINTER_ROLE`. Protected by `nonReentrant` (transient storage).

| Parameter  | Type      | Description                   |
| ---------- | --------- | ----------------------------- |
| `student`  | `address` | Wallet address of the student |
| `surveyId` | `uint256` | Survey being claimed          |

> The V1 `string secret` parameter is **gone**. All authentication happens in the backend (`POST /api/v1/claim`) before this call: HMAC verify, nonce-mark, then on-chain `awardPoints`.

Emits `PointsAwarded(wallet, surveyId, points)`.

**Reverts if:**

- Student address is zero (`ZeroAddress`)
- Survey does not exist (`SurveyNotFound`)
- Survey is inactive (`SurveyNotActive`)
- Student already claimed this survey (`AlreadyClaimed`)
- Maximum claims reached (`MaxClaimsReached`)

#### `revokePoints(wallet, surveyId)`

Undo an awarded claim. Requires `MINTER_ROLE`. Subtracts from `_totalPoints[wallet]`, clears `_claimed[wallet][surveyId]`, and decrements `_surveys[surveyId].claimCount`. Emits `PointsRevoked(wallet, surveyId, points)`.

**Reverts if:** the wallet has not claimed this survey (`NotClaimed`).

Used for operator corrections — e.g. a participant who completed the study under duress, or a duplicate claim caused by a system bug.

### Write Functions (admin)

#### `registerSurvey(surveyId, points, maxClaims, title)`

Register a new survey. Requires `ADMIN_ROLE`. The HMAC key is created in the backend (see `POST /api/v1/surveys`) and is **not** sent on-chain.

| Parameter   | Type      | Description                            |
| ----------- | --------- | -------------------------------------- |
| `surveyId`  | `uint256` | Unique survey identifier (must be > 0) |
| `points`    | `uint8`   | Points to award (1–255)                |
| `maxClaims` | `uint256` | Max claims allowed (0 = unlimited)     |
| `title`     | `string`  | Human-readable survey title            |

Emits `SurveyRegistered(surveyId, points, maxClaims, title)`.

#### `deactivateSurvey(surveyId)` / `reactivateSurvey(surveyId)`

Toggle a survey's `active` flag. Requires `ADMIN_ROLE`. Emit `SurveyDeactivated(surveyId)` and `SurveyReactivated(surveyId)` respectively.

`deactivateSurvey` reverts if the survey is already inactive (`SurveyNotActive`); `reactivateSurvey` reverts if it is already active (`SurveyAlreadyActive`).

#### `addAdmin(account)` / `removeAdmin(account)`

Grant or revoke `ADMIN_ROLE`. Requires `ADMIN_ROLE`. `removeAdmin` reverts with `LastAdmin()` if it would leave zero admins.

#### `markWalletSubmitted(wallet)` / `unmarkWalletSubmitted(wallet)`

Mark / unmark a wallet as submitted for thesis admission. Requires `ADMIN_ROLE`. Each emits an event (`WalletSubmitted` / `WalletUnsubmitted`).

### Upgrade Mechanism

#### `_authorizeUpgrade(newImplementation)` (`onlyRole(ADMIN_ROLE)`)

Called by `UUPSUpgradeable.upgradeToAndCall(...)`. Only `ADMIN_ROLE` can authorize a swap. The OpenZeppelin Hardhat plugin (`scripts/upgrade-v2.ts`) checks storage-layout compatibility before broadcasting the upgrade so existing state cannot be corrupted.

#### `version()` → `string`

Returns `"v2.0.0"` (bumped per upgrade). Useful for audit trails and for the `/api/v1/status` endpoint to surface the live implementation version.

### Read Functions

| Function                         | Returns                                            | Description                              |
| -------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `totalPoints(wallet)`            | `uint256`                                          | Total points for a wallet                |
| `surveyPoints(wallet, surveyId)` | `uint8`                                            | Points earned for a specific survey      |
| `claimed(wallet, surveyId)`      | `bool`                                             | Whether a wallet has claimed a survey    |
| `getSurveyInfo(surveyId)`        | `(uint8, uint256, uint256, bool, uint256, string)` | Full survey details (no secret hash)     |
| `isAdmin(account)`               | `bool`                                             | Whether an address holds `ADMIN_ROLE`    |
| `adminCount()`                   | `uint256`                                          | Live count of `ADMIN_ROLE` holders       |
| `isWalletSubmitted(wallet)`      | `bool`                                             | Whether a wallet is marked as submitted  |
| `version()`                      | `string`                                           | Implementation version (e.g. `"v2.0.0"`) |

## Events

| Event               | Parameters                                                | When                              |
| ------------------- | --------------------------------------------------------- | --------------------------------- |
| `SurveyRegistered`  | `surveyId (indexed)`, `points`, `maxClaims`, `title`      | New survey created                |
| `PointsAwarded`     | `wallet (indexed)`, `surveyId (indexed)`, `points`        | Points awarded                    |
| `PointsRevoked`     | `wallet (indexed)`, `surveyId (indexed)`, `points`        | Points undone by an admin/minter  |
| `SurveyDeactivated` | `surveyId (indexed)`                                      | Survey deactivated                |
| `SurveyReactivated` | `surveyId (indexed)`                                      | Survey reactivated                |
| `WalletSubmitted`   | `wallet (indexed)`, `markedBy (indexed)`                  | Wallet marked as submitted        |
| `WalletUnsubmitted` | `wallet (indexed)`, `unmarkedBy (indexed)`                | Wallet submission mark removed    |
| `RoleGranted`       | `role (indexed)`, `account (indexed)`, `sender (indexed)` | Role assigned (from OpenZeppelin) |
| `RoleRevoked`       | `role (indexed)`, `account (indexed)`, `sender (indexed)` | Role revoked (from OpenZeppelin)  |
| `Upgraded`          | `implementation (indexed)`                                | Proxy points to new logic         |

## Custom Errors

| Error                              | When                                                 |
| ---------------------------------- | ---------------------------------------------------- |
| `SurveyAlreadyExists(surveyId)`    | Trying to register with an existing ID               |
| `SurveyNotFound(surveyId)`         | Survey ID does not exist                             |
| `SurveyNotActive(surveyId)`        | Survey has been deactivated                          |
| `SurveyAlreadyActive(surveyId)`    | Trying to reactivate a survey that is already active |
| `AlreadyClaimed(wallet, surveyId)` | Wallet already claimed this survey                   |
| `NotClaimed(wallet, surveyId)`     | Trying to revoke an unawarded claim                  |
| `MaxClaimsReached(surveyId)`       | Maximum number of claims exceeded                    |
| `InvalidPoints()`                  | Points value is zero                                 |
| `InvalidSurveyId()`                | Survey ID is zero                                    |
| `ZeroAddress()`                    | Address parameter is the zero address                |
| `LastAdmin()`                      | Operation would leave zero `ADMIN_ROLE` holders      |
| `WalletAlreadySubmitted(wallet)`   | Wallet is already marked as submitted                |
| `WalletNotSubmitted(wallet)`       | Wallet is not marked as submitted                    |

## Deployment

The V2 deploy is **not** a fresh deploy in the V1 sense — it is a one-shot **migration script** that performs the V1→V2 cutover atomically. Full step-by-step instructions live in [v2-migration-runbook.md](v2-migration-runbook.md). Short version:

### Testnet (Base Sepolia rehearsal — do this first)

```bash
cd packages/contracts
cp .env.example .env  # set DEPLOYER_PRIVATE_KEY, BASESCAN_API_KEY,
                      # V1_CONTRACT_ADDRESS, TARGET_ADMIN, TARGET_MINTER
pnpm run deploy:v2:sepolia
```

### Mainnet (Base)

```bash
pnpm run deploy:v2:mainnet
```

The script performs, in order:

1. Discovers all V1 `RoleGranted(ADMIN_ROLE, ...)` events via `eth_getLogs`.
2. Deploys the V2 implementation + ERC1967 proxy.
3. Replays admin grants on V2.
4. Calls `deactivateSurvey(...)` on every V1 survey.
5. Grants `ADMIN_ROLE` and `MINTER_ROLE` to `TARGET_ADMIN` / `TARGET_MINTER`.
6. Renounces the deployer's `ADMIN_ROLE` and `DEFAULT_ADMIN_ROLE`.
7. Verifies both implementation + proxy on BaseScan.
8. Prints a copy-paste ready Plesk env-var block.

### Future upgrades

```bash
pnpm run upgrade:v2:mainnet
```

`scripts/upgrade-v2.ts` deploys a new implementation, runs the OpenZeppelin storage-layout check, calls `upgradeToAndCall(impl, "")` from `TARGET_ADMIN`, and verifies the new implementation on BaseScan. The proxy address never changes.

## Verification

`scripts/deploy-v2.ts` and `scripts/upgrade-v2.ts` invoke `hardhat verify` automatically. To re-run manually:

```bash
npx hardhat verify --network baseSepolia <IMPLEMENTATION_ADDRESS>
# proxy is auto-detected by BaseScan once the implementation is verified
```

## Gas Costs (April 2026, Base mainnet, 0.05 gwei)

| Operation                               | Estimated Gas     | Approx. USD  |
| --------------------------------------- | ----------------- | ------------ |
| Deploy V2 (impl + proxy)                | ~3,600,000        | ~$0.65       |
| `upgradeToAndCall` (later)              | ~50,000           | ~$0.01       |
| `registerSurvey`                        | ~120,000          | ~$0.02       |
| `awardPoints` (first per wallet)        | ~75,000           | ~$0.01       |
| `awardPoints` (subsequent)              | ~50,000           | ~$0.005      |
| `revokePoints`                          | ~40,000           | ~$0.005      |
| `deactivateSurvey` / `reactivateSurvey` | ~32,000 / ~32,000 | ~$0.004 each |
| Read functions                          | 0                 | Free         |

The full V1 → V2 cutover for the live system (4 admins, 11 V1 surveys) cost less than 0.005 USD in the Sepolia rehearsal — see `v2-migration-runbook.md`.
