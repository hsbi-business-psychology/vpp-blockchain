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
import { resolve } from 'node:path'
import { config } from '../config.js'
import { withRpcRetry } from '../lib/rpcRetry.js'
import { AdaptiveLogReader } from '../lib/log-reader.js'
import { BACKEND_ROOT } from '../lib/paths.js'
import { fromCentiPoints, toCentiPoints } from '../lib/points.js'

/**
 * Loads the SurveyPointsV3 ABI from the contracts package artifacts. V3 is
 * a superset of V2: every V2 function and event keeps its signature, and
 * V3 adds the centipoint functions/events for fractional surveys. The
 * same ABI therefore works against a proxy that still runs the V2
 * implementation — V3-only calls are gated by `supportsFractionalPoints()`.
 * V1 artifacts were intentionally retired (see docs/v2-migration-runbook.md).
 */
function loadContractABI(): ethers.InterfaceAbi {
  const artifactPath = resolve(
    BACKEND_ROOT,
    '../contracts/artifacts/contracts/SurveyPointsV3.sol/SurveyPointsV3.json',
  )
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'))
  return artifact.abi
}

const abi = loadContractABI()

/**
 * Build the read provider.
 *
 * Two hard lessons baked in here:
 *
 * 1. Most public Base RPCs are flaky in their own way. 1rpc.io silently
 *    starts returning HTTP 200 with `{"error":"You've reached the usage
 *    limit"}` after some traffic; drpc.org Free Tier rejects batches > 3
 *    with HTTP 500. A single hard-coded RPC URL therefore turns every
 *    spike into a full outage. We accept either a single URL or a comma-
 *    separated list in `RPC_URL`, plus a small set of well-known public
 *    Base mainnet fallbacks so the system survives the loss of any one
 *    provider without any operator action.
 *
 * 2. ethers v6 batches JSON-RPC requests by default (up to 100/batch).
 *    Free-tier providers reject batches > 3. We force `batchMaxCount: 1`
 *    on every JsonRpcProvider so each call goes out as a plain HTTP POST.
 *
 * Writes go through the same FallbackProvider. ethers v6's
 * FallbackProvider implements broadcastTransaction by sending the signed
 * tx to every healthy sub-provider — that's actually safer than pinning
 * to one URL because mempool dedup on the chain side ensures the tx is
 * mined exactly once. NonceManager continues to work because
 * getTransactionCount("latest") returns the same value across all
 * Base sub-providers (they all see the same canonical state).
 */
const KNOWN_BASE_FALLBACKS = [
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://base.drpc.org',
]

/**
 * True when the URL points at a local development chain (Hardhat, Anvil,
 * Ganache, Geth dev mode). We must NOT mix such URLs with the public Base
 * mainnet fallbacks because:
 *   - their chain IDs differ (31337 vs 8453)
 *   - their state differs (FallbackProvider would race answers and return
 *     whichever sub-provider replies first, often the WRONG chain)
 * The integration test suite hits 127.0.0.1:8545; production hits Alchemy
 * or one of the public Base RPCs.
 */
function isLocalRpcUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')
  } catch {
    return false
  }
}

/**
 * Public list of RPC URLs actually in use (operator-configured + dedup'd
 * fallbacks). Exposed so `/api/v1/health/diag` can probe each one and tell
 * the operator which provider is healthy and which is degraded — including
 * the fallback URLs, not only the primary.
 *
 * Public Base mainnet fallbacks are appended ONLY when the configured URL(s)
 * look like real Base mainnet endpoints. A localhost / 127.0.0.1 setup
 * (Hardhat, integration tests, dev environments) gets the plain configured
 * URL(s) only — mixing chains via FallbackProvider returns wrong data.
 */
export function getEffectiveRpcUrls(): string[] {
  const configured = config.rpcUrl
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  const includeFallbacks = configured.length > 0 && !configured.some(isLocalRpcUrl)
  const seen = new Set<string>()
  const candidates = includeFallbacks ? [...configured, ...KNOWN_BASE_FALLBACKS] : configured
  return candidates.filter((u) => {
    if (seen.has(u)) return false
    seen.add(u)
    return true
  })
}

function buildReadProvider(urls: string[]): ethers.AbstractProvider {
  const subProviders = urls.map((url, idx) => ({
    provider: new ethers.JsonRpcProvider(url, undefined, { batchMaxCount: 1 }),
    priority: idx + 1,
    stallTimeout: 2_000,
    weight: 1,
  }))

  if (subProviders.length === 1) {
    return subProviders[0].provider
  }

  // quorum: 1 → first responding provider wins; failures fall through
  return new ethers.FallbackProvider(subProviders, undefined, { quorum: 1 })
}

const provider = buildReadProvider(getEffectiveRpcUrls())

/**
 * Sources for eth_getLogs, in the order they are asked: EVENT_RPC_URL when
 * set, otherwise RPC_URL followed by the public Base fallbacks. Each source
 * gets its own plain JsonRpcProvider; AdaptiveLogReader handles failover and
 * the block span (see lib/log-reader.ts). With EXPECTED_CHAIN_ID set the
 * network is static, so an unreachable source fails instead of waiting for
 * network detection.
 */
function getEventRpcUrls(): string[] {
  const explicit = (config.eventRpcUrl ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  return explicit.length > 0 ? explicit : getEffectiveRpcUrls()
}

const eventNetwork = config.expectedChainId
  ? ethers.Network.from(Number(config.expectedChainId))
  : undefined
/** Per-request deadline for one event source. Set on the FetchRequest so
 * ethers really aborts the HTTP call instead of leaving it running. */
const EVENT_REQUEST_TIMEOUT_MS = 10_000

const eventContracts = getEventRpcUrls().map((url) => {
  const request = new ethers.FetchRequest(url)
  request.timeout = EVENT_REQUEST_TIMEOUT_MS
  return new ethers.Contract(
    config.contractAddress,
    abi,
    new ethers.JsonRpcProvider(request, eventNetwork, {
      batchMaxCount: 1,
      staticNetwork: eventNetwork,
    }),
  )
})
const logReader = new AdaptiveLogReader(eventContracts.length, {
  maxSpan: config.chunkSize,
  timeoutMs: EVENT_REQUEST_TIMEOUT_MS + 1_000,
})

/** Block span the next eth_getLogs request will use. The event store sizes
 * its checkpoint windows with it, so a provider that only accepts small
 * ranges still makes saved progress. */
export function getEventWindowSize(): number {
  return logReader.getSpan()
}
// Wallet uses the SAME FallbackProvider so write operations (addAdmin,
// awardPoints, etc.) survive a quota-locked / down primary RPC. Without
// this, /api/v1/admin/add returned a 500 even though reads worked,
// because the wallet was hard-pinned to the primary URL (1rpc.io) which
// had exhausted its plan limit.
const wallet = new ethers.Wallet(config.minterPrivateKey, provider)
const managedSigner = new ethers.NonceManager(wallet)
const contract = new ethers.Contract(config.contractAddress, abi, managedSigner)
const readOnlyContract = new ethers.Contract(config.contractAddress, abi, provider)

/**
 * Hard-stop threshold: write paths refuse new transactions when balance
 * drops below this. Sized for ~30 awardPoints transactions at typical
 * Base gas prices (~80 000 gas × ~10 gwei ≈ 0.000 8 ETH per Tx → 30 ×
 * Tx ≈ 0.024 ETH; leaving a 5× margin gives ~0.005 ETH as the floor).
 *
 * The previous default of 50 000 × 1e6 wei (≈ 0.00000005 ETH) was 16
 * 000× too low — see audit F2.4. Operators can override via
 * `MIN_BALANCE_ETH`; everything below 0.001 ETH is essentially "service
 * is broken in <5 Tx" and should not be configured in production.
 */
export const MIN_BALANCE_WEI = ethers.parseEther(config.minBalanceEth)

/**
 * Soft warn threshold: structured `MINTER_BALANCE_LOW` log line at warn
 * level (picked up by Plesk cron + UptimeRobot keyword check) when
 * balance drops below this. 5× the hard floor gives operators ~150 Tx
 * (typically several full class runs) to schedule a refill before the
 * service starts returning 503s. See `services/balance-monitor.ts`.
 */
export const WARN_BALANCE_WEI = MIN_BALANCE_WEI * 5n

/**
 * Hard fee caps applied as upper bounds to every state-changing
 * transaction (audit F2.3 / M12). Without these, ethers v6's default
 * `getFeeData()` policy lets a Base mainnet fee spike (NFT mint wave,
 * sequencer backlog) burn the minter wallet inside a handful of
 * transactions. With the caps, a Tx submitted during a spike simply
 * waits in the mempool until baseFee drops back below the ceiling.
 *
 * Both knobs are config-driven so operators on a congested network
 * or on L1 can lift the cap without a code change.
 */
export const MAX_FEE_PER_GAS_WEI = ethers.parseUnits(config.maxFeePerGasGwei, 'gwei')
export const MAX_PRIORITY_FEE_PER_GAS_WEI = ethers.parseUnits(
  config.maxPriorityFeePerGasGwei,
  'gwei',
)

/**
 * Builds per-transaction EIP-1559 fee overrides.
 *
 * Reads the provider's current `getFeeData()` and computes:
 *
 *   priority = min(provider.maxPriorityFeePerGas, MAX_PRIORITY_FEE)
 *   baseFee  = (provider.maxFeePerGas − provider.maxPriorityFeePerGas) / 2
 *   maxFee   = min(2 × baseFee + priority, MAX_FEE_PER_GAS)
 *
 * On Base, baseFee is typically 0.005-0.05 gwei and the sequencer is
 * single-operator (priority tip is anti-spam, not bid-for-blockspace),
 * so a healthy run lands at ~0.005-0.015 gwei effective gas price —
 * one `awardPoints` Tx costs $0.001-0.005 instead of the $0.15
 * the previous static-override path produced. During a congestion
 * spike the static caps still apply, so wallet-drain protection
 * (audit F2.3 / M12) is preserved.
 *
 * The returned object always satisfies `maxFeePerGas >= maxPriorityFeePerGas`
 * which ethers v6 requires.
 */
export async function buildTxOverrides(): Promise<ethers.Overrides> {
  const feeData = await withRpcRetry(() => provider.getFeeData(), { label: 'getFeeData' })

  let priority = feeData.maxPriorityFeePerGas ?? MAX_PRIORITY_FEE_PER_GAS_WEI
  if (priority < 0n) priority = 0n
  if (priority > MAX_PRIORITY_FEE_PER_GAS_WEI) priority = MAX_PRIORITY_FEE_PER_GAS_WEI

  const providerMaxFee = feeData.maxFeePerGas ?? 0n
  const providerTip = feeData.maxPriorityFeePerGas ?? 0n
  const baseFee = providerMaxFee > providerTip ? (providerMaxFee - providerTip) / 2n : 0n

  let maxFee = baseFee * 2n + priority
  if (maxFee > MAX_FEE_PER_GAS_WEI) maxFee = MAX_FEE_PER_GAS_WEI
  if (maxFee < priority) maxFee = priority

  return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority }
}

/**
 * Static worst-case fee overrides — used only by code paths that need
 * a synchronous override and accept paying the absolute ceiling. New
 * code should call `buildTxOverrides()` instead, which is dynamic and
 * costs ~30× less in normal operation.
 *
 * @deprecated Prefer `buildTxOverrides()` for cost efficiency.
 */
export const TX_OVERRIDES: ethers.Overrides = {
  maxFeePerGas: MAX_FEE_PER_GAS_WEI,
  maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS_WEI,
}

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
      `Minter wallet balance too low: ${ethers.formatEther(balance)} ETH ` +
        `(threshold ${ethers.formatEther(MIN_BALANCE_WEI)} ETH). ` +
        'Top up the wallet to resume operations — see docs/runbooks/eth-refill.md.',
    )
    ;(err as unknown as Record<string, unknown>).code = 'INSUFFICIENT_FUNDS'
    throw err
  }
}

// ---------------------------------------------------------------------------
//  Fractional points (contract V3)
// ---------------------------------------------------------------------------

let fractionalSupport: { value: boolean; checkedAt: number } | null = null
const FRACTIONAL_RECHECK_MS = 5 * 60_000

/**
 * Whether the live contract understands centipoints (implementation
 * version >= 3). Lets this backend run against both the V2 and the V3
 * implementation, so deploying the backend and upgrading the proxy can
 * happen in either order. A positive answer is cached for good (upgrades
 * never go backwards); a negative one is re-checked every 5 minutes so
 * the backend picks up a proxy upgrade without a restart.
 */
export async function supportsFractionalPoints(): Promise<boolean> {
  if (fractionalSupport) {
    if (fractionalSupport.value) return true
    if (Date.now() - fractionalSupport.checkedAt < FRACTIONAL_RECHECK_MS) return false
  }
  const version = await getContractVersion()
  if (version === 'unknown') return false // transient RPC failure — don't cache
  const major = parseInt(version.split('.')[0], 10)
  const value = Number.isFinite(major) && major >= 3
  fractionalSupport = { value, checkedAt: Date.now() }
  return value
}

/** Test hook: forget the cached version check. */
export function resetFractionalSupportCache(): void {
  fractionalSupport = null
}

/**
 * Award points to `student` for `surveyId`. V2 dropped the on-chain
 * secret parameter — proof of completion is verified off-chain by the
 * backend (HMAC token + nonce store) before this function is called.
 */
export async function awardPoints(
  student: string,
  surveyId: number,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.awardPoints(student, surveyId, await buildTxOverrides())
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

/**
 * Register a new survey on-chain. V2 no longer stores any per-survey
 * secret hash — the off-chain `survey-keys` store owns the HMAC key.
 *
 * `points` is a decimal number. Whole values go through the V2
 * `registerSurvey` function (works on V2 and V3); fractional values need
 * the V3 `registerSurveyCenti` — callers must check
 * `supportsFractionalPoints()` first.
 */
export async function registerSurvey(
  surveyId: number,
  points: number,
  maxClaims: number,
  title: string,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const centi = toCentiPoints(points)
  const tx =
    centi % 100 === 0
      ? await contract.registerSurvey(
          surveyId,
          centi / 100,
          maxClaims,
          title,
          await buildTxOverrides(),
        )
      : await contract.registerSurveyCenti(
          surveyId,
          centi,
          maxClaims,
          title,
          await buildTxOverrides(),
        )
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export interface SurveyInfoRaw {
  /** Decimal points (0.25, 1, 1.5). 0 means the survey does not exist. */
  points: number
  maxClaims: bigint
  claimCount: bigint
  active: boolean
  registeredAt: bigint
  title: string
}

export async function deactivateSurvey(surveyId: number): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.deactivateSurvey(surveyId, await buildTxOverrides())
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

/**
 * Re-enable a previously deactivated survey. V2-only — V1 had no way
 * to reverse a `deactivateSurvey` call.
 */
export async function reactivateSurvey(surveyId: number): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.reactivateSurvey(surveyId, await buildTxOverrides())
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

/**
 * Reverse a previously awarded claim. Used to correct genuine mistakes
 * (operator error, accidental double-award via backend bug). V2-only.
 */
export async function revokePoints(
  student: string,
  surveyId: number,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.revokePoints(student, surveyId, await buildTxOverrides())
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function getSurveyInfo(surveyId: number): Promise<SurveyInfoRaw> {
  if (await supportsFractionalPoints()) {
    const result = await withRpcRetry(() => readOnlyContract.getSurveyInfoCenti(surveyId), {
      label: 'getSurveyInfoCenti',
    })
    return {
      points: fromCentiPoints(result[0]),
      maxClaims: result[1],
      claimCount: result[2],
      active: result[3],
      registeredAt: result[4],
      title: result[5],
    }
  }
  const result = await withRpcRetry(() => readOnlyContract.getSurveyInfo(surveyId), {
    label: 'getSurveyInfo',
  })
  return {
    points: Number(result[0]),
    maxClaims: result[1],
    claimCount: result[2],
    active: result[3],
    registeredAt: result[4],
    title: result[5],
  }
}

/** Total points of a wallet as a decimal number. */
export async function getTotalPoints(walletAddress: string): Promise<number> {
  if (await supportsFractionalPoints()) {
    const centi = await withRpcRetry(() => readOnlyContract.totalPointsCenti(walletAddress), {
      label: 'totalPointsCenti',
    })
    return fromCentiPoints(centi)
  }
  const points = await withRpcRetry(() => readOnlyContract.totalPoints(walletAddress), {
    label: 'totalPoints',
  })
  return Number(points)
}

/** Points a wallet earned for one survey, as a decimal number. */
export async function getSurveyPoints(walletAddress: string, surveyId: number): Promise<number> {
  if (await supportsFractionalPoints()) {
    const centi = await withRpcRetry(
      () => readOnlyContract.surveyPointsCenti(walletAddress, surveyId),
      { label: 'surveyPointsCenti' },
    )
    return fromCentiPoints(centi)
  }
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

/**
 * Sort helper so whole-point (V2 `PointsAwarded`) and fractional (V3
 * `PointsAwardedCenti`) events appear in on-chain order.
 */
function byChainOrder(a: ethers.EventLog | ethers.Log, b: ethers.EventLog | ethers.Log): number {
  return a.blockNumber - b.blockNumber || a.index - b.index
}

/** Decimal points carried by a V2 (whole) or V3 (`*Centi`) event. */
function eventPoints(event: ethers.EventLog, valueArgIndex: number): number {
  const raw = event.args[valueArgIndex]
  return event.fragment.name.endsWith('Centi') ? fromCentiPoints(raw) : Number(raw)
}

export async function getPointsAwardedEvents(walletAddress: string): Promise<PointsAwardedEvent[]> {
  const fromBlock = config.contractDeployBlock || 0
  const [whole, fractional] = await Promise.all([
    queryFilterChunked(
      readOnlyContract,
      readOnlyContract.filters.PointsAwarded(walletAddress),
      fromBlock,
    ),
    queryFilterChunked(
      readOnlyContract,
      readOnlyContract.filters.PointsAwardedCenti(walletAddress),
      fromBlock,
    ),
  ])
  const events = [...whole, ...fractional].sort(byChainOrder)

  const results: PointsAwardedEvent[] = []
  for (const event of events) {
    if (!('args' in event)) continue
    const block = await event.getBlock()
    results.push({
      wallet: event.args[0],
      surveyId: Number(event.args[1]),
      points: eventPoints(event, 2),
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
  const [whole, fractional] = await Promise.all([
    queryFilterChunked(readOnlyContract, readOnlyContract.filters.SurveyRegistered(), fromBlock),
    queryFilterChunked(
      readOnlyContract,
      readOnlyContract.filters.SurveyRegisteredCenti(),
      fromBlock,
    ),
  ])
  const events = [...whole, ...fractional].sort(byChainOrder)

  const results: SurveyRegisteredEvent[] = []
  for (const event of events) {
    if (!('args' in event)) continue
    const block = await event.getBlock()
    results.push({
      surveyId: Number(event.args[0]),
      points: eventPoints(event, 1),
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
  const tx = await contract.addAdmin(address, await buildTxOverrides())
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function removeAdmin(address: string): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.removeAdmin(address, await buildTxOverrides())
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function markWalletSubmitted(
  walletAddress: string,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.markWalletSubmitted(walletAddress, await buildTxOverrides())
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function unmarkWalletSubmitted(
  walletAddress: string,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.unmarkWalletSubmitted(walletAddress, await buildTxOverrides())
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

export function getContractAddress(): string {
  return config.contractAddress
}

/**
 * Returns the on-chain contract version string (e.g. "2.0.0").
 *
 * Used by the admin status panel so operators can verify at a glance
 * which implementation is actually live behind the proxy. Falls back
 * to "unknown" if the call reverts (e.g. when pointing at a non-V2
 * deployment during migration).
 */
export async function getContractVersion(): Promise<string> {
  try {
    return (await withRpcRetry(() => readOnlyContract.version(), {
      label: 'contract.version',
    })) as string
  } catch {
    return 'unknown'
  }
}

export interface QueryLogsOptions {
  /** Checked before every request so an abandoned caller stops early. */
  shouldStop?: () => boolean
  /** Make exactly one request for the whole range. A rejected range then
   * throws RangeRejectedError instead of being split here, so the event
   * store can retry it as a smaller, separately checkpointed window. */
  singleRequest?: boolean
}

/**
 * Queries event logs for `[fromBlock, toBlock]` through the event sources,
 * failing over between them and shrinking the block span when they reject
 * the range. `toBlock` defaults to the chain head. Errors are not retried
 * against the same source: the next source is the retry.
 */
async function queryFilterChunked(
  _ignoredContract: ethers.Contract,
  filter: ethers.ContractEventName,
  fromBlock: number,
  toBlock?: number,
  options: QueryLogsOptions = {},
): Promise<(ethers.EventLog | ethers.Log)[]> {
  const latestBlock =
    toBlock ??
    (await withRpcRetry(() => provider.getBlockNumber(), {
      label: 'getBlockNumber',
    }))
  const query = (index: number, from: number, to: number) =>
    eventContracts[index].queryFilter(filter, from, to)
  return options.singleRequest
    ? logReader.readOnce(query, fromBlock, latestBlock, options.shouldStop)
    : logReader.read(query, fromBlock, latestBlock, options.shouldStop)
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
