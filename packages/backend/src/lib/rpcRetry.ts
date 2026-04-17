/**
 * @module rpcRetry
 *
 * Exponential-backoff retry for transient RPC failures (HTTP 429, timeouts,
 * connection resets, server errors). Public RPC endpoints throttle aggressively
 * during peak load (e.g. classroom test runs) — this keeps reads alive without
 * surfacing cryptic provider errors to end users.
 *
 * Only used for read operations. Write transactions are NOT retried to avoid
 * double-spends if a tx was actually mined before the timeout.
 */
import { logger } from './logger.js'

export interface RetryOptions {
  retries?: number
  initialDelayMs?: number
  maxDelayMs?: number
  label?: string
}

const DEFAULT_RETRIES = 4
const DEFAULT_INITIAL_DELAY_MS = 250
const DEFAULT_MAX_DELAY_MS = 4000

function isTransient(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false
  const rec = err as Record<string, unknown>

  const code = rec.code
  if (
    code === 'TIMEOUT' ||
    code === 'NETWORK_ERROR' ||
    code === 'SERVER_ERROR' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN'
  ) {
    return true
  }

  const status = rec.status as number | undefined
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true

  const message = rec.message
  if (typeof message === 'string') {
    if (
      /429|too many requests|timeout|timed out|rate limit|gateway|service unavailable|bad gateway|connection reset|fetch failed|network error/i.test(
        message,
      )
    ) {
      return true
    }
  }

  const info = rec.info as Record<string, unknown> | undefined
  if (info && typeof info === 'object') {
    const responseStatus = info.responseStatus
    if (typeof responseStatus === 'string' && /^(429|5\d\d)/.test(responseStatus)) return true
  }

  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

/**
 * Wraps an async fn with exponential backoff on transient errors.
 * Non-transient errors (e.g. contract reverts, validation) bubble up immediately.
 */
export async function withRpcRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? DEFAULT_RETRIES
  const initial = opts.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
  const max = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const label = opts.label ?? 'rpc'

  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= retries || !isTransient(err)) {
        throw err
      }
      const wait = Math.min(initial * 2 ** attempt, max) + Math.floor(Math.random() * 100)
      logger.warn(
        { err, attempt: attempt + 1, retries, waitMs: wait, label },
        'Transient RPC error — retrying with backoff',
      )
      await delay(wait)
      attempt++
    }
  }
}
