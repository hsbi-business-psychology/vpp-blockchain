/**
 * @module survey-keys
 *
 * Persistent JSON-file store for the per-survey HMAC secret keys that
 * back the V2 claim flow.
 *
 * Why this exists:
 *   V1 stored a single shared "secret" per survey on-chain. That design
 *   had two fatal flaws (audit findings 1.3 and 1.7): the secret was
 *   visible in calldata, and any participant who learned the link could
 *   share it with the entire campus. V2 replaces the shared secret with
 *   a per-participant HMAC token signed by a server-side key. The smart
 *   contract never sees the key — it lives only in this file and in the
 *   minter wallet's memory.
 *
 * Why JSON-on-disk and not a DB:
 *   The whole project is intentionally Plesk-only with no managed
 *   services. The same atomic-rename pattern that backs admin-labels.ts
 *   and the event store is reused here. A Plesk worker restart mid-write
 *   cannot corrupt the file.
 *
 * Key format:
 *   32 random bytes encoded as URL-safe base64. Base64 because it shows
 *   up cleanly in a SoSci config field; URL-safe so it can be embedded
 *   in copy/paste examples without escaping. 256 bits is overkill for
 *   HMAC-SHA256 but cheap and future-proof.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { atomicWriteJson } from '../lib/atomic-write.js'
import { logger } from '../lib/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '../../data')
const KEYS_PATH = resolve(DATA_DIR, 'survey-keys.json')

interface SurveyKeyRecord {
  /** URL-safe base64 of 32 random bytes. */
  key: string
  /** Unix-millis timestamp the key was generated. Pure audit metadata. */
  createdAt: number
}

interface SurveyKeyFile {
  schemaVersion: 1
  keys: Record<string, SurveyKeyRecord>
}

let cache: SurveyKeyFile | null = null

function emptyFile(): SurveyKeyFile {
  return { schemaVersion: 1, keys: {} }
}

function load(): SurveyKeyFile {
  if (cache) return cache
  if (!existsSync(KEYS_PATH)) {
    cache = emptyFile()
    return cache
  }
  try {
    const raw = readFileSync(KEYS_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<SurveyKeyFile>
    if (!parsed || typeof parsed !== 'object' || !parsed.keys) {
      cache = emptyFile()
      return cache
    }
    const cleanedKeys: Record<string, SurveyKeyRecord> = {}
    for (const [k, v] of Object.entries(parsed.keys)) {
      if (
        v &&
        typeof v === 'object' &&
        typeof (v as SurveyKeyRecord).key === 'string' &&
        typeof (v as SurveyKeyRecord).createdAt === 'number'
      ) {
        cleanedKeys[k] = v as SurveyKeyRecord
      }
    }
    cache = { schemaVersion: 1, keys: cleanedKeys }
    return cache
  } catch (err) {
    // Bad JSON on disk should never silently lose every key. Surface
    // the error and start fresh — operator will see it in the logs and
    // can restore from the previous backup.
    logger.error({ err }, 'survey-keys.json could not be parsed; starting empty')
    cache = emptyFile()
    return cache
  }
}

function save(file: SurveyKeyFile): void {
  atomicWriteJson(KEYS_PATH, file)
}

function toKey(surveyId: number): string {
  if (!Number.isInteger(surveyId) || surveyId <= 0) {
    throw new Error(`Invalid surveyId: ${surveyId}`)
  }
  return String(surveyId)
}

function generateKeyMaterial(): string {
  // Buffer.toString('base64url') was added in Node 16. We're on 18+.
  return randomBytes(32).toString('base64url')
}

/**
 * Returns the existing key for a survey, or null if none has been
 * registered yet. Use {@link createKey} to register.
 */
export function getSurveyKey(surveyId: number): string | null {
  const file = load()
  return file.keys[toKey(surveyId)]?.key ?? null
}

/**
 * Returns the createdAt millis for a survey's key, or null if missing.
 * Used by /admin to show the key age in the UI without exposing the key.
 */
export function getKeyCreatedAt(surveyId: number): number | null {
  const file = load()
  return file.keys[toKey(surveyId)]?.createdAt ?? null
}

export function hasKey(surveyId: number): boolean {
  return getSurveyKey(surveyId) !== null
}

/**
 * Generates and stores a fresh HMAC key for the given survey. Throws
 * if a key already exists — overwriting an existing key would silently
 * invalidate every previously distributed claim URL, which is almost
 * always a bug. Use {@link rotateKey} for the rare case where rotation
 * is intentional.
 */
export function createKey(surveyId: number): string {
  const file = load()
  const k = toKey(surveyId)
  if (file.keys[k]) {
    throw new Error(`Survey ${surveyId} already has a key — use rotateKey to override`)
  }
  const key = generateKeyMaterial()
  file.keys[k] = { key, createdAt: Date.now() }
  save(file)
  return key
}

/**
 * Replaces the HMAC key for an existing survey. Returns the new key.
 * Operators MUST regenerate every claim URL after rotating, otherwise
 * existing links will silently fail to verify.
 */
export function rotateKey(surveyId: number): string {
  const file = load()
  const k = toKey(surveyId)
  if (!file.keys[k]) {
    throw new Error(`Survey ${surveyId} has no key to rotate — use createKey instead`)
  }
  const key = generateKeyMaterial()
  file.keys[k] = { key, createdAt: Date.now() }
  save(file)
  return key
}

/**
 * Removes the HMAC key for a survey. Used when a survey is permanently
 * decommissioned and the operator wants to ensure no further claims can
 * be processed even if the V2 contract still has the survey registered.
 *
 * Returns true if a key was removed, false if there was nothing to remove.
 */
export function deleteKey(surveyId: number): boolean {
  const file = load()
  const k = toKey(surveyId)
  if (!file.keys[k]) return false
  delete file.keys[k]
  save(file)
  return true
}

/** Test-only: drop the in-memory cache. */
export function __resetForTests(): void {
  cache = null
}
