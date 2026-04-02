/**
 * @module types
 *
 * Re-exports shared API types from @vpp/shared and defines
 * backend-only types that are not needed by the frontend.
 */

export type {
  ApiSuccess,
  ApiError,
  PaginatedApiSuccess,
  ApiResponse,
  ClaimRequest,
  ClaimResult,
  PointsResult,
  SurveyClaimEntry,
  SurveyInfo,
  SurveyRegisterResult,
  SystemStatus,
  HealthResult,
} from '@vpp/shared'

// ---------------------------------------------------------------------------
// Backend-only types
// ---------------------------------------------------------------------------

export interface SurveyRegisterRequest {
  surveyId: number
  secret: string
  points: number
  maxClaims?: number
  title?: string
  adminSignature: string
  adminMessage: string
}
