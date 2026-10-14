import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp } from '../src/server.js'
import { __resetActionSignaturesForTests } from '../src/middleware/auth.js'
import * as blockchain from '../src/services/blockchain.js'
import { __resetForTests as resetSessions } from '../src/services/admin-session.js'
import { __resetRoleCacheForTests } from '../src/middleware/auth.js'

const app = createApp()
const ADMIN = ethers.Wallet.createRandom()
const OUTSIDER = ethers.Wallet.createRandom()
const TARGET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const SECRET_FILE = resolve(__dirname, '../data/session-secret.json')

async function challengeFor(address: string): Promise<string> {
  const res = await request(app).get('/api/v1/auth/challenge').query({ address })
  expect(res.status).toBe(200)
  return res.body.data.message as string
}

async function login(wallet: ethers.HDNodeWallet = ADMIN) {
  const message = await challengeFor(wallet.address)
  const signature = await wallet.signMessage(message)
  return request(app).post('/api/v1/auth/login').send({ message, signature })
}

function cookieOf(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[]
  return header[0].split(';')[0]
}

function activeSurvey() {
  vi.mocked(blockchain.getSurveyInfo).mockResolvedValue({
    points: 1,
    maxClaims: 0n,
    claimCount: 0n,
    active: true,
    registeredAt: 1710000000n,
    title: '',
  })
  vi.mocked(blockchain.deactivateSurvey).mockResolvedValue({
    hash: '0xdeactivated',
  } as unknown as ethers.TransactionReceipt)
}

beforeEach(() => {
  vi.restoreAllMocks()
  resetSessions()
  __resetRoleCacheForTests()
  vi.mocked(blockchain.isAdmin).mockImplementation(
    async (address: string) => address.toLowerCase() === ADMIN.address.toLowerCase(),
  )
})

afterAll(() => {
  if (existsSync(SECRET_FILE)) rmSync(SECRET_FILE)
})

beforeEach(() => {
  __resetActionSignaturesForTests()
})

describe('admin sign-in', () => {
  it('hands out a Sign-In-with-Ethereum message for this site', async () => {
    const message = await challengeFor(ADMIN.address)

    expect(message.split('\n')[0]).toBe(
      'localhost:5173 wants you to sign in with your Ethereum account:',
    )
    expect(message.split('\n')[1]).toBe(ADMIN.address)
    expect(message).toContain('URI: http://localhost:5173')
    expect(message).toMatch(/\nNonce: [0-9a-f]{50}\n/)
  })

  it('sets an HttpOnly, SameSite=Strict session cookie for an admin', async () => {
    const res = await login()

    expect(res.status).toBe(200)
    expect(res.body.data.address).toBe(ADMIN.address)
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]
    expect(cookie).toMatch(/^vpp_admin=/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/api')
  })

  it('refuses a wallet without the admin role', async () => {
    const res = await login(OUTSIDER)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('refuses a message that was changed after it was issued', async () => {
    const message = (await challengeFor(ADMIN.address)).replace('8 Stunden', '800 Stunden')
    const signature = await ADMIN.signMessage(message)

    const res = await request(app).post('/api/v1/auth/login').send({ message, signature })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('INVALID_LOGIN')
  })

  it('refuses a challenge signed by another wallet', async () => {
    const message = await challengeFor(ADMIN.address)
    const signature = await OUTSIDER.signMessage(message)

    const res = await request(app).post('/api/v1/auth/login').send({ message, signature })

    expect(res.status).toBe(401)
  })

  it('accepts each challenge only once', async () => {
    const message = await challengeFor(ADMIN.address)
    const signature = await ADMIN.signMessage(message)

    const first = await request(app).post('/api/v1/auth/login').send({ message, signature })
    const replay = await request(app).post('/api/v1/auth/login').send({ message, signature })

    expect(first.status).toBe(200)
    expect(replay.status).toBe(401)
  })

  it('refuses a challenge older than five minutes', async () => {
    const message = await challengeFor(ADMIN.address)
    const signature = await ADMIN.signMessage(message)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 60_000)

    const res = await request(app).post('/api/v1/auth/login').send({ message, signature })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('EXPIRED_LOGIN')
  })
})

describe('admin session cookie', () => {
  it('answers null without a session instead of an error', async () => {
    const res = await request(app).get('/api/v1/auth/session')

    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })

  it('reports the session', async () => {
    const cookie = cookieOf(await login())

    const res = await request(app).get('/api/v1/auth/session').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.data.address).toBe(ADMIN.address)
  })

  it('authorises an admin action without a further signature', async () => {
    const cookie = cookieOf(await login())
    activeSurvey()

    const res = await request(app)
      .post('/api/v1/surveys/7/deactivate')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')

    expect(res.status).toBe(200)
    expect(res.body.data.txHash).toBe('0xdeactivated')
  })

  it('refuses a write from a foreign origin', async () => {
    const cookie = cookieOf(await login())
    activeSurvey()

    const res = await request(app)
      .post('/api/v1/surveys/7/deactivate')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('BAD_ORIGIN')
    expect(blockchain.deactivateSurvey).not.toHaveBeenCalled()
  })

  it('ignores a forged cookie', async () => {
    const forged = `vpp_admin=${ADMIN.address.toLowerCase()}.9999999999.${'0'.repeat(64)}`

    const res = await request(app).get('/api/v1/auth/session').set('Cookie', forged)

    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })

  it('stops working once the admin role is revoked', async () => {
    const cookie = cookieOf(await login())
    __resetRoleCacheForTests()
    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app).get('/api/v1/auth/session').set('Cookie', cookie)

    expect(res.body.data).toBeNull()
  })

  it('ends when the secret file is replaced', async () => {
    const cookie = cookieOf(await login())
    rmSync(SECRET_FILE)

    const res = await request(app).get('/api/v1/auth/session').set('Cookie', cookie)

    expect(res.body.data).toBeNull()
  })

  it('treats a cookie with odd characters as no session', async () => {
    const res = await request(app)
      .get('/api/v1/auth/session')
      .set('Cookie', `vpp_admin=${ADMIN.address.toLowerCase()}.9999999999.${'ä'.repeat(64)}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })

  it('refuses a logout from another site', async () => {
    const res = await request(app).post('/api/v1/auth/logout').set('Origin', 'https://evil.example')

    expect(res.status).toBe(403)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('is cleared by logout', async () => {
    const res = await request(app).post('/api/v1/auth/logout')

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]
    expect(cookie).toMatch(/^vpp_admin=;/)
    expect(cookie).toContain('Max-Age=0')
  })
})

describe('role changes', () => {
  it('need their own signature even with a session', async () => {
    const cookie = cookieOf(await login())

    const res = await request(app)
      .post('/api/v1/admin/add')
      .set('Cookie', cookie)
      .send({ address: TARGET })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('SIGNATURE_REQUIRED')
  })

  it('refuse a signature made for something else', async () => {
    const adminMessage = `Admin login ${ADMIN.address} at ${Math.floor(Date.now() / 1000)}`
    const adminSignature = await ADMIN.signMessage(adminMessage)

    const res = await request(app)
      .post('/api/v1/admin/add')
      .send({ address: TARGET, adminSignature, adminMessage })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('ACTION_MISMATCH')
  })

  it('go through with a signature naming the action and target', async () => {
    const adminMessage = `Add admin ${TARGET} by ${ADMIN.address} at ${Math.floor(Date.now() / 1000)}`
    const adminSignature = await ADMIN.signMessage(adminMessage)
    vi.mocked(blockchain.addAdmin).mockResolvedValue({
      hash: '0xadded',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app)
      .post('/api/v1/admin/add')
      .send({ address: TARGET, adminSignature, adminMessage })

    expect(res.status).toBe(201)
    expect(res.body.data.txHash).toBe('0xadded')
  })
})
