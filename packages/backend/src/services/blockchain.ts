/**
 * @module blockchain
 *
 * Thin wrapper around the SurveyPoints smart contract.
 *
 * Two contract instances are maintained:
 *   - `contract`         – connected to the Minter wallet, used for state-changing
 *                          transactions (awardPoints, registerSurvey, role management).
 *   - `readOnlyContract` – connected to a plain provider, used for gas-free reads
 *                          and event queries.
 *
 * Every write function waits for the transaction receipt before returning,
 * so callers can rely on the operation being mined.
 */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { withRpcRetry } from '../lib/rpcRetry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadContractABI(): ethers.InterfaceAbi {
  const artifactPath = resolve(
    __dirname,
    '../../../contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json',
  )
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'))
  return artifact.abi
}

const abi = loadContractABI()

// IMPORTANT: ethers v6 batches RPC requests by default (up to 100 per batch).
// Free-tier providers like drpc.org reject batches > 3 with a 500 ("Batch of more
// than 3 requests are not allowed on free tier"). Disabling batching turns the
// blockchain layer back into a sequence of normal individual JSON-RPC calls,
// which every provider tolerates. This was the root cause of all "blockchain
// disconnected" / 500 errors in production.
const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
  batchMaxCount: 1,
})
const wallet = new ethers.Wallet(config.minterPrivateKey, provider)
const managedSigner = new ethers.NonceManager(wallet)
const contract = new ethers.Contract(config.contractAddress, abi, managedSigner)
const readOnlyContract = new ethers.Contract(config.contractAddress, abi, provider)

const MIN_BALANCE_WEI = 50_000n * 1_000_000n // ~50k gas units at 1 Mwei/gas

/**
 * Throws a descriptive error if the minter wallet balance is too low
 * to cover even a single transaction. Called before every write operation
 * so users get a clear 503 instead of a cryptic provider error.
 */
async function assertSufficientBalance(): Promise<void> {
  const balance = await withRpcRetry(() => provider.getBalance(wallet.address), {
    label: 'getBalance',
  })
  if (balance < MIN_BALANCE_WEI) {
    const err = new Error(
      `Minter wallet balance too low: ${ethers.formatEther(balance)} ETH. ` +
        'Top up the wallet to resume operations.',
    )
    ;(err as unknown as Record<string, unknown>).code = 'INSUFFICIENT_FUNDS'
    throw err
  }
}

export async function awardPoints(
  student: string,
  surveyId: number,
  secret: string,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.awardPoints(student, surveyId, secret)
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function registerSurvey(
  surveyId: number,
  secretHash: string,
  points: number,
  maxClaims: number,
  title: string,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.registerSurvey(surveyId, secretHash, points, maxClaims, title)
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export interface SurveyInfoRaw {
  secretHash: string
  points: number
  maxClaims: bigint
  claimCount: bigint
  active: boolean
  registeredAt: bigint
  title: string
}

export async function deactivateSurvey(surveyId: number): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.deactivateSurvey(surveyId)
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function getSurveyInfo(surveyId: number): Promise<SurveyInfoRaw> {
  const result = await withRpcRetry(() => readOnlyContract.getSurveyInfo(surveyId), {
    label: 'getSurveyInfo',
  })
  return {
    secretHash: result[0],
    points: Number(result[1]),
    maxClaims: result[2],
    claimCount: result[3],
    active: result[4],
    registeredAt: result[5],
    title: result[6],
  }
}

export async function getTotalPoints(walletAddress: string): Promise<number> {
  const points = await withRpcRetry(() => readOnlyContract.totalPoints(walletAddress), {
    label: 'totalPoints',
  })
  return Number(points)
}

export async function getSurveyPoints(walletAddress: string, surveyId: number): Promise<number> {
  const points = await withRpcRetry(() => readOnlyContract.surveyPoints(walletAddress, surveyId), {
    label: 'surveyPoints',
  })
  return Number(points)
}

export async function hasClaimed(walletAddress: string, surveyId: number): Promise<boolean> {
  return withRpcRetry(() => readOnlyContract.claimed(walletAddress, surveyId), {
    label: 'claimed',
  })
}

export interface PointsAwardedEvent {
  wallet: string
  surveyId: number
  points: number
  blockNumber: number
  transactionHash: string
  timestamp: number
}

export async function getPointsAwardedEvents(walletAddress: string): Promise<PointsAwardedEvent[]> {
  const fromBlock = config.contractDeployBlock || 0
  const filter = readOnlyContract.filters.PointsAwarded(walletAddress)
  const events = await queryFilterChunked(readOnlyContract, filter, fromBlock)

  const results: PointsAwardedEvent[] = []
  for (const event of events) {
    if (!('args' in event)) continue
    const block = await event.getBlock()
    results.push({
      wallet: event.args[0],
      surveyId: Number(event.args[1]),
      points: Number(event.args[2]),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      timestamp: block.timestamp,
    })
  }

  return results
}

export interface SurveyRegisteredEvent {
  surveyId: number
  points: number
  maxClaims: number
  blockNumber: number
  transactionHash: string
  timestamp: number
}

export async function getSurveyRegisteredEvents(): Promise<SurveyRegisteredEvent[]> {
  const fromBlock = config.contractDeployBlock || 0
  const filter = readOnlyContract.filters.SurveyRegistered()
  const events = await queryFilterChunked(readOnlyContract, filter, fromBlock)

  const results: SurveyRegisteredEvent[] = []
  for (const event of events) {
    if (!('args' in event)) continue
    const block = await event.getBlock()
    results.push({
      surveyId: Number(event.args[0]),
      points: Number(event.args[1]),
      maxClaims: Number(event.args[2]),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      timestamp: block.timestamp,
    })
  }

  return results
}

export async function isAdmin(address: string): Promise<boolean> {
  return withRpcRetry(() => readOnlyContract.isAdmin(address), { label: 'isAdmin' })
}

export async function addAdmin(address: string): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.addAdmin(address)
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function removeAdmin(address: string): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.removeAdmin(address)
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function markWalletSubmitted(
  walletAddress: string,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.markWalletSubmitted(walletAddress)
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function unmarkWalletSubmitted(
  walletAddress: string,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.unmarkWalletSubmitted(walletAddress)
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function isWalletSubmitted(walletAddress: string): Promise<boolean> {
  return withRpcRetry(() => readOnlyContract.isWalletSubmitted(walletAddress), {
    label: 'isWalletSubmitted',
  })
}

export function getMinterAddress(): string {
  return wallet.address
}

export async function getMinterBalance(): Promise<bigint> {
  return withRpcRetry(() => provider.getBalance(wallet.address), { label: 'getBalance' })
}

export async function getBlockNumber(): Promise<number> {
  return withRpcRetry(() => provider.getBlockNumber(), { label: 'getBlockNumber' })
}

export async function getNetwork(): Promise<string> {
  const network = await withRpcRetry(() => provider.getNetwork(), { label: 'getNetwork' })
  return network.name
}

/**
 * Queries event logs in chunks to stay within RPC provider block-range limits.
 * Most free-tier RPCs (drpc, publicnode) cap at 10,000 blocks per request.
 * Chunk size is configurable via CHUNK_SIZE env var (default: 9000).
 */
async function queryFilterChunked(
  contract: ethers.Contract,
  filter: ethers.ContractEventName,
  fromBlock: number,
): Promise<(ethers.EventLog | ethers.Log)[]> {
  const chunkSize = config.chunkSize
  const latestBlock = await withRpcRetry(() => contract.runner!.provider!.getBlockNumber(), {
    label: 'getBlockNumber',
  })
  if (latestBlock - fromBlock <= chunkSize) {
    return withRpcRetry(() => contract.queryFilter(filter, fromBlock, latestBlock), {
      label: 'queryFilter',
    })
  }

  const results: (ethers.EventLog | ethers.Log)[] = []
  for (let start = fromBlock; start <= latestBlock; start += chunkSize + 1) {
    const end = Math.min(start + chunkSize, latestBlock)
    const chunk = await withRpcRetry(() => contract.queryFilter(filter, start, end), {
      label: 'queryFilter',
    })
    results.push(...chunk)
  }
  return results
}

/**
 * Fallback: queries RoleGranted/RoleRevoked events directly from the RPC
 * to compute the current admin list. Used when the event store is cold.
 */
export async function getAdminAddresses(): Promise<string[]> {
  const fromBlock = config.contractDeployBlock || 0
  const adminRole: string = await readOnlyContract.ADMIN_ROLE()

  const [grantedEvents, revokedEvents] = await Promise.all([
    queryFilterChunked(
      readOnlyContract,
      readOnlyContract.filters.RoleGranted(adminRole),
      fromBlock,
    ),
    queryFilterChunked(
      readOnlyContract,
      readOnlyContract.filters.RoleRevoked(adminRole),
      fromBlock,
    ),
  ])

  const adminSet = new Set<string>()
  const allEvents = [
    ...grantedEvents.map((e) => ({ type: 'grant' as const, ...e })),
    ...revokedEvents.map((e) => ({ type: 'revoke' as const, ...e })),
  ].sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index)

  for (const event of allEvents) {
    if (!('args' in event)) continue
    const account = (event.args as unknown as [string, string, string])[1]
    if (event.type === 'grant') {
      adminSet.add(account)
    } else {
      adminSet.delete(account)
    }
  }

  return Array.from(adminSet)
}

/**
 * Validates that the connected RPC returns the expected chain ID.
 * Throws if EXPECTED_CHAIN_ID is set and does not match.
 */
export async function validateChainId(): Promise<void> {
  if (!config.expectedChainId) return

  const network = await provider.getNetwork()
  const actual = network.chainId.toString()
  const expected = config.expectedChainId

  if (actual !== expected) {
    throw new Error(
      `Chain ID mismatch: RPC returned ${actual}, expected ${expected}. ` +
        'Check RPC_URL and EXPECTED_CHAIN_ID.',
    )
  }
}

export { provider, contract, readOnlyContract, queryFilterChunked }
