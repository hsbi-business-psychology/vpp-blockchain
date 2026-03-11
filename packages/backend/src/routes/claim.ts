import { Router } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { claimLimiter } from '../middleware/rateLimit.js'
import * as blockchain from '../services/blockchain.js'
import type { ClaimResult } from '../types.js'

const router = Router()

const claimSchema = z.object({
  walletAddress: z.string().refine(ethers.isAddress, 'Invalid wallet address'),
  surveyId: z.number().int().positive(),
  secret: z.string().min(1),
  signature: z.string().min(1),
  message: z.string().min(1),
})

router.post('/', claimLimiter, async (req, res, next) => {
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
      throw new AppError(400, 'INVALID_MESSAGE', 'Message does not contain a valid timestamp')
    }
    const messageAge = Date.now() - timestamp * 1000
    if (messageAge > config.maxMessageAgeMs) {
      throw new AppError(400, 'EXPIRED_MESSAGE', 'Signed message has expired')
    }
    if (messageAge < -60_000) {
      throw new AppError(400, 'INVALID_TIMESTAMP', 'Message timestamp is in the future')
    }

    // Verify EIP-191 signature
    let recoveredAddress: string
    try {
      recoveredAddress = ethers.verifyMessage(message, signature)
    } catch {
      throw new AppError(400, 'INVALID_SIGNATURE', 'Could not recover address from signature')
    }

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new AppError(400, 'INVALID_SIGNATURE', 'Signature does not match wallet address')
    }

    // Check on-chain state
    const surveyInfo = await blockchain.getSurveyInfo(surveyId)
    if (surveyInfo.points === 0) {
      throw new AppError(404, 'SURVEY_NOT_FOUND', 'Survey does not exist')
    }
    if (!surveyInfo.active) {
      throw new AppError(400, 'SURVEY_INACTIVE', 'Survey is no longer active')
    }
    if (await blockchain.hasClaimed(walletAddress, surveyId)) {
      throw new AppError(409, 'ALREADY_CLAIMED', 'This wallet has already claimed this survey')
    }

    // Submit transaction
    const receipt = await blockchain.awardPoints(walletAddress, surveyId, secret)

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
