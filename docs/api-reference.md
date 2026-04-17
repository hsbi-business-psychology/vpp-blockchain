# API Reference

The VPP backend exposes a REST API on the configured port (default: `3000`). All endpoints are prefixed with `/api/v1`. Legacy calls to `/api/*` are redirected with HTTP 308.

> A machine-readable [OpenAPI 3.0 specification](openapi.yaml) is available for use with Swagger UI, Postman, or code generators.
>
> **V2 update (April 2026):** The claim and survey-registration flows no longer accept plaintext `secret` values. Claims are authenticated with per-participant HMAC tokens, and surveys have a per-survey HMAC key managed entirely by the backend. See [ADR 0004](adr/0004-hmac-claim-tokens-and-upgradeable-contract.md) for background.

## Base URL

```
http://localhost:3000/api/v1
```

## Authentication

Admin endpoints require an **EIP-191 wallet signature**. The credentials can be passed either in the request body or as HTTP headers:

- Body: `adminSignature` and `adminMessage`
- Headers: `X-Admin-Signature` and `X-Admin-Message`

The recovered signer address must hold `ADMIN_ROLE` on the smart contract (verified on-chain).

## Rate Limiting

All endpoints are rate-limited to prevent abuse:

| Scope          | Window | Max Requests |
| -------------- | ------ | ------------ |
| General API    | 60 s   | 100          |
| Claim endpoint | 60 s   | 5            |

Rate limit headers are included in every response:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Endpoints

### POST /api/v1/claim

Claim survey participation points for a wallet, using an HMAC token minted by the survey server.

**Request Body:**

```json
{
  "walletAddress": "0x1234...abcd",
  "surveyId": 42,
  "nonce": "Ik3pj8sN-Vf9aD2EXAMPLE",
  "token": "R4Bc...HMAC_SHA256_BASE64URL",
  "signature": "0xabcd...1234",
  "message": "claim:42:Ik3pj8sN-Vf9aD2EXAMPLE:1710000000"
}
```

| Field           | Type     | Description                                                            |
| --------------- | -------- | ---------------------------------------------------------------------- | ---------- | -------------------------------- |
| `walletAddress` | `string` | Ethereum address of the claimant                                       |
| `surveyId`      | `number` | Positive integer identifying the survey                                |
| `nonce`         | `string` | Single-use base64url nonce minted by the survey server (URL param `n`) |
| `token`         | `string` | base64url HMAC-SHA256 of `v1                                           | <surveyId> | <nonce>`(URL param`t`, 43 chars) |
| `signature`     | `string` | EIP-191 signature over `message`                                       |
| `message`       | `string` | Format: `claim:<surveyId>:<nonce>:<unixSeconds>` (≤ 5 minutes old)     |

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "txHash": "0x...",
    "points": 2,
    "explorerUrl": "https://basescan.org/tx/0x..."
  }
}
```

**Error Responses:**

| Status | Error Code             | When                                                                |
| ------ | ---------------------- | ------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`     | Invalid request body                                                |
| 400    | `INVALID_MESSAGE`      | Signed message is malformed                                         |
| 400    | `EXPIRED_MESSAGE`      | Signed message is too old (> 5 min)                                 |
| 400    | `INVALID_TIMESTAMP`    | Message timestamp is in the future                                  |
| 400    | `INVALID_SIGNATURE`    | Signature does not match wallet address                             |
| 400    | `INVALID_NONCE_FORMAT` | `nonce` is not a valid base64url string of acceptable length        |
| 400    | `INVALID_TOKEN_FORMAT` | `token` is not a valid base64url string of the expected length      |
| 400    | `INVALID_TOKEN`        | HMAC verification failed (tampered or wrong key / survey)           |
| 404    | `SURVEY_NOT_FOUND`     | Survey does not exist on-chain                                      |
| 409    | `ALREADY_CLAIMED`      | Wallet has already claimed this survey                              |
| 409    | `NONCE_USED`           | The `nonce` has already been redeemed — links are single-use        |
| 410    | `SURVEY_INACTIVE`      | Survey has been deactivated                                         |
| 500    | `CONFIG_ERROR`         | Server is missing an HMAC key for the registered survey (ops issue) |

> Replay protection is fail-closed: the nonce is marked consumed **before** the on-chain transaction is broadcast. If the transaction later fails, the participant must reopen the survey end page to get a fresh nonce.

---

### GET /api/v1/points/:wallet

Get the total points and claim history for a wallet address.

**Path Parameters:**

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `wallet`  | `string` | Ethereum address |

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "wallet": "0x1234...abcd",
    "totalPoints": 7,
    "surveys": [
      {
        "surveyId": 42,
        "points": 2,
        "claimedAt": "2026-03-10T14:30:00.000Z",
        "txHash": "0x..."
      },
      {
        "surveyId": 43,
        "points": 3,
        "claimedAt": "2026-03-11T09:15:00.000Z",
        "txHash": "0x..."
      }
    ]
  }
}
```

**Error Responses:**

| Status | Error Code        | When                                             |
| ------ | ----------------- | ------------------------------------------------ |
| 400    | `INVALID_ADDRESS` | Provided address is not a valid Ethereum address |

---

### POST /api/v1/surveys

Register a new survey on-chain and provision an HMAC key for it. **Admin authentication required.**

**Request Body:**

```json
{
  "surveyId": 42,
  "points": 2,
  "maxClaims": 100,
  "title": "Cognitive Load Study",
  "adminSignature": "0x...",
  "adminMessage": "register:42:1710000000"
}
```

| Field            | Type     | Description                            |
| ---------------- | -------- | -------------------------------------- |
| `surveyId`       | `number` | Unique positive integer for the survey |
| `points`         | `number` | Points awarded per claim (1–255)       |
| `maxClaims`      | `number` | Maximum claims allowed (0 = unlimited) |
| `title`          | `string` | Human-readable survey title (optional) |
| `adminSignature` | `string` | EIP-191 signature from an admin wallet |
| `adminMessage`   | `string` | Signed message for verification        |

> The HMAC key is generated server-side; it is **not** part of the request.

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "txHash": "0x...",
    "explorerUrl": "https://basescan.org/tx/0x...",
    "templateDownloadUrl": "/api/v1/surveys/42/template",
    "key": "<base64url HMAC key, 43 chars>",
    "keyCreatedAt": "2026-04-10T14:30:00.000Z"
  }
}
```

> **The `key` is returned exactly once.** Copy it into a password manager. It can be retrieved again via `GET /api/v1/surveys/:id/key`, or rolled via `POST /api/v1/surveys/:id/key/rotate`.

**Error Responses:**

| Status | Error Code         | When                                                                  |
| ------ | ------------------ | --------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR` | Invalid request body                                                  |
| 401    | `UNAUTHORIZED`     | Missing admin signature                                               |
| 403    | `FORBIDDEN`        | Signer is not an authorized admin                                     |
| 409    | `SURVEY_EXISTS`    | Survey ID already registered                                          |
| 409    | `KEY_EXISTS`       | A leftover key from a previous failed registration exists — rotate it |

---

### GET /api/v1/surveys

List all registered surveys with their current status.

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "surveys": [
      {
        "surveyId": 42,
        "points": 2,
        "maxClaims": 100,
        "claimCount": 37,
        "active": true,
        "registeredAt": "2026-03-01T10:00:00.000Z"
      }
    ]
  }
}
```

---

### POST /api/v1/surveys/:id/deactivate

Stop accepting claims for a survey. **Admin authentication required.**

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "txHash": "0x...",
    "explorerUrl": "https://basescan.org/tx/0x..."
  }
}
```

| Status | Error Code         | When                          |
| ------ | ------------------ | ----------------------------- |
| 404    | `SURVEY_NOT_FOUND` | Survey does not exist         |
| 409    | `ALREADY_INACTIVE` | Survey is already deactivated |

---

### POST /api/v1/surveys/:id/reactivate

Re-enable a previously deactivated survey. **Admin authentication required.** Response format matches `deactivate`.

| Status | Error Code              | When                                               |
| ------ | ----------------------- | -------------------------------------------------- |
| 404    | `SURVEY_NOT_FOUND`      | Survey does not exist                              |
| 409    | `SURVEY_ALREADY_ACTIVE` | Survey is already active (no-op rejected on-chain) |

---

### POST /api/v1/surveys/:id/revoke

Revoke a previously awarded claim (e.g. fraud cleanup). Removes the wallet's points for this survey on-chain. **Admin authentication required.**

**Request Body:**

```json
{
  "student": "0xabcd...1234",
  "adminSignature": "0x...",
  "adminMessage": "revoke:42:1710000000"
}
```

**Success Response (200):** same shape as `deactivate`.

| Status | Error Code         | When                                             |
| ------ | ------------------ | ------------------------------------------------ |
| 400    | `INVALID_ADDRESS`  | `student` is not a valid Ethereum address        |
| 404    | `SURVEY_NOT_FOUND` | Survey does not exist                            |
| 409    | `NOT_CLAIMED`      | The specified wallet has not claimed this survey |

---

### POST /api/v1/surveys/:id/template

Download a SoSci Survey or LimeSurvey XML template for a specific survey. **Admin authentication required.**

**Path Parameters:**

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `id`      | `number` | Survey ID   |

**Request Body:**

| Field    | Type     | Description                       |
| -------- | -------- | --------------------------------- |
| `format` | `string` | `sosci` (default) or `limesurvey` |

The HMAC key is embedded into the downloaded template server-side — it is **not** requested in the body.

**Success Response (200):**

Returns an XML file with `Content-Type: application/xml` and `Content-Disposition: attachment`.

**Error Responses:**

| Status | Error Code          | When                                                             |
| ------ | ------------------- | ---------------------------------------------------------------- |
| 400    | `INVALID_SURVEY_ID` | ID is not a positive integer                                     |
| 400    | `VALIDATION_ERROR`  | Missing or invalid request body                                  |
| 404    | `SURVEY_NOT_FOUND`  | Survey does not exist                                            |
| 404    | `KEY_NOT_FOUND`     | Server has no HMAC key for this survey — use `/key/rotate` first |

---

### GET /api/v1/surveys/:id/key

Retrieve the current HMAC key for a registered survey. **Admin authentication required.** Use this if you lost the key from the registration response.

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "surveyId": 42,
    "key": "<base64url HMAC key>",
    "createdAt": "2026-04-10T14:30:00.000Z"
  }
}
```

| Status | Error Code      | When                                |
| ------ | --------------- | ----------------------------------- |
| 404    | `KEY_NOT_FOUND` | No HMAC key on file for this survey |

---

### POST /api/v1/surveys/:id/key/rotate

Generate a fresh HMAC key for a registered survey, invalidating the previous one. **Admin authentication required.**

> Rotating a key invalidates **every already-distributed claim link**. Do this only after a data-collection window has closed, or in immediate response to a leak.

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "surveyId": 42,
    "key": "<new base64url HMAC key>",
    "createdAt": "2026-04-11T09:00:00.000Z"
  }
}
```

| Status | Error Code         | When                                                   |
| ------ | ------------------ | ------------------------------------------------------ |
| 404    | `SURVEY_NOT_FOUND` | Survey does not exist (cannot rotate for unregistered) |

---

### GET /api/v1/health

Health check endpoint. Returns the server status and blockchain connectivity.

**Success Response (200):**

```json
{
  "status": "ok",
  "uptime": 3600,
  "blockchain": {
    "connected": true,
    "network": "base-sepolia",
    "blockNumber": 12345678
  }
}
```

**Degraded Response (503):**

```json
{
  "status": "degraded",
  "uptime": 3600,
  "blockchain": {
    "connected": false,
    "network": null,
    "blockNumber": null
  }
}
```

---

### GET /api/v1/wallets/:address/submitted

Check whether a wallet has been marked as "submitted" for thesis admission.

**Parameters:**

| Name      | In   | Type   | Description    |
| --------- | ---- | ------ | -------------- |
| `address` | path | string | Wallet address |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "submitted": false,
    "totalPoints": 8
  }
}
```

---

### POST /api/v1/wallets/:address/mark-submitted

Mark a wallet as submitted for thesis admission.

**Authentication:** Admin wallet signature (via `x-admin-signature` and `x-admin-message` headers).

**Response (200):**

```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "txHash": "0x...",
    "explorerUrl": "https://basescan.org/tx/0x..."
  }
}
```

---

### POST /api/v1/wallets/:address/unmark-submitted

Remove the submission mark from a wallet (e.g. to correct a mistake).

**Authentication:** Admin wallet signature (via `x-admin-signature` and `x-admin-message` headers).

**Response format:** Same as `mark-submitted`.

---

## Error Format

All error responses follow a consistent format:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error description"
}
```

## CORS

The backend allows cross-origin requests from the configured `FRONTEND_URL` with methods `GET` and `POST`.
