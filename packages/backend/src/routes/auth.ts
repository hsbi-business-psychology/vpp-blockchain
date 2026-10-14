/**
 * @route /api/v1/auth
 *
 * Admin sign-in, one wallet signature per session.
 *
 *   GET  /challenge?address=0x…  – Sign-In-with-Ethereum message to sign.
 *   POST /login                  – { message, signature } → session cookie.
 *   GET  /session                – current session, null without one.
 *   POST /logout                 – clears the cookie.
 */
import { Router } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { AppError } from '../middleware/errorHandler.js'
import { throwValidationError } from '../lib/validation.js'
import { originAllowed } from '../middleware/auth.js'
import * as blockchain from '../services/blockchain.js'
import {
  clearedSessionCookie,
  createLoginChallenge,
  issueSession,
  readSession,
  readSessionCookie,
  sessionCookie,
  verifyLogin,
} from '../services/admin-session.js'

const router: Router = Router()

const challengeSchema = z.object({
  address: z.string().refine(ethers.isAddress, 'Invalid Ethereum address'),
})

const loginSchema = z.object({
  message: z.string().min(1).max(2000),
  signature: z.string().min(1).max(200),
})

router.get('/challenge', (req, res, next) => {
  try {
    const parsed = challengeSchema.safeParse(req.query)
    if (!parsed.success) throwValidationError(parsed.error)
    res.json({ success: true, data: { message: createLoginChallenge(parsed.data.address) } })
  } catch (err) {
    next(err)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) throwValidationError(parsed.error)

    const address = verifyLogin(parsed.data.message, parsed.data.signature)
    if (!(await blockchain.isAdmin(address))) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Your wallet does not have admin permissions. Ask an existing admin to grant you the ADMIN_ROLE.',
      )
    }

    const { token, session } = issueSession(address)
    res.setHeader('Set-Cookie', sessionCookie(token))
    res.json({ success: true, data: session })
  } catch (err) {
    next(err)
  }
})

// Answers null rather than 401 without a session: every admin page load
// asks, and "not signed in yet" is the normal case, not an error.
router.get('/session', async (req, res, next) => {
  try {
    const session = readSession(readSessionCookie(req.headers.cookie))
    const active = session && (await blockchain.isAdmin(session.address)) ? session : null
    res.json({ success: true, data: active })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', (req, res) => {
  if (!originAllowed(req)) {
    res.status(403).json({
      success: false,
      error: 'BAD_ORIGIN',
      message: 'This request did not come from the VPP website and was rejected.',
    })
    return
  }
  res.setHeader('Set-Cookie', clearedSessionCookie())
  res.json({ success: true, data: null })
})

export default router
