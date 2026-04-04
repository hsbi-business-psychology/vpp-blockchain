# API Reference

The VPP backend exposes a REST API on the configured port (default: `3000`). All endpoints are prefixed with `/api/v1`. Legacy calls to `/api/*` are redirected with HTTP 308.

> A machine-readable [OpenAPI 3.0 specification](openapi.yaml) is available for use with Swagger UI, Postman, or code generators.

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

Claim survey participation points for a wallet.

**Request Body:**

```json
{
  "walletAddress": "0x1234...abcd",
  "surveyId": 42,
  "secret": "VPP-x8k2m9",
  "signature": "0xabcd...1234",
  "message": "Claim:42:0x1234...abcd:1710000000"
}
```

| Field           | Type     | Description                                                |
| --------------- | -------- | ---------------------------------------------------------- |
| `walletAddress` | `string` | Ethereum address of the claimant                           |
| `surveyId`      | `number` | Positive integer identifying the survey                    |
| `secret`        | `string` | Survey secret (received via redirect URL)                  |
| `signature`     | `string` | EIP-191 signature over `message`                           |
| `message`       | `string` | Format: `Claim:{surveyId}:{walletAddress}:{unixTimestamp}` |

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "txHash": "0x...",
    "points": 2,
    "explorerUrl": "https://sepolia.basescan.org/tx/0x..."
  }
}
```

**Error Responses:**

| Status | Error Code          | When                                    |
| ------ | ------------------- | --------------------------------------- |
| 400    | `VALIDATION_ERROR`  | Invalid request body                    |
| 400    | `EXPIRED_MESSAGE`   | Signed message is too old               |
| 400    | `INVALID_SIGNATURE` | Signature does not match wallet address |
| 400    | `INVALID_TIMESTAMP` | Message timestamp is in the future      |
| 404    | `SURVEY_NOT_FOUND`  | Survey does not exist on-chain          |
| 400    | `SURVEY_INACTIVE`   | Survey has been deactivated             |
| 409    | `ALREADY_CLAIMED`   | Wallet has already claimed this survey  |

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

Register a new survey on-chain. **Admin authentication required.**

**Request Body:**

```json
{
  "surveyId": 42,
  "secret": "VPP-x8k2m9",
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
| `secret`         | `string` | Secret that participants need to claim |
| `points`         | `number` | Points awarded per claim (1–255)       |
| `maxClaims`      | `number` | Maximum claims allowed (0 = unlimited) |
| `title`          | `string` | Human-readable survey title (optional) |
| `adminSignature` | `string` | EIP-191 signature from an admin wallet |
| `adminMessage`   | `string` | Signed message for verification        |

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "txHash": "0x...",
    "explorerUrl": "https://sepolia.basescan.org/tx/0x...",
    "templateDownloadUrl": "/api/v1/surveys/42/template"
  }
}
```

**Error Responses:**

| Status | Error Code         | When                              |
| ------ | ------------------ | --------------------------------- |
| 400    | `VALIDATION_ERROR` | Invalid request body              |
| 401    | `UNAUTHORIZED`     | Missing admin signature           |
| 403    | `FORBIDDEN`        | Signer is not an authorized admin |
| 409    | `SURVEY_EXISTS`    | Survey ID already registered      |

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

### POST /api/v1/surveys/:id/template

Download a SoSci Survey or LimeSurvey XML template for a specific survey. **Admin authentication required.**

**Path Parameters:**

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `id`      | `number` | Survey ID   |

**Request Body:**

| Field    | Type     | Description                       |
| -------- | -------- | --------------------------------- |
| `secret` | `string` | Survey secret (required)          |
| `format` | `string` | `sosci` (default) or `limesurvey` |

**Success Response (200):**

Returns an XML file with `Content-Type: application/xml` and `Content-Disposition: attachment`.

**Error Responses:**

| Status | Error Code          | When                            |
| ------ | ------------------- | ------------------------------- |
| 400    | `INVALID_SURVEY_ID` | ID is not a positive integer    |
| 400    | `VALIDATION_ERROR`  | Missing or invalid request body |
| 404    | `SURVEY_NOT_FOUND`  | Survey does not exist           |

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
