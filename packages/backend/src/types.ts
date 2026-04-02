/**
 * @module types
 *
 * Shared TypeScript interfaces for the VPP Backend.
 * These types define the shape of API request/response payloads and
 * internal data structures passed between routes and services.
 */

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
  maxClaims?: number
  title?: string
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

export interface HealthResult {
  status: string
  uptime: number
  blockchain: {
    connected: boolean
    network: string | null
    blockNumber: number | null
  }
}
