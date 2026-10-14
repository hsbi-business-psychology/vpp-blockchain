/**
 * @module nonce-store
 *
 * Persistent, append-only set of HMAC nonces that have already been
 * consumed. Backs the V2 claim flow's replay protection: every nonce
 * may be redeemed at most once, regardless of which wallet eventually
 * claimed it.
 *
 * Storage:
 *   data/used-nonces.json — JSON file with the same atomic-write pattern
 *   the rest of the project uses (write tmp + POSIX rename).
 *
 *   Composite key: `${surveyId}:${nonce}`.
 *
 *   The file holds an array of strings, in-memory it is also kept as a
 *   Set for O(1) lookup. The cache is reloaded whenever the file changed
 *   on disk, and `markUsed` re-reads and writes under a file lock, so
 *   several Passenger processes share one consistent set.
 *
 * Size budget:
 *   Per nonce on disk: ~38 bytes ("8453:abc..." + JSON quoting). At
 *   100k nonces (≈ 20 surveys × 5k participants) that is ~3.8 MB —
 *   trivially small. We do not prune; replay protection only works
 *   if every consumed nonce is remembered forever.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { atomicWriteJson } from '../lib/atomic-write.js'
import { fileVersion, withFileLock } from '../lib/file-lock.js'
import { logger } from '../lib/logger.js'
import { DATA_DIR } from '../lib/paths.js'

const NONCES_PATH = resolve(DATA_DIR, 'used-nonces.json')

interface NonceFile {
  schemaVersion: 1
  used: string[]
}

interface CacheState {
  set: Set<string>
  version: string | null
}

let cache: CacheState | null = null

function compositeKey(surveyId: number, nonce: string): string {
  if (!Number.isInteger(surveyId) || surveyId <= 0) {
    throw new Error(`Invalid surveyId: ${surveyId}`)
  }
  if (!nonce || typeof nonce !== 'string') {
    throw new Error('nonce must be a non-empty string')
  }
  return `${surveyId}:${nonce}`
}

function load(): CacheState {
  const version = fileVersion(NONCES_PATH)
  if (cache && cache.version === version) return cache
  if (!existsSync(NONCES_PATH)) {
    cache = { set: new Set(), version: null }
    return cache
  }
  try {
    const raw = readFileSync(NONCES_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<NonceFile>
    const arr = Array.isArray(parsed?.used) ? parsed!.used : []
    const set = new Set<string>()
    for (const item of arr) {
      if (typeof item === 'string' && item.includes(':')) set.add(item)
    }
    cache = { set, version }
    return cache
  } catch (err) {
    // We cannot proceed safely if the nonce file is unreadable — that
    // would let already-redeemed nonces be replayed. Fail closed: log
    // loudly and behave as if no nonces have ever been used so the
    // operator notices in the very next claim attempt (it will succeed
    // even though the user has already claimed). To avoid that, we
    // throw instead of returning an empty set.
    logger.error({ err }, 'used-nonces.json could not be parsed — refusing to start')
    throw new Error('used-nonces.json is corrupt; restore from backup before serving claims', {
      cause: err,
    })
  }
}

function save(state: CacheState): void {
  const file: NonceFile = {
    schemaVersion: 1,
    used: Array.from(state.set).sort(),
  }
  atomicWriteJson(NONCES_PATH, file)
  state.version = fileVersion(NONCES_PATH)
}

export function isUsed(surveyId: number, nonce: string): boolean {
  return load().set.has(compositeKey(surveyId, nonce))
}

/**
 * Atomically marks a nonce as consumed. Returns true if this call was
 * the one that consumed it, false if someone else got there first
 * (i.e. the nonce was already used).
 *
 * The check-then-set is intentionally NOT exposed as two separate
 * functions: callers MUST commit through this single entry point. The
 * file lock makes it atomic across Passenger processes too; without it
 * two processes could hand the same link to two different wallets.
 */
export function markUsed(surveyId: number, nonce: string): boolean {
  const key = compositeKey(surveyId, nonce)
  return withFileLock(NONCES_PATH, () => {
    const state = load()
    if (state.set.has(key)) return false
    state.set.add(key)
    save(state)
    return true
  })
}

/**
 * Gives a consumed nonce back. Only for a claim whose transaction was
 * never broadcast, so the participant can retry with the same link.
 */
export function releaseNonce(surveyId: number, nonce: string): void {
  const key = compositeKey(surveyId, nonce)
  withFileLock(NONCES_PATH, () => {
    const state = load()
    if (state.set.delete(key)) save(state)
  })
}

export function getUsedCount(): number {
  return load().set.size
}

/** Test-only: clear in-memory state. */
export function __resetForTests(): void {
  cache = null
}
