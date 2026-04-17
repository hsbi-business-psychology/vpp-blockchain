/**
 * @module admin-labels
 *
 * Persistent JSON-file store for human-readable labels on admin wallet
 * addresses. The blockchain only knows EVM addresses (`0x…`); operators
 * want to see "Jasmin" or "Gerrit" in the admin list. Labels are kept
 * server-side instead of on-chain because they are pure UX metadata that
 * doesn't justify the gas cost or the permanence.
 *
 * The file is `data/admin-labels.json` (next to `events.json`) and uses
 * the same atomic-write pattern (write tmp + POSIX rename) so a Plesk
 * worker restart mid-write cannot corrupt the file.
 *
 * Keys are normalized to EIP-55 checksum addresses to keep lookups
 * stable regardless of input casing.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ethers } from 'ethers'
import { logger } from '../lib/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '../../data')
const LABELS_PATH = resolve(DATA_DIR, 'admin-labels.json')

/** Hard cap so a malicious or fat-fingered operator can't write a 1MB
 * "label". Labels are display strings, not free-form notes. */
export const MAX_LABEL_LENGTH = 64

type LabelMap = Record<string, string>

let cache: LabelMap | null = null

function normalize(address: string): string {
  return ethers.getAddress(address)
}

function load(): LabelMap {
  if (cache) return cache
  if (!existsSync(LABELS_PATH)) {
    cache = {}
    return cache
  }
  try {
    const raw = readFileSync(LABELS_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const normalized: LabelMap = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value !== 'string') continue
        try {
          normalized[normalize(key)] = value
        } catch {
          // Skip malformed addresses silently — corrupt entries should
          // not block the rest of the file from loading.
        }
      }
      cache = normalized
      return cache
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load admin-labels.json — starting with empty map')
  }
  cache = {}
  return cache
}

function save(map: LabelMap): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
  const tmp = LABELS_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(map, null, 2))
  renameSync(tmp, LABELS_PATH)
}

export function getLabel(address: string): string | null {
  const map = load()
  return map[normalize(address)] ?? null
}

export function getAllLabels(): Readonly<LabelMap> {
  return load()
}

/**
 * Sets or clears the label for a given address. Passing an empty string
 * deletes the entry so we don't leave dangling empty values in the file.
 *
 * Returns the new label (or null if cleared) so callers can echo it back
 * to the client without re-reading.
 */
export function setLabel(address: string, label: string): string | null {
  const trimmed = label.trim()
  if (trimmed.length > MAX_LABEL_LENGTH) {
    throw new Error(`Label exceeds ${MAX_LABEL_LENGTH} characters`)
  }
  const map = load()
  const key = normalize(address)
  if (trimmed === '') {
    if (key in map) {
      delete map[key]
      save(map)
    }
    return null
  }
  map[key] = trimmed
  save(map)
  return trimmed
}

/** Test-only: reset the in-memory cache so subsequent reads pick up
 * external file changes (or the lack of a file). Not exported in the
 * public type surface used by routes. */
export function __resetForTests(): void {
  cache = null
}
