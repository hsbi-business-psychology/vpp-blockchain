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
