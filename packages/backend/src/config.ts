/**
 * @module config
 *
 * Loads and validates all environment variables at startup.
 * Required variables throw immediately if missing so the server
 * fails fast rather than crashing later on the first request.
 *
 * @see .env.development   – local defaults (Hardhat node)
 * @see .env.production.example – template for Plesk / production
 */
import 'dotenv/config'

function required(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),

  rpcUrl: required('RPC_URL'),
  contractAddress: required('CONTRACT_ADDRESS'),
  minterPrivateKey: required('MINTER_PRIVATE_KEY'),

  contractDeployBlock: parseInt(optional('CONTRACT_DEPLOY_BLOCK', '0'), 10),

  explorerBaseUrl: optional('EXPLORER_BASE_URL', 'https://sepolia.basescan.org'),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),

  claimRateLimit: {
    windowMs: parseInt(optional('CLAIM_RATE_LIMIT_WINDOW_MS', '60000'), 10),
    max: parseInt(optional('CLAIM_RATE_LIMIT_MAX', '5'), 10),
  },

  apiRateLimit: {
    windowMs: parseInt(optional('API_RATE_LIMIT_WINDOW_MS', '60000'), 10),
    max: parseInt(optional('API_RATE_LIMIT_MAX', '100'), 10),
  },

  trustProxy: optional('TRUST_PROXY', 'false'),

  rateLimitStore: optional('RATE_LIMIT_STORE', 'memory') as 'memory' | 'redis',
  redisUrl: process.env.REDIS_URL || undefined,

  logLevel: optional('LOG_LEVEL', 'info'),

  /** Maximum age (in ms) of a signed claim message before it is rejected. */
  maxMessageAgeMs: 5 * 60 * 1000,
} as const
