/**
 * @module use-blockchain
 *
 * React hook for read-only smart contract queries from the frontend.
 * Uses ethers.js `JsonRpcProvider` (no wallet needed) to call view functions
 * and query event logs directly against the public RPC.
 *
 * Used on the student points page to display total points, claim history,
 * and wallet submission status without going through the backend.
 */
import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import { config } from '@/lib/config'
import { SURVEY_POINTS_ABI } from '@/lib/contract-abi'

interface SurveyClaimEntry {
  surveyId: number
  points: number
  txHash: string
  blockNumber: number
}

const CHUNK_SIZE = 9_000

function getContract() {
  if (!config.contractAddress) {
    throw new Error('Contract address not configured')
  }
  const provider = new ethers.JsonRpcProvider(config.rpcUrl)
  return new ethers.Contract(config.contractAddress, SURVEY_POINTS_ABI, provider)
}

/**
 * Queries event logs in chunks to avoid free-tier RPC block-range limits
 * (most providers cap at 10,000 blocks per request).
 */
export async function queryFilterChunked(
  contract: ethers.Contract,
  filter: ethers.ContractEventName,
  fromBlock: number,
): Promise<(ethers.EventLog | ethers.Log)[]> {
  const latestBlock = await contract.runner!.provider!.getBlockNumber()
  if (latestBlock - fromBlock <= CHUNK_SIZE) {
    return contract.queryFilter(filter, fromBlock, latestBlock)
  }

  const results: (ethers.EventLog | ethers.Log)[] = []
  for (let start = fromBlock; start <= latestBlock; start += CHUNK_SIZE + 1) {
    const end = Math.min(start + CHUNK_SIZE, latestBlock)
    const chunk = await contract.queryFilter(filter, start, end)
    results.push(...chunk)
  }
  return results
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

  const getClaimHistory = useCallback(async (address: string): Promise<SurveyClaimEntry[]> => {
    setLoading(true)
    setError(null)
    try {
      const contract = getContract()
      const fromBlock = config.contractDeployBlock || 0
      const filter = contract.filters.PointsAwarded(address)
      const events = await queryFilterChunked(contract, filter, fromBlock)
      return events.map((event) => {
        const log = event as ethers.EventLog
        return {
          surveyId: Number(log.args[1]),
          points: Number(log.args[2]),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch history'
      setError(message)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

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
    getClaimHistory,
    isWalletSubmitted,
  }
}
