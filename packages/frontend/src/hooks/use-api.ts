/**
 * @module use-api
 *
 * React hook providing typed wrappers around the VPP Backend REST API.
 * All functions use `apiFetch` which automatically prepends the API base URL,
 * sets JSON headers, and throws on non-success responses.
 *
 * Exposed methods map 1:1 to backend routes:
 *   - claimPoints       → POST /api/claim
 *   - getSurveys        → GET  /api/surveys
 *   - registerSurvey    → POST /api/surveys
 *   - downloadTemplate  → POST /api/surveys/:id/template
 *   - deactivateSurvey  → POST /api/surveys/:id/deactivate
 *   - addAdmin          → POST /api/admin/add
 *   - removeAdmin       → POST /api/admin/remove
 *   - getSystemStatus   → GET  /api/status
 *   - wallet submission → GET/POST /api/wallets/:address/*
 */
import { useCallback } from 'react'
import { config } from '@/lib/config'
import type {
  ClaimResult,
  SurveyInfo,
  SurveyRegisterResult,
  PointsResult,
  SystemStatus,
} from '@vpp/shared'

interface AdminListData {
  admins: string[]
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${config.apiUrl}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  const json = await res.json()

  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || `API error: ${res.status}`)
  }

  return json.data as T
}

export function useApi() {
  const claimPoints = useCallback(
    async (params: {
      walletAddress: string
      surveyId: number
      secret: string
      signature: string
      message: string
    }): Promise<ClaimResult> => {
      return apiFetch<ClaimResult>('/api/v1/claim', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },
    [],
  )

  const getSurveys = useCallback(
    async (signature: string, message: string): Promise<SurveyInfo[]> => {
      return apiFetch<SurveyInfo[]>('/api/v1/surveys', {
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-message': message,
        },
      })
    },
    [],
  )

  const registerSurvey = useCallback(
    async (params: {
      surveyId: number
      secret: string
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

  const downloadTemplate = useCallback(
    async (
      surveyId: number,
      secret: string,
      format: 'sosci' | 'limesurvey' = 'sosci',
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
        body: JSON.stringify({ secret, format }),
      })
      if (!res.ok) throw new Error('Failed to download template')
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

  const getAdmins = useCallback(async (signature: string, message: string): Promise<string[]> => {
    const data = await apiFetch<AdminListData>('/api/v1/admin', {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-signature': signature,
        'x-admin-message': message,
      },
    })
    return data.admins
  }, [])

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
    downloadTemplate,
    deactivateSurvey,
    getWalletSubmissionStatus,
    markWalletSubmitted,
    unmarkWalletSubmitted,
    getSystemStatus,
    getAdmins,
    getPointsData,
    addAdmin,
    removeAdmin,
  }
}
