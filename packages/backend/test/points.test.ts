import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'
import * as eventStore from '../src/services/event-store.js'

const app = createApp()

describe('GET /api/points/:wallet', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return points for a valid wallet', async () => {
    vi.mocked(blockchain.getTotalPoints).mockResolvedValue(5)
    vi.mocked(eventStore.getPointsAwardedByWallet).mockReturnValue([
      {
        wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        surveyId: 1,
        points: 2,
        blockNumber: 100,
        txHash: '0xabc123',
        timestamp: 1710000000,
      },
      {
        wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        surveyId: 2,
        points: 3,
        blockNumber: 200,
        txHash: '0xdef456',
        timestamp: 1710100000,
      },
    ])

    const res = await request(app).get('/api/points/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.totalPoints).toBe(5)
    expect(res.body.data.surveys).toHaveLength(2)
    expect(res.body.data.surveys[0].surveyId).toBe(1)
    expect(res.body.data.surveys[0].txHash).toBe('0xabc123')
  })

  it('should return 400 for an invalid address', async () => {
    const res = await request(app).get('/api/points/not-an-address')

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('INVALID_ADDRESS')
  })

  it('should return 0 points for a wallet with no claims', async () => {
    vi.mocked(blockchain.getTotalPoints).mockResolvedValue(0)
    vi.mocked(eventStore.getPointsAwardedByWallet).mockReturnValue([])

    const res = await request(app).get('/api/points/0x70997970C51812dc3A010C7d01b50e0d17dc79C8')

    expect(res.status).toBe(200)
    expect(res.body.data.totalPoints).toBe(0)
    expect(res.body.data.surveys).toHaveLength(0)
  })
})
