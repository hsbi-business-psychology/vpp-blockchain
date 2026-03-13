import { useCallback } from 'react'
import { config } from '@/lib/config'

interface ClaimResult {
  txHash: string
  points: number
  explorerUrl: string
}

interface SurveyInfo {
  surveyId: number
  title: string
  points: number
  maxClaims: number
  claimCount: number
  active: boolean
  registeredAt: string
}

interface SurveyRegisterResult {
  txHash: string
  explorerUrl: string
  templateDownloadUrl: string
}

interface SystemStatus {
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
      return apiFetch<ClaimResult>('/api/claim', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },
    [],
  )

  const getSurveys = useCallback(
    async (signature: string, message: string): Promise<SurveyInfo[]> => {
      return apiFetch<SurveyInfo[]>('/api/surveys', {
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
      return apiFetch<SurveyRegisterResult>('/api/surveys', {
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
    ): Promise<Blob> => {
      const url = `${config.apiUrl}/api/surveys/${surveyId}/template?secret=${encodeURIComponent(
        secret,
      )}&format=${format}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to download template')
      return res.blob()
    },
    [],
  )

  const deactivateSurvey = useCallback(
    async (surveyId: number, signature: string, message: string): Promise<{ txHash: string }> => {
      return apiFetch<{ txHash: string }>(`/api/surveys/${surveyId}/deactivate`, {
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
        `/api/wallets/${address}/submitted`,
      )
    },
    [],
  )

  const markWalletSubmitted = useCallback(
    async (address: string, signature: string, message: string): Promise<{ txHash: string }> => {
      return apiFetch<{ txHash: string }>(`/api/wallets/${address}/mark-submitted`, {
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
      return apiFetch<{ txHash: string }>(`/api/wallets/${address}/unmark-submitted`, {
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
      return apiFetch<SystemStatus>('/api/status', {
        headers: {
          'Content-Type': 'application/json',
          'x-admin-signature': signature,
          'x-admin-message': message,
        },
      })
    },
    [],
  )

  const addAdmin = useCallback(
    async (
      address: string,
      adminSignature: string,
      adminMessage: string,
    ): Promise<{ txHash: string; explorerUrl: string }> => {
      return apiFetch<{ txHash: string; explorerUrl: string }>('/api/admin/add', {
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
      return apiFetch<{ txHash: string; explorerUrl: string }>('/api/admin/remove', {
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
    addAdmin,
    removeAdmin,
  }
}
