import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'
import { issueToken } from '../src/services/hmac.js'

// Local mocks for the per-survey HMAC key store and the consumed-nonce
// set. Both modules persist to disk in production; for route tests we
// substitute in-memory implementations so suites can run in parallel
// without touching packages/backend/data/.
const mockKeyStore: Record<number, string> = {}
vi.mock('../src/services/survey-keys.js', () => ({
  getSurveyKey: vi.fn((id: number) => mockKeyStore[id] ?? null),
  getKeyCreatedAt: vi.fn(() => Date.now()),
  hasKey: vi.fn((id: number) => id in mockKeyStore),
  createKey: vi.fn((id: number) => {
    if (mockKeyStore[id]) throw new Error('exists')
    mockKeyStore[id] = `test-key-${id}`
    return mockKeyStore[id]
  }),
  rotateKey: vi.fn((id: number) => {
    mockKeyStore[id] = `rotated-${id}-${Date.now()}`
    return mockKeyStore[id]
  }),
  deleteKey: vi.fn((id: number) => {
    if (!mockKeyStore[id]) return false
    delete mockKeyStore[id]
    return true
  }),
  __resetForTests: vi.fn(() => {
    for (const k of Object.keys(mockKeyStore)) delete mockKeyStore[k as unknown as number]
  }),
}))

const usedNonces = new Set<string>()
vi.mock('../src/services/nonce-store.js', () => ({
  isUsed: vi.fn((id: number, nonce: string) => usedNonces.has(`${id}:${nonce}`)),
  markUsed: vi.fn((id: number, nonce: string) => {
    const k = `${id}:${nonce}`
    if (usedNonces.has(k)) return false
    usedNonces.add(k)
    return true
  }),
  getUsedCount: vi.fn(() => usedNonces.size),
  __resetForTests: vi.fn(() => usedNonces.clear()),
}))

// Use a constant test key (32 random bytes, base64url) so issueToken in
// the test file produces a token the real verifyToken (running inside
// the route) accepts.
const TEST_KEY = Buffer.from(new Uint8Array(32).fill(0x42)).toString('base64url')

const app = createApp()
const TEST_WALLET = ethers.Wallet.createRandom()

function freshNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')
}

function buildClaim(surveyId: number, nonce: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const message = `claim:${surveyId}:${nonce}:${timestamp}`
  return { message, timestamp }
}

describe('POST /api/v1/claim', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    for (const k of Object.keys(mockKeyStore)) delete mockKeyStore[k as unknown as number]
    usedNonces.clear()
    mockKeyStore[1] = TEST_KEY
    mockKeyStore[5] = TEST_KEY
  })

  it('should successfully claim points', async () => {
    const nonce = freshNonce()
    const { message } = buildClaim(1, nonce)
    const signature = await TEST_WALLET.signMessage(message)
    const token = issueToken({ surveyId: 1, nonce, key: TEST_KEY })

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 100n,
      claimCount: 5n,
      active: true,
      registeredAt: 1710000000n,
      title: '',
    })
    vi.mocked(blockchain.hasClaimed).mockResolvedValue(false)
    vi.mocked(blockchain.awardPoints).mockResolvedValue({
      hash: '0xtxhash123',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 1,
      nonce,
      token,
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
    const nonce = freshNonce()
    const { message } = buildClaim(1, nonce)
    const otherWallet = ethers.Wallet.createRandom()
    const signature = await otherWallet.signMessage(message)
    const token = issueToken({ surveyId: 1, nonce, key: TEST_KEY })

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 1,
      nonce,
      token,
      signature,
      message,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_SIGNATURE')
  })

  it('should reject a tampered HMAC token', async () => {
    const nonce = freshNonce()
    const { message } = buildClaim(1, nonce)
    const signature = await TEST_WALLET.signMessage(message)
    // Token signed with a different key — verifyToken must reject.
    const wrongKey = Buffer.from(new Uint8Array(32).fill(0xff)).toString('base64url')
    const badToken = issueToken({ surveyId: 1, nonce, key: wrongKey })

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 100n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
      title: '',
    })

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 1,
      nonce,
      token: badToken,
      signature,
      message,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_TOKEN')
  })

  it('should reject a nonce that has already been used', async () => {
    const nonce = freshNonce()
    const { message } = buildClaim(1, nonce)
    const signature = await TEST_WALLET.signMessage(message)
    const token = issueToken({ surveyId: 1, nonce, key: TEST_KEY })

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 100n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
      title: '',
    })
    vi.mocked(blockchain.hasClaimed).mockResolvedValue(false)
    usedNonces.add(`1:${nonce}`)

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 1,
      nonce,
      token,
      signature,
      message,
    })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('NONCE_USED')
  })

  it('should reject a double claim (wallet already claimed on-chain)', async () => {
    const nonce = freshNonce()
    const { message } = buildClaim(1, nonce)
    const signature = await TEST_WALLET.signMessage(message)
    const token = issueToken({ surveyId: 1, nonce, key: TEST_KEY })

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 100n,
      claimCount: 1n,
      active: true,
      registeredAt: 1710000000n,
      title: '',
    })
    vi.mocked(blockchain.hasClaimed).mockResolvedValue(true)

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 1,
      nonce,
      token,
      signature,
      message,
    })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_CLAIMED')
  })

  it('should reject a non-existent survey', async () => {
    const nonce = freshNonce()
    const { message } = buildClaim(999, nonce)
    const signature = await TEST_WALLET.signMessage(message)
    const token = issueToken({ surveyId: 999, nonce, key: TEST_KEY })
    mockKeyStore[999] = TEST_KEY

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 0,
      maxClaims: 0n,
      claimCount: 0n,
      active: false,
      registeredAt: 0n,
      title: '',
    })

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 999,
      nonce,
      token,
      signature,
      message,
    })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('SURVEY_NOT_FOUND')
  })

  it('should reject an expired message', async () => {
    const nonce = freshNonce()
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600 // 10 min ago
    const message = `claim:1:${nonce}:${oldTimestamp}`
    const signature = await TEST_WALLET.signMessage(message)
    const token = issueToken({ surveyId: 1, nonce, key: TEST_KEY })

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 1,
      nonce,
      token,
      signature,
      message,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('EXPIRED_MESSAGE')
  })

  it('should reject a request with missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/claim')
      .send({ walletAddress: TEST_WALLET.address })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  it('should reject an inactive survey with 410', async () => {
    const nonce = freshNonce()
    const { message } = buildClaim(1, nonce)
    const signature = await TEST_WALLET.signMessage(message)
    const token = issueToken({ surveyId: 1, nonce, key: TEST_KEY })

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 100n,
      claimCount: 0n,
      active: false,
      registeredAt: 1710000000n,
      title: '',
    })

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 1,
      nonce,
      token,
      signature,
      message,
    })

    expect(res.status).toBe(410)
    expect(res.body.error).toBe('SURVEY_INACTIVE')
  })

  it('should reject malformed nonce shape', async () => {
    const nonce = 'short' // less than 16 chars
    const { message } = buildClaim(1, nonce)
    const signature = await TEST_WALLET.signMessage(message)
    const token = issueToken({ surveyId: 1, nonce: 'a'.repeat(20), key: TEST_KEY })

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 1,
      nonce,
      token,
      signature,
      message,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_NONCE_FORMAT')
  })

  it('should surface CONFIG_ERROR when the survey has no key on file', async () => {
    const nonce = freshNonce()
    const { message } = buildClaim(7, nonce)
    const signature = await TEST_WALLET.signMessage(message)
    const token = issueToken({ surveyId: 7, nonce, key: TEST_KEY })

    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 0n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
      title: '',
    })

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: TEST_WALLET.address,
      surveyId: 7,
      nonce,
      token,
      signature,
      message,
    })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('CONFIG_ERROR')
  })
})
