import rateLimit, { type Store } from 'express-rate-limit'
import { config } from '../config.js'

const isTest = process.env.NODE_ENV === 'test'

function createStore(): Store | undefined {
  if (config.rateLimitStore === 'redis' && config.redisUrl) {
    // Dynamic import at module level is not possible with conditional logic,
    // so we lazily require the Redis store. The packages are optional
    // dependencies that only need to be installed when RATE_LIMIT_STORE=redis.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RedisStore } = require('rate-limit-redis') as typeof import('rate-limit-redis')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: Redis } = require('ioredis') as typeof import('ioredis')

    const client = new Redis(config.redisUrl)
    return new RedisStore({
      sendCommand: (...args: string[]) => client.call(...args) as Promise<unknown>,
    })
  }
  return undefined
}

const store = createStore()

/** Strict limiter for the claim endpoint (default: 5 req/min per IP). */
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

/** General API limiter (default: 100 req/min per IP). */
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
