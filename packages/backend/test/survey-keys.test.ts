import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// We deliberately import the module fresh inside each test so the
// hard-coded data dir picks up our temporary fixture. The service
// resolves DATA_DIR relative to its own file at import time, so we
// override DATA_DIR by stubbing the file system: tests place a
// temporary directory at packages/backend/data via symlink-equivalent
// layering — actually we just point through process.chdir so that the
// resolved DATA_DIR ends up writable. Simpler: use the real DATA_DIR
// and clean up after each test.
import {
  __resetForTests,
  createKey,
  deleteKey,
  getKeyCreatedAt,
  getSurveyKey,
  hasKey,
  rotateKey,
} from '../src/services/survey-keys.js'

// The service writes to packages/backend/data/survey-keys.json. We
// snapshot and restore that file so the test suite never destroys an
// operator's real data even when run against a populated checkout.
const DATA_FILE = resolve(__dirname, '../data/survey-keys.json')

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

describe('survey-keys store', () => {
  it('returns null for an unregistered survey', () => {
    expect(getSurveyKey(1)).toBeNull()
    expect(hasKey(1)).toBe(false)
    expect(getKeyCreatedAt(1)).toBeNull()
  })

  it('createKey stores a 32-byte base64url key and returns it', () => {
    const key = createKey(42)
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/)
    // 32 bytes => 43 chars base64url (no padding)
    expect(Buffer.from(key, 'base64url')).toHaveLength(32)
    expect(getSurveyKey(42)).toBe(key)
    expect(hasKey(42)).toBe(true)
    expect(getKeyCreatedAt(42)).toBeGreaterThan(Date.now() - 5_000)
  })

  it('createKey refuses to overwrite an existing key', () => {
    createKey(7)
    expect(() => createKey(7)).toThrow(/already has a key/i)
  })

  it('rotateKey replaces the existing key and updates createdAt', async () => {
    const original = createKey(1)
    // sleep so createdAt actually changes — Date.now() can collide
    await new Promise((r) => setTimeout(r, 5))
    const rotated = rotateKey(1)
    expect(rotated).not.toBe(original)
    expect(getSurveyKey(1)).toBe(rotated)
    expect(getKeyCreatedAt(1)!).toBeGreaterThan(0)
  })

  it('rotateKey rejects unknown surveys', () => {
    expect(() => rotateKey(999)).toThrow(/no key to rotate/i)
  })

  it('deleteKey removes an existing entry and is idempotent', () => {
    createKey(3)
    expect(deleteKey(3)).toBe(true)
    expect(getSurveyKey(3)).toBeNull()
    expect(deleteKey(3)).toBe(false)
  })

  it('persists keys across an in-memory cache reset', () => {
    const key = createKey(11)
    __resetForTests()
    expect(getSurveyKey(11)).toBe(key)
  })

  it('rejects invalid surveyIds', () => {
    expect(() => createKey(0)).toThrow()
    expect(() => createKey(-1)).toThrow()
    expect(() => createKey(1.5)).toThrow()
    expect(() => getSurveyKey(0)).toThrow()
  })

  it('uses the atomic-rename pattern (no .tmp left behind)', () => {
    createKey(99)
    expect(existsSync(join(DATA_FILE + '.tmp'))).toBe(false)
    expect(existsSync(DATA_FILE)).toBe(true)
  })
})
