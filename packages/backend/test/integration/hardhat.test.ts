/**
 * End-to-end integration tests against a real Hardhat node.
 *
 * Prerequisites (both from packages/contracts/):
 *   1. npx hardhat node
 *   2. npx hardhat run scripts/deploy-local.ts --network localhost
 *
 * Run:
 *   pnpm --filter @vpp/backend test:integration
 *
 * The deploy-local script seeds 5 surveys and claims surveys 1-4 for
 * the student wallet. Survey #5 (secret: "test-secret-epsilon") is
 * left unclaimed for testing the claim flow.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import type { Express } from 'express'

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

beforeAll(async () => {
  // Dynamic import so env vars from setup.ts are applied first
  const { createApp } = await import('../../src/server.js')
  app = createApp()

  // Give the event store time to sync from the local chain
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

describe('integration: claim', () => {
  it('POST /api/v1/claim should award points for unclaimed survey #5', async () => {
    const surveyId = 5
    const secret = 'test-secret-epsilon'
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `claim:${surveyId}:${secret}:${timestamp}`
    const signature = await studentWallet.signMessage(message)

    const res = await request(app).post('/api/v1/claim').send({
      walletAddress: studentWallet.address,
      surveyId,
      secret,
      signature,
      message,
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBeDefined()
    expect(res.body.data.points).toBe(2)
  })
})

describe('integration: points', () => {
  it('GET /api/v1/points/:wallet should return accumulated points', async () => {
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
