import rateLimit, { type Store } from 'express-rate-limit'
import { config } from '../config.js'

const isTest = process.env.NODE_ENV === 'test'

async function createStore(): Promise<Store | undefined> {
  if (config.rateLimitStore === 'redis' && config.redisUrl) {
    const { RedisStore } = await import('rate-limit-redis')
    const ioredis = await import('ioredis')
    // @ts-expect-error -- ioredis ESM default export lacks construct signature in types
    const client = new ioredis.default(config.redisUrl!)
    return new RedisStore({
      sendCommand: (...args: string[]) => client.call(args[0], ...args.slice(1)) as Promise<string>,
    })
  }
  return undefined
}

const store = await createStore()

/**
 * Strict limiter for the claim endpoint.
 *
 * Default: **500 req/min per source IP** (overridable via
 * `CLAIM_RATE_LIMIT_MAX` / `CLAIM_RATE_LIMIT_WINDOW_MS`). Sized for
 * a 100-student class behind a single NAT IP (HSBI eduroam, lecture
 * hall WiFi). See `config.claimRateLimit` JSDoc for the sizing math.
 *
 * Real abuse defence is the per-survey HMAC nonce + on-chain
 * `_claimed` guard, not this IP-based limiter.
 */
export const claimLimiter = rateLimit({
  windowMs: config.claimRateLimit.windowMs,
  max: config.claimRateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  validate: { xForwardedForHeader: false },
  ...(store && { store }),
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many claim requests. Please try again later.',
  },
})

/**
 * General API limiter for non-claim routes (admin/wallet/survey reads).
 *
 * Default: **2000 req/min per source IP** (overridable via
 * `API_RATE_LIMIT_MAX` / `API_RATE_LIMIT_WINDOW_MS`). Sized for a
 * 100-student class behind a single NAT IP plus admin dashboard
 * polling. See `config.apiRateLimit` JSDoc for the sizing math.
 *
 * Still IP-keyed; for hardened production we should add a dedicated
 * `adminAuthFailureLimiter` (10/min for invalid signatures) — tracked
 * as F6.6 long-term backlog.
 */
export const apiLimiter = rateLimit({
  windowMs: config.apiRateLimit.windowMs,
  max: config.apiRateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  validate: { xForwardedForHeader: false },
  ...(store && { store }),
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
  },
})
