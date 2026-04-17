/**
 * @module api-types
 *
 * Shared API types used by both the VPP backend and frontend.
 * Defines request/response payload shapes and common data structures.
 */

// ---------------------------------------------------------------------------
// Response envelopes
// ---------------------------------------------------------------------------

export interface ApiSuccess<T = unknown> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string
  message: string
  details?: Array<{ field: string; message: string }>
}

export interface PaginatedApiSuccess<T = unknown> {
  success: true
  data: T
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

/**
 * V2 claim request body. The plaintext `secret` field of the V1 schema
 * is replaced by `nonce` + `token`, both delivered through the SoSci
 * goodbye-page URL. `nonce` is a single-use 16-byte URL-safe base64
 * value; `token` is the HMAC-SHA256 over `v1|<surveyId>|<nonce>` keyed
 * by the per-survey secret stored on the backend.
 */
export interface ClaimRequest {
  walletAddress: string
  surveyId: number
  nonce: string
  token: string
  signature: string
  message: string
}

export interface ClaimResult {
  txHash: string
  points: number
  explorerUrl: string
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

export interface PointsResult {
  wallet: string
  totalPoints: number
  surveys: SurveyClaimEntry[]
}

export interface SurveyClaimEntry {
  surveyId: number
  points: number
  claimedAt: string
  txHash: string
}

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

export interface SurveyInfo {
  surveyId: number
  title: string
  points: number
  maxClaims: number
  claimCount: number
  active: boolean
  registeredAt: string
}

export interface SurveyRegisterResult {
  txHash: string
  explorerUrl: string
  templateDownloadUrl: string
  /**
   * V2-only: the HMAC key that backs the survey's claim flow. Returned
   * once on registration. Admin can re-fetch later via
   * GET /api/v1/surveys/:id/key (admin-authenticated).
   */
  key: string
  /** ISO-8601 timestamp the key was generated. */
  keyCreatedAt: string
}

// ---------------------------------------------------------------------------
// System status
// ---------------------------------------------------------------------------

export interface SystemStatus {
  minterAddress: string
  balance: string
  lowBalance: boolean
  gasPrice: string
  estimates: {
    claimsRemaining: number
    registrationsRemaining: number
    costPerClaim: string
    costPerRegistration: string
  }
  blockchain: {
    network: string
    blockNumber: number
    /** Address of the live SurveyPoints proxy (V2). */
    contractAddress: string
    /**
     * On-chain `version()` of the implementation behind the proxy
     * (e.g. "2.0.0"). "unknown" if the call reverts — useful as a fast
     * visual check that a freshly deployed front-end is talking to the
     * intended V2 contract rather than a stale legacy address.
     */
    contractVersion: string
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResult {
  status: string
  uptime: number
  blockchain: {
    connected: boolean
    network: string | null
    blockNumber: number | null
  }
  eventStore?: {
    ready: boolean
    lastSyncedBlock: number
  }
}
