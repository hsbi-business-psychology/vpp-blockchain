/**
 * Unit tests for `services/json-file-event-store.ts` and the factory
 * `services/event-store.ts`.
 *
 * The global setup replaces the event-store module with an in-memory
 * mock; these tests un-mock it and exercise the real implementation
 * with a per-test temporary `data/events.json`.
 *
 * Coverage focuses on the four production failure modes the audit
 * (Bereich 4) flagged:
 *   - cold-start sync from contractDeployBlock
 *   - incremental sync that picks up only new blocks
 *   - syncing-lock + watchdog timeout (Plesk worker hang)
 *   - getCurrentAdmins() replay of grant / revoke events in block order
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.unmock('../src/services/event-store.js')
vi.unmock('../src/services/json-file-event-store.js')

const ADMIN_ROLE_HASH = '0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775'

// One shared mock surface for blockchain.ts. Each test reconfigures
// the individual vi.fn() handlers — much more predictable than
// vi.doMock() + vi.resetModules() acrobatics.
const mockBlockchain = {
  getBlockNumber: vi.fn(async () => 0 as number),
  getBlock: vi.fn(async (_n: number) => ({ timestamp: 1700000000 }) as { timestamp: number }),
  ADMIN_ROLE: vi.fn(async () => ADMIN_ROLE_HASH),
  queryFilterChunked: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
}

vi.mock('../src/services/blockchain.js', () => {
  const filters = {
    SurveyRegistered: () => 'SurveyRegistered',
    PointsAwarded: () => 'PointsAwarded',
    RoleGranted: (role: string) => `RoleGranted(${role})`,
    RoleRevoked: (role: string) => `RoleRevoked(${role})`,
  }
  return {
    provider: {
      getBlockNumber: (...a: unknown[]) => mockBlockchain.getBlockNumber(...(a as [])),
      getBlock: (n: number) => mockBlockchain.getBlock(n),
    },
    readOnlyContract: {
      ADMIN_ROLE: () => mockBlockchain.ADMIN_ROLE(),
      filters,
    },
    queryFilterChunked: (...a: unknown[]) => mockBlockchain.queryFilterChunked(...a),
  }
})

const SRC_FILE = fileURLToPath(new URL('../src/services/json-file-event-store.ts', import.meta.url))
const DATA_DIR = resolve(dirname(SRC_FILE), '../../data')
const STORE_PATH = resolve(DATA_DIR, 'events.json')

let backup: string | null = null

beforeEach(() => {
  backup = existsSync(STORE_PATH) ? readFileSync(STORE_PATH, 'utf-8') : null
  if (existsSync(STORE_PATH)) rmSync(STORE_PATH)

  // Reset all mock handlers back to a permissive default.
  mockBlockchain.getBlockNumber.mockReset().mockResolvedValue(0)
  mockBlockchain.getBlock.mockReset().mockResolvedValue({ timestamp: 1700000000 })
  mockBlockchain.ADMIN_ROLE.mockReset().mockResolvedValue(ADMIN_ROLE_HASH)
  mockBlockchain.queryFilterChunked.mockReset().mockResolvedValue([])
})

afterEach(() => {
  if (existsSync(STORE_PATH)) rmSync(STORE_PATH)
  if (backup !== null) writeFileSync(STORE_PATH, backup, { mode: 0o600 })
})

interface MockEvent {
  args: unknown[]
  blockNumber: number
  index: number
  transactionHash?: string
}

function configureChainMocks(opts: {
  blockNumber?: number
  surveyEvents?: MockEvent[]
  pointsEvents?: MockEvent[]
  grantEvents?: MockEvent[]
  revokeEvents?: MockEvent[]
}) {
  mockBlockchain.getBlockNumber.mockResolvedValue(opts.blockNumber ?? 100)
  mockBlockchain.queryFilterChunked.mockImplementation(
    async (_contract: unknown, filter: unknown, _from: number) => {
      const f = filter as string
      if (f === 'SurveyRegistered') return opts.surveyEvents ?? []
      if (f === 'PointsAwarded') return opts.pointsEvents ?? []
      if (f === `RoleGranted(${ADMIN_ROLE_HASH})`) return opts.grantEvents ?? []
      if (f === `RoleRevoked(${ADMIN_ROLE_HASH})`) return opts.revokeEvents ?? []
      return []
    },
  )
}

describe('JsonFileEventStore — cold start', () => {
  it('starts at block 0 with empty store when no events.json exists', async () => {
    configureChainMocks({ blockNumber: 50 })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()

    expect(store.getLastSyncedBlock()).toBe(0)
    expect(store.isReady()).toBe(false)
    expect(store.getSurveyRegisteredEvents()).toEqual([])
  })

  it('marks itself ready after the first successful sync', async () => {
    configureChainMocks({ blockNumber: 50 })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()

    await store.sync()

    expect(store.getLastSyncedBlock()).toBe(50)
    expect(store.isReady()).toBe(true)
  })

  it('persists events to disk via atomicWriteJson', async () => {
    configureChainMocks({
      blockNumber: 100,
      surveyEvents: [{ args: [1n, 5n, 100n], blockNumber: 50, index: 0, transactionHash: '0xaaa' }],
    })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()

    await store.sync()

    expect(existsSync(STORE_PATH)).toBe(true)
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
    expect(raw.lastSyncedBlock).toBe(100)
    expect(raw.surveyRegistered).toHaveLength(1)
    expect(raw.surveyRegistered[0]).toMatchObject({
      surveyId: 1,
      points: 5,
      maxClaims: 100,
      blockNumber: 50,
      txHash: '0xaaa',
    })
  })
})

describe('JsonFileEventStore — incremental sync', () => {
  it('reads existing events.json on construction (via load + start)', async () => {
    writeFileSync(
      STORE_PATH,
      JSON.stringify({
        lastSyncedBlock: 42,
        surveyRegistered: [
          {
            surveyId: 7,
            points: 1,
            maxClaims: 10,
            blockNumber: 30,
            txHash: '0xprev',
            timestamp: 0,
          },
        ],
        pointsAwarded: [],
        roleChanges: [],
      }),
      { mode: 0o600 },
    )
    configureChainMocks({ blockNumber: 42 }) // no new blocks
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    await store.start()
    store.stop()

    expect(store.getLastSyncedBlock()).toBe(42)
    expect(store.getSurveyRegisteredEvents()).toHaveLength(1)
    expect(store.getSurveyRegisteredEvents()[0].surveyId).toBe(7)
  })

  it('queries from lastSyncedBlock + 1 (not lastSyncedBlock)', async () => {
    writeFileSync(
      STORE_PATH,
      JSON.stringify({
        lastSyncedBlock: 100,
        surveyRegistered: [],
        pointsAwarded: [],
        roleChanges: [],
      }),
      { mode: 0o600 },
    )
    configureChainMocks({ blockNumber: 200 })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    store['load']() // private call to seed in-memory store from disk
    await store.sync()

    // Verify the query used fromBlock = 101, not 100.
    const callArgs = mockBlockchain.queryFilterChunked.mock.calls
    expect(callArgs.length).toBeGreaterThan(0)
    for (const call of callArgs) {
      expect(call[2]).toBe(101)
    }
  })

  it('returns early without query when fromBlock > latestBlock', async () => {
    writeFileSync(
      STORE_PATH,
      JSON.stringify({
        lastSyncedBlock: 200,
        surveyRegistered: [],
        pointsAwarded: [],
        roleChanges: [],
      }),
      { mode: 0o600 },
    )
    configureChainMocks({ blockNumber: 150 }) // chain "rolled back" / RPC behind cache
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    store['load']()
    await store.sync()

    expect(mockBlockchain.queryFilterChunked).not.toHaveBeenCalled()
    expect(store.getLastSyncedBlock()).toBe(200)
  })
})

describe('JsonFileEventStore — sync lock', () => {
  it('returns early if a sync is already in progress and not stale', async () => {
    configureChainMocks({ blockNumber: 50 })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()

    store['syncing'] = true
    store['syncStartedAt'] = Date.now()

    const before = store.getLastSyncedBlock()
    await store.sync()
    expect(store.getLastSyncedBlock()).toBe(before)
    expect(mockBlockchain.getBlockNumber).not.toHaveBeenCalled()
  })

  it('force-releases a stale sync lock and runs anyway', async () => {
    configureChainMocks({ blockNumber: 75 })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()

    store['syncing'] = true
    store['syncStartedAt'] = Date.now() - 60_000

    await store.sync()
    expect(store.getLastSyncedBlock()).toBe(75)
  })

  it('records the error message on getSyncDebug() when sync throws', async () => {
    mockBlockchain.getBlockNumber.mockRejectedValue(new Error('RPC unreachable'))
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    await store.sync()
    const debug = store.getSyncDebug()
    expect(debug.lastSyncError).toMatch(/RPC unreachable/)
  })
})

describe('JsonFileEventStore — admin role replay', () => {
  it('builds the current admin set from grant/revoke history in block order', async () => {
    configureChainMocks({
      blockNumber: 300,
      grantEvents: [
        { args: [ADMIN_ROLE_HASH, '0xAlice'], blockNumber: 100, index: 0 },
        { args: [ADMIN_ROLE_HASH, '0xBob'], blockNumber: 110, index: 0 },
        { args: [ADMIN_ROLE_HASH, '0xCarol'], blockNumber: 120, index: 0 },
      ],
      revokeEvents: [{ args: [ADMIN_ROLE_HASH, '0xBob'], blockNumber: 200, index: 0 }],
    })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    await store.sync()

    const admins = store.getCurrentAdmins()
    expect(admins).toContain('0xAlice')
    expect(admins).toContain('0xCarol')
    expect(admins).not.toContain('0xBob')
  })

  it('handles re-grant after revoke (Bob added back later)', async () => {
    configureChainMocks({
      blockNumber: 500,
      grantEvents: [
        { args: [ADMIN_ROLE_HASH, '0xBob'], blockNumber: 100, index: 0 },
        { args: [ADMIN_ROLE_HASH, '0xBob'], blockNumber: 300, index: 0 },
      ],
      revokeEvents: [{ args: [ADMIN_ROLE_HASH, '0xBob'], blockNumber: 200, index: 0 }],
    })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    await store.sync()
    expect(store.getCurrentAdmins()).toContain('0xBob')
  })

  it('respects logIndex when grant + revoke happen in same block', async () => {
    configureChainMocks({
      blockNumber: 100,
      grantEvents: [{ args: [ADMIN_ROLE_HASH, '0xX'], blockNumber: 50, index: 1 }],
      revokeEvents: [{ args: [ADMIN_ROLE_HASH, '0xX'], blockNumber: 50, index: 0 }],
    })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    await store.sync()
    // Revoke (index 0) ran first, grant (index 1) ran second → still admin.
    expect(store.getCurrentAdmins()).toContain('0xX')
  })
})

describe('JsonFileEventStore — wallet queries', () => {
  it('case-insensitive filter on wallet address', async () => {
    configureChainMocks({
      blockNumber: 100,
      pointsEvents: [
        {
          args: ['0xABCDEF0000000000000000000000000000000001', 1n, 1n],
          blockNumber: 50,
          index: 0,
          transactionHash: '0xt1',
        },
      ],
    })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    await store.sync()

    expect(
      store.getPointsAwardedByWallet('0xABCDEF0000000000000000000000000000000001'),
    ).toHaveLength(1)
    expect(
      store.getPointsAwardedByWallet('0xabcdef0000000000000000000000000000000001'),
    ).toHaveLength(1)
    expect(
      store.getPointsAwardedByWallet('0xdeadbeef00000000000000000000000000000000'),
    ).toHaveLength(0)
  })
})

describe('JsonFileEventStore — staleness + diagnostics', () => {
  it('reports stale when lastSuccessfulSyncAt is older than threshold', async () => {
    configureChainMocks({ blockNumber: 50 })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    await store.sync()

    store['lastSuccessfulSyncAt'] = Date.now() - 120_000
    expect(store.isStale(60_000)).toBe(true)
    expect(store.isStale(180_000)).toBe(false)
  })

  it('exposes getSyncDebug() with all critical operator fields', async () => {
    configureChainMocks({ blockNumber: 75 })
    const { JsonFileEventStore } = await import('../src/services/json-file-event-store.js')
    const store = new JsonFileEventStore()
    await store.sync()

    const debug = store.getSyncDebug()
    expect(debug).toMatchObject({
      syncing: false,
      lastSyncedBlock: 75,
      lastSyncError: null,
    })
    expect(debug.lastSuccessfulSyncAt).toBeGreaterThan(0)
    expect(debug.lastSyncAgeSeconds).toBeGreaterThanOrEqual(0)
  })
})

describe('event-store factory (services/event-store.ts)', () => {
  it('returns the same JsonFileEventStore instance on repeated calls', async () => {
    const { getEventStore } = await import('../src/services/event-store.js')
    const a = getEventStore()
    const b = getEventStore()
    expect(a).toBe(b)
  })
})
