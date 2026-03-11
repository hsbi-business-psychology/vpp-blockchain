# API Reference

The VPP backend exposes a REST API on the configured port (default: `3000`). All endpoints are prefixed with `/api`.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Admin endpoints require an **EIP-191 wallet signature**. The request body must include:
- `adminSignature` — The signed message
- `adminMessage` — The plain-text message that was signed

The recovered signer address must hold `ADMIN_ROLE` on the smart contract (verified on-chain).

## Rate Limiting

All endpoints are rate-limited to prevent abuse:

| Scope | Window | Max Requests |
|---|---|---|
| General API | 60 s | 100 |
| Claim endpoint | 60 s | 5 |

Rate limit headers are included in every response:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Endpoints

### POST /api/claim

Claim survey participation points for a wallet.

**Request Body:**

```json
{
  "walletAddress": "0x1234...abcd",
  "surveyId": 42,
  "secret": "VPP-x8k2m9",
  "signature": "0xabcd...1234",
  "message": "claim:42:VPP-x8k2m9:1710000000"
}
```

| Field | Type | Description |
|---|---|---|
| `walletAddress` | `string` | Ethereum address of the claimant |
| `surveyId` | `number` | Positive integer identifying the survey |
| `secret` | `string` | Survey secret (received via redirect URL) |
| `signature` | `string` | EIP-191 signature over `message` |
| `message` | `string` | Format: `claim:{surveyId}:{secret}:{unixTimestamp}` |

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

| Status | Error Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 400 | `EXPIRED_MESSAGE` | Signed message is too old |
| 400 | `INVALID_SIGNATURE` | Signature does not match wallet address |
| 400 | `INVALID_TIMESTAMP` | Message timestamp is in the future |
| 404 | `SURVEY_NOT_FOUND` | Survey does not exist on-chain |
| 400 | `SURVEY_INACTIVE` | Survey has been deactivated |
| 409 | `ALREADY_CLAIMED` | Wallet has already claimed this survey |

---

### GET /api/points/:wallet

Get the total points and claim history for a wallet address.

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `wallet` | `string` | Ethereum address |

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

| Status | Error Code | When |
|---|---|---|
| 400 | `INVALID_ADDRESS` | Provided address is not a valid Ethereum address |

---

### POST /api/surveys

Register a new survey on-chain. **Admin authentication required.**

**Request Body:**

```json
{
  "surveyId": 42,
  "secret": "VPP-x8k2m9",
  "points": 2,
  "maxClaims": 100,
  "adminSignature": "0x...",
  "adminMessage": "register:42:1710000000"
}
```

| Field | Type | Description |
|---|---|---|
| `surveyId` | `number` | Unique positive integer for the survey |
| `secret` | `string` | Secret that participants need to claim |
| `points` | `number` | Points awarded per claim (1–255) |
| `maxClaims` | `number` | Maximum claims allowed (0 = unlimited) |
| `adminSignature` | `string` | EIP-191 signature from an admin wallet |
| `adminMessage` | `string` | Signed message for verification |

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "txHash": "0x...",
    "explorerUrl": "https://sepolia.basescan.org/tx/0x...",
    "templateDownloadUrl": "/api/surveys/42/template?secret=VPP-x8k2m9"
  }
}
```

**Error Responses:**

| Status | Error Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | `UNAUTHORIZED` | Missing admin signature |
| 403 | `FORBIDDEN` | Signer is not an authorized admin |
| 409 | `SURVEY_EXISTS` | Survey ID already registered |

---

### GET /api/surveys

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

### GET /api/surveys/:id/template

Download a SoSci Survey XML template for a specific survey.

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `id` | `number` | Survey ID |

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `secret` | `string` | Survey secret (required) |

**Success Response (200):**

Returns an XML file with `Content-Type: application/xml` and `Content-Disposition: attachment`.

**Error Responses:**

| Status | Error Code | When |
|---|---|---|
| 400 | `INVALID_SURVEY_ID` | ID is not a positive integer |
| 400 | `MISSING_SECRET` | Secret query parameter is missing |
| 404 | `SURVEY_NOT_FOUND` | Survey does not exist |

---

### GET /api/health

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
