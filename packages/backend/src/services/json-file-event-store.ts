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
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { atomicWriteJson } from '../lib/atomic-write.js'
import { logger } from '../lib/logger.js'
import { readOnlyContract, queryFilterChunked, provider } from './blockchain.js'
import type { EventStore } from './event-store.interface.js'
import type { EventStoreData, StoredSurveyEvent, StoredPointsEvent } from './event-store.types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '../../data')
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
    for (const bn of unique) {
      const block = await provider.getBlock(bn)
      map.set(bn, block?.timestamp ?? 0)
    }
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
    try {
      await Promise.race([
        this.runSync(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`sync watchdog (>${JsonFileEventStore.SYNC_TIMEOUT_MS}ms)`)),
            JsonFileEventStore.SYNC_TIMEOUT_MS,
          ),
        ),
      ])
      this.lastSuccessfulSyncAt = Date.now()
      this.lastSyncError = null
    } catch (err) {
      this.lastSyncError = err instanceof Error ? err.message : String(err)
      logger.error({ err }, 'Event store sync failed (watchdog)')
    } finally {
      this.syncing = false
    }
  }

  private async runSync(): Promise<void> {
    try {
      const latestBlock = await provider.getBlockNumber()
      const fromBlock = this.store.lastSyncedBlock
        ? this.store.lastSyncedBlock + 1
        : config.contractDeployBlock || 0

      if (fromBlock > latestBlock) return

      const adminRole = await this.getAdminRoleHash()

      const [surveyEvents, pointsEvents, grantEvents, revokeEvents] = await Promise.all([
        queryFilterChunked(
          readOnlyContract,
          readOnlyContract.filters.SurveyRegistered(),
          fromBlock,
        ),
        queryFilterChunked(readOnlyContract, readOnlyContract.filters.PointsAwarded(), fromBlock),
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

      const allBlockNumbers = [
        ...surveyEvents.map((e) => e.blockNumber),
        ...pointsEvents.map((e) => e.blockNumber),
      ]
      const timestamps =
        allBlockNumbers.length > 0
          ? await this.getBlockTimestamps(allBlockNumbers)
          : new Map<number, number>()

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

      this.store.lastSyncedBlock = latestBlock
      this.save()
      logger.info(
        { block: latestBlock, newBlocks: latestBlock - fromBlock + 1 },
        'Event store synced',
      )
    } catch (err) {
      logger.error({ err }, 'Event store sync failed')
      throw err
    }
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
