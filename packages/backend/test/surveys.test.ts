import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'
import * as eventStore from '../src/services/event-store.js'
import { invalidateCache } from '../src/services/survey-cache.js'

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

    const res = await request(app).post('/api/surveys').send({
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

    const res = await request(app).post('/api/surveys').send({
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
    const res = await request(app).post('/api/surveys').send({
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
    invalidateCache()
  })

  it('should list all registered surveys', async () => {
    vi.mocked(eventStore.getSurveyRegisteredEvents).mockReturnValue([
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
    vi.mocked(eventStore.getSurveyRegisteredEvents).mockReturnValue([])

    const res = await request(app).get('/api/surveys')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })
})

describe('GET /api/surveys/:id/template', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return a SoSci template by default', async () => {
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.ZeroHash,
      points: 2,
      maxClaims: 100n,
      claimCount: 5n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Test Survey',
    })

    const res = await request(app).get('/api/surveys/1/template?secret=vpp-test-secret')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/xml')
    expect(res.headers['content-disposition']).toContain('vpp-survey-1.xml')
    expect(res.text).toContain('surveyProject')
    expect(res.text).toContain('vpp-test-secret')
    expect(res.text).toContain('Punkte jetzt')
  })

  it('should return a SoSci template with format=sosci', async () => {
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.ZeroHash,
      points: 3,
      maxClaims: 0n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Test',
    })

    const res = await request(app).get('/api/surveys/5/template?secret=my-secret&format=sosci')

    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('vpp-survey-5.xml')
    expect(res.text).toContain('surveyProject')
    expect(res.text).toContain('my-secret')
  })

  it('should return a LimeSurvey template with format=limesurvey', async () => {
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.ZeroHash,
      points: 1,
      maxClaims: 50n,
      claimCount: 10n,
      active: true,
      registeredAt: 1710000000n,
      title: 'LS Survey',
    })

    const res = await request(app).get('/api/surveys/7/template?secret=ls-secret&format=limesurvey')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/xml')
    expect(res.headers['content-disposition']).toContain('vpp-survey-7.lss')
    expect(res.text).toContain('LimeSurveyDocType')
    expect(res.text).toContain('surveyls_endtext')
    expect(res.text).toContain('ls-secret')
    expect(res.text).toContain('Punkte jetzt')
  })

  it('should reject an invalid format parameter', async () => {
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.ZeroHash,
      points: 2,
      maxClaims: 0n,
      claimCount: 0n,
      active: true,
      registeredAt: 1710000000n,
      title: 'Test',
    })

    const res = await request(app).get('/api/surveys/1/template?secret=test&format=invalid')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_FORMAT')
  })

  it('should reject without secret parameter', async () => {
    const res = await request(app).get('/api/surveys/1/template')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('MISSING_SECRET')
  })

  it('should return 404 for non-existent survey', async () => {
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.ZeroHash,
      points: 0,
      maxClaims: 0n,
      claimCount: 0n,
      active: false,
      registeredAt: 0n,
      title: '',
    })

    const res = await request(app).get('/api/surveys/999/template?secret=test')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('SURVEY_NOT_FOUND')
  })
})

describe('POST /api/surveys/:id/deactivate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should deactivate an active survey', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const adminMessage = `deactivate:1:${timestamp}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
      secretHash: ethers.ZeroHash,
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
      .post('/api/surveys/1/deactivate')
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
      secretHash: ethers.ZeroHash,
      points: 5,
      maxClaims: 0n,
      claimCount: 3n,
      active: false,
      registeredAt: 1710000000n,
      title: 'Test',
    })

    const res = await request(app)
      .post('/api/surveys/1/deactivate')
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
      .post('/api/surveys/1/deactivate')
      .set('x-admin-signature', adminSignature)
      .set('x-admin-message', adminMessage)

    expect(res.status).toBe(403)
  })
})
