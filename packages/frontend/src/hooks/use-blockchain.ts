/**
 * @module use-blockchain
 *
 * React hook for read-only smart contract queries from the frontend.
 * Uses ethers.js `JsonRpcProvider` (no wallet needed) to call view functions
 * directly against the public RPC.
 *
 * Event-based queries (claim history, admin roles) are served by the backend
 * API via the local event store — no direct event queries from the frontend.
 */
import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import { config } from '@/lib/config'
import { SURVEY_POINTS_ABI } from '@/lib/contract-abi'

function getContract() {
  if (!config.contractAddress) {
    throw new Error('Contract address not configured')
  }
  const provider = new ethers.JsonRpcProvider(config.rpcUrl)
  return new ethers.Contract(config.contractAddress, SURVEY_POINTS_ABI, provider)
}

export function useBlockchain() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getTotalPoints = useCallback(async (address: string): Promise<number> => {
    setLoading(true)
    setError(null)
    try {
      const contract = getContract()
      const points = await contract.totalPoints(address)
      return Number(points)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch points'
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const getSurveyPoints = useCallback(
    async (address: string, surveyId: number): Promise<number> => {
      const contract = getContract()
      const points = await contract.surveyPoints(address, surveyId)
      return Number(points)
    },
    [],
  )

  const hasClaimed = useCallback(async (address: string, surveyId: number): Promise<boolean> => {
    const contract = getContract()
    return contract.claimed(address, surveyId)
  }, [])

  const getSurveyInfo = useCallback(
    async (
      surveyId: number,
    ): Promise<{
      points: number
      maxClaims: number
      claimCount: number
      active: boolean
      registeredAt: Date
    }> => {
      const contract = getContract()
      const info = await contract.getSurveyInfo(surveyId)
      return {
        points: Number(info[1]),
        maxClaims: Number(info[2]),
        claimCount: Number(info[3]),
        active: info[4],
        registeredAt: new Date(Number(info[5]) * 1000),
      }
    },
    [],
  )

  const isWalletSubmitted = useCallback(async (address: string): Promise<boolean> => {
    const contract = getContract()
    return contract.isWalletSubmitted(address)
  }, [])

  return {
    loading,
    error,
    getTotalPoints,
    getSurveyPoints,
    hasClaimed,
    getSurveyInfo,
    isWalletSubmitted,
  }
}
