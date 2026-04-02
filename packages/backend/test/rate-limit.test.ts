import { describe, it, expect } from 'vitest'
import express from 'express'
import rateLimit from 'express-rate-limit'
import request from 'supertest'

/**
 * The production rate limiter skips in test mode (skip: () => isTest).
 * These tests verify the actual rate-limiting behaviour by creating
 * a standalone Express app with a fresh limiter (no skip, low max).
 */
function createRateLimitedApp(max: number) {
  const app = express()
  app.use(
    rateLimit({
      windowMs: 60_000,
      max,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many requests.',
      },
    }),
  )
  app.get('/test', (_req, res) => res.json({ ok: true }))
  return app
}

describe('rate limiting behaviour', () => {
  it('should allow requests within the limit', async () => {
    const app = createRateLimitedApp(3)

    const res = await request(app).get('/test')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('should return 429 when limit is exceeded', async () => {
    const app = createRateLimitedApp(2)

    await request(app).get('/test')
    await request(app).get('/test')
    const res = await request(app).get('/test')

    expect(res.status).toBe(429)
    expect(res.body.error).toBe('RATE_LIMITED')
  })

  it('should include RateLimit-Policy header (draft-7)', async () => {
    const app = createRateLimitedApp(5)

    const res = await request(app).get('/test')

    expect(res.headers['ratelimit-policy']).toContain('5')
    expect(res.headers['ratelimit']).toBeDefined()
  })

  it('should track remaining requests until blocked', async () => {
    const app = createRateLimitedApp(3)

    const res1 = await request(app).get('/test')
    expect(res1.status).toBe(200)

    const res2 = await request(app).get('/test')
    expect(res2.status).toBe(200)

    const res3 = await request(app).get('/test')
    expect(res3.status).toBe(200)

    const res4 = await request(app).get('/test')
    expect(res4.status).toBe(429)
    expect(res4.body.error).toBe('RATE_LIMITED')
  })
})
