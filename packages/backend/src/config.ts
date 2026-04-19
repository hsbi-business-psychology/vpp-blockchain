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

/**
 * Validate that a string looks like a 32-byte (64-hex) Ethereum private key.
 *
 * Throws a generic error message that does **not** include the value itself,
 * because in the past (see audit M1 / probe.mjs) we have leaked the live
 * minter PK by letting ethers.js bubble the failing value up through the
 * unhandled-error envelope. Pino redact already covers `err.value` /
 * `err.argument`, but defense in depth: we also catch malformed keys here
 * before they ever reach `new Wallet(...)`.
 *
 * Accepts both `0x`-prefixed and bare hex.
 */
export function validatePrivateKey(key: string, name: string): string {
  const trimmed = key.trim()
  const hex = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed
  if (hex.length !== 64) {
    throw new Error(
      `Invalid ${name}: expected a 32-byte hex string (64 hex characters, optional 0x prefix); got length ${hex.length}.`,
    )
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      `Invalid ${name}: contains non-hex characters. Expected 64 hex characters (0-9, a-f, A-F).`,
    )
  }
  if (/^0+$/.test(hex)) {
    throw new Error(`Invalid ${name}: zero key is not a valid Ethereum private key.`)
  }
  return `0x${hex.toLowerCase()}`
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
  minterPrivateKey: validatePrivateKey(required('MINTER_PRIVATE_KEY'), 'MINTER_PRIVATE_KEY'),

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

  /**
   * Maximum age (in ms) of a signed claim or admin message before it is
   * rejected.
   *
   * Default: 60_000 ms (60 s). This was lowered from 300_000 ms (5 min) as
   * part of audit M2 mitigation: the value defines how long an attacker who
   * intercepts a signed message has to replay it against a different
   * backend instance (or before the server-side nonce store has flushed).
   * 60 s is comfortable for a clock-synced participant clicking "Sign &
   * Submit" in the wallet popup, but too short for a manual MITM relay.
   *
   * Audit ref: F6.11, M2-Mitigation, AUDIT-LOG.md.
   */
  maxMessageAgeMs: parseInt(optional('MAX_MESSAGE_AGE_MS', '60000'), 10),

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
