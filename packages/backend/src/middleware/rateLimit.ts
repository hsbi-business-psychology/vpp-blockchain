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
 * Default: **100 req/min per source IP** (overridable via
 * `CLAIM_RATE_LIMIT_MAX` / `CLAIM_RATE_LIMIT_WINDOW_MS`). The previous
 * doc comment claimed "5 req/min" — that was never true; the actual
 * config default has always been 100. Fixed in M2-Mitigation / F6.6.
 *
 * NAT note for class test runs: HSBI eduroam (and most campus WLANs)
 * NATs all student devices behind a single public IP. With a class of
 * ~30 students each making 1-3 claim attempts during a survey, you stay
 * well under the 100/min budget. For larger cohorts (50+) or multiple
 * concurrent surveys on the same network, raise `CLAIM_RATE_LIMIT_MAX`
 * via env (e.g. 200) before the session — abuse defense ultimately
 * relies on the per-wallet HMAC nonce + on-chain uniqueness, not on
 * this IP-based limiter.
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
 * Default: **600 req/min per source IP** (overridable via
 * `API_RATE_LIMIT_MAX` / `API_RATE_LIMIT_WINDOW_MS`). The previous doc
 * comment said "100 req/min" — wrong, the env default is 600. Fixed in
 * M2-Mitigation / F6.6.
 *
 * The higher budget here is intentional: admin dashboards poll status
 * endpoints frequently (UI refresh) and a single browser tab can easily
 * burst >100 req/min during normal use. Still IP-keyed; for hardened
 * production we should add a dedicated `adminAuthFailureLimiter`
 * (10/min for invalid signatures) — tracked as F6.6 long-term backlog.
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
