import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { atomicWriteJson, ensureSecureDataDir } from '../src/lib/atomic-write.js'

// POSIX permission bits we expect after each operation. We mask away the
// file-type bits so the assertions remain readable.
const PERM_MASK = 0o777

let tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vpp-atomic-write-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('atomicWriteJson', () => {
  it('writes the JSON content under the requested path', () => {
    const dir = makeTempDir()
    const path = join(dir, 'sub', 'store.json')
    const payload = { schemaVersion: 1, items: ['a', 'b'] }

    atomicWriteJson(path, payload)

    const onDisk = JSON.parse(readFileSync(path, 'utf-8'))
    expect(onDisk).toEqual(payload)
  })

  it('creates the parent directory with mode 0700', () => {
    const dir = makeTempDir()
    const subdir = join(dir, 'fresh-data')
    const path = join(subdir, 'store.json')

    atomicWriteJson(path, { ok: true })

    const stat = statSync(subdir)
    // Symbolic equivalent: drwx------ for the owner only.
    expect(stat.mode & PERM_MASK).toBe(0o700)
  })

  it('persists the JSON file with mode 0600', () => {
    const dir = makeTempDir()
    const path = join(dir, 'store.json')

    atomicWriteJson(path, { ok: true })

    const stat = statSync(path)
    expect(stat.mode & PERM_MASK).toBe(0o600)
  })

  it('tightens permissions on overwrite of an existing 0644 file', () => {
    const dir = makeTempDir()
    const path = join(dir, 'pre-existing.json')

    // Simulate a file left over from a previous, looser-permissioned write
    // (e.g. an old release or a manual scp from the operator).
    atomicWriteJson(path, { round: 1 })
    chmodSync(path, 0o644)

    atomicWriteJson(path, { round: 2 })

    const stat = statSync(path)
    expect(stat.mode & PERM_MASK).toBe(0o600)
  })

  it('drops a deny-from-all .htaccess into the data directory', () => {
    const dir = makeTempDir()
    const path = join(dir, 'store.json')

    atomicWriteJson(path, { ok: true })

    const htaccess = readFileSync(join(dir, '.htaccess'), 'utf-8')
    expect(htaccess).toContain('Require all denied')
    expect(htaccess).toContain('Deny from all')
  })
})

describe('ensureSecureDataDir', () => {
  it('is idempotent — repeated calls do not churn the .htaccess mtime', () => {
    const dir = makeTempDir()
    ensureSecureDataDir(dir)
    const firstMtime = statSync(join(dir, '.htaccess')).mtimeMs

    // Sleep a tiny bit so a real rewrite would produce a distinguishable
    // mtime on filesystems with millisecond resolution.
    const start = Date.now()
    while (Date.now() - start < 5) {
      /* spin */
    }

    ensureSecureDataDir(dir)
    const secondMtime = statSync(join(dir, '.htaccess')).mtimeMs

    expect(secondMtime).toBe(firstMtime)
  })
})
