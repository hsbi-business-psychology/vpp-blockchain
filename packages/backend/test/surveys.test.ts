import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'

const app = createApp()

const ADMIN_WALLET = new ethers.Wallet(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

describe('POST /api/surveys', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should register a survey with valid admin signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `register:42:${timestamp}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.ZeroHash,
      points: 0,
      maxClaims: 0n,
      claimCount: 0n,
      active: false,
      registeredAt: 0n,
      title: '',
    })
    vi.mocked(blockchain.registerSurvey).mockResolvedValue({
      hash: '0xtxhash456',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app)
      .post('/api/surveys')
      .send({
        surveyId: 42,
        secret: 'VPP-secret-42',
        points: 2,
        maxClaims: 100,
        adminSignature,
        adminMessage,
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBe('0xtxhash456')
    expect(res.body.data.templateDownloadUrl).toContain('/api/surveys/42/template')
  })

  it('should reject a request from a non-admin wallet', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `register:42:${timestamp}`
    const adminSignature = await nonAdmin.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app)
      .post('/api/surveys')
      .send({
        surveyId: 42,
        secret: 'VPP-secret-42',
        points: 2,
        maxClaims: 100,
        adminSignature,
        adminMessage,
      })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('should reject a request without signature', async () => {
    const res = await request(app)
      .post('/api/surveys')
      .send({
        surveyId: 42,
        secret: 'VPP-secret-42',
        points: 2,
        maxClaims: 100,
      })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })
})

describe('GET /api/surveys', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should list all registered surveys', async () => {
    vi.mocked(blockchain.getSurveyRegisteredEvents).mockResolvedValue([
      {
        surveyId: 1,
        points: 2,
        maxClaims: 100,
        blockNumber: 100,
        transactionHash: '0xabc',
        timestamp: 1710000000,
      },
    ])
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.ZeroHash,
      points: 2,
      maxClaims: 100n,
      claimCount: 37n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Test Survey',
    })

    const res = await request(app).get('/api/surveys')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].surveyId).toBe(1)
    expect(res.body.data[0].claimCount).toBe(37)
  })

  it('should return empty list when no surveys exist', async () => {
    vi.mocked(blockchain.getSurveyRegisteredEvents).mockResolvedValue([])

    const res = await request(app).get('/api/surveys')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })
})
