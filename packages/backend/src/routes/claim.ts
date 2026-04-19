/**
 * @route POST /api/v1/claim
 *
 * V2 claim flow. Replaces V1's plaintext-secret design with an HMAC
 * token signed by the backend's per-survey key.
 *
 * Request body (all required):
 *   - walletAddress  – the student's wallet (checksummed or lowercase).
 *   - surveyId       – numeric ID of the survey being claimed.
 *   - nonce          – the nonce embedded in the SoSci-generated URL
 *                      (`?n=<nonce>`). Single-use; consumed by this call.
 *   - token          – HMAC-SHA256 token from the SoSci-generated URL
 *                      (`?t=<token>`). Verified server-side against the
 *                      survey's HMAC key. Constant-time compare.
 *   - signature      – EIP-191 signature of `message` by `walletAddress`.
 *   - message        – `claim:<surveyId>:<nonce>:<unixSeconds>`. Must be
 *                      <= MAX_MESSAGE_AGE_MS old. The format is enforced
 *                      so timestamp parsing is unambiguous.
 *
 * Failure model:
 *   - 400 INVALID_MESSAGE / EXPIRED_MESSAGE / INVALID_TIMESTAMP /
 *     INVALID_SIGNATURE / INVALID_TOKEN_FORMAT / INVALID_NONCE_FORMAT
 *   - 401 (none — anonymous endpoint)
 *   - 404 SURVEY_NOT_FOUND
 *   - 409 ALREADY_CLAIMED / NONCE_USED
 *   - 410 SURVEY_INACTIVE
 *   - 5xx propagated through errorHandler
 *
 * Replay protection:
 *   - Each nonce can be redeemed exactly once (nonce-store).
 *   - The on-chain `awardPoints` call enforces one claim per
 *     (wallet, surveyId), so even a successful HMAC + fresh nonce from
 *     a re-issued URL cannot double-award.
 */
import { randomBytes } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { throwValidationError } from '../lib/validation.js'
import { claimLimiter } from '../middleware/rateLimit.js'
import * as blockchain from '../services/blockchain.js'
import { getEventStore } from '../services/event-store.js'
import {
  buildClaimUrl,
  isValidNonceShape,
  isValidTokenShape,
  verifyToken,
} from '../services/hmac.js'
import { isUsed, markUsed } from '../services/nonce-store.js'
import { getSurveyKey } from '../services/survey-keys.js'
import type { ClaimResult } from '../types.js'

const router: Router = Router()

/**
 * @route GET /api/v1/claim/launch/:surveyId
 *
 * Engine-agnostic claim entry-point. Designed to be called from a
 * plain `<a href>` link inside any survey engine (SoSci, LimeSurvey,
 * Qualtrics, Google Forms, ...) — no script execution, no PHP, no
 * browser HMAC required.
 *
 * Behaviour:
 *   - Generates a fresh 16-byte nonce server-side.
 *   - Computes the HMAC token using the per-survey key (which never
 *     leaves the backend).
 *   - 302-redirects to `${frontendUrl}/claim?s=&n=&t=` for the wallet
 *     sign + POST /claim flow.
 *
 * Failure model:
 *   - 400 INVALID_SURVEY_ID  — surveyId not a positive integer
 *   - 404 SURVEY_NOT_FOUND   — no per-survey key registered
 *
 * Security note:
 *   - The HMAC key is consulted in-memory and never appears in the
 *     redirect URL or any client-visible payload. This is a strict
 *     improvement over both the old SoSci-PHP and LimeSurvey-JS
 *     snippet variants (the latter leaked the key into the page
 *     source). Replay protection is unchanged: each nonce is single-
 *     use via the disk-backed nonce store, and the on-chain
 *     `_claimed[surveyId][wallet]` guard enforces one claim per
 *     (wallet, survey) regardless of nonce reuse attempts.
 *   - Anyone with the launcher URL can mint fresh (nonce, token)
 *     pairs at will, but each pair only entitles the holder to one
 *     successful POST /claim. The same was already true of the
 *     SoSci/LimeSurvey snippets — anyone reaching the goodbye page
 *     could refresh and get fresh nonces — so this does not weaken
 *     the existing trust model.
 *   - Rate-limited via `claimLimiter` (500 req/min/IP default) to
 *     blunt token-mint floods from a single source.
 */
router.get('/launch/:surveyId', claimLimiter as RequestHandler, (req, res, next) => {
  try {
    const surveyId = Number(req.params.surveyId)
    if (!Number.isInteger(surveyId) || surveyId <= 0 || surveyId > 1_000_000) {
      throw new AppError(
        400,
        'INVALID_SURVEY_ID',
        'The claim link is malformed (invalid survey id).',
      )
    }

    const surveyKey = getSurveyKey(surveyId)
    if (!surveyKey) {
      throw new AppError(
        404,
        'SURVEY_NOT_FOUND',
        'This survey is not registered or has no HMAC key. Contact the survey administrator.',
      )
    }

    const nonce = randomBytes(16).toString('base64url')
    const url = buildClaimUrl({
      origin: config.frontendUrl,
      surveyId,
      nonce,
      key: surveyKey,
    })

    // Cache-busting headers: each launch must produce a fresh nonce.
    // Without these, a CDN or browser back/forward navigation could
    // serve a cached redirect, which would lead to NONCE_USED on the
    // second click.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.redirect(302, url)
  } catch (err) {
    next(err)
  }
})

const claimSchema = z.object({
  walletAddress: z.string().refine(ethers.isAddress, 'Invalid wallet address'),
  surveyId: z.number().int().positive(),
  nonce: z.string().min(1),
  token: z.string().min(1),
  signature: z.string().min(1),
  message: z.string().min(1),
})

router.post('/', claimLimiter as RequestHandler, async (req, res, next) => {
  try {
    const parsed = claimSchema.safeParse(req.body)
    if (!parsed.success) {
      throwValidationError(parsed.error)
    }

    const { walletAddress, surveyId, nonce, token, signature, message } = parsed.data

    if (!isValidNonceShape(nonce)) {
      throw new AppError(
        400,
        'INVALID_NONCE_FORMAT',
        'The claim link is malformed. Open the SoSci goodbye page once more and use the freshly generated link.',
      )
    }
    if (!isValidTokenShape(token)) {
      throw new AppError(
        400,
        'INVALID_TOKEN_FORMAT',
        'The claim link is malformed. Open the SoSci goodbye page once more and use the freshly generated link.',
      )
    }

    // Step 1 — message timestamp freshness. Done before any RPC calls so
    // an obviously stale request does not consume rate budget for nothing.
    const parts = message.split(':')
    const timestamp = parseInt(parts[parts.length - 1], 10)
    if (isNaN(timestamp)) {
      throw new AppError(
        400,
        'INVALID_MESSAGE',
        'The signed message is malformed. Please reload the page and try again.',
      )
    }
    const messageAge = Date.now() - timestamp * 1000
    if (messageAge > config.maxMessageAgeMs) {
      const ageSeconds = Math.round(config.maxMessageAgeMs / 1000)
      throw new AppError(
        400,
        'EXPIRED_MESSAGE',
        `Your signature has expired (older than ${ageSeconds} s). Please reload the page and sign again.`,
      )
    }
    if (messageAge < -60_000) {
      throw new AppError(
        400,
        'INVALID_TIMESTAMP',
        'Your device clock appears to be incorrect. Please check your system time and try again.',
      )
    }

    // Step 2 — wallet ownership. EIP-191 verify recovers the signer; the
    // recovered address must match the claim's walletAddress. Without
    // this, the (nonce, token) pair could be redeemed by anyone who
    // intercepted the link.
    let recoveredAddress: string
    try {
      recoveredAddress = ethers.verifyMessage(message, signature)
    } catch {
      throw new AppError(
        400,
        'INVALID_SIGNATURE',
        'The signature could not be verified. Please reload the page and try again.',
      )
    }
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new AppError(
        400,
        'INVALID_SIGNATURE',
        'The signature does not match your wallet address. Make sure you are signing with the correct wallet.',
      )
    }

    // Step 3 — survey lookup. Reject early on missing / inactive surveys
    // so the user gets a meaningful 404 / 410 instead of a generic
    // on-chain revert.
    const surveyInfo = await blockchain.getSurveyInfo(surveyId)
    if (surveyInfo.points === 0) {
      throw new AppError(
        404,
        'SURVEY_NOT_FOUND',
        'This survey does not exist. The claim link may be invalid or the survey has not been registered yet.',
      )
    }
    if (!surveyInfo.active) {
      throw new AppError(
        410,
        'SURVEY_INACTIVE',
        'This survey has been deactivated and no longer accepts claims. Contact the survey administrator.',
      )
    }

    // Step 4 — HMAC verify. The survey-key store lookup happens AFTER
    // the survey existence check so a missing key on a registered survey
    // is a server configuration error (CONFIG_ERROR), not a user error.
    const surveyKey = getSurveyKey(surveyId)
    if (!surveyKey) {
      throw new AppError(
        500,
        'CONFIG_ERROR',
        'This survey is missing its HMAC key on the server. Please contact the administrator so the key can be regenerated.',
      )
    }
    if (!verifyToken({ surveyId, nonce, key: surveyKey, token })) {
      throw new AppError(
        400,
        'INVALID_TOKEN',
        'The claim link is invalid or has been tampered with. Open the SoSci goodbye page once more and use the freshly generated link.',
      )
    }

    // Step 5 — replay protection. Atomic check-and-set in the nonce
    // store. Any subsequent attempt with the same (surveyId, nonce)
    // returns false here. We check this BEFORE the on-chain
    // already-claimed test so a participant who closed and reopened the
    // SoSci tab gets a clear "link reused" error rather than the more
    // confusing "this wallet already claimed".
    if (isUsed(surveyId, nonce)) {
      throw new AppError(
        409,
        'NONCE_USED',
        'This claim link was already used. Each link can only be redeemed once. Open the SoSci goodbye page again to get a fresh link.',
      )
    }

    if (await blockchain.hasClaimed(walletAddress, surveyId)) {
      throw new AppError(
        409,
        'ALREADY_CLAIMED',
        'You have already claimed points for this survey. Each wallet can only claim once per survey.',
      )
    }

    // Mark the nonce consumed BEFORE broadcasting the on-chain TX. If the
    // TX fails (e.g. RPC outage), the participant must reopen SoSci to
    // get a fresh nonce — that is the cost of fail-closed replay
    // protection. The alternative (mark on success) would let an
    // attacker force a bunch of pending TXs and replay nonces freely.
    if (!markUsed(surveyId, nonce)) {
      // Race: another worker consumed the nonce between isUsed and markUsed.
      throw new AppError(
        409,
        'NONCE_USED',
        'This claim link was already used. Each link can only be redeemed once.',
      )
    }

    const receipt = await blockchain.awardPoints(walletAddress, surveyId)
    await getEventStore().sync()

    const result: ClaimResult = {
      txHash: receipt.hash,
      points: surveyInfo.points,
      explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
    }

    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
