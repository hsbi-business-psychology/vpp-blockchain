/**
 * @route POST /api/claim
 *
 * Lets a student claim survey points. The flow:
 *   1. Validate the request body (wallet address, survey ID, secret, signature).
 *   2. Check timestamp freshness to prevent replay attacks.
 *   3. Recover the signer from the EIP-191 signature and verify it matches
 *      the declared wallet address.
 *   4. Query the smart contract to ensure the survey exists, is active,
 *      and has not already been claimed by this wallet.
 *   5. Call `awardPoints()` on-chain via the Minter wallet.
 *
 * Rate-limited to prevent abuse (see `claimLimiter`).
 */
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { claimLimiter } from '../middleware/rateLimit.js'
import * as blockchain from '../services/blockchain.js'
import { getEventStore } from '../services/event-store.js'
import type { ClaimResult } from '../types.js'

const router: Router = Router()

const claimSchema = z.object({
  walletAddress: z.string().refine(ethers.isAddress, 'Invalid wallet address'),
  surveyId: z.number().int().positive(),
  secret: z.string().min(1),
  signature: z.string().min(1),
  message: z.string().min(1),
})

router.post('/', claimLimiter as RequestHandler, async (req, res, next) => {
  try {
    const parsed = claimSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0].message)
    }

    const { walletAddress, surveyId, secret, signature, message } = parsed.data

    // Verify timestamp freshness
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
      throw new AppError(
        400,
        'EXPIRED_MESSAGE',
        'Your signature has expired (older than 5 minutes). Please reload the page and sign again.',
      )
    }
    if (messageAge < -60_000) {
      throw new AppError(
        400,
        'INVALID_TIMESTAMP',
        'Your device clock appears to be incorrect. Please check your system time and try again.',
      )
    }

    // Verify EIP-191 signature
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

    // Check on-chain state
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
        400,
        'SURVEY_INACTIVE',
        'This survey has been deactivated and no longer accepts claims. Contact the survey administrator.',
      )
    }
    if (await blockchain.hasClaimed(walletAddress, surveyId)) {
      throw new AppError(
        409,
        'ALREADY_CLAIMED',
        'You have already claimed points for this survey. Each wallet can only claim once per survey.',
      )
    }

    // Submit transaction
    const receipt = await blockchain.awardPoints(walletAddress, surveyId, secret)
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
