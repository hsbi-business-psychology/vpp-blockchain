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

export interface ClaimRequest {
  walletAddress: string
  surveyId: number
  secret: string
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
