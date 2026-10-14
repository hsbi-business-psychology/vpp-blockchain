/**
 * @module json-file-event-store
 *
 * Persistent JSON-file cache for blockchain events.
 *
 * Instead of querying all blocks from the contract deploy block on every
 * request, events are synced incrementally: only new blocks since the last
 * sync are fetched from the RPC. This eliminates free-tier block-range
 * limits and makes event queries near-instant.
 *
 * The store is written to `data/events.json` relative to the backend root.
 * It is loaded at startup and re-synced every 60 seconds and immediately
 * after any write transaction.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from '../config.js'
import { atomicWriteJson } from '../lib/atomic-write.js'
import { logger } from '../lib/logger.js'
import { DATA_DIR } from '../lib/paths.js'
import { readOnlyContract, queryFilterChunked, provider } from './blockchain.js'
import type { EventStore } from './event-store.interface.js'
import type { EventStoreData, StoredSurveyEvent, StoredPointsEvent } from './event-store.types.js'

const STORE_PATH = resolve(DATA_DIR, 'events.json')

export class JsonFileEventStore implements EventStore {
  private store: EventStoreData = {
    lastSyncedBlock: 0,
    surveyRegistered: [],
    pointsAwarded: [],
    roleChanges: [],
  }

  private syncing = false
  private syncStartedAt = 0
  private lastSuccessfulSyncAt = 0
  private lastSyncError: string | null = null
  private adminRoleHash: string | null = null
  private syncInterval: ReturnType<typeof setInterval> | null = null

  /** Hard ceiling per sync run. If a single sync takes longer than this,
   * something is hanging (free-tier RPC stalled forever, FallbackProvider
   * race never resolved, etc). The watchdog releases the `syncing` lock so
   * the NEXT scheduled sync can try again instead of being permanently
   * blocked. 45s is generous enough for an honest cold sync over many
   * chunks but short enough that operators see fresh data within a minute
   * of any single hang. */
  private static readonly SYNC_TIMEOUT_MS = 45_000

  /** Time budget for one sync run. The run works through the block range
   * window by window (CHUNK_SIZE blocks each), saving progress to disk
   * after every window, and stops once this budget is used up. The next
   * run resumes from the saved checkpoint. Kept well below SYNC_TIMEOUT_MS
   * so a long catch-up is split across runs instead of being killed by the
   * watchdog.
   *
   * Background: the previous implementation fetched the WHOLE missing range
   * in one go and only saved at the very end. Once the store fell more than
   * ~45 s worth of queries behind (≈ a month of Base blocks), every run hit
   * the watchdog, nothing was ever saved, and the gap kept growing — newly
   * registered surveys and claims silently stopped showing up. */
  private static readonly SYNC_BUDGET_MS = 30_000

  /** Max parallel getBlock() calls when resolving event timestamps. */
  private static readonly TIMESTAMP_CONCURRENCY = 4

  /** Incremented for every run. A run abandoned by the watchdog keeps
   * executing in the background; it checks this counter before touching
   * the store so it can never interleave with (and duplicate events of)
   * a newer run. */
  private runGeneration = 0

  private load(): void {
    if (!existsSync(STORE_PATH)) return
    try {
      const raw = readFileSync(STORE_PATH, 'utf-8')
      this.store = JSON.parse(raw)
    } catch {
      this.store = {
        lastSyncedBlock: 0,
        surveyRegistered: [],
        pointsAwarded: [],
        roleChanges: [],
      }
    }
  }

  private save(): void {
    // Delegated to atomicWriteJson, which handles the tmp+rename dance,
    // chmod 0600 on the canonical file, and the .htaccess deny-all in
    // data/. See lib/atomic-write.ts for the rationale.
    atomicWriteJson(STORE_PATH, this.store)
  }

  private async getAdminRoleHash(): Promise<string> {
    if (!this.adminRoleHash) {
      this.adminRoleHash = await readOnlyContract.ADMIN_ROLE()
    }
    return this.adminRoleHash!
  }

  private async getBlockTimestamps(blockNumbers: number[]): Promise<Map<number, number>> {
    const unique = [...new Set(blockNumbers)]
    const map = new Map<number, number>()
    // Small fixed-size worker pool: sequential lookups were the slowest
    // part of a sync after a busy claim session (hundreds of blocks), while
    // unbounded parallelism trips free-tier RPC rate limits.
    let next = 0
    const worker = async () => {
      while (next < unique.length) {
        const bn = unique[next++]
        const block = await provider.getBlock(bn)
        map.set(bn, block?.timestamp ?? 0)
      }
    }
    const workers = Math.min(JsonFileEventStore.TIMESTAMP_CONCURRENCY, unique.length)
    await Promise.all(Array.from({ length: workers }, worker))
    return map
  }

  /** Public-facing sync that callers can fire-and-forget from request
   * handlers. Wraps `runSync` in a watchdog so a single hung RPC call
   * cannot freeze the cache forever. */
  async sync(): Promise<void> {
    if (this.syncing) {
      // If a previous sync has been running for longer than the timeout,
      // the watchdog should have already released the lock. If we still
      // see syncing=true with a stale start time, force-release as a last
      // resort so we don't get stuck for the lifetime of the worker.
      const ageMs = Date.now() - this.syncStartedAt
      if (ageMs < JsonFileEventStore.SYNC_TIMEOUT_MS) return
      logger.warn({ ageMs }, 'Sync lock was held longer than SYNC_TIMEOUT_MS — force-releasing')
      this.syncing = false
    }
    this.syncing = true
    this.syncStartedAt = Date.now()
    const generation = ++this.runGeneration
    let caughtUp: boolean
    let watchdogTimer: ReturnType<typeof setTimeout> | undefined
    try {
      caughtUp = await Promise.race([
        this.runSync(generation),
        new Promise<never>((_, reject) => {
          watchdogTimer = setTimeout(
            () => reject(new Error(`sync watchdog (>${JsonFileEventStore.SYNC_TIMEOUT_MS}ms)`)),
            JsonFileEventStore.SYNC_TIMEOUT_MS,
          )
        }),
      ])
      this.lastSyncError = null
      // Only count as "fresh" once the store has reached the chain head;
      // while catching up, staleness checks should keep triggering syncs.
      if (caughtUp) this.lastSuccessfulSyncAt = Date.now()
    } catch (err) {
      // Invalidate the abandoned run so it cannot write to the store later.
      if (this.runGeneration === generation) this.runGeneration++
      caughtUp = true // don't hot-loop on errors; the interval retries
      this.lastSyncError = err instanceof Error ? err.message : String(err)
      logger.error({ err }, 'Event store sync failed (watchdog)')
    } finally {
      clearTimeout(watchdogTimer)
      this.syncing = false
    }

    if (!caughtUp) {
      // Still behind after this run's time budget — continue shortly
      // rather than waiting for the next interval tick.
      const t = setTimeout(() => void this.sync(), 1_000)
      t.unref?.()
    }
  }

  /**
   * Fetches events from the last checkpoint towards the chain head in
   * windows of CHUNK_SIZE blocks, persisting after each window.
   * Returns true when the store has reached the chain head, false when the
   * time budget ran out first (the next run resumes from the checkpoint).
   */
  private async runSync(generation: number): Promise<boolean> {
    const deadline = Date.now() + JsonFileEventStore.SYNC_BUDGET_MS
    try {
      const latestBlock = await provider.getBlockNumber()
      let fromBlock = this.store.lastSyncedBlock
        ? this.store.lastSyncedBlock + 1
        : config.contractDeployBlock || 0

      if (fromBlock > latestBlock) return true

      const adminRole = await this.getAdminRoleHash()
      const windowSize = Math.max(1, config.chunkSize)

      while (fromBlock <= latestBlock) {
        const toBlock = Math.min(fromBlock + windowSize - 1, latestBlock)
        const applied = await this.syncWindow(generation, adminRole, fromBlock, toBlock)
        if (!applied) return true // superseded by a newer run — stop quietly

        logger.info(
          { fromBlock, toBlock, behind: latestBlock - toBlock },
          'Event store synced window',
        )
        fromBlock = toBlock + 1

        if (fromBlock <= latestBlock && Date.now() >= deadline) {
          logger.warn(
            { lastSyncedBlock: toBlock, behind: latestBlock - toBlock },
            'Event store still catching up — continuing in next run',
          )
          return false
        }
      }
      return true
    } catch (err) {
      logger.error({ err }, 'Event store sync failed')
      throw err
    }
  }

  /**
   * Fetches and stores all events in [fromBlock, toBlock], then saves the
   * checkpoint. Returns false (and changes nothing) if a newer run has
   * started in the meantime.
   */
  private async syncWindow(
    generation: number,
    adminRole: string,
    fromBlock: number,
    toBlock: number,
  ): Promise<boolean> {
    const [surveyEvents, pointsEvents, grantEvents, revokeEvents] = await Promise.all([
      queryFilterChunked(
        readOnlyContract,
        readOnlyContract.filters.SurveyRegistered(),
        fromBlock,
        toBlock,
      ),
      queryFilterChunked(
        readOnlyContract,
        readOnlyContract.filters.PointsAwarded(),
        fromBlock,
        toBlock,
      ),
      queryFilterChunked(
        readOnlyContract,
        readOnlyContract.filters.RoleGranted(adminRole),
        fromBlock,
        toBlock,
      ),
      queryFilterChunked(
        readOnlyContract,
        readOnlyContract.filters.RoleRevoked(adminRole),
        fromBlock,
        toBlock,
      ),
    ])

    const allBlockNumbers = [
      ...surveyEvents.map((e) => e.blockNumber),
      ...pointsEvents.map((e) => e.blockNumber),
    ]
    const timestamps =
      allBlockNumbers.length > 0
        ? await this.getBlockTimestamps(allBlockNumbers)
        : new Map<number, number>()

    if (generation !== this.runGeneration) return false

    for (const event of surveyEvents) {
      if (!('args' in event)) continue
      this.store.surveyRegistered.push({
        surveyId: Number(event.args[0]),
        points: Number(event.args[1]),
        maxClaims: Number(event.args[2]),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: timestamps.get(event.blockNumber) ?? 0,
      })
    }

    for (const event of pointsEvents) {
      if (!('args' in event)) continue
      this.store.pointsAwarded.push({
        wallet: event.args[0],
        surveyId: Number(event.args[1]),
        points: Number(event.args[2]),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        timestamp: timestamps.get(event.blockNumber) ?? 0,
      })
    }

    for (const event of grantEvents) {
      if (!('args' in event)) continue
      this.store.roleChanges.push({
        type: 'grant',
        account: event.args[1],
        blockNumber: event.blockNumber,
        logIndex: event.index,
      })
    }

    for (const event of revokeEvents) {
      if (!('args' in event)) continue
      this.store.roleChanges.push({
        type: 'revoke',
        account: event.args[1],
        blockNumber: event.blockNumber,
        logIndex: event.index,
      })
    }

    this.store.lastSyncedBlock = toBlock
    this.save()
    return true
  }

  /** Returns true if the last successful sync is older than `staleMs`.
   * Used by request handlers to opportunistically refresh the cache when
   * Plesk/Passenger has paused the background interval between requests. */
  isStale(staleMs: number): boolean {
    return Date.now() - this.lastSuccessfulSyncAt > staleMs
  }

  /** Snapshot of internal sync state for /diag observability. Exposed so
   * operators can tell from the outside whether the background sync is
   * keeping up, hung, or erroring. */
  getSyncDebug(): {
    syncing: boolean
    lastSyncedBlock: number
    lastSuccessfulSyncAt: number
    lastSyncAgeSeconds: number | null
    lastSyncError: string | null
    syncStartedAt: number
    currentSyncAgeSeconds: number | null
  } {
    const now = Date.now()
    return {
      syncing: this.syncing,
      lastSyncedBlock: this.store.lastSyncedBlock,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
      lastSyncAgeSeconds: this.lastSuccessfulSyncAt
        ? Math.floor((now - this.lastSuccessfulSyncAt) / 1000)
        : null,
      lastSyncError: this.lastSyncError,
      syncStartedAt: this.syncStartedAt,
      currentSyncAgeSeconds: this.syncing ? Math.floor((now - this.syncStartedAt) / 1000) : null,
    }
  }

  getSurveyRegisteredEvents(): StoredSurveyEvent[] {
    return this.store.surveyRegistered
  }

  getPointsAwardedByWallet(wallet: string): StoredPointsEvent[] {
    const lower = wallet.toLowerCase()
    return this.store.pointsAwarded.filter((e) => e.wallet.toLowerCase() === lower)
  }

  getCurrentAdmins(): string[] {
    const adminSet = new Set<string>()
    const sorted = [...this.store.roleChanges].sort(
      (a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex,
    )
    for (const event of sorted) {
      if (event.type === 'grant') {
        adminSet.add(event.account)
      } else {
        adminSet.delete(event.account)
      }
    }
    return Array.from(adminSet)
  }

  getLastSyncedBlock(): number {
    return this.store.lastSyncedBlock
  }

  isReady(): boolean {
    return this.store.lastSyncedBlock > 0
  }

  async start(): Promise<void> {
    this.load()
    await this.sync()
    this.syncInterval = setInterval(() => void this.sync(), config.syncIntervalMs)
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }
}
