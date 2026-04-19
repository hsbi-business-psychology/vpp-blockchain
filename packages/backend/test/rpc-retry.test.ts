/**
 * Unit tests for `lib/rpcRetry.ts`.
 *
 * The retry helper is the single line of defence between transient
 * upstream RPC failures (Base public RPC throttling, Cloudflare 5xx,
 * AWS Route53 hiccups) and the user-visible 500 errors that follow if
 * the original error reaches the route handler. This module had 0 %
 * coverage in the audit baseline, which meant every classroom run
 * was a live test of code nobody had ever exercised in CI.
 *
 * The tests fake timers so the suite stays sub-100ms even though the
 * production code waits 250–4000 ms between retries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRpcRetry } from '../src/lib/rpcRetry.js'

describe('withRpcRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('success paths', () => {
    it('returns the value on first attempt without delay when fn resolves', async () => {
      const fn = vi.fn().mockResolvedValue('ok')

      const result = await withRpcRetry(fn)

      expect(result).toBe('ok')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('returns the value on the second attempt after a transient 429', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ status: 429, message: 'Too many requests' })
        .mockResolvedValue('ok')

      const promise = withRpcRetry(fn, { initialDelayMs: 10, maxDelayMs: 50 })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('ok')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('retries up to the default 4 times before giving up', async () => {
      const err = { status: 503, message: 'service unavailable' }
      const fn = vi
        .fn()
        .mockRejectedValueOnce(err)
        .mockRejectedValueOnce(err)
        .mockRejectedValueOnce(err)
        .mockRejectedValueOnce(err)
        .mockResolvedValue('ok')

      const promise = withRpcRetry(fn, { initialDelayMs: 10, maxDelayMs: 50 })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('ok')
      expect(fn).toHaveBeenCalledTimes(5) // 1 initial + 4 retries
    })
  })

  describe('transient error classification', () => {
    it.each([
      { code: 'TIMEOUT' },
      { code: 'NETWORK_ERROR' },
      { code: 'SERVER_ERROR' },
      { code: 'ECONNRESET' },
      { code: 'ETIMEDOUT' },
      { code: 'ENOTFOUND' },
      { code: 'EAI_AGAIN' },
    ])('treats ethers error code $code as transient and retries', async ({ code }) => {
      const fn = vi.fn().mockRejectedValueOnce({ code }).mockResolvedValue('ok')

      const promise = withRpcRetry(fn, { initialDelayMs: 1, maxDelayMs: 5 })
      await vi.runAllTimersAsync()
      await promise

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it.each([429, 500, 502, 503, 504, 599])(
      'treats HTTP status %i as transient and retries',
      async (status) => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce({ status, message: 'upstream broke' })
          .mockResolvedValue('ok')

        const promise = withRpcRetry(fn, { initialDelayMs: 1, maxDelayMs: 5 })
        await vi.runAllTimersAsync()
        await promise

        expect(fn).toHaveBeenCalledTimes(2)
      },
    )

    it.each([
      'rate limit exceeded',
      'request timeout after 5s',
      'fetch failed',
      'bad gateway',
      'service unavailable',
      'connection reset by peer',
      'NETWORK ERROR: socket hang up',
    ])('treats message %s as transient via regex match', async (message) => {
      const fn = vi.fn().mockRejectedValueOnce({ message }).mockResolvedValue('ok')

      const promise = withRpcRetry(fn, { initialDelayMs: 1, maxDelayMs: 5 })
      await vi.runAllTimersAsync()
      await promise

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('treats Alchemy/Infura nested info.responseStatus 4xx/5xx as transient', async () => {
      const err = { info: { responseStatus: '503 Service Unavailable' } }
      const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('ok')

      const promise = withRpcRetry(fn, { initialDelayMs: 1, maxDelayMs: 5 })
      await vi.runAllTimersAsync()
      await promise

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('does NOT retry on a 400 client error — bubbles up immediately', async () => {
      const err = { status: 400, message: 'invalid argument' }
      const fn = vi.fn().mockRejectedValue(err)

      await expect(withRpcRetry(fn)).rejects.toEqual(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry on a 404 client error', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 404, message: 'not found' })

      await expect(withRpcRetry(fn)).rejects.toMatchObject({ status: 404 })
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry on a contract revert (no status, no transient code)', async () => {
      const err = { code: 'CALL_EXCEPTION', reason: 'NotAdmin' }
      const fn = vi.fn().mockRejectedValue(err)

      await expect(withRpcRetry(fn)).rejects.toEqual(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry on a plain Error without transient indicators', async () => {
      const err = new Error('something else broke')
      const fn = vi.fn().mockRejectedValue(err)

      await expect(withRpcRetry(fn)).rejects.toThrow('something else broke')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry on null / undefined / primitive throws', async () => {
      // Defensive: production has seen `throw "string"` from buggy middleware.
      const fn = vi.fn().mockRejectedValueOnce('not an object')
      await expect(withRpcRetry(fn)).rejects.toBe('not an object')
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('exhaustion behaviour', () => {
    it('throws the LAST error after exhausting all retries', async () => {
      const errors = [
        { status: 503, message: 'first' },
        { status: 503, message: 'second' },
        { status: 503, message: 'third' },
      ]
      const fn = vi
        .fn()
        .mockRejectedValueOnce(errors[0])
        .mockRejectedValueOnce(errors[1])
        .mockRejectedValueOnce(errors[2])

      const promise = withRpcRetry(fn, { retries: 2, initialDelayMs: 1, maxDelayMs: 5 })
      promise.catch(() => undefined) // suppress unhandled rejection during timer flush
      await vi.runAllTimersAsync()
      await expect(promise).rejects.toEqual(errors[2])
      expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
    })

    it('honours retries: 0 (no retries at all)', async () => {
      const err = { status: 503, message: 'always fails' }
      const fn = vi.fn().mockRejectedValue(err)

      await expect(withRpcRetry(fn, { retries: 0 })).rejects.toEqual(err)
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('backoff timing', () => {
    it('uses exponential backoff capped at maxDelayMs', async () => {
      // initial = 100, max = 250 ⇒ delays should be:
      //   attempt 0: 100, attempt 1: 200, attempt 2: 250 (capped), attempt 3: 250 (capped)
      // (plus up to +99 ms jitter each — checked as ranges)
      vi.useRealTimers()
      const sleepDurations: number[] = []
      const realSetTimeout = globalThis.setTimeout
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
        cb: (...args: unknown[]) => void,
        ms?: number,
      ) => {
        sleepDurations.push(ms ?? 0)
        return realSetTimeout(cb, 0)
      }) as unknown as typeof setTimeout)

      try {
        const err = { status: 503 }
        const fn = vi
          .fn()
          .mockRejectedValueOnce(err)
          .mockRejectedValueOnce(err)
          .mockRejectedValueOnce(err)
          .mockRejectedValueOnce(err)
          .mockResolvedValue('ok')

        await withRpcRetry(fn, { initialDelayMs: 100, maxDelayMs: 250 })

        expect(sleepDurations.length).toBeGreaterThanOrEqual(4)
        expect(sleepDurations[0]).toBeGreaterThanOrEqual(100)
        expect(sleepDurations[0]).toBeLessThan(200)
        expect(sleepDurations[1]).toBeGreaterThanOrEqual(200)
        expect(sleepDurations[1]).toBeLessThan(300)
        expect(sleepDurations[2]).toBeGreaterThanOrEqual(250)
        expect(sleepDurations[2]).toBeLessThan(350)
        expect(sleepDurations[3]).toBeGreaterThanOrEqual(250)
        expect(sleepDurations[3]).toBeLessThan(350)
      } finally {
        vi.restoreAllMocks()
      }
    })
  })

  describe('label propagation', () => {
    it('accepts a label option without affecting return value', async () => {
      const fn = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValue('labeled')

      const promise = withRpcRetry(fn, {
        label: 'getBlockNumber',
        initialDelayMs: 1,
        maxDelayMs: 5,
      })
      await vi.runAllTimersAsync()
      await expect(promise).resolves.toBe('labeled')
    })
  })
})
