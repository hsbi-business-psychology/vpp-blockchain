/**
 * @file config.test.ts
 *
 * Boot-time validation tests for `config.ts`. The most important check is
 * `validatePrivateKey`, which guards against ever passing a malformed
 * MINTER_PRIVATE_KEY through to `new ethers.Wallet(...)` — ethers will
 * throw an error envelope that includes the raw value, which our log
 * redact has to catch but should never need to in the first place.
 *
 * Audit ref: M1 (probe.mjs leak), M13 (defense in depth), F2.7
 */
import { describe, expect, it } from 'vitest'
import { validatePrivateKey } from '../src/config.js'

describe('config.validatePrivateKey', () => {
  it('accepts a 0x-prefixed 64-hex private key and lowercases it', () => {
    const result = validatePrivateKey('0x' + 'A'.repeat(64), 'TEST_KEY')
    expect(result).toBe('0x' + 'a'.repeat(64))
  })

  it('accepts a bare 64-hex private key and adds the 0x prefix', () => {
    const result = validatePrivateKey('b'.repeat(64), 'TEST_KEY')
    expect(result).toBe('0x' + 'b'.repeat(64))
  })

  it('accepts an uppercase 0X prefix', () => {
    const result = validatePrivateKey('0X' + 'd'.repeat(64), 'TEST_KEY')
    expect(result).toBe('0x' + 'd'.repeat(64))
  })

  it('trims surrounding whitespace before validation', () => {
    const result = validatePrivateKey('  0x' + 'a'.repeat(64) + '\n', 'TEST_KEY')
    expect(result).toBe('0x' + 'a'.repeat(64))
  })

  it('rejects a key with the wrong length (too short)', () => {
    expect(() => validatePrivateKey('0xdeadbeef', 'TEST_KEY')).toThrow(
      /Invalid TEST_KEY.*length 8/i,
    )
  })

  it('rejects a key with the wrong length (too long)', () => {
    expect(() => validatePrivateKey('0x' + 'a'.repeat(65), 'TEST_KEY')).toThrow(
      /Invalid TEST_KEY.*length 65/i,
    )
  })

  it('rejects a key with non-hex characters', () => {
    expect(() => validatePrivateKey('0x' + 'z'.repeat(64), 'TEST_KEY')).toThrow(
      /Invalid TEST_KEY.*non-hex/i,
    )
  })

  it('rejects the all-zeros key', () => {
    expect(() => validatePrivateKey('0x' + '0'.repeat(64), 'TEST_KEY')).toThrow(/zero key/i)
  })

  it('does not include the raw key value in any error message', () => {
    const sensitive = '0x' + 'c'.repeat(63) + 'g'
    try {
      validatePrivateKey(sensitive, 'TEST_KEY')
      throw new Error('expected throw')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      expect(message).not.toContain(sensitive)
      expect(message).not.toContain('c'.repeat(20))
    }
  })

  it('uses the supplied name in the error message', () => {
    expect(() => validatePrivateKey('foo', 'CUSTOM_NAME_XYZ')).toThrow(/CUSTOM_NAME_XYZ/)
  })
})
