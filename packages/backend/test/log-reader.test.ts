import { describe, it, expect, vi } from 'vitest'
import {
  AdaptiveLogReader,
  RangeRejectedError,
  errorText,
  isRangeRejection,
} from '../src/lib/log-reader.js'

// Shapes of the errors the Base RPCs returned on 2026-10-14.
const alchemyFree = {
  code: 'UNKNOWN_ERROR',
  error: {
    code: -32600,
    message:
      'Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.',
  },
}
const drpcFree = {
  code: 'SERVER_ERROR',
  info: {
    responseStatus: '400 Bad Request',
    responseBody:
      '{"error":{"message":"ranges over 10000 blocks are not supported on free plan","code":35}}',
  },
}
const publicnodeArchive = {
  code: 'SERVER_ERROR',
  info: {
    responseStatus: '403 Forbidden',
    responseBody:
      '{"error":{"code":-32602,"message":"Archive requests require a personal token."}}',
  },
}
const baseRateLimit = {
  code: 'SERVER_ERROR',
  info: { responseBody: '{"error":{"code":-32011,"message":"request limit reached"}}' },
}

describe('isRangeRejection', () => {
  it('recognises range refusals from Alchemy, drpc and Infura', () => {
    expect(isRangeRejection(alchemyFree)).toBe(true)
    expect(isRangeRejection(drpcFree)).toBe(true)
    expect(isRangeRejection(new Error('query returned more than 10000 results'))).toBe(true)
    expect(isRangeRejection(new Error('requested range exceeds 10000 blocks'))).toBe(true)
  })

  it('treats archive refusals and rate limits as provider failures', () => {
    expect(isRangeRejection(publicnodeArchive)).toBe(false)
    expect(isRangeRejection(baseRateLimit)).toBe(false)
    expect(isRangeRejection(new Error('fetch failed'))).toBe(false)
  })

  it('collects nested messages', () => {
    expect(errorText(drpcFree)).toContain('ranges over 10000 blocks')
  })
})

/** Records the ranges each source was asked for. */
function sources(...behaviours: Array<(from: number, to: number) => Promise<number[]>>) {
  const calls: Array<[number, number, number]> = []
  const query = (index: number, from: number, to: number) => {
    calls.push([index, from, to])
    return behaviours[index](from, to)
  }
  return { query, calls }
}

const ok = (from: number, to: number) => Promise.resolve([from, to])
const refuseAbove = (max: number) => (from: number, to: number) =>
  to - from + 1 > max ? Promise.reject(drpcFree) : ok(from, to)

describe('AdaptiveLogReader', () => {
  it('returns all results from one source when it accepts the range', async () => {
    const reader = new AdaptiveLogReader(1, { maxSpan: 1000, timeoutMs: 1000 })
    const { query, calls } = sources(ok)

    await expect(reader.read(query, 0, 2499)).resolves.toEqual([0, 999, 1000, 1999, 2000, 2499])
    expect(calls.map((c) => c[0])).toEqual([0, 0, 0])
  })

  it('asks the next source when one fails and keeps using the one that answered', async () => {
    const reader = new AdaptiveLogReader(2, { maxSpan: 100, timeoutMs: 1000 })
    const { query, calls } = sources(() => Promise.reject(publicnodeArchive), ok)

    await reader.read(query, 0, 199)

    expect(calls.map((c) => c[0])).toEqual([0, 1, 1])
  })

  it('halves the span when every source rejects the range', async () => {
    const reader = new AdaptiveLogReader(2, { maxSpan: 1000, timeoutMs: 1000 })
    const { query } = sources(refuseAbove(10), refuseAbove(300))

    const results = await reader.read(query, 0, 499)

    expect(reader.getSpan()).toBe(250)
    expect(results).toEqual([0, 249, 250, 499])
  })

  it('throws the provider error when no source rejected the range', async () => {
    const reader = new AdaptiveLogReader(2, { maxSpan: 100, timeoutMs: 1000 })
    const { query } = sources(
      () => Promise.reject(publicnodeArchive),
      () => Promise.reject(baseRateLimit),
    )

    await expect(reader.read(query, 0, 50)).rejects.toBe(baseRateLimit)
    expect(reader.getSpan()).toBe(100)
  })

  it('gives up with RangeRejectedError when even one block is refused', async () => {
    const reader = new AdaptiveLogReader(1, { maxSpan: 4, timeoutMs: 1000 })
    const { query } = sources(() => Promise.reject(alchemyFree))

    await expect(reader.read(query, 0, 3)).rejects.toBeInstanceOf(RangeRejectedError)
    expect(reader.getSpan()).toBe(1)
  })

  it('doubles the span again after a run of successes', async () => {
    const reader = new AdaptiveLogReader(1, { maxSpan: 8, timeoutMs: 1000, growAfter: 3 })
    let refuse = true
    const query = (_i: number, from: number, to: number) =>
      refuse && to - from + 1 > 2 ? Promise.reject(alchemyFree) : ok(from, to)

    // 8 and 4 blocks are refused, then [0,1] and [2,3] succeed.
    await reader.read(query, 0, 3)
    expect(reader.getSpan()).toBe(2)

    // The third success in a row doubles the span.
    refuse = false
    await expect(reader.read(query, 4, 9)).resolves.toEqual([4, 5, 6, 9])
    expect(reader.getSpan()).toBe(4)
  })

  it('shrinks once when parallel requests are refused the same span', async () => {
    const reader = new AdaptiveLogReader(1, { maxSpan: 1000, timeoutMs: 1000 })
    const refuse = () => Promise.reject(drpcFree)

    await Promise.allSettled([
      reader.readOnce(refuse, 0, 999),
      reader.readOnce(refuse, 0, 999),
      reader.readOnce(refuse, 0, 999),
      reader.readOnce(refuse, 0, 999),
    ])

    expect(reader.getSpan()).toBe(500)
  })

  it('leaves the retry of a refused range to readOnce callers', async () => {
    const reader = new AdaptiveLogReader(1, { maxSpan: 100, timeoutMs: 1000 })

    await expect(reader.readOnce(() => Promise.reject(drpcFree), 0, 99)).rejects.toBeInstanceOf(
      RangeRejectedError,
    )
    expect(reader.getSpan()).toBe(50)
  })

  it('checks shouldStop before asking the next source', async () => {
    const reader = new AdaptiveLogReader(2, { maxSpan: 10, timeoutMs: 1000 })
    let stop = false
    const second = vi.fn(ok)
    const { query } = sources(() => {
      stop = true
      return Promise.reject(publicnodeArchive)
    }, second)

    await expect(reader.read(query, 0, 9, () => stop)).rejects.toThrow('superseded')
    expect(second).not.toHaveBeenCalled()
  })

  it('moves on when a source stalls', async () => {
    vi.useFakeTimers()
    try {
      const reader = new AdaptiveLogReader(2, { maxSpan: 10, timeoutMs: 5_000 })
      const { query } = sources(() => new Promise<number[]>(() => {}), ok)

      const result = reader.read(query, 0, 9)
      await vi.advanceTimersByTimeAsync(5_000)

      await expect(result).resolves.toEqual([0, 9])
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops issuing requests once the caller is superseded', async () => {
    const reader = new AdaptiveLogReader(1, { maxSpan: 10, timeoutMs: 1000 })
    const { query, calls } = sources(ok)
    let stop = false

    const result = reader.read(
      async (i, from, to) => {
        stop = true
        return query(i, from, to)
      },
      0,
      99,
      () => stop,
    )

    await expect(result).rejects.toThrow('superseded')
    expect(calls).toHaveLength(1)
  })
})
