import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  buildClaimUrl,
  isValidNonceShape,
  isValidTokenShape,
  issueToken,
  verifyToken,
} from '../src/services/hmac.js'

const KEY = randomBytes(32).toString('base64url')
const OTHER_KEY = randomBytes(32).toString('base64url')
const NONCE = 'abcdef0123456789ABCDEF_-fghi'

describe('hmac.issueToken / verifyToken', () => {
  it('round-trips a freshly issued token', () => {
    const token = issueToken({ surveyId: 42, nonce: NONCE, key: KEY })
    expect(verifyToken({ surveyId: 42, nonce: NONCE, key: KEY, token })).toBe(true)
  })

  it('produces a stable token for the same inputs', () => {
    const a = issueToken({ surveyId: 7, nonce: NONCE, key: KEY })
    const b = issueToken({ surveyId: 7, nonce: NONCE, key: KEY })
    expect(a).toBe(b)
  })

  it('produces a 43-char base64url token (32 bytes)', () => {
    const token = issueToken({ surveyId: 1, nonce: NONCE, key: KEY })
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('rejects a token signed with a different key', () => {
    const token = issueToken({ surveyId: 42, nonce: NONCE, key: OTHER_KEY })
    expect(verifyToken({ surveyId: 42, nonce: NONCE, key: KEY, token })).toBe(false)
  })

  it('rejects a token issued for a different surveyId', () => {
    const token = issueToken({ surveyId: 42, nonce: NONCE, key: KEY })
    expect(verifyToken({ surveyId: 43, nonce: NONCE, key: KEY, token })).toBe(false)
  })

  it('rejects a token issued for a different nonce', () => {
    const token = issueToken({ surveyId: 42, nonce: NONCE, key: KEY })
    expect(verifyToken({ surveyId: 42, nonce: 'differentnonce123', key: KEY, token })).toBe(false)
  })

  it('rejects a token of the wrong length', () => {
    expect(verifyToken({ surveyId: 42, nonce: NONCE, key: KEY, token: 'tooshort' })).toBe(false)
    const longToken = 'a'.repeat(100)
    expect(verifyToken({ surveyId: 42, nonce: NONCE, key: KEY, token: longToken })).toBe(false)
  })

  it('rejects a non-base64url token without throwing', () => {
    expect(verifyToken({ surveyId: 42, nonce: NONCE, key: KEY, token: '!!! not b64 !!!' })).toBe(
      false,
    )
  })

  it('rejects when surveyId is invalid', () => {
    expect(() => issueToken({ surveyId: 0, nonce: NONCE, key: KEY })).toThrow()
    expect(() => issueToken({ surveyId: -1, nonce: NONCE, key: KEY })).toThrow()
    expect(() => issueToken({ surveyId: 1.5, nonce: NONCE, key: KEY })).toThrow()
  })

  it('rejects when nonce is empty', () => {
    expect(() => issueToken({ surveyId: 1, nonce: '', key: KEY })).toThrow()
  })
})

describe('hmac.buildClaimUrl', () => {
  it('embeds surveyId, nonce, and a verifying token', () => {
    const url = buildClaimUrl({
      origin: 'https://vpstunden.hsbi.de',
      surveyId: 42,
      nonce: NONCE,
      key: KEY,
    })
    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://vpstunden.hsbi.de')
    expect(parsed.pathname).toBe('/claim')
    expect(parsed.searchParams.get('s')).toBe('42')
    expect(parsed.searchParams.get('n')).toBe(NONCE)
    const token = parsed.searchParams.get('t')!
    expect(verifyToken({ surveyId: 42, nonce: NONCE, key: KEY, token })).toBe(true)
  })

  it('honours a custom path', () => {
    const url = buildClaimUrl({
      origin: 'https://vpstunden.hsbi.de',
      surveyId: 1,
      nonce: NONCE,
      key: KEY,
      path: '/de/claim',
    })
    expect(new URL(url).pathname).toBe('/de/claim')
  })
})

describe('hmac.isValidNonceShape', () => {
  it('accepts the standard 32-char hex nonce SoSci will issue', () => {
    expect(isValidNonceShape('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(true)
  })

  it('accepts URL-safe base64 nonces', () => {
    expect(isValidNonceShape('abcdef-_ABCDEF12')).toBe(true)
  })

  it('rejects too-short nonces', () => {
    expect(isValidNonceShape('shortone')).toBe(false)
  })

  it('rejects too-long nonces', () => {
    expect(isValidNonceShape('a'.repeat(129))).toBe(false)
  })

  it('rejects nonces with disallowed characters', () => {
    expect(isValidNonceShape('contains spaces in it 123456')).toBe(false)
    expect(isValidNonceShape('special!chars/here1234')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isValidNonceShape(123 as unknown)).toBe(false)
    expect(isValidNonceShape(null)).toBe(false)
    expect(isValidNonceShape(undefined)).toBe(false)
  })
})

describe('hmac.isValidTokenShape', () => {
  it('accepts the standard 43-char base64url token', () => {
    const token = issueToken({ surveyId: 1, nonce: NONCE, key: KEY })
    expect(isValidTokenShape(token)).toBe(true)
  })

  it('rejects shorter or longer tokens', () => {
    expect(isValidTokenShape('a'.repeat(42))).toBe(false)
    expect(isValidTokenShape('a'.repeat(44))).toBe(false)
  })

  it('rejects tokens with disallowed characters', () => {
    expect(isValidTokenShape('+'.repeat(43))).toBe(false)
  })
})
