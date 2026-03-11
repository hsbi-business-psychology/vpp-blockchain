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

interface PointsResult {
  wallet: string
  totalPoints: number
  surveys: Array<{
    surveyId: number
    points: number
    claimedAt: string
    txHash: string
  }>
}

interface HealthResult {
  status: string
  uptime: number
  blockchain: {
    connected: boolean
    network: string | null
    blockNumber: number | null
  }
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

  const getPoints = useCallback(async (wallet: string): Promise<PointsResult> => {
    return apiFetch<PointsResult>(`/api/points/${wallet}`)
  }, [])

  const getSurveys = useCallback(async (signature: string, message: string): Promise<SurveyInfo[]> => {
    return apiFetch<SurveyInfo[]>('/api/surveys', {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-signature': signature,
        'x-admin-message': message,
      },
    })
  }, [])

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

  const downloadTemplate = useCallback(async (surveyId: number, secret: string): Promise<Blob> => {
    const url = `${config.apiUrl}/api/surveys/${surveyId}/template?secret=${encodeURIComponent(secret)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to download template')
    return res.blob()
  }, [])

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
    async (address: string): Promise<{ address: string; submitted: boolean; totalPoints: number }> => {
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

  const getHealth = useCallback(async (): Promise<HealthResult> => {
    return apiFetch<HealthResult>('/api/health')
  }, [])

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

  return {
    claimPoints,
    getPoints,
    getSurveys,
    registerSurvey,
    downloadTemplate,
    deactivateSurvey,
    getWalletSubmissionStatus,
    markWalletSubmitted,
    unmarkWalletSubmitted,
    getHealth,
    getSystemStatus,
  }
}
