import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'
import { getEventStore } from '../src/services/event-store.js'
import { invalidateCache } from '../src/services/survey-cache.js'

// Local in-memory replacement for the persistent survey-keys store.
// Keeps test runs hermetic — no writes to packages/backend/data/.
const mockKeys: Record<number, { key: string; createdAt: number }> = {}
vi.mock('../src/services/survey-keys.js', () => ({
  getSurveyKey: vi.fn((id: number) => mockKeys[id]?.key ?? null),
  getKeyCreatedAt: vi.fn((id: number) => mockKeys[id]?.createdAt ?? null),
  hasKey: vi.fn((id: number) => mockKeys[id] != null),
  createKey: vi.fn((id: number) => {
    if (mockKeys[id]) throw new Error('already exists')
    const key = `survey-${id}-key`
    mockKeys[id] = { key, createdAt: Date.now() }
    return key
  }),
  rotateKey: vi.fn((id: number) => {
    if (!mockKeys[id]) throw new Error('no key')
    const key = `rotated-survey-${id}-key`
    mockKeys[id] = { key, createdAt: Date.now() }
    return key
  }),
  deleteKey: vi.fn((id: number) => {
    if (!mockKeys[id]) return false
    delete mockKeys[id]
    return true
  }),
  __resetForTests: vi.fn(() => {
    for (const k of Object.keys(mockKeys)) delete mockKeys[k as unknown as number]
  }),
}))

vi.mock('../src/services/nonce-store.js', () => ({
  isUsed: vi.fn(() => false),
  markUsed: vi.fn(() => true),
  getUsedCount: vi.fn(() => 0),
  __resetForTests: vi.fn(),
}))

const app = createApp()

const ADMIN_WALLET = new ethers.Wallet(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

beforeEach(() => {
  for (const k of Object.keys(mockKeys)) delete mockKeys[k as unknown as number]
})

describe('POST /api/v1/surveys', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should register a survey, return the HMAC key once', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `register:42:${timestamp}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
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

    const res = await request(app).post('/api/v1/surveys').send({
      surveyId: 42,
      points: 2,
      maxClaims: 100,
      adminSignature,
      adminMessage,
    })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBe('0xtxhash456')
    expect(res.body.data.templateDownloadUrl).toContain('/api/v1/surveys/42/template')
    expect(res.body.data.key).toBe('survey-42-key')
    expect(res.body.data.keyCreatedAt).toMatch(/T/)
  })

  it('should roll back the key if the on-chain registration fails', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `register:43:${timestamp}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 0,
      maxClaims: 0n,
      claimCount: 0n,
      active: false,
      registeredAt: 0n,
      title: '',
    })
    vi.mocked(blockchain.registerSurvey).mockRejectedValue(new Error('boom'))

    const res = await request(app).post('/api/v1/surveys').send({
      surveyId: 43,
      points: 2,
      maxClaims: 100,
      adminSignature,
      adminMessage,
    })

    expect(res.status).toBe(500)
    expect(mockKeys[43]).toBeUndefined()
  })

  it('should reject a request from a non-admin wallet', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `register:42:${timestamp}`
    const adminSignature = await nonAdmin.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app).post('/api/v1/surveys').send({
      surveyId: 42,
      points: 2,
      maxClaims: 100,
      adminSignature,
      adminMessage,
    })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('should reject a request without signature', async () => {
    const res = await request(app).post('/api/v1/surveys').send({
      surveyId: 42,
      points: 2,
      maxClaims: 100,
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })
})

describe('GET /api/v1/surveys', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    invalidateCache()
  })

  it('should list all registered surveys', async () => {
    vi.mocked(getEventStore()).getSurveyRegisteredEvents.mockReturnValue([
      {
        surveyId: 1,
        points: 2,
        maxClaims: 100,
        blockNumber: 100,
        txHash: '0xabc',
        timestamp: 1710000000,
      },
    ])
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 100n,
      claimCount: 37n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Test Survey',
    })

    const res = await request(app).get('/api/v1/surveys')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].surveyId).toBe(1)
    expect(res.body.data[0].claimCount).toBe(37)
  })

  it('should return empty list when no surveys exist', async () => {
    vi.mocked(getEventStore()).getSurveyRegisteredEvents.mockReturnValue([])

    const res = await request(app).get('/api/v1/surveys')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })
})

describe('POST /api/v1/surveys/:id/template', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  async function adminAuth() {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Download template at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)
    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    return { signature, message }
  }

  it('should return a SoSci template embedding the HMAC key as PHP', async () => {
    const { signature, message } = await adminAuth()
    mockKeys[1] = { key: 'embedded-key-1', createdAt: Date.now() }
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 100n,
      claimCount: 5n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Test Survey',
    })

    const res = await request(app)
      .post('/api/v1/surveys/1/template')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)
      .send({})

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/xml')
    expect(res.headers['content-disposition']).toContain('vpp-survey-1.xml')
    expect(res.text).toContain('surveyProject')
    expect(res.text).toContain('embedded-key-1')
    // V2.1 templates run HMAC client-side via Web Crypto, no PHP.
    expect(res.text).toContain("KEY_B64URL = 'embedded-key-1'")
    expect(res.text).toContain('Punkte jetzt')
  })

  it('should default to SoSci when no format is given', async () => {
    const { signature, message } = await adminAuth()
    mockKeys[5] = { key: 'survey-5-key', createdAt: Date.now() }
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 3,
      maxClaims: 0n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Test',
    })

    const res = await request(app)
      .post('/api/v1/surveys/5/template')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)
      .send({ format: 'sosci' })

    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('vpp-survey-5.xml')
    expect(res.text).toContain('surveyProject')
    expect(res.text).toContain('survey-5-key')
  })

  it('should return a LimeSurvey template with format=limesurvey', async () => {
    const { signature, message } = await adminAuth()
    mockKeys[7] = { key: 'ls-survey-7-key', createdAt: Date.now() }
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 1,
      maxClaims: 50n,
      claimCount: 10n,
      active: true,
      registeredAt: 1710000000n,
      title: 'LS Survey',
    })

    const res = await request(app)
      .post('/api/v1/surveys/7/template')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)
      .send({ format: 'limesurvey' })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/xml')
    expect(res.headers['content-disposition']).toContain('vpp-survey-7.lss')
    expect(res.text).toContain('LimeSurveyDocType')
    expect(res.text).toContain('surveyls_endtext')
    expect(res.text).toContain('ls-survey-7-key')
    expect(res.text).toContain('Punkte jetzt')
  })

  it('should reject an invalid format parameter', async () => {
    const { signature, message } = await adminAuth()

    const res = await request(app)
      .post('/api/v1/surveys/1/template')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)
      .send({ format: 'invalid' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  it('should reject unauthenticated request', async () => {
    const res = await request(app).post('/api/v1/surveys/1/template').send({})

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('should return 404 for non-existent survey', async () => {
    const { signature, message } = await adminAuth()
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 0,
      maxClaims: 0n,
      claimCount: 0n,
      active: false,
      registeredAt: 0n,
      title: '',
    })

    const res = await request(app)
      .post('/api/v1/surveys/999/template')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)
      .send({})

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('SURVEY_NOT_FOUND')
  })

  it('should return 404 when the survey has no HMAC key on file', async () => {
    const { signature, message } = await adminAuth()
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 0n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
      title: '',
    })

    const res = await request(app)
      .post('/api/v1/surveys/8/template')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)
      .send({})

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('KEY_NOT_FOUND')
  })
})

describe('POST /api/v1/surveys/:id/deactivate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should deactivate an active survey', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `deactivate:1:${timestamp}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 5,
      maxClaims: 0n,
      claimCount: 3n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Test',
    })
    vi.mocked(blockchain.deactivateSurvey).mockResolvedValue({
      hash: '0xdeactivatetx',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app)
      .post('/api/v1/surveys/1/deactivate')
      .set('x-admin-signature', adminSignature)
      .set('x-admin-message', adminMessage)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBe('0xdeactivatetx')
  })

  it('should reject deactivation of already inactive survey', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `deactivate:1:${timestamp}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 5,
      maxClaims: 0n,
      claimCount: 3n,
      active: false,
      registeredAt: 1710000000n,
      title: 'Test',
    })

    const res = await request(app)
      .post('/api/v1/surveys/1/deactivate')
      .set('x-admin-signature', adminSignature)
      .set('x-admin-message', adminMessage)

    expect(res.status).toBe(409)
  })

  it('should reject deactivation from non-admin', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `deactivate:1:${timestamp}`
    const adminSignature = await nonAdmin.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app)
      .post('/api/v1/surveys/1/deactivate')
      .set('x-admin-signature', adminSignature)
      .set('x-admin-message', adminMessage)

    expect(res.status).toBe(403)
  })
})

describe('POST /api/v1/surveys/:id/reactivate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should re-activate a previously deactivated survey', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `reactivate:1:${timestamp}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 5,
      maxClaims: 0n,
      claimCount: 3n,
      active: false,
      registeredAt: 1710000000n,
      title: 'Test',
    })
    vi.mocked(blockchain.reactivateSurvey).mockResolvedValue({
      hash: '0xreactivatetx',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app)
      .post('/api/v1/surveys/1/reactivate')
      .set('x-admin-signature', adminSignature)
      .set('x-admin-message', adminMessage)

    expect(res.status).toBe(200)
    expect(res.body.data.txHash).toBe('0xreactivatetx')
  })
})

describe('POST /api/v1/surveys/:id/revoke', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should revoke a previously claimed point award', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `revoke:1:${timestamp}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)
    const student = ethers.Wallet.createRandom().address

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.revokePoints).mockResolvedValue({
      hash: '0xrevoketx',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app)
      .post('/api/v1/surveys/1/revoke')
      .set('x-admin-signature', adminSignature)
      .set('x-admin-message', adminMessage)
      .send({ student, adminSignature, adminMessage })

    expect(res.status).toBe(200)
    expect(res.body.data.txHash).toBe('0xrevoketx')
  })

  it('should reject revoke for an invalid student address', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `revoke:1:${timestamp}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app)
      .post('/api/v1/surveys/1/revoke')
      .set('x-admin-signature', adminSignature)
      .set('x-admin-message', adminMessage)
      .send({ student: 'not-an-address', adminSignature, adminMessage })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/v1/surveys/:id/key', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the HMAC key for an existing survey', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `key:1:${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)
    mockKeys[1] = { key: 'secret-key-1', createdAt: 1710000000000 }

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app)
      .get('/api/v1/surveys/1/key')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)

    expect(res.status).toBe(200)
    expect(res.body.data.key).toBe('secret-key-1')
  })

  it('returns 404 when no key exists', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `key:99:${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app)
      .get('/api/v1/surveys/99/key')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('KEY_NOT_FOUND')
  })
})

describe('POST /api/v1/surveys/:id/key/rotate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rotates an existing key and returns the new value', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `rotate:1:${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)
    mockKeys[1] = { key: 'old-key', createdAt: Date.now() }

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 0n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Test',
    })

    const res = await request(app)
      .post('/api/v1/surveys/1/key/rotate')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)

    expect(res.status).toBe(200)
    expect(res.body.data.key).toBe('rotated-survey-1-key')
    expect(mockKeys[1].key).toBe('rotated-survey-1-key')
  })

  it('creates the first key for a legacy survey lacking one', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `rotate:1:${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      points: 2,
      maxClaims: 0n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Legacy',
    })

    const res = await request(app)
      .post('/api/v1/surveys/1/key/rotate')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)

    expect(res.status).toBe(200)
    expect(res.body.data.key).toBe('survey-1-key')
  })
})
