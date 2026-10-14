/**
 * @module log-reader
 *
 * Failover and block-span adaptation for eth_getLogs.
 *
 * RPC providers disagree on how many blocks one eth_getLogs call may span
 * (Alchemy Free: 10, drpc Free: 10,000, Alchemy Pay-as-you-go: any range
 * up to 10,000 logs) and on whether old blocks are served at all
 * (publicnode wants a personal token). ethers' FallbackProvider hands such
 * an error straight to the caller instead of asking the next provider, so
 * one refusing provider stopped the whole event sync.
 *
 * AdaptiveLogReader asks the sources in turn, sticks with the one that
 * answered, and halves the block span when every source refused the range.
 * After a run of successes it doubles the span again, up to the maximum.
 */

import { withTimeout } from './timeout.js'

/** Every source refused the requested block range. */
export class RangeRejectedError extends Error {
  constructor(readonly lastError: unknown) {
    super(`all log sources rejected the block range: ${errorText(lastError)}`)
    this.name = 'RangeRejectedError'
  }
}

const RANGE_PATTERNS = [
  /block range/i,
  /ranges? over [\d,]+ blocks/i,
  /limited to (a )?[\d,]+ (block )?range/i,
  /range (is )?too (large|wide|big)/i,
  /requested range exceeds/i,
  /exceeds? (the )?max(imum)? (block )?range/i,
  /block limit exceeded/i,
  /query returned more than [\d,]+ results/i,
  /response size (exceeded|is too)/i,
  /too many (blocks|results|logs)/i,
]

/** Collects the human-readable parts of an ethers or JSON-RPC error. */
export function errorText(err: unknown): string {
  const parts: string[] = []
  const visit = (value: unknown, depth: number) => {
    if (value == null || depth > 3) return
    if (typeof value === 'string') {
      parts.push(value)
      return
    }
    if (typeof value !== 'object') return
    const record = value as Record<string, unknown>
    for (const key of ['message', 'shortMessage', 'responseBody']) {
      if (typeof record[key] === 'string') parts.push(record[key] as string)
    }
    for (const key of ['error', 'info', 'cause']) visit(record[key], depth + 1)
  }
  visit(err, 0)
  return parts.join(' | ')
}

/** True when the provider refused the block range rather than failing. */
export function isRangeRejection(err: unknown): boolean {
  const text = errorText(err)
  if (/rate limit|request limit|too many requests/i.test(text)) return false
  return RANGE_PATTERNS.some((pattern) => pattern.test(text))
}

export interface AdaptiveLogReaderOptions {
  /** Largest block span per request. */
  maxSpan: number
  /** Per-request deadline for one source. */
  timeoutMs: number
  /** Successful requests before the span doubles again. */
  growAfter?: number
}

/** Queries `[fromBlock, toBlock]` on the source with the given index. */
export type LogQuery<T> = (sourceIndex: number, fromBlock: number, toBlock: number) => Promise<T[]>

export class AdaptiveLogReader {
  private span: number
  private preferred = 0
  private successes = 0

  constructor(
    private readonly sourceCount: number,
    private readonly options: AdaptiveLogReaderOptions,
  ) {
    if (sourceCount < 1) throw new Error('AdaptiveLogReader needs at least one source')
    this.span = Math.max(1, options.maxSpan)
  }

  /** Block span the next request will use. */
  getSpan(): number {
    return this.span
  }

  /**
   * Fetches all results in `[fromBlock, toBlock]`, one span at a time,
   * shrinking the span whenever every source rejects it. For callers that
   * do not checkpoint (cold-start fallbacks). The event store calls
   * {@link readOnce} per window instead, so progress is saved in between.
   */
  async read<T>(
    query: LogQuery<T>,
    fromBlock: number,
    toBlock: number,
    shouldStop?: () => boolean,
  ): Promise<T[]> {
    const results: T[] = []
    let from = fromBlock
    while (from <= toBlock) {
      const to = Math.min(from + this.span - 1, toBlock)
      try {
        results.push(...(await this.readOnce(query, from, to, shouldStop)))
      } catch (err) {
        // readOnce has already shrunk the span; retry the same blocks.
        if (err instanceof RangeRejectedError && to > from) continue
        throw err
      }
      from = to + 1
    }
    return results
  }

  /**
   * One request for `[fromBlock, toBlock]`, asking the sources in turn.
   * Throws RangeRejectedError after shrinking the span when every source
   * rejected the range, so the caller can retry with getSpan() blocks.
   */
  async readOnce<T>(
    query: LogQuery<T>,
    fromBlock: number,
    toBlock: number,
    shouldStop?: () => boolean,
  ): Promise<T[]> {
    const requested = toBlock - fromBlock + 1
    let lastError: unknown
    let rangeRejected = false
    for (let attempt = 0; attempt < this.sourceCount; attempt++) {
      if (shouldStop?.()) throw new Error('log query superseded')
      const index = (this.preferred + attempt) % this.sourceCount
      try {
        const results = await withTimeout(
          query(index, fromBlock, toBlock),
          this.options.timeoutMs,
          `log source did not answer within ${this.options.timeoutMs} ms`,
        )
        this.preferred = index
        this.recordSuccess(requested)
        return results
      } catch (err) {
        lastError = err
        if (isRangeRejection(err)) rangeRejected = true
      }
    }
    if (rangeRejected) {
      // Relative to the rejected request, so parallel callers that were
      // all refused the same span shrink it once, not once each.
      this.span = Math.max(1, Math.min(this.span, Math.floor(requested / 2)))
      this.successes = 0
      throw new RangeRejectedError(lastError)
    }
    throw lastError
  }

  private recordSuccess(requested: number): void {
    // Only full-span requests show that the current span is safe; a short
    // tail window at the chain head says nothing about larger ones.
    if (this.span >= this.options.maxSpan || requested < this.span) return
    this.successes++
    if (this.successes >= (this.options.growAfter ?? 10)) {
      this.span = Math.min(this.options.maxSpan, this.span * 2)
      this.successes = 0
    }
  }
}
