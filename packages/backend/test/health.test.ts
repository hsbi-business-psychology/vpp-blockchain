import { describe, it, expect, vi, beforeEach } from 'vitest'
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
})
