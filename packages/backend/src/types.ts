export interface ClaimRequest {
  walletAddress: string
  surveyId: number
  secret: string
  signature: string
  message: string
}

export interface SurveyRegisterRequest {
  surveyId: number
  secret: string
  points: number
  maxClaims: number
  adminSignature: string
  adminMessage: string
}

export interface ApiSuccess<T = unknown> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string
  message: string
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

export interface ClaimResult {
  txHash: string
  points: number
  explorerUrl: string
}

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

export interface SurveyInfo {
  surveyId: number
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

export interface HealthResult {
  status: string
  uptime: number
  blockchain: {
    connected: boolean
    network: string | null
    blockNumber: number | null
  }
}
