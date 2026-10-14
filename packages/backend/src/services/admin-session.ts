/**
 * @module admin-session
 *
 * One wallet signature per admin session instead of one per action.
 *
 * Login: the backend hands out a Sign-In-with-Ethereum (EIP-4361) message,
 * the admin signs it once, and `POST /auth/login` turns a valid signature
 * of an ADMIN_ROLE holder into an HttpOnly session cookie. Requests then
 * carry the cookie; middleware/auth.ts re-checks the on-chain role.
 *
 * Both the login nonce and the session token are HMACs under a secret in
 * `data/session-secret.json`, so every Passenger process can verify them
 * without shared memory. Deleting that file signs every admin out.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { atomicWriteJson } from '../lib/atomic-write.js'
import { withFileLock } from '../lib/file-lock.js'
import { DATA_DIR } from '../lib/paths.js'
import { AppError } from '../middleware/errorHandler.js'

export const SESSION_COOKIE = 'vpp_admin'
export const LOGIN_CHALLENGE_TTL_MS = 5 * 60_000

const SECRET_PATH = resolve(DATA_DIR, 'session-secret.json')
const TS_HEX = 10
const RAND_HEX = 16
const MAC_HEX = 24
const DEFAULT_CHAIN_ID = '8453'

let secret: Buffer | null = null

function getSecret(): Buffer {
  if (secret) return secret
  secret = withFileLock(SECRET_PATH, () => {
    if (existsSync(SECRET_PATH)) {
      const parsed = JSON.parse(readFileSync(SECRET_PATH, 'utf-8')) as { secret?: string }
      if (typeof parsed.secret === 'string' && parsed.secret.length >= 43) {
        return Buffer.from(parsed.secret, 'base64url')
      }
    }
    const fresh = randomBytes(32)
    atomicWriteJson(SECRET_PATH, { schemaVersion: 1, secret: fresh.toString('base64url') })
    return fresh
  })
  return secret
}

function mac(...parts: string[]): string {
  return createHmac('sha256', getSecret()).update(parts.join('|')).digest('hex')
}

function sameHex(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function site(): URL {
  return new URL(config.frontendUrl)
}

export function sessionHours(): number {
  return config.adminSessionHours
}

export function buildLoginMessage(address: string, nonce: string, issuedAt: Date): string {
  const origin = site()
  const expires = new Date(issuedAt.getTime() + LOGIN_CHALLENGE_TTL_MS)
  return [
    `${origin.host} wants you to sign in with your Ethereum account:`,
    address,
    '',
    `Anmeldung im Lehrenden-Bereich. Die Sitzung gilt ${sessionHours()} Stunden.`,
    '',
    `URI: ${origin.origin}`,
    'Version: 1',
    `Chain ID: ${config.expectedChainId ?? DEFAULT_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expires.toISOString()}`,
  ].join('\n')
}

/** Login message for `address`, valid for {@link LOGIN_CHALLENGE_TTL_MS}. */
export function createLoginChallenge(address: string): string {
  const checksum = ethers.getAddress(address)
  const seconds = Math.floor(Date.now() / 1000)
  const ts = seconds.toString(16).padStart(TS_HEX, '0')
  const rand = randomBytes(RAND_HEX / 2).toString('hex')
  const nonce = ts + rand + mac('login', ts, rand, checksum.toLowerCase()).slice(0, MAC_HEX)
  return buildLoginMessage(checksum, nonce, new Date(seconds * 1000))
}

// Login nonces are single-use per process. Another process would accept
// a replay within the 5-minute window, but only with the same signature,
// which yields a session for the same admin.
const usedLoginNonces = new Map<string, number>()

function consumeLoginNonce(nonce: string, expiresAt: number): boolean {
  const now = Date.now()
  for (const [n, exp] of usedLoginNonces) if (exp < now) usedLoginNonces.delete(n)
  if (usedLoginNonces.has(nonce)) return false
  usedLoginNonces.set(nonce, expiresAt)
  return true
}

function invalidLogin(message: string): AppError {
  return new AppError(401, 'INVALID_LOGIN', message)
}

/**
 * Checks a signed login message and returns the signer's checksum address.
 * The message must be byte-identical to one {@link createLoginChallenge}
 * produced, so nothing in it is parsed loosely.
 */
export function verifyLogin(message: string, signature: string): string {
  const lines = message.split('\n')
  const addressLine = lines[1] ?? ''
  const nonce = lines.find((l) => l.startsWith('Nonce: '))?.slice('Nonce: '.length) ?? ''
  if (!ethers.isAddress(addressLine) || !/^[0-9a-f]+$/.test(nonce)) {
    throw invalidLogin('The sign-in message is malformed. Please sign in again.')
  }
  if (nonce.length !== TS_HEX + RAND_HEX + MAC_HEX) {
    throw invalidLogin('The sign-in message is malformed. Please sign in again.')
  }
  const checksum = ethers.getAddress(addressLine)
  const ts = nonce.slice(0, TS_HEX)
  const rand = nonce.slice(TS_HEX, TS_HEX + RAND_HEX)
  const expectedMac = mac('login', ts, rand, checksum.toLowerCase()).slice(0, MAC_HEX)
  if (!sameHex(nonce.slice(TS_HEX + RAND_HEX), expectedMac)) {
    throw invalidLogin('The sign-in message was not issued by this server. Please sign in again.')
  }

  const issuedAtMs = parseInt(ts, 16) * 1000
  const age = Date.now() - issuedAtMs
  if (age > LOGIN_CHALLENGE_TTL_MS || age < -60_000) {
    throw new AppError(401, 'EXPIRED_LOGIN', 'The sign-in request expired. Please sign in again.')
  }
  if (message !== buildLoginMessage(checksum, nonce, new Date(issuedAtMs))) {
    throw invalidLogin('The sign-in message was modified. Please sign in again.')
  }

  let signer: string
  try {
    signer = ethers.verifyMessage(message, signature)
  } catch {
    throw invalidLogin('The signature is invalid. Please sign in again.')
  }
  if (signer !== checksum) {
    throw invalidLogin('The signature does not belong to this wallet. Please sign in again.')
  }
  if (!consumeLoginNonce(nonce, issuedAtMs + LOGIN_CHALLENGE_TTL_MS)) {
    throw invalidLogin('This sign-in request was already used. Please sign in again.')
  }
  return checksum
}

export interface AdminSession {
  address: string
  expiresAt: number
}

export function issueSession(address: string): { token: string; session: AdminSession } {
  const lower = ethers.getAddress(address).toLowerCase()
  const exp = Math.floor(Date.now() / 1000) + sessionHours() * 3600
  const token = `${lower}.${exp}.${mac('session', lower, String(exp))}`
  return { token, session: { address: ethers.getAddress(lower), expiresAt: exp * 1000 } }
}

/** The session a token stands for, or null if it is forged or expired. */
export function readSession(token: string | undefined): AdminSession | null {
  if (!token) return null
  const [lower, expRaw, sig] = token.split('.')
  if (!lower || !expRaw || !sig || !/^0x[0-9a-f]{40}$/.test(lower) || !/^\d+$/.test(expRaw)) {
    return null
  }
  if (!sameHex(sig, mac('session', lower, expRaw))) return null
  const expiresAt = Number(expRaw) * 1000
  if (expiresAt <= Date.now()) return null
  return { address: ethers.getAddress(lower), expiresAt }
}

function cookieAttributes(maxAgeSeconds: number): string {
  const secure = site().protocol === 'https:' ? '; Secure' : ''
  return `Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; ${cookieAttributes(sessionHours() * 3600)}`
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(0)}`
}

export function readSessionCookie(header: string | undefined): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === SESSION_COOKIE) return part.slice(eq + 1).trim()
  }
  return undefined
}

/** Test-only: forget the cached secret and used login nonces. */
export function __resetForTests(): void {
  secret = null
  usedLoginNonces.clear()
}
