import rateLimit from 'express-rate-limit'
import { config } from '../config.js'

const isTest = process.env.NODE_ENV === 'test'

/** Strict limiter for the claim endpoint (default: 5 req/min per IP). */
export const claimLimiter = rateLimit({
  windowMs: config.claimRateLimit.windowMs,
  max: config.claimRateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  validate: { xForwardedForHeader: false },
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
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
  },
})
