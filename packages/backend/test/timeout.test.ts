import { describe, it, expect, vi } from 'vitest'
import { withTimeout } from '../src/lib/timeout.js'

describe('withTimeout', () => {
  it('passes the result through when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1_000)).resolves.toBe(42)
  })

  it('passes a rejection through unchanged', async () => {
    const err = new Error('boom')
    await expect(withTimeout(Promise.reject(err), 1_000)).rejects.toBe(err)
  })

  it('rejects once the deadline passes', async () => {
    vi.useFakeTimers()
    try {
      const result = withTimeout(new Promise(() => {}), 8_000, 'too slow')
      const assertion = expect(result).rejects.toThrow('too slow')
      await vi.advanceTimersByTimeAsync(8_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
