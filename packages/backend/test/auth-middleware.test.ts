/**
 * Edge-case tests for `middleware/auth.ts` that the route-level
 * admin/wallet/survey suites don't reach. Coverage baseline showed
 * lines 55 (INVALID_MESSAGE — non-numeric timestamp), 67-73
 * (INVALID_TIMESTAMP — clock skew >60s in future), and 82-84
 * (RPC failure during isAdmin check) all uncovered.
 *
 * The production failure modes these guard against:
 *   - Frontend bug ships a message like "VPP Admin Auth foo" with no
 *     trailing timestamp → must return 400 INVALID_MESSAGE, not 500.
 *   - User's laptop clock is 5 min in the future → must return 400
 *     INVALID_TIMESTAMP with a hint about system time, not 401
 *     EXPIRED_MESSAGE which would mislead them into trying again.
 *   - Base RPC throws during isAdmin() → must propagate to errorHandler
 *     so the client sees 503 (RPC down), not 401 (you're not admin).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { ethers } from 'ethers'
import { requireAdminHandler } from '../src/middleware/auth.js'
import { errorHandler } from '../src/middleware/errorHandler.js'
import * as blockchain from '../src/services/blockchain.js'

// Bare app that exposes the middleware on a stub route so we can assert
// status + body without dragging in the full Express bootstrap.
function buildApp() {
  const app = express()
  app.use(express.json())
  app.post('/protected', requireAdminHandler, (_req, res) => {
    res.json({ ok: true })
  })
  app.use(errorHandler as express.ErrorRequestHandler)
  return app
}

const ADMIN_WALLET = new ethers.Wallet(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)

async function signAt(
  epochSeconds: number,
): Promise<{ adminMessage: string; adminSignature: string }> {
  const adminMessage = `VPP Admin Auth ${epochSeconds}`
  const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)
  return { adminMessage, adminSignature }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
})

describe('requireAdmin — missing credentials', () => {
  it('returns 401 UNAUTHORIZED when both signature and message are missing', async () => {
    const res = await request(buildApp()).post('/protected').send({})
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('returns 401 UNAUTHORIZED when only message is provided', async () => {
    const res = await request(buildApp()).post('/protected').send({ adminMessage: 'foo' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('returns 401 UNAUTHORIZED when only signature is provided', async () => {
    const res = await request(buildApp()).post('/protected').send({ adminSignature: '0xdeadbeef' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('accepts credentials via x-admin-* headers as fallback to body fields', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const { adminMessage, adminSignature } = await signAt(ts)
    const res = await request(buildApp())
      .post('/protected')
      .set('x-admin-signature', adminSignature)
      .set('x-admin-message', adminMessage)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('requireAdmin — invalid signatures', () => {
  it('returns 401 INVALID_SIGNATURE when signature bytes are garbage', async () => {
    const res = await request(buildApp())
      .post('/protected')
      .send({ adminSignature: '0xnotahexstring', adminMessage: 'foo 123' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('INVALID_SIGNATURE')
  })

  it('returns 401 INVALID_SIGNATURE when signature length is wrong', async () => {
    const res = await request(buildApp())
      .post('/protected')
      .send({
        adminSignature: '0x1234',
        adminMessage: `VPP Admin Auth ${Math.floor(Date.now() / 1000)}`,
      })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('INVALID_SIGNATURE')
  })
})

describe('requireAdmin — timestamp validation (audit gap: lines 55, 67-73)', () => {
  it('returns 400 INVALID_MESSAGE when message has no parseable trailing number', async () => {
    const adminMessage = 'VPP Admin Auth without a timestamp at all'
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    const res = await request(buildApp()).post('/protected').send({ adminMessage, adminSignature })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_MESSAGE')
  })

  it('returns 400 INVALID_MESSAGE when trailing token looks like ms (>=1e12)', async () => {
    // Frontend regression: someone shipped Date.now() instead of Math.floor(Date.now()/1000).
    const adminMessage = `VPP Admin Auth ${Date.now()}`
    const adminSignature = await ADMIN_WALLET.signMessage(adminMessage)

    const res = await request(buildApp()).post('/protected').send({ adminMessage, adminSignature })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_MESSAGE')
  })

  it('returns 400 EXPIRED_MESSAGE when timestamp is well in the past (>5 min)', async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600 // 10 min ago
    const { adminMessage, adminSignature } = await signAt(oldTs)

    const res = await request(buildApp()).post('/protected').send({ adminMessage, adminSignature })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('EXPIRED_MESSAGE')
    expect(res.body.message).toMatch(/expired/i)
  })

  it('returns 400 INVALID_TIMESTAMP when clock is skewed >60s into the future', async () => {
    const futureTs = Math.floor(Date.now() / 1000) + 120 // 2 min in future
    const { adminMessage, adminSignature } = await signAt(futureTs)

    const res = await request(buildApp()).post('/protected').send({ adminMessage, adminSignature })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_TIMESTAMP')
    expect(res.body.message).toMatch(/clock|system time/i)
  })

  it('accepts a timestamp that is in the future but within the 60s tolerance', async () => {
    const slightlyFutureTs = Math.floor(Date.now() / 1000) + 30 // 30s in future
    const { adminMessage, adminSignature } = await signAt(slightlyFutureTs)

    const res = await request(buildApp()).post('/protected').send({ adminMessage, adminSignature })

    expect(res.status).toBe(200)
  })
})

describe('requireAdmin — RPC failure path (audit gap: lines 82-84)', () => {
  it('forwards RPC errors to the error middleware (not 401)', async () => {
    vi.mocked(blockchain.isAdmin).mockRejectedValue(new Error('Base RPC unreachable'))
    const ts = Math.floor(Date.now() / 1000)
    const { adminMessage, adminSignature } = await signAt(ts)

    const res = await request(buildApp()).post('/protected').send({ adminMessage, adminSignature })

    // errorHandler returns 500 by default for plain Error; the key
    // assertion is that we did NOT get 401/403 (which would mislead
    // operators into thinking the wallet was rejected).
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(res.body.error).not.toBe('UNAUTHORIZED')
    expect(res.body.error).not.toBe('FORBIDDEN')
  })
})

describe('requireAdmin — non-admin wallet', () => {
  it('returns 403 FORBIDDEN when the recovered signer lacks ADMIN_ROLE', async () => {
    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)
    const ts = Math.floor(Date.now() / 1000)
    const { adminMessage, adminSignature } = await signAt(ts)

    const res = await request(buildApp()).post('/protected').send({ adminMessage, adminSignature })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
    expect(res.body.message).toMatch(/admin/i)
  })

  it('isAdmin is called with the EIP-191-recovered address (not body field)', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const { adminMessage, adminSignature } = await signAt(ts)

    await request(buildApp())
      .post('/protected')
      .send({ adminMessage, adminSignature, recoveredAddress: '0xdeadbeef' })

    expect(blockchain.isAdmin).toHaveBeenCalledTimes(1)
    expect(blockchain.isAdmin).toHaveBeenCalledWith(ADMIN_WALLET.address)
  })
})
