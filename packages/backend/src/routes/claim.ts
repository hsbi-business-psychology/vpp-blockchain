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
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { throwValidationError } from '../lib/validation.js'
import { claimLimiter } from '../middleware/rateLimit.js'
import * as blockchain from '../services/blockchain.js'
import { getEventStore } from '../services/event-store.js'
import { isValidNonceShape, isValidTokenShape, verifyToken } from '../services/hmac.js'
import { isUsed, markUsed } from '../services/nonce-store.js'
import { getSurveyKey } from '../services/survey-keys.js'
import type { ClaimResult } from '../types.js'

const router: Router = Router()

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
