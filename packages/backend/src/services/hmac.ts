/**
 * @module hmac
 *
 * HMAC token issue & verify primitives for the V2 claim flow.
 *
 * Token format:
 *   token = base64url(HMAC-SHA256(surveyKey, "v1|<surveyId>|<nonce>"))
 *
 * The "v1|" prefix lets us bump the format later without invalidating
 * issued tokens silently — verifiers will simply reject unknown
 * versions. Pipe is used as the separator because it never appears in
 * decimal surveyId nor in URL-safe base64 nonces.
 *
 * Constant-time compare:
 *   Use crypto.timingSafeEqual instead of Buffer.equals to avoid the
 *   timing oracle that would let an attacker discover valid tokens
 *   character by character.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_VERSION = 'v1'

/**
 * Construct the canonical message that the HMAC is computed over.
 * Centralised so token issue and token verify cannot disagree on
 * spelling, ordering, or padding. Whitespace is intentional: any
 * difference (including a stray space) yields a completely different
 * MAC, which is exactly the property we want.
 */
function canonicalMessage(surveyId: number, nonce: string): string {
  if (!Number.isInteger(surveyId) || surveyId <= 0) {
    throw new Error(`Invalid surveyId: ${surveyId}`)
  }
  if (!nonce || typeof nonce !== 'string') {
    throw new Error('nonce must be a non-empty string')
  }
  return `${TOKEN_VERSION}|${surveyId}|${nonce}`
}

/**
 * Compute the token for a given (surveyId, nonce) pair using the
 * survey-specific HMAC key. Mostly useful in tests and in admin tools
 * that pre-render claim URLs; production traffic mainly invokes
 * {@link verifyToken}.
 */
export function issueToken(opts: { surveyId: number; nonce: string; key: string }): string {
  const message = canonicalMessage(opts.surveyId, opts.nonce)
  const mac = createHmac('sha256', Buffer.from(opts.key, 'base64url')).update(message).digest()
  return mac.toString('base64url')
}

/**
 * Verify a claim token. Returns true iff `token` matches the expected
 * HMAC of (surveyId, nonce) under `key`. Performs a constant-time
 * comparison on the raw byte buffers.
 */
export function verifyToken(opts: {
  surveyId: number
  nonce: string
  key: string
  token: string
}): boolean {
  let provided: Buffer
  try {
    provided = Buffer.from(opts.token, 'base64url')
  } catch {
    return false
  }
  // SHA-256 outputs 32 bytes; if the provided token is the wrong size
  // bail out before timingSafeEqual (which throws on length mismatch).
  if (provided.length !== 32) return false

  const expected = createHmac('sha256', Buffer.from(opts.key, 'base64url'))
    .update(canonicalMessage(opts.surveyId, opts.nonce))
    .digest()
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

/**
 * Returns the canonical claim URL for a given (surveyId, nonce, key)
 * triple. Accepts the public origin (e.g. https://vpstunden.hsbi.de)
 * so the same primitive renders both production and dev URLs without
 * embedding any environment lookup.
 */
export function buildClaimUrl(opts: {
  origin: string
  surveyId: number
  nonce: string
  key: string
  path?: string
}): string {
  const path = opts.path ?? '/claim'
  const token = issueToken({ surveyId: opts.surveyId, nonce: opts.nonce, key: opts.key })
  const url = new URL(path, opts.origin)
  url.searchParams.set('s', String(opts.surveyId))
  url.searchParams.set('n', opts.nonce)
  url.searchParams.set('t', token)
  return url.toString()
}

/**
 * Validate the shape of a claim nonce coming in from a query string.
 * Used by routes that accept user input. Real validation that the
 * nonce was actually issued by the operator's SoSci is impossible —
 * the HMAC verify is the real gate.
 *
 * Constraints:
 *   - URL-safe base64 only (A-Z, a-z, 0-9, -, _)
 *   - Length 16-128 characters (16 bytes hex up to 96 bytes base64)
 *
 * Anything outside that range is almost certainly a typo or attack and
 * we want to reject it before ever reaching the disk-backed nonce store.
 */
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export function isValidNonceShape(nonce: unknown): nonce is string {
  return typeof nonce === 'string' && NONCE_PATTERN.test(nonce)
}

/**
 * Validate the shape of a claim token coming in from a query string.
 * Tokens are always 32 bytes => 43 base64url chars (no padding).
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isValidTokenShape(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token)
}
