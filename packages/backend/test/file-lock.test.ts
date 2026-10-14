import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withFileLock } from '../src/lib/file-lock.js'

const dir = mkdtempSync(join(tmpdir(), 'vpp-lock-'))
const target = join(dir, 'store.json')
const lock = `${target}.lock`

afterEach(() => {
  rmSync(lock, { force: true })
})

describe('withFileLock', () => {
  it('holds the lock while running and removes it afterwards', () => {
    const held = withFileLock(target, () => existsSync(lock))

    expect(held).toBe(true)
    expect(existsSync(lock)).toBe(false)
  })

  it('removes its lock when the work throws', () => {
    expect(() =>
      withFileLock(target, () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(existsSync(lock)).toBe(false)
  })

  it('breaks a lock left behind by a crashed process', () => {
    writeFileSync(lock, '')
    const old = new Date(Date.now() - 60_000)
    utimesSync(lock, old, old)

    expect(withFileLock(target, () => 'ran')).toBe('ran')
  })

  it('does not delete a lock that another process took over meanwhile', () => {
    withFileLock(target, () => {
      // Another process broke our lock as stale and now holds its own.
      rmSync(lock)
      writeFileSync(lock, 'other process')
    })

    expect(existsSync(lock)).toBe(true)
  })
})
