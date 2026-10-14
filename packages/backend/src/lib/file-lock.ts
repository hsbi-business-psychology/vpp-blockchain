/**
 * @module file-lock
 *
 * Cross-process mutual exclusion for the JSON stores in `data/`. Passenger
 * may run several Node processes for the app; each keeps its own cache, so
 * a read-modify-write must hold a lock that every process can see. An
 * exclusive-create (`wx`) lock file is atomic on POSIX filesystems.
 */
import { closeSync, openSync, statSync, unlinkSync } from 'node:fs'

/** A holder that crashed leaves its lock behind; older locks are broken. */
const STALE_LOCK_MS = 10_000
const WAIT_LIMIT_MS = 3_000
const RETRY_MS = 5

const sleepCell = new Int32Array(new SharedArrayBuffer(4))

function sleepSync(ms: number): void {
  Atomics.wait(sleepCell, 0, 0, ms)
}

function isStale(lockPath: string): boolean {
  try {
    return Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS
  } catch {
    return false
  }
}

/**
 * Runs `fn` while holding `${path}.lock`. Synchronous on purpose: the
 * callers do short file reads and writes, and no other code of this
 * process may run between their read and their write.
 */
export function withFileLock<T>(path: string, fn: () => T): T {
  const lockPath = `${path}.lock`
  const deadline = Date.now() + WAIT_LIMIT_MS
  let fd: number | null = null
  while (fd === null) {
    try {
      fd = openSync(lockPath, 'wx', 0o600)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      if (isStale(lockPath)) {
        try {
          unlinkSync(lockPath)
        } catch {
          // Another process removed it first.
        }
        continue
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${lockPath}`, { cause: err })
      }
      sleepSync(RETRY_MS)
    }
  }
  try {
    return fn()
  } finally {
    closeSync(fd)
    try {
      unlinkSync(lockPath)
    } catch {
      // Broken as stale by another process; nothing left to clean up.
    }
  }
}

/** Identity of a file's current contents, cheap enough to check per read. */
export function fileVersion(path: string): string | null {
  try {
    const s = statSync(path, { bigint: true })
    return `${s.mtimeNs}:${s.size}:${s.ino}`
  } catch {
    return null
  }
}
