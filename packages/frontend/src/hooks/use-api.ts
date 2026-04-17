/**
 * @module use-api
 *
 * React hook providing typed wrappers around the VPP Backend REST API
 * (V2 contract surface, HMAC claim flow).
 *
 * Exposed methods map 1:1 to backend routes:
 *   - claimPoints       → POST /api/v1/claim                  (HMAC nonce + token)
 *   - getSurveys        → GET  /api/v1/surveys
 *   - registerSurvey    → POST /api/v1/surveys                (server mints HMAC key)
 *   - getSurveyKey      → GET  /api/v1/surveys/:id/key        (admin, never logged)
 *   - rotateSurveyKey   → POST /api/v1/surveys/:id/key/rotate (admin)
 *   - downloadTemplate  → POST /api/v1/surveys/:id/template
 *   - deactivateSurvey  → POST /api/v1/surveys/:id/deactivate
 *   - reactivateSurvey  → POST /api/v1/surveys/:id/reactivate
 *   - revokePoints      → POST /api/v1/surveys/:id/revoke
 *   - addAdmin          → POST /api/v1/admin/add
 *   - removeAdmin       → POST /api/v1/admin/remove
 *   - getSystemStatus   → GET  /api/v1/status
 *   - wallet submission → GET/POST /api/v1/wallets/:address/*
 */
import { useCallback } from 'react'
import { config } from '@/lib/config'
import type {
  ClaimRequest,
  ClaimResult,
  SurveyInfo,
  SurveyRegisterResult,
  PointsResult,
  SystemStatus,
} from '@vpp/shared'
import { ApiRequestError } from '@vpp/shared'

export interface AdminEntry {
  address: string
  label: string | null
  isMinter: boolean
}

interface AdminListData {
  admins: AdminEntry[]
}

interface AdminLabelResult {
  address: string
  label: string | null
}

export interface SurveyKeyInfo {
  surveyId: number
  key: string
  keyCreatedAt: string
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${config.apiUrl}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  const json = await res.json()

  if (!res.ok || !json.success) {
    throw new ApiRequestError(
      json.error || 'UNKNOWN_ERROR',
      json.message || `API error: ${res.status}`,
      res.status,
      json.details,
    )
  }

  return json.data as T
}

export function useApi() {
  const claimPoints = useCallback(async (params: ClaimRequest): Promise<ClaimResult> => {
    return apiFetch<ClaimResult>('/api/v1/claim', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }, [])

  const getSurveys = useCallback(async (): Promise<SurveyInfo[]> => {
    return apiFetch<SurveyInfo[]>('/api/v1/surveys')
  }, [])

  const registerSurvey = useCallback(
    async (params: {
      surveyId: number
      points: number
      maxClaims?: number
      title?: string
      adminSignature: string
      adminMessage: string
    }): Promise<SurveyRegisterResult> => {
      return apiFetch<SurveyRegisterResult>('/api/v1/surveys', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },
    [],
  )

  const getSurveyKey = useCallback(
    async (
      surveyId: number,
      adminSignature: string,
      adminMessage: string,
    ): Promise<SurveyKeyInfo> => {
      return apiFetch<SurveyKeyInfo>(`/api/v1/surveys/${surveyId}/key`, {
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': adminSignature,
          'x-admin-message': adminMessage,
        },
      })
    },
    [],
  )

  const rotateSurveyKey = useCallback(
    async (
      surveyId: number,
      adminSignature: string,
      adminMessage: string,
    ): Promise<SurveyKeyInfo> => {
      return apiFetch<SurveyKeyInfo>(`/api/v1/surveys/${surveyId}/key/rotate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': adminSignature,
          'x-admin-message': adminMessage,
        },
      })
    },
    [],
  )

  const downloadTemplate = useCallback(
    async (
      surveyId: number,
      format: 'sosci' | 'limesurvey',
      adminSignature: string,
      adminMessage: string,
    ): Promise<Blob> => {
      const url = `${config.apiUrl}/api/v1/surveys/${surveyId}/template`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': adminSignature,
          'x-admin-message': adminMessage,
        },
        body: JSON.stringify({ format }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new ApiRequestError(
          json.error || 'DOWNLOAD_FAILED',
          json.message || `Failed to download template (HTTP ${res.status})`,
          res.status,
          json.details,
        )
      }
      return res.blob()
    },
    [],
  )

  const deactivateSurvey = useCallback(
    async (surveyId: number, signature: string, message: string): Promise<{ txHash: string }> => {
      return apiFetch<{ txHash: string }>(`/api/v1/surveys/${surveyId}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-message': message,
        },
      })
    },
    [],
  )

  const reactivateSurvey = useCallback(
    async (surveyId: number, signature: string, message: string): Promise<{ txHash: string }> => {
      return apiFetch<{ txHash: string }>(`/api/v1/surveys/${surveyId}/reactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-message': message,
        },
      })
    },
    [],
  )

  const revokePoints = useCallback(
    async (
      surveyId: number,
      walletAddress: string,
      signature: string,
      message: string,
    ): Promise<{ txHash: string }> => {
      return apiFetch<{ txHash: string }>(`/api/v1/surveys/${surveyId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-message': message,
        },
        body: JSON.stringify({ walletAddress }),
      })
    },
    [],
  )

  const getWalletSubmissionStatus = useCallback(
    async (
      address: string,
    ): Promise<{ address: string; submitted: boolean; totalPoints: number }> => {
      return apiFetch<{ address: string; submitted: boolean; totalPoints: number }>(
        `/api/v1/wallets/${address}/submitted`,
      )
    },
    [],
  )

  const markWalletSubmitted = useCallback(
    async (address: string, signature: string, message: string): Promise<{ txHash: string }> => {
      return apiFetch<{ txHash: string }>(`/api/v1/wallets/${address}/mark-submitted`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-message': message,
        },
      })
    },
    [],
  )

  const unmarkWalletSubmitted = useCallback(
    async (address: string, signature: string, message: string): Promise<{ txHash: string }> => {
      return apiFetch<{ txHash: string }>(`/api/v1/wallets/${address}/unmark-submitted`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-message': message,
        },
      })
    },
    [],
  )

  const getSystemStatus = useCallback(
    async (signature: string, message: string): Promise<SystemStatus> => {
      return apiFetch<SystemStatus>('/api/v1/status', {
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-message': message,
        },
      })
    },
    [],
  )

  const getAdmins = useCallback(
    async (signature: string, message: string): Promise<AdminEntry[]> => {
      const data = await apiFetch<AdminListData>('/api/v1/admin', {
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-message': message,
        },
      })
      return data.admins
    },
    [],
  )

  const setAdminLabel = useCallback(
    async (
      address: string,
      label: string,
      adminSignature: string,
      adminMessage: string,
    ): Promise<AdminLabelResult> => {
      return apiFetch<AdminLabelResult>('/api/v1/admin/label', {
        method: 'PUT',
        body: JSON.stringify({ address, label, adminSignature, adminMessage }),
      })
    },
    [],
  )

  const getPointsData = useCallback(async (address: string): Promise<PointsResult> => {
    return apiFetch<PointsResult>(`/api/v1/points/${address}`)
  }, [])

  const addAdmin = useCallback(
    async (
      address: string,
      adminSignature: string,
      adminMessage: string,
    ): Promise<{ txHash: string; explorerUrl: string }> => {
      return apiFetch<{ txHash: string; explorerUrl: string }>('/api/v1/admin/add', {
        method: 'POST',
        body: JSON.stringify({ address, adminSignature, adminMessage }),
      })
    },
    [],
  )

  const removeAdmin = useCallback(
    async (
      address: string,
      adminSignature: string,
      adminMessage: string,
    ): Promise<{ txHash: string; explorerUrl: string }> => {
      return apiFetch<{ txHash: string; explorerUrl: string }>('/api/v1/admin/remove', {
        method: 'POST',
        body: JSON.stringify({ address, adminSignature, adminMessage }),
      })
    },
    [],
  )

  return {
    claimPoints,
    getSurveys,
    registerSurvey,
    getSurveyKey,
    rotateSurveyKey,
    downloadTemplate,
    deactivateSurvey,
    reactivateSurvey,
    revokePoints,
    getWalletSubmissionStatus,
    markWalletSubmitted,
    unmarkWalletSubmitted,
    getSystemStatus,
    getAdmins,
    getPointsData,
    addAdmin,
    removeAdmin,
    setAdminLabel,
  }
}
