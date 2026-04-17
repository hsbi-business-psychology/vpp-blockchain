import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { __resetForTests, getUsedCount, isUsed, markUsed } from '../src/services/nonce-store.js'

const DATA_FILE = resolve(__dirname, '../data/used-nonces.json')

let snapshot: string | null = null

beforeEach(() => {
  snapshot = existsSync(DATA_FILE) ? readFileSync(DATA_FILE, 'utf-8') : null
  if (existsSync(DATA_FILE)) rmSync(DATA_FILE)
  __resetForTests()
})

afterEach(() => {
  if (existsSync(DATA_FILE)) rmSync(DATA_FILE)
  if (snapshot !== null) writeFileSync(DATA_FILE, snapshot)
  __resetForTests()
})

describe('nonce-store', () => {
  it('reports an unused nonce as not used', () => {
    expect(isUsed(1, 'abc123')).toBe(false)
    expect(getUsedCount()).toBe(0)
  })

  it('markUsed records the nonce and returns true on first call', () => {
    expect(markUsed(1, 'abc123')).toBe(true)
    expect(isUsed(1, 'abc123')).toBe(true)
    expect(getUsedCount()).toBe(1)
  })

  it('markUsed returns false on a replay', () => {
    expect(markUsed(1, 'abc123')).toBe(true)
    expect(markUsed(1, 'abc123')).toBe(false)
    expect(getUsedCount()).toBe(1)
  })

  it('namespaces nonces by surveyId', () => {
    expect(markUsed(1, 'sharednonce')).toBe(true)
    expect(markUsed(2, 'sharednonce')).toBe(true)
    expect(isUsed(1, 'sharednonce')).toBe(true)
    expect(isUsed(2, 'sharednonce')).toBe(true)
    expect(getUsedCount()).toBe(2)
  })

  it('persists nonces across an in-memory cache reset', () => {
    markUsed(7, 'persistme')
    __resetForTests()
    expect(isUsed(7, 'persistme')).toBe(true)
  })

  it('refuses invalid surveyIds', () => {
    expect(() => markUsed(0, 'x')).toThrow()
    expect(() => isUsed(-1, 'x')).toThrow()
  })

  it('refuses empty nonces', () => {
    expect(() => markUsed(1, '')).toThrow()
    expect(() => isUsed(1, '')).toThrow()
  })

  it('refuses to start when the file is corrupt', () => {
    // Write garbage to the file directly, then bust the cache.
    writeFileSync(DATA_FILE, '{ this is not valid json')
    __resetForTests()
    expect(() => isUsed(1, 'x')).toThrow(/corrupt/i)
  })

  it('writes a sorted, schema-versioned JSON file', () => {
    markUsed(2, 'b')
    markUsed(1, 'a')
    markUsed(2, 'a')
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
    expect(raw.schemaVersion).toBe(1)
    // Sorted lexicographically as composite "<id>:<nonce>"
    expect(raw.used).toEqual(['1:a', '2:a', '2:b'])
  })
})
