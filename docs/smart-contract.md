# Smart Contract

The `SurveyPoints` contract is the core on-chain component of VPP. It manages survey registration, point distribution, and claim tracking.

## Contract Details

| Property         | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Name             | `SurveyPoints`                                       |
| Solidity Version | `^0.8.24`                                            |
| License          | MIT                                                  |
| Inheritance      | `AccessControl`, `ReentrancyGuard` (OpenZeppelin v5) |
| Network          | Base L2 (Sepolia testnet / Mainnet)                  |

## Roles

| Role          | Constant             | Purpose                                                 |
| ------------- | -------------------- | ------------------------------------------------------- |
| Default Admin | `DEFAULT_ADMIN_ROLE` | Can grant and revoke all roles                          |
| Admin         | `ADMIN_ROLE`         | Can register/deactivate surveys and manage other admins |
| Minter        | `MINTER_ROLE`        | Can award points (assigned to the backend wallet)       |

The deployer address receives `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE`. The backend wallet receives `MINTER_ROLE`.

**Role admin configuration:** `ADMIN_ROLE` is its own role admin (`_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE)`), meaning any wallet with `ADMIN_ROLE` can grant or revoke `ADMIN_ROLE` for other wallets — no need to involve the deployer. The same applies to `MINTER_ROLE`, which is also managed by `ADMIN_ROLE`.

## Data Structures

### Survey Struct

```solidity
struct Survey {
    bytes32 secretHash;    // keccak256 hash of the survey secret
    uint8   points;        // Points per claim (1–255)
    uint256 maxClaims;     // Maximum claims allowed (0 = unlimited)
    uint256 claimCount;    // Current number of claims
    bool    active;        // Can be deactivated by admin
    uint256 registeredAt;  // Block timestamp of registration
}
```

### State Mappings

| Mapping         | Type                        | Purpose                             |
| --------------- | --------------------------- | ----------------------------------- |
| `_surveys`      | `uint256 → Survey`          | Survey configuration by ID          |
| `_surveyPoints` | `address → uint256 → uint8` | Points per wallet per survey        |
| `_totalPoints`  | `address → uint256`         | Total accumulated points per wallet |
| `_claimed`      | `address → uint256 → bool`  | Claim status per wallet per survey  |

## Functions

### Write Functions

#### `registerSurvey(surveyId, secretHash, points, maxClaims)`

Register a new survey. Requires `ADMIN_ROLE`.

| Parameter    | Type      | Description                            |
| ------------ | --------- | -------------------------------------- |
| `surveyId`   | `uint256` | Unique survey identifier (must be > 0) |
| `secretHash` | `bytes32` | `keccak256(abi.encodePacked(secret))`  |
| `points`     | `uint8`   | Points to award (1–255)                |
| `maxClaims`  | `uint256` | Max claims allowed (0 = unlimited)     |

Emits `SurveyRegistered(surveyId, points, maxClaims)`.

#### `awardPoints(student, surveyId, secret)`

Award points to a student. Requires `MINTER_ROLE`. Protected by `nonReentrant`.

| Parameter  | Type      | Description                                      |
| ---------- | --------- | ------------------------------------------------ |
| `student`  | `address` | Wallet address of the student                    |
| `surveyId` | `uint256` | Survey being claimed                             |
| `secret`   | `string`  | Plain-text secret (hashed and compared on-chain) |

Emits `PointsAwarded(wallet, surveyId, points)`.

**Reverts if:**

- Student address is zero
- Survey does not exist
- Survey is inactive
- Student already claimed this survey
- Secret does not match the stored hash
- Maximum claims reached

#### `deactivateSurvey(surveyId)`

Deactivate a survey to prevent further claims. Requires `ADMIN_ROLE`.

Emits `SurveyDeactivated(surveyId)`.

#### `addAdmin(account)`

Grant `ADMIN_ROLE` to another address. Requires `ADMIN_ROLE`. Reverts on zero address.

Emits `RoleGranted(ADMIN_ROLE, account, sender)` (from OpenZeppelin AccessControl).

#### `removeAdmin(account)`

Revoke `ADMIN_ROLE` from an address. Requires `ADMIN_ROLE`. Reverts on zero address.

Emits `RoleRevoked(ADMIN_ROLE, account, sender)` (from OpenZeppelin AccessControl).

### Read Functions

| Function                         | Returns                                             | Description                           |
| -------------------------------- | --------------------------------------------------- | ------------------------------------- |
| `totalPoints(wallet)`            | `uint256`                                           | Total points for a wallet             |
| `surveyPoints(wallet, surveyId)` | `uint8`                                             | Points earned for a specific survey   |
| `claimed(wallet, surveyId)`      | `bool`                                              | Whether a wallet has claimed a survey |
| `getSurveyInfo(surveyId)`        | `(bytes32, uint8, uint256, uint256, bool, uint256)` | Full survey details                   |
| `isAdmin(account)`               | `bool`                                              | Whether an address holds `ADMIN_ROLE` |

## Events

| Event               | Parameters                                                | When                              |
| ------------------- | --------------------------------------------------------- | --------------------------------- |
| `SurveyRegistered`  | `surveyId (indexed)`, `points`, `maxClaims`               | New survey created                |
| `PointsAwarded`     | `wallet (indexed)`, `surveyId (indexed)`, `points`        | Points awarded                    |
| `SurveyDeactivated` | `surveyId (indexed)`                                      | Survey deactivated                |
| `RoleGranted`       | `role (indexed)`, `account (indexed)`, `sender (indexed)` | Role assigned (from OpenZeppelin) |
| `RoleRevoked`       | `role (indexed)`, `account (indexed)`, `sender (indexed)` | Role revoked (from OpenZeppelin)  |

## Custom Errors

| Error                              | When                                    |
| ---------------------------------- | --------------------------------------- |
| `SurveyAlreadyExists(surveyId)`    | Trying to register with an existing ID  |
| `SurveyNotFound(surveyId)`         | Survey ID does not exist                |
| `SurveyNotActive(surveyId)`        | Survey has been deactivated             |
| `InvalidSecret()`                  | Provided secret does not match the hash |
| `AlreadyClaimed(wallet, surveyId)` | Wallet already claimed this survey      |
| `MaxClaimsReached(surveyId)`       | Maximum number of claims exceeded       |
| `InvalidPoints()`                  | Points value is zero                    |
| `InvalidSurveyId()`                | Survey ID is zero                       |
| `ZeroAddress()`                    | Address parameter is the zero address   |

## Deployment

### Testnet (Base Sepolia)

```bash
# Configure environment
cp packages/contracts/.env.example packages/contracts/.env
# Set DEPLOYER_PRIVATE_KEY and BASESCAN_API_KEY

# Deploy
pnpm --filter @vpp/contracts run deploy:sepolia
```

### Mainnet (Base)

```bash
pnpm --filter @vpp/contracts run deploy:mainnet
```

The deployment script (`scripts/deploy.ts`) automatically grants `ADMIN_ROLE` to the deployer and `MINTER_ROLE` to the backend wallet address.

## Verification

After deployment, verify the contract on BaseScan:

```bash
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS> <ADMIN_ADDRESS> <MINTER_ADDRESS>
```

## Gas Costs

| Operation                  | Estimated Gas | Approx. USD (Base L2) |
| -------------------------- | ------------- | --------------------- |
| Deploy                     | ~500,000      | ~$0.50                |
| `registerSurvey`           | ~80,000       | ~$0.005               |
| `awardPoints` (first)      | ~65,000       | ~$0.003               |
| `awardPoints` (subsequent) | ~45,000       | ~$0.002               |
| Read functions             | 0             | Free                  |
