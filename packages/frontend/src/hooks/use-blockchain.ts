/**
 * @module use-blockchain
 *
 * React hook for read-only smart contract queries from the frontend.
 * Uses ethers.js `JsonRpcProvider` (no wallet needed) to call view functions
 * directly against the public RPC. `VITE_RPC_URL` may list several URLs
 * separated by commas; a read moves on to the next one when an RPC fails or
 * stalls, and later reads start with the RPC that answered last.
 *
 * Provider and Contract instances are cached as module-level singletons
 * to avoid creating new TCP connections on every call.
 *
 * Each method returns a plain Promise — callers manage their own
 * loading / error state so multiple concurrent calls don't conflict.
 */
import { useCallback } from 'react'
import { ethers } from 'ethers'
import { config } from '@/lib/config'
import { SURVEY_POINTS_ABI } from '@/lib/contract-abi'

/** An RPC that cannot be reached makes ethers wait for network detection
 * indefinitely, so every attempt gets a deadline. */
const RPC_ATTEMPT_TIMEOUT_MS = 8_000

let cachedContracts: ethers.Contract[] | null = null
let preferredIndex = 0

function getContracts(): ethers.Contract[] {
  if (!config.contractAddress) {
    throw new Error('Contract address not configured')
  }
  if (!cachedContracts) {
    const urls = config.rpcUrl
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean)
    cachedContracts = urls.map((url) => {
      // batchMaxCount: 1 disables ethers' default JSON-RPC batching. Free-tier
      // providers like drpc.org reject batches of more than 3 requests, which
      // breaks any view that fires several reads in parallel (e.g. the points
      // overview). Sending one HTTP request per call is the only way to stay
      // compatible with all common public RPCs.
      const provider = new ethers.JsonRpcProvider(url, undefined, { batchMaxCount: 1 })
      return new ethers.Contract(config.contractAddress, SURVEY_POINTS_ABI, provider)
    })
  }
  return cachedContracts
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`RPC did not answer within ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Runs a read against the configured RPCs in turn. A contract revert is a
 * real answer and is returned to the caller instead of being retried. */
async function read<T>(call: (contract: ethers.Contract) => Promise<T>): Promise<T> {
  const contracts = getContracts()
  let lastError: unknown
  for (let attempt = 0; attempt < contracts.length; attempt++) {
    const index = (preferredIndex + attempt) % contracts.length
    try {
      const result = await withTimeout(call(contracts[index]), RPC_ATTEMPT_TIMEOUT_MS)
      preferredIndex = index
      return result
    } catch (err) {
      if (ethers.isError(err, 'CALL_EXCEPTION')) throw err
      lastError = err
    }
  }
  throw lastError
}

export function useBlockchain() {
  const getTotalPoints = useCallback(async (address: string): Promise<number> => {
    const points = await read((contract) => contract.totalPoints(address))
    return Number(points)
  }, [])

  const getSurveyPoints = useCallback(
    async (address: string, surveyId: number): Promise<number> => {
      const points = await read((contract) => contract.surveyPoints(address, surveyId))
      return Number(points)
    },
    [],
  )

  const hasClaimed = useCallback(async (address: string, surveyId: number): Promise<boolean> => {
    return read((contract) => contract.claimed(address, surveyId))
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
      const info = await read((contract) => contract.getSurveyInfo(surveyId))
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
    return read((contract) => contract.isWalletSubmitted(address))
  }, [])

  const isAdmin = useCallback(async (address: string): Promise<boolean> => {
    return read((contract) => contract.isAdmin(address))
  }, [])

  return {
    getTotalPoints,
    getSurveyPoints,
    hasClaimed,
    getSurveyInfo,
    isWalletSubmitted,
    isAdmin,
  }
}
