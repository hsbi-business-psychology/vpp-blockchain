import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'
import { getEventStore } from '../src/services/event-store.js'

const app = createApp()

describe('GET /api/v1/health (legacy alias)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return ok when blockchain is connected and event store is ready', async () => {
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(12345)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    vi.mocked(getEventStore()).isReady.mockReturnValue(true)
    vi.mocked(getEventStore()).getLastSyncedBlock.mockReturnValue(12340)

    const res = await request(app).get('/api/v1/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.blockchain.connected).toBe(true)
    expect(res.body.blockchain.blockNumber).toBe(12345)
    expect(res.body.blockchain.network).toBe('base-sepolia')
    expect(res.body.eventStore.ready).toBe(true)
    expect(res.body.uptime).toBeTypeOf('number')
  })

  it('should return degraded when blockchain is unreachable', async () => {
    vi.mocked(blockchain.getBlockNumber).mockRejectedValue(new Error('connection failed'))
    vi.mocked(blockchain.getNetwork).mockRejectedValue(new Error('connection failed'))

    const res = await request(app).get('/api/v1/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
    expect(res.body.blockchain.connected).toBe(false)
  })
})

describe('GET /api/v1/health/live', () => {
  it('should always return 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health/live')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.uptime).toBeTypeOf('number')
  })
})

describe('GET /api/v1/health/ready', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return ok when blockchain connected and event store ready', async () => {
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(99999)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    vi.mocked(getEventStore()).isReady.mockReturnValue(true)
    vi.mocked(getEventStore()).getLastSyncedBlock.mockReturnValue(99990)

    const res = await request(app).get('/api/v1/health/ready')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.blockchain.connected).toBe(true)
    expect(res.body.eventStore.ready).toBe(true)
    expect(res.body.eventStore.lastSyncedBlock).toBe(99990)
  })

  it('should return degraded when blockchain is unreachable', async () => {
    vi.mocked(blockchain.getBlockNumber).mockRejectedValue(new Error('timeout'))
    vi.mocked(blockchain.getNetwork).mockRejectedValue(new Error('timeout'))
    vi.mocked(getEventStore()).isReady.mockReturnValue(true)

    const res = await request(app).get('/api/v1/health/ready')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
    expect(res.body.blockchain.connected).toBe(false)
  })

  it('should return degraded when event store is not ready', async () => {
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(12345)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    vi.mocked(getEventStore()).isReady.mockReturnValue(false)
    vi.mocked(getEventStore()).getLastSyncedBlock.mockReturnValue(0)

    const res = await request(app).get('/api/v1/health/ready')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
    expect(res.body.blockchain.connected).toBe(true)
    expect(res.body.eventStore.ready).toBe(false)
  })

  it('triggers an opportunistic sync when the event store is stale (Plesk pause guard)', async () => {
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(12345)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    const store = vi.mocked(getEventStore())
    store.isReady.mockReturnValue(true)
    store.getLastSyncedBlock.mockReturnValue(12340)
    store.isStale.mockReturnValue(true)
    store.sync.mockResolvedValue(undefined)

    const res = await request(app).get('/api/v1/health/ready')

    expect(res.status).toBe(200)
    expect(store.isStale).toHaveBeenCalledWith(60_000)
    expect(store.sync).toHaveBeenCalledTimes(1)
  })

  it('does NOT trigger sync when the store is fresh', async () => {
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(12345)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    const store = vi.mocked(getEventStore())
    store.isReady.mockReturnValue(true)
    store.getLastSyncedBlock.mockReturnValue(12340)
    store.isStale.mockReturnValue(false)

    await request(app).get('/api/v1/health/ready')

    expect(store.sync).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/health/diag (operator diagnostic)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(blockchain.getEffectiveRpcUrls).mockReturnValue([
      'http://localhost:8545',
      'https://base.drpc.org',
    ])
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
    fetchSpy = null
  })

  function mockFetchOk(chainId = '0x2105') {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: chainId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }

  it('probes the configured RPC and returns chainId on success', async () => {
    mockFetchOk('0x2105') // Base mainnet
    const res = await request(app).get('/api/v1/health/diag')

    expect(res.status).toBe(200)
    expect(res.body.uptime).toBeTypeOf('number')
    expect(res.body.rpc.configured).toBeGreaterThan(0)
    expect(res.body.rpc.anyOk).toBe(true)
    expect(res.body.rpc.configuredProbes[0]).toMatchObject({
      ok: true,
      chainId: '0x2105',
      httpStatus: 200,
    })
    expect(res.body.rpc.configuredProbes[0].host).toBe('localhost:8545')
  })

  it('reports anyOk=false when every probe fails', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    const res = await request(app).get('/api/v1/health/diag')

    expect(res.status).toBe(200) // /diag never 503s — operator needs the data
    expect(res.body.rpc.anyOk).toBe(false)
    expect(res.body.rpc.configuredProbes[0]).toMatchObject({
      ok: false,
    })
    expect(res.body.rpc.configuredProbes[0].error).toMatch(/network down/)
  })

  it('handles JSON-RPC error responses (no result, has error)', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'method not allowed' } }),
          { status: 200 },
        ),
      )
    const res = await request(app).get('/api/v1/health/diag')

    expect(res.body.rpc.anyOk).toBe(false)
    expect(res.body.rpc.configuredProbes[0].error).toMatch(/method not allowed/)
  })

  it('separates operator-configured probes from public fallback probes', async () => {
    mockFetchOk()
    vi.mocked(blockchain.getEffectiveRpcUrls).mockReturnValue([
      'http://localhost:8545', // matches configured
      'https://base.drpc.org',
      'https://1rpc.io',
    ])

    const res = await request(app).get('/api/v1/health/diag')

    expect(res.body.rpc.configured).toBe(1)
    expect(res.body.rpc.fallbacks).toBe(2)
    expect(res.body.rpc.configuredProbes).toHaveLength(1)
    expect(res.body.rpc.fallbackProbes).toHaveLength(2)
  })

  it('exposes contract address and explorer base URL for operator copy/paste', async () => {
    mockFetchOk()
    const res = await request(app).get('/api/v1/health/diag')
    expect(res.body.contractAddress).toBeTruthy()
    expect(res.body.contractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(res.body.explorerBaseUrl).toMatch(/^https?:/)
  })

  it('includes event-store sync diagnostics when available', async () => {
    mockFetchOk()
    const store = vi.mocked(getEventStore())
    // Simulate the production JsonFileEventStore exposing getSyncDebug.
    ;(store as unknown as { getSyncDebug: () => unknown }).getSyncDebug = () => ({
      syncing: false,
      lastSyncedBlock: 12345,
      lastSuccessfulSyncAt: Date.now(),
      lastSyncAgeSeconds: 5,
      lastSyncError: null,
    })

    const res = await request(app).get('/api/v1/health/diag')
    expect(res.body.eventStore).toMatchObject({
      syncing: false,
      lastSyncedBlock: 12345,
    })

    delete (store as unknown as { getSyncDebug?: unknown }).getSyncDebug
  })
})
