import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'

const app = createApp()

describe('GET /api/v1/health', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return ok when blockchain is connected', async () => {
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(12345)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')

    const res = await request(app).get('/api/v1/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.blockchain.connected).toBe(true)
    expect(res.body.blockchain.blockNumber).toBe(12345)
    expect(res.body.blockchain.network).toBe('base-sepolia')
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
