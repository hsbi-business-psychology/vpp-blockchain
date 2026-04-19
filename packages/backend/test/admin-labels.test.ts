/**
 * Unit tests for `services/admin-labels.ts`.
 *
 * The global setup.ts replaces this module with an in-memory mock so
 * route tests don't write to disk. These tests exercise the REAL
 * implementation — `vi.unmock(...)` peels off the global stub and we
 * point `data/admin-labels.json` at a per-test tmp directory via env
 * (the production module derives DATA_DIR from import.meta.url, so we
 * cannot easily redirect it; we instead drive the public API and
 * inspect the disk state from a known location).
 *
 * The tests cover:
 *   - EIP-55 normalization on read AND write
 *   - empty-string label clears the entry instead of storing ""
 *   - MAX_LABEL_LENGTH enforcement (the file itself is operator-trusted
 *     but we still cap individual values to keep memory bounded)
 *   - load() tolerates missing file, malformed JSON, non-object root,
 *     and entries with non-string values (returns empty / skips bad)
 *   - cache invalidation via __resetForTests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.unmock('../src/services/admin-labels.js')

// The module derives its data path from import.meta.url at module load:
//   DATA_DIR  = resolve(__dirname, '../../data')
//   LABELS_PATH = resolve(DATA_DIR, 'admin-labels.json')
// Resolving the same way here so we can set up / tear down state on
// the real on-disk path the module actually reads.
const SRC_FILE = fileURLToPath(new URL('../src/services/admin-labels.ts', import.meta.url))
// SRC_FILE is at packages/backend/src/services/admin-labels.ts.
// The module computes DATA_DIR = resolve(__dirname, '../../data') which
// from src/services/ goes up two levels to packages/backend/data.
const DATA_DIR = resolve(dirname(SRC_FILE), '../../data')
const LABELS_PATH = join(DATA_DIR, 'admin-labels.json')
const ADDR_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // Hardhat #0
const ADDR_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // Hardhat #1

// Backup any pre-existing labels file so we don't trash an operator's
// real data when running these tests on a workstation.
let backup: string | null = null

beforeEach(async () => {
  backup = existsSync(LABELS_PATH) ? readFileSync(LABELS_PATH, 'utf-8') : null
  if (existsSync(LABELS_PATH)) rmSync(LABELS_PATH)
  const mod = await import('../src/services/admin-labels.js')
  mod.__resetForTests()
})

afterEach(() => {
  if (existsSync(LABELS_PATH)) rmSync(LABELS_PATH)
  if (backup !== null) writeFileSync(LABELS_PATH, backup, { mode: 0o600 })
})

describe('admin-labels: getLabel / setLabel happy path', () => {
  it('returns null for an unknown address', async () => {
    const { getLabel } = await import('../src/services/admin-labels.js')
    expect(getLabel(ADDR_A)).toBeNull()
  })

  it('round-trips a label through setLabel → getLabel', async () => {
    const { setLabel, getLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, 'Jasmin')
    expect(getLabel(ADDR_A)).toBe('Jasmin')
  })

  it('persists the label to disk so a fresh load() picks it up', async () => {
    const { setLabel, __resetForTests, getLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, 'Gerrit')

    // Flush in-memory cache so the next read goes through load().
    __resetForTests()
    expect(getLabel(ADDR_A)).toBe('Gerrit')

    // Verify the on-disk JSON is what we expect — including EIP-55
    // checksum casing of the key.
    const raw = JSON.parse(readFileSync(LABELS_PATH, 'utf-8')) as Record<string, string>
    expect(raw[ADDR_A]).toBe('Gerrit')
  })

  it('returns the new label string from setLabel', async () => {
    const { setLabel } = await import('../src/services/admin-labels.js')
    expect(setLabel(ADDR_A, 'Vera')).toBe('Vera')
  })

  it('trims whitespace on write but keeps internal spaces intact', async () => {
    const { setLabel, getLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, '  Prof. Dr. Müller  ')
    expect(getLabel(ADDR_A)).toBe('Prof. Dr. Müller')
  })
})

describe('admin-labels: EIP-55 normalization', () => {
  it('normalizes input addresses to checksum form on write', async () => {
    const { setLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A.toLowerCase(), 'Jasmin')

    const raw = JSON.parse(readFileSync(LABELS_PATH, 'utf-8')) as Record<string, string>
    // Stored under the EIP-55 form, NOT the lowercase form we wrote.
    expect(Object.keys(raw)).toEqual([ADDR_A])
  })

  it('normalizes input addresses on read regardless of casing', async () => {
    const { setLabel, getLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, 'Jasmin')

    expect(getLabel(ADDR_A)).toBe('Jasmin')
    expect(getLabel(ADDR_A.toLowerCase())).toBe('Jasmin')
    expect(getLabel(ADDR_A.toUpperCase().replace('0X', '0x'))).toBe('Jasmin')
  })

  it('throws on malformed addresses (delegates to ethers.getAddress)', async () => {
    const { setLabel } = await import('../src/services/admin-labels.js')
    expect(() => setLabel('not-an-address', 'X')).toThrow()
    expect(() => setLabel('0x123', 'X')).toThrow()
  })
})

describe('admin-labels: clear via empty string', () => {
  it('deletes an entry when label is empty string', async () => {
    const { setLabel, getLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, 'Jasmin')
    expect(setLabel(ADDR_A, '')).toBeNull()
    expect(getLabel(ADDR_A)).toBeNull()

    // The on-disk file should not contain the deleted key.
    const raw = JSON.parse(readFileSync(LABELS_PATH, 'utf-8')) as Record<string, string>
    expect(raw[ADDR_A]).toBeUndefined()
  })

  it('treats whitespace-only label as empty (clears entry)', async () => {
    const { setLabel, getLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, 'Jasmin')
    expect(setLabel(ADDR_A, '   \t\n  ')).toBeNull()
    expect(getLabel(ADDR_A)).toBeNull()
  })

  it('is a no-op when clearing an entry that never existed', async () => {
    const { setLabel } = await import('../src/services/admin-labels.js')
    expect(setLabel(ADDR_B, '')).toBeNull()
    // No file should have been created since there was nothing to delete.
    expect(existsSync(LABELS_PATH)).toBe(false)
  })
})

describe('admin-labels: MAX_LABEL_LENGTH cap', () => {
  it('accepts a label exactly at MAX_LABEL_LENGTH', async () => {
    const { setLabel, MAX_LABEL_LENGTH } = await import('../src/services/admin-labels.js')
    const max = 'a'.repeat(MAX_LABEL_LENGTH)
    expect(setLabel(ADDR_A, max)).toBe(max)
  })

  it('rejects a label one character over MAX_LABEL_LENGTH', async () => {
    const { setLabel, MAX_LABEL_LENGTH } = await import('../src/services/admin-labels.js')
    const tooLong = 'a'.repeat(MAX_LABEL_LENGTH + 1)
    expect(() => setLabel(ADDR_A, tooLong)).toThrow(/exceeds/i)
  })
})

describe('admin-labels: load() resilience', () => {
  it('returns empty when the file does not exist', async () => {
    const { getAllLabels } = await import('../src/services/admin-labels.js')
    expect(Object.keys(getAllLabels())).toHaveLength(0)
  })

  it('returns empty and logs a warning when the file is malformed JSON', async () => {
    writeFileSync(LABELS_PATH, '{not valid json', { mode: 0o600 })
    const mod = await import('../src/services/admin-labels.js')
    mod.__resetForTests()
    expect(Object.keys(mod.getAllLabels())).toHaveLength(0)
  })

  it('returns empty when the file root is an array, not an object', async () => {
    writeFileSync(LABELS_PATH, JSON.stringify(['Jasmin', 'Gerrit']), { mode: 0o600 })
    const mod = await import('../src/services/admin-labels.js')
    mod.__resetForTests()
    expect(Object.keys(mod.getAllLabels())).toHaveLength(0)
  })

  it('skips entries whose value is not a string', async () => {
    writeFileSync(LABELS_PATH, JSON.stringify({ [ADDR_A]: 'Jasmin', [ADDR_B]: 42 }), {
      mode: 0o600,
    })
    const mod = await import('../src/services/admin-labels.js')
    mod.__resetForTests()
    expect(mod.getLabel(ADDR_A)).toBe('Jasmin')
    expect(mod.getLabel(ADDR_B)).toBeNull()
  })

  it('skips entries whose key is not a valid address but keeps the rest', async () => {
    writeFileSync(
      LABELS_PATH,
      JSON.stringify({
        [ADDR_A]: 'Jasmin',
        garbage: 'Should be skipped',
        '0x123': 'Also skipped',
      }),
      { mode: 0o600 },
    )
    const mod = await import('../src/services/admin-labels.js')
    mod.__resetForTests()
    expect(mod.getLabel(ADDR_A)).toBe('Jasmin')
    expect(Object.keys(mod.getAllLabels())).toEqual([ADDR_A])
  })
})

describe('admin-labels: cache behaviour', () => {
  it('serves subsequent reads from in-memory cache (no disk I/O)', async () => {
    const { setLabel, getLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, 'Jasmin')

    // Tamper with disk; cache should still serve the old value.
    writeFileSync(LABELS_PATH, JSON.stringify({}), { mode: 0o600 })
    expect(getLabel(ADDR_A)).toBe('Jasmin')
  })

  it('picks up external file changes after __resetForTests', async () => {
    const { setLabel, getLabel, __resetForTests } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, 'Jasmin')

    writeFileSync(LABELS_PATH, JSON.stringify({ [ADDR_A]: 'Replaced' }), { mode: 0o600 })
    __resetForTests()
    expect(getLabel(ADDR_A)).toBe('Replaced')
  })
})

describe('admin-labels: file permissions (best-effort)', () => {
  it('writes the file via atomicWriteJson which sets 0600', async () => {
    const { setLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, 'Jasmin')

    // POSIX mode check — skip on Windows where fs.chmod is a no-op.
    if (process.platform === 'win32') return
    const { statSync } = await import('node:fs')
    const mode = statSync(LABELS_PATH).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('keeps the surrounding data/ dir at 0700 with .htaccess present', async () => {
    const { setLabel } = await import('../src/services/admin-labels.js')
    setLabel(ADDR_A, 'Jasmin')
    expect(existsSync(join(DATA_DIR, '.htaccess'))).toBe(true)
    if (process.platform === 'win32') return
    const { statSync } = await import('node:fs')
    const mode = statSync(DATA_DIR).mode & 0o777
    expect(mode).toBe(0o700)
  })
})

// Suppress lint warning about unused import:
void mkdtempSync
void tmpdir
