/**
 * @module event-store
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
import { readOnlyContract, queryFilterChunked, provider } from './blockchain.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '../../data')
const STORE_PATH = resolve(DATA_DIR, 'events.json')

const SYNC_INTERVAL_MS = 60_000

export interface StoredSurveyEvent {
  surveyId: number
  points: number
  maxClaims: number
  blockNumber: number
  txHash: string
  timestamp: number
}

export interface StoredPointsEvent {
  wallet: string
  surveyId: number
  points: number
  blockNumber: number
  txHash: string
  timestamp: number
}

export interface StoredRoleEvent {
  type: 'grant' | 'revoke'
  account: string
  blockNumber: number
  logIndex: number
}

interface EventStoreData {
  lastSyncedBlock: number
  surveyRegistered: StoredSurveyEvent[]
  pointsAwarded: StoredPointsEvent[]
  roleChanges: StoredRoleEvent[]
}

let store: EventStoreData = {
  lastSyncedBlock: 0,
  surveyRegistered: [],
  pointsAwarded: [],
  roleChanges: [],
}

let syncing = false
let adminRoleHash: string | null = null
let syncInterval: ReturnType<typeof setInterval> | null = null

function load(): void {
  if (!existsSync(STORE_PATH)) return
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8')
    store = JSON.parse(raw)
  } catch {
    store = { lastSyncedBlock: 0, surveyRegistered: [], pointsAwarded: [], roleChanges: [] }
  }
}

function save(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

async function getAdminRoleHash(): Promise<string> {
  if (!adminRoleHash) {
    adminRoleHash = await readOnlyContract.ADMIN_ROLE()
  }
  return adminRoleHash!
}

async function getBlockTimestamps(blockNumbers: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(blockNumbers)]
  const map = new Map<number, number>()
  for (const bn of unique) {
    const block = await provider.getBlock(bn)
    map.set(bn, block?.timestamp ?? 0)
  }
  return map
}

export async function sync(): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const latestBlock = await provider.getBlockNumber()
    const fromBlock = store.lastSyncedBlock
      ? store.lastSyncedBlock + 1
      : config.contractDeployBlock || 0

    if (fromBlock > latestBlock) return

    const adminRole = await getAdminRoleHash()

    const [surveyEvents, pointsEvents, grantEvents, revokeEvents] = await Promise.all([
      queryFilterChunked(readOnlyContract, readOnlyContract.filters.SurveyRegistered(), fromBlock),
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
        ? await getBlockTimestamps(allBlockNumbers)
        : new Map<number, number>()

    for (const event of surveyEvents) {
      if (!('args' in event)) continue
      store.surveyRegistered.push({
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
      store.pointsAwarded.push({
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
      store.roleChanges.push({
        type: 'grant',
        account: event.args[1],
        blockNumber: event.blockNumber,
        logIndex: event.index,
      })
    }

    for (const event of revokeEvents) {
      if (!('args' in event)) continue
      store.roleChanges.push({
        type: 'revoke',
        account: event.args[1],
        blockNumber: event.blockNumber,
        logIndex: event.index,
      })
    }

    store.lastSyncedBlock = latestBlock
    save()
    console.log(
      `Event store synced to block ${latestBlock} (+${latestBlock - fromBlock + 1} blocks)`,
    )
  } catch (err) {
    console.error('Event store sync failed:', err)
  } finally {
    syncing = false
  }
}

export function getSurveyRegisteredEvents(): StoredSurveyEvent[] {
  return store.surveyRegistered
}

export function getPointsAwardedByWallet(wallet: string): StoredPointsEvent[] {
  const lower = wallet.toLowerCase()
  return store.pointsAwarded.filter((e) => e.wallet.toLowerCase() === lower)
}

export function getCurrentAdmins(): string[] {
  const adminSet = new Set<string>()
  const sorted = [...store.roleChanges].sort(
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

export function getLastSyncedBlock(): number {
  return store.lastSyncedBlock
}

/** Returns true when at least one full sync has completed. */
export function isReady(): boolean {
  return store.lastSyncedBlock > 0
}

export async function startEventStore(): Promise<void> {
  load()
  await sync()
  syncInterval = setInterval(() => void sync(), SYNC_INTERVAL_MS)
}

export function stopEventStore(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}
