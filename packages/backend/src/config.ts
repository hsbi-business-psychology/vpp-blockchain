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
  /**
   * Optional override for the RPC providers used by `eth_getLogs` /
   * `queryFilter`. When unset, the backend auto-detects Alchemy Free Tier
   * URLs in `RPC_URL` and excludes them from event sync (Alchemy Free caps
   * `eth_getLogs` to 10 blocks, which kills full-history sync). Operators
   * on Alchemy Growth/Scale should set this to their Alchemy URL to opt
   * back in. Comma-separated list, same format as RPC_URL.
   */
  eventRpcUrl: process.env.EVENT_RPC_URL || undefined,
  contractAddress: required('CONTRACT_ADDRESS'),
  minterPrivateKey: required('MINTER_PRIVATE_KEY'),

  contractDeployBlock: parseInt(optional('CONTRACT_DEPLOY_BLOCK', '0'), 10),

  explorerBaseUrl: optional('EXPLORER_BASE_URL', 'https://sepolia.basescan.org'),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),

  claimRateLimit: {
    windowMs: parseInt(optional('CLAIM_RATE_LIMIT_WINDOW_MS', '60000'), 10),
    max: parseInt(optional('CLAIM_RATE_LIMIT_MAX', '100'), 10),
  },

  apiRateLimit: {
    windowMs: parseInt(optional('API_RATE_LIMIT_WINDOW_MS', '60000'), 10),
    max: parseInt(optional('API_RATE_LIMIT_MAX', '600'), 10),
  },

  trustProxy: optional('TRUST_PROXY', 'false'),

  rateLimitStore: optional('RATE_LIMIT_STORE', 'memory') as 'memory' | 'redis',
  redisUrl: process.env.REDIS_URL || undefined,

  logLevel: optional('LOG_LEVEL', 'info'),

  /** Maximum age (in ms) of a signed claim message before it is rejected. */
  maxMessageAgeMs: parseInt(optional('MAX_MESSAGE_AGE_MS', '300000'), 10),

  /** Interval (in ms) between event store sync cycles. */
  syncIntervalMs: parseInt(optional('SYNC_INTERVAL_MS', '60000'), 10),

  /** TTL (in ms) for the in-memory survey cache. */
  cacheTtlMs: parseInt(optional('CACHE_TTL_MS', '30000'), 10),

  /** Block range per RPC query chunk (free-tier RPCs typically cap at 10,000). */
  chunkSize: parseInt(optional('CHUNK_SIZE', '9000'), 10),

  /**
   * Expected chain ID for the connected RPC.
   * Set to validate at startup (e.g. '84532' for Base Sepolia, '8453' for Base Mainnet).
   * Leave unset to skip validation.
   */
  expectedChainId: process.env.EXPECTED_CHAIN_ID || undefined,
} as const
