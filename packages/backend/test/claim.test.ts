import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'

const app = createApp()

const TEST_WALLET = ethers.Wallet.createRandom()

function createSignedClaim(surveyId: number, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const message = `claim:${surveyId}:${secret}:${timestamp}`
  return { message, timestamp }
}

describe('POST /api/claim', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should successfully claim points', async () => {
    const { message } = createSignedClaim(1, 'test-secret')
    const signature = await TEST_WALLET.signMessage(message)

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.keccak256(ethers.toUtf8Bytes('test-secret')),
      points: 2,
      maxClaims: 100n,
      claimCount: 5n,
      active: true,
      registeredAt: 1710000000n,
    })
    vi.mocked(blockchain.hasClaimed).mockResolvedValue(false)
    vi.mocked(blockchain.awardPoints).mockResolvedValue({
      hash: '0xtxhash123',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app)
      .post('/api/claim')
      .send({
        walletAddress: TEST_WALLET.address,
        surveyId: 1,
        secret: 'test-secret',
        signature,
        message,
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBe('0xtxhash123')
    expect(res.body.data.points).toBe(2)
    expect(res.body.data.explorerUrl).toContain('0xtxhash123')
  })

  it('should reject an invalid signature', async () => {
    const { message } = createSignedClaim(1, 'test-secret')
    const otherWallet = ethers.Wallet.createRandom()
    const signature = await otherWallet.signMessage(message)

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.keccak256(ethers.toUtf8Bytes('test-secret')),
      points: 2,
      maxClaims: 100n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
    })

    const res = await request(app)
      .post('/api/claim')
      .send({
        walletAddress: TEST_WALLET.address,
        surveyId: 1,
        secret: 'test-secret',
        signature,
        message,
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_SIGNATURE')
  })

  it('should reject a double claim', async () => {
    const { message } = createSignedClaim(1, 'test-secret')
    const signature = await TEST_WALLET.signMessage(message)

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.keccak256(ethers.toUtf8Bytes('test-secret')),
      points: 2,
      maxClaims: 100n,
      claimCount: 1n,
      active: true,
      registeredAt: 1710000000n,
    })
    vi.mocked(blockchain.hasClaimed).mockResolvedValue(true)

    const res = await request(app)
      .post('/api/claim')
      .send({
        walletAddress: TEST_WALLET.address,
        surveyId: 1,
        secret: 'test-secret',
        signature,
        message,
      })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_CLAIMED')
  })

  it('should reject a non-existent survey', async () => {
    const { message } = createSignedClaim(999, 'test-secret')
    const signature = await TEST_WALLET.signMessage(message)

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.ZeroHash,
      points: 0,
      maxClaims: 0n,
      claimCount: 0n,
      active: false,
      registeredAt: 0n,
    })

    const res = await request(app)
      .post('/api/claim')
      .send({
        walletAddress: TEST_WALLET.address,
        surveyId: 999,
        secret: 'test-secret',
        signature,
        message,
      })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('SURVEY_NOT_FOUND')
  })

  it('should reject an expired message', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600 // 10 min ago
    const message = `claim:1:test-secret:${oldTimestamp}`
    const signature = await TEST_WALLET.signMessage(message)

    const res = await request(app)
      .post('/api/claim')
      .send({
        walletAddress: TEST_WALLET.address,
        surveyId: 1,
        secret: 'test-secret',
        signature,
        message,
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('EXPIRED_MESSAGE')
  })

  it('should reject a request with missing fields', async () => {
    const res = await request(app)
      .post('/api/claim')
      .send({ walletAddress: TEST_WALLET.address })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  it('should reject an inactive survey', async () => {
    const { message } = createSignedClaim(1, 'test-secret')
    const signature = await TEST_WALLET.signMessage(message)

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.keccak256(ethers.toUtf8Bytes('test-secret')),
      points: 2,
      maxClaims: 100n,
      claimCount: 0n,
      active: false,
      registeredAt: 1710000000n,
    })

    const res = await request(app)
      .post('/api/claim')
      .send({
        walletAddress: TEST_WALLET.address,
        surveyId: 1,
        secret: 'test-secret',
        signature,
        message,
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('SURVEY_INACTIVE')
  })
})
