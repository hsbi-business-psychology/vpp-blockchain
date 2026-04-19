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

  /**
   * Per-IP rate limits (audit F6.6 / M2-Mitigation).
   *
   * **Defaults sized for a 100-student class behind a single NAT IP**
   * (HSBI eduroam, lecture-hall WiFi, etc.). With every student device
   * funnelled through one public IP, the limiter must accommodate the
   * worst-case "everyone clicks Submit at the end of the survey
   * minute" burst plus retries on flaky MetaMask popups.
   *
   * Sizing math for the claim limit (default 500/min):
   *   - 100 students × 1 successful claim   = 100 req/min worst case
   *   - + ~30 % retry overhead              ≈ 130 req/min
   *   - + admin parallel monitoring         + 50 req/min
   *   - safety buffer × 3                   → 500 req/min
   *
   * Sizing math for the general API limit (default 2000/min):
   *   - 100 students × 5-10 page-load
   *     reads (survey/wallet/status)        ≈ 750 req/min
   *   - + admin dashboard polling           + several hundred req/min
   *   - safety buffer × ~2                  → 2000 req/min
   *
   * Real abuse defence is the per-survey HMAC nonce (single use,
   * see `services/nonce-store.ts`) and the on-chain `_claimed` guard,
   * NOT this IP-based limiter — the limiter only protects against
   * accidental hammering and trivial DoS, never against a determined
   * attacker who can rotate IPs.
   *
   * Operators who run smaller cohorts can lower the env values; the
   * defaults intentionally err on the generous side to avoid blocking
   * legitimate students mid-class.
   */
  claimRateLimit: {
    windowMs: parseInt(optional('CLAIM_RATE_LIMIT_WINDOW_MS', '60000'), 10),
    max: parseInt(optional('CLAIM_RATE_LIMIT_MAX', '500'), 10),
  },

  apiRateLimit: {
    windowMs: parseInt(optional('API_RATE_LIMIT_WINDOW_MS', '60000'), 10),
    max: parseInt(optional('API_RATE_LIMIT_MAX', '2000'), 10),
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

  /**
   * Minimum minter wallet balance (ETH) before write paths refuse new
   * transactions and return 503 INSUFFICIENT_FUNDS.
   *
   * **Default 0.002 ETH — sized for Base mainnet**, where typical
   * baseFee is 0.01-0.1 gwei and one `awardPoints` tx costs about
   * 0.000015 ETH at typical prices, or 0.0003 ETH at our 2-gwei
   * MAX_FEE_PER_GAS_GWEI hard cap (worst case during a sequencer
   * spike). 0.002 ETH therefore gives the operator:
   *   - ~6 tx of runway at the absolute worst-case gas cap, OR
   *   - ~133 tx of runway at typical Base gas
   * before the backend short-circuits with a clean 503.
   *
   * Original audit fix (F2.4) bumped from a broken 0.00000005 ETH
   * value to 0.005 ETH; that was sized for Ethereum mainnet pricing
   * and turned out to be needlessly conservative for Base — it
   * forced operators to keep ~$11 idle just to clear the floor.
   * Lowered to 0.002 ETH as a Base-native default. Operators on a
   * more expensive L1 (mainnet, OP) should override via env.
   *
   * Also gates the balance-monitor warn threshold (5× this value =
   * 0.01 ETH default warn point).
   */
  minBalanceEth: optional('MIN_BALANCE_ETH', '0.002'),

  /**
   * Interval (ms) for the boot-time balance monitor. Default 1h. Set to
   * 0 to disable (e.g. for unit tests). The monitor logs a structured
   * `MINTER_BALANCE_LOW` line at warn level when balance drops below
   * 5× minBalanceEth so that a Plesk cron / UptimeRobot keyword check
   * can pick it up without us shipping a paging stack. See
   * docs/runbooks/eth-refill.md for the operator-side wiring.
   */
  balanceMonitorIntervalMs: parseInt(optional('BALANCE_MONITOR_INTERVAL_MS', '3600000'), 10),

  /**
   * Hard cap on `maxFeePerGas` (gwei) the backend is willing to pay for
   * any state-changing transaction (audit F2.3 / M12).
   *
   * Base mainnet baseFee is typically 0.01–0.1 gwei. NFT mint waves
   * (Friend.tech, BasePaint, Higher) and sequencer backlogs have
   * historically pushed baseFee to 5–50 gwei for tens of minutes.
   * Without an explicit cap, ethers v6 happily lets a single
   * `awardPoints` Tx burn ~16 000× the normal fee, draining the
   * minter wallet inside a handful of transactions.
   *
   * The default of 2 gwei is ~20–200× the typical Base baseFee, which
   * leaves plenty of head room for normal congestion while putting a
   * hard ceiling on a fee-spike loss event. Tx submitted during a
   * spike above this cap simply hang in the mempool until baseFee
   * drops back below the cap — students see a delay rather than a
   * silent wallet drain.
   */
  maxFeePerGasGwei: optional('MAX_FEE_PER_GAS_GWEI', '2'),

  /**
   * Hard cap on `maxPriorityFeePerGas` (gwei). Base typically requires
   * < 0.01 gwei; 0.5 gwei is generous head room without inviting
   * priority-fee bidding wars during congestion.
   */
  maxPriorityFeePerGasGwei: optional('MAX_PRIORITY_FEE_PER_GAS_GWEI', '0.5'),
} as const
