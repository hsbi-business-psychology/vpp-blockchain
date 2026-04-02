/**
 * @module use-blockchain
 *
 * React hook for read-only smart contract queries from the frontend.
 * Uses ethers.js `JsonRpcProvider` (no wallet needed) to call view functions
 * directly against the public RPC.
 *
 * Each method returns a plain Promise — callers manage their own
 * loading / error state so multiple concurrent calls don't conflict.
 */
import { useCallback } from 'react'
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
  const getTotalPoints = useCallback(async (address: string): Promise<number> => {
    const contract = getContract()
    const points = await contract.totalPoints(address)
    return Number(points)
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
    getTotalPoints,
    getSurveyPoints,
    hasClaimed,
    getSurveyInfo,
    isWalletSubmitted,
  }
}
