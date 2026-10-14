import { describe, it, expect, vi } from 'vitest'
import { syncWithin } from '../src/lib/sync-within.js'

describe('syncWithin', () => {
  it('waits for a sync that finishes in time', async () => {
    let done = false
    const store = {
      sync: vi.fn(async () => {
        done = true
      }),
    }

    await syncWithin(store, 1_000)

    expect(done).toBe(true)
  })

  it('stops waiting for a long sync after the limit', async () => {
    vi.useFakeTimers()
    try {
      const store = { sync: vi.fn(() => new Promise<void>(() => {})) }
      let returned = false

      const wait = syncWithin(store, 5_000).then(() => {
        returned = true
      })
      await vi.advanceTimersByTimeAsync(4_999)
      expect(returned).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await wait

      expect(returned).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not throw when the sync fails', async () => {
    const store = { sync: vi.fn(() => Promise.reject(new Error('rpc down'))) }

    await expect(syncWithin(store, 1_000)).resolves.toBeUndefined()
  })
})
