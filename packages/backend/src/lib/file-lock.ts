/**
 * @module file-lock
 *
 * Cross-process mutual exclusion for the JSON stores in `data/`. Passenger
 * may run several Node processes for the app; each keeps its own cache, so
 * a read-modify-write must hold a lock that every process can see. An
 * exclusive-create (`wx`) lock file is atomic on POSIX filesystems.
 */
import { randomBytes } from 'node:crypto'
import { closeSync, fstatSync, linkSync, openSync, renameSync, statSync, unlinkSync } from 'node:fs'

/** A holder that crashed leaves its lock behind; older locks are broken. */
const STALE_LOCK_MS = 10_000
const WAIT_LIMIT_MS = 3_000
const RETRY_MS = 5

const sleepCell = new Int32Array(new SharedArrayBuffer(4))

function sleepSync(ms: number): void {
  Atomics.wait(sleepCell, 0, 0, ms)
}

/**
 * Removes the lock if it is still the stale file that was looked at. Two
 * processes may judge the same lock stale; the rename lets only one take
 * it, and whoever moved a lock that turned out to be fresh puts it back.
 */
function breakIfStale(lockPath: string): void {
  let seen: ReturnType<typeof statSync>
  try {
    seen = statSync(lockPath)
  } catch {
    return
  }
  if (Date.now() - seen.mtimeMs <= STALE_LOCK_MS) return
  const grave = `${lockPath}.${process.pid}.${randomBytes(4).toString('hex')}`
  try {
    renameSync(lockPath, grave)
  } catch {
    return
  }
  // A freed inode number is often reused at once, so a fresh lock can carry
  // the old ino; its mtime is new, though.
  const moved = statSync(grave)
  if (moved.ino !== seen.ino || moved.mtimeMs !== seen.mtimeMs) {
    try {
      linkSync(grave, lockPath)
    } catch {
      // A newer lock already sits there; ours was the one to give back.
    }
  }
  unlinkSync(grave)
}

/** Unlinks the lock only while it is still the file this process created. */
function release(lockPath: string, fd: number): void {
  try {
    if (statSync(lockPath).ino === fstatSync(fd).ino) unlinkSync(lockPath)
  } catch {
    // Already gone.
  } finally {
    closeSync(fd)
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
      breakIfStale(lockPath)
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${lockPath}`, { cause: err })
      }
      sleepSync(RETRY_MS)
    }
  }
  try {
    return fn()
  } finally {
    release(lockPath, fd)
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
