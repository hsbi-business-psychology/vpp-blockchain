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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
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
  private adminRoleHash: string | null = null
  private syncInterval: ReturnType<typeof setInterval> | null = null

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
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true })
    }
    writeFileSync(STORE_PATH, JSON.stringify(this.store, null, 2))
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

  async sync(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
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
    } finally {
      this.syncing = false
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
