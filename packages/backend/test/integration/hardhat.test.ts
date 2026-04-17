/**
 * End-to-end integration tests against a real Hardhat node running
 * SurveyPointsV2 (UUPS proxy).
 *
 * Prerequisites (both from packages/contracts/):
 *   1. npx hardhat node
 *   2. npx hardhat run scripts/deploy-v2-local.ts --network localhost
 *
 * Run:
 *   pnpm --filter @vpp/backend test:integration
 *
 * The deploy-v2-local script seeds 5 surveys (no on-chain secrets) and
 * pre-claims surveys 1-4 for the student wallet. This test
 *   - verifies health + survey listing,
 *   - registers a *new* survey via the backend API (which generates the
 *     HMAC key on the spot and registers it on-chain),
 *   - claims that survey using the V2 HMAC flow (nonce + token),
 *   - verifies the cumulative point total.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import type { Express } from 'express'
import { issueToken } from '../../src/services/hmac.js'

const ADMIN_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const STUDENT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

const adminWallet = new ethers.Wallet(ADMIN_KEY)
const studentWallet = new ethers.Wallet(STUDENT_KEY)

let app: Express

async function adminAuth(text: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const message = `${text} ${timestamp}`
  const signature = await adminWallet.signMessage(message)
  return { signature, message }
}

function freshNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')
}

beforeAll(async () => {
  const { createApp } = await import('../../src/server.js')
  app = createApp()

  const { getEventStore } = await import('../../src/services/event-store.js')
  const store = getEventStore()
  await store.start()
})

afterAll(async () => {
  const { getEventStore } = await import('../../src/services/event-store.js')
  getEventStore().stop()
})

describe('integration: health', () => {
  it('GET /api/v1/health/live should return ok', async () => {
    const res = await request(app).get('/api/v1/health/live')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('GET /api/v1/health/ready should confirm blockchain and event store', async () => {
    const res = await request(app).get('/api/v1/health/ready')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.blockchain.connected).toBe(true)
    expect(res.body.eventStore.ready).toBe(true)
  })
})

describe('integration: surveys', () => {
  it('GET /api/v1/surveys should return the seeded surveys', async () => {
    const res = await request(app).get('/api/v1/surveys')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(5)
  })
})

describe('integration: full HMAC claim flow', () => {
  // surveyId 100 is fresh — the backend creates the HMAC key and
  // registers it on-chain in this test, then the student claims it.
  const SURVEY_ID = 100
  let issuedKey: string

  it('POST /api/v1/surveys registers a new survey + returns the HMAC key', async () => {
    const { signature, message } = await adminAuth(`Register survey ${SURVEY_ID}`)

    const res = await request(app).post('/api/v1/surveys').send({
      surveyId: SURVEY_ID,
      points: 2,
      maxClaims: 0,
      title: 'Integration Test Survey',
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.data.key).toBe('string')
    expect(res.body.data.key).toMatch(/^[A-Za-z0-9_-]+$/)
    issuedKey = res.body.data.key
  })

  it('POST /api/v1/claim awards points using the HMAC token', async () => {
    expect(issuedKey).toBeDefined()
    const nonce = freshNonce()
    const token = issueToken({ surveyId: SURVEY_ID, nonce, key: issuedKey })

    const timestamp = Math.floor(Date.now() / 1000)
    const message = `claim:${SURVEY_ID}:${nonce}:${timestamp}`
    const signature = await studentWallet.signMessage(message)

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: studentWallet.address,
      surveyId: SURVEY_ID,
      nonce,
      token,
      signature,
      message,
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBeDefined()
    expect(res.body.data.points).toBe(2)
  })

  it('POST /api/v1/claim refuses to redeem the same nonce twice', async () => {
    expect(issuedKey).toBeDefined()
    const nonce = freshNonce()
    const token = issueToken({ surveyId: SURVEY_ID, nonce, key: issuedKey })

    const timestamp = Math.floor(Date.now() / 1000)
    const message = `claim:${SURVEY_ID}:${nonce}:${timestamp}`
    // Fresh wallet so we are not blocked by ALREADY_CLAIMED first.
    const otherStudent = ethers.Wallet.createRandom()
    const signature = await otherStudent.signMessage(message)

    const ok = await request(app).post('/api/v1/claim').send({
      walletAddress: otherStudent.address,
      surveyId: SURVEY_ID,
      nonce,
      token,
      signature,
      message,
    })
    expect(ok.status).toBe(200)

    // Second redeem of the same (surveyId, nonce) must fail with 409
    // NONCE_USED, *not* with a generic on-chain revert.
    const yetAnother = ethers.Wallet.createRandom()
    const sig2 = await yetAnother.signMessage(message)
    const replay = await request(app).post('/api/v1/claim').send({
      walletAddress: yetAnother.address,
      surveyId: SURVEY_ID,
      nonce,
      token,
      signature: sig2,
      message,
    })
    expect(replay.status).toBe(409)
    expect(replay.body.error).toBe('NONCE_USED')
  })
})

describe('integration: points', () => {
  it('GET /api/v1/points/:wallet should reflect the seeded + new claim', async () => {
    const res = await request(app).get(`/api/v1/points/${studentWallet.address}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // 4 seeded claims (2+1+3+1=7) + 1 from our claim test (2) = 9
    expect(res.body.data.totalPoints).toBe(9)
  })
})

describe('integration: status', () => {
  it('GET /api/v1/status should return system info for admin', async () => {
    const { signature, message } = await adminAuth('System status')

    const res = await request(app)
      .get('/api/v1/status')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.minterAddress).toBe(adminWallet.address)
    expect(res.body.data.balance).toBeDefined()
    expect(res.body.data.blockchain.network).toBeDefined()
  })
})
