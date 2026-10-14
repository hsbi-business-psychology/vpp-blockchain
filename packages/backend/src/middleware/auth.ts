import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { isAdmin as checkAdmin } from '../services/blockchain.js'
import { readSession, readSessionCookie } from '../services/admin-session.js'

/**
 * Admin authentication. Two ways in:
 *
 * 1. Session cookie from `POST /api/v1/auth/login` (one wallet signature
 *    per session). The on-chain ADMIN_ROLE is re-checked, cached for a
 *    minute, so a revoked admin loses access within that minute.
 * 2. An EIP-191 signed message with a trailing unix timestamp, sent as
 *    `adminSignature` / `adminMessage` (body) or `x-admin-signature` /
 *    `x-admin-message` (headers). Kept for scripts and older clients.
 *
 * {@link requireAdminAction} guards sensitive actions: it ignores the
 * cookie and wants a fresh signature whose message names the action.
 */

const ROLE_CACHE_MS = 60_000
const roleCache = new Map<string, { value: boolean; checkedAt: number }>()

async function isAdminCached(address: string): Promise<boolean> {
  const key = address.toLowerCase()
  const hit = roleCache.get(key)
  if (hit && Date.now() - hit.checkedAt < ROLE_CACHE_MS) return hit.value
  const value = await checkAdmin(address)
  roleCache.set(key, { value, checkedAt: Date.now() })
  return value
}

/** Test-only: forget cached role lookups. */
export function __resetRoleCacheForTests(): void {
  roleCache.clear()
}

// SameSite=Strict already keeps the cookie off cross-site requests; a
// foreign Origin on a write is refused as a second line.
export function originAllowed(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true
  const origin = req.headers.origin
  return !origin || origin === new URL(config.frontendUrl).origin
}

function signedCredentials(req: Request): { adminSignature?: string; adminMessage?: string } {
  const body = (req.body ?? {}) as Record<string, string | undefined>
  return {
    adminSignature: body.adminSignature || (req.headers['x-admin-signature'] as string | undefined),
    adminMessage: body.adminMessage || (req.headers['x-admin-message'] as string | undefined),
  }
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = readSession(readSessionCookie(req.headers.cookie))
  if (session) {
    if (!originAllowed(req)) {
      res.status(403).json({
        success: false,
        error: 'BAD_ORIGIN',
        message: 'This request did not come from the VPP website and was rejected.',
      })
      return
    }
    let hasRole: boolean
    try {
      hasRole = await isAdminCached(session.address)
    } catch (err) {
      next(err)
      return
    }
    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message:
          'Your wallet does not have admin permissions. Ask an existing admin to grant you the ADMIN_ROLE.',
      })
      return
    }
    res.locals.adminAddress = session.address
    next()
    return
  }

  const { adminSignature, adminMessage } = signedCredentials(req)
  if (!adminSignature || !adminMessage) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Admin authentication required. Please sign in with your admin wallet first.',
    })
    return
  }
  await verifySignedRequest(adminMessage, adminSignature, res, next)
}

// Action signatures are single-use: without this, a signed award could be
// replayed after a revoke while still inside the age window.
const usedActionSignatures = new Map<string, number>()

function consumeActionSignature(signature: string): boolean {
  const now = Date.now()
  for (const [sig, expires] of usedActionSignatures) {
    if (expires < now) usedActionSignatures.delete(sig)
  }
  const key = signature.toLowerCase()
  if (usedActionSignatures.has(key)) return false
  usedActionSignatures.set(key, now + config.maxMessageAgeMs + 120_000)
  return true
}

/** Test-only: forget consumed action signatures. */
export function __resetActionSignaturesForTests(): void {
  usedActionSignatures.clear()
}

async function verifySignedRequest(
  adminMessage: string,
  adminSignature: string,
  res: Response,
  next: NextFunction,
  singleUse = false,
): Promise<void> {
  // Step 1: recover signer address from the signed message. ONLY signature
  // problems should produce a 401 here — RPC / blockchain failures must not
  // be reported as "invalid signature" because that misleads operators into
  // thinking the wallet is broken when in reality the RPC is down.
  let recoveredAddress: string
  try {
    recoveredAddress = ethers.verifyMessage(adminMessage, adminSignature)
  } catch {
    res.status(401).json({
      success: false,
      error: 'INVALID_SIGNATURE',
      message: 'The signature is invalid or corrupted. Please sign in again with your wallet.',
    })
    return
  }

  // Step 2: validate message timestamp to prevent replay attacks.
  const parts = adminMessage.split(/[\s:]+/)
  const timestamp = parseInt(parts[parts.length - 1], 10)
  if (isNaN(timestamp) || timestamp >= 1e12) {
    res.status(400).json({
      success: false,
      error: 'INVALID_MESSAGE',
      message:
        'The signed message is malformed (missing timestamp). Please reload the page and try again.',
    })
    return
  }
  const ageMs = Date.now() - timestamp * 1000
  if (ageMs > config.maxMessageAgeMs) {
    const ageSeconds = Math.round(config.maxMessageAgeMs / 1000)
    res.status(400).json({
      success: false,
      error: 'EXPIRED_MESSAGE',
      message: `Your admin signature has expired (older than ${ageSeconds} s). Please sign again.`,
    })
    return
  }
  if (ageMs < -60_000) {
    res.status(400).json({
      success: false,
      error: 'INVALID_TIMESTAMP',
      message: 'Your device clock appears to be incorrect. Please check your system time.',
    })
    return
  }

  // Step 3: check the on-chain role. Errors here come from the RPC provider
  // (rate limits, network failures) and should propagate to the central
  // error handler so the client sees a 503 instead of a misleading 401.
  let hasRole: boolean
  try {
    hasRole = await checkAdmin(recoveredAddress)
  } catch (err) {
    next(err)
    return
  }

  if (!hasRole) {
    res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message:
        'Your wallet does not have admin permissions. Ask an existing admin to grant you the ADMIN_ROLE.',
    })
    return
  }

  if (singleUse && !consumeActionSignature(adminSignature)) {
    res.status(409).json({
      success: false,
      error: 'SIGNATURE_USED',
      message: 'This confirmation was already used. Please confirm the action again.',
    })
    return
  }

  res.locals.adminAddress = recoveredAddress
  next()
}

/** Type-safe wrapper that satisfies Express RequestHandler and forwards rejections to next(). */
export const requireAdminHandler: RequestHandler = (req, res, next) => {
  requireAdmin(req, res, next).catch(next)
}

/**
 * For actions that must not ride on a session cookie (role changes,
 * reading or rotating a survey key). Wants a signature made for this
 * request: the message has to start with `describe(req)` followed by a
 * space, e.g. "Add admin 0xabc… by 0xdef… at 1791900000".
 */
export function requireAdminAction(describe: (req: Request) => string): RequestHandler {
  return (req, res, next) => {
    const { adminSignature, adminMessage } = signedCredentials(req)
    if (!adminSignature || !adminMessage) {
      res.status(401).json({
        success: false,
        error: 'SIGNATURE_REQUIRED',
        message: 'This action has to be confirmed with your wallet.',
      })
      return
    }
    if (!adminMessage.toLowerCase().startsWith(`${describe(req).toLowerCase()} `)) {
      res.status(403).json({
        success: false,
        error: 'ACTION_MISMATCH',
        message: 'The signed message does not match this action. Please try again.',
      })
      return
    }
    verifySignedRequest(adminMessage, adminSignature, res, next, true).catch(next)
  }
}
