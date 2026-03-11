import { Router } from 'express'
import { ethers } from 'ethers'
import { AppError } from '../middleware/errorHandler.js'
import * as blockchain from '../services/blockchain.js'
import type { PointsResult } from '../types.js'

const router = Router()

router.get('/:wallet', async (req, res, next) => {
  try {
    const { wallet } = req.params

    if (!ethers.isAddress(wallet)) {
      throw new AppError(400, 'INVALID_ADDRESS', 'The provided wallet address is not valid')
    }

    const [totalPoints, events] = await Promise.all([
      blockchain.getTotalPoints(wallet),
      blockchain.getPointsAwardedEvents(wallet),
    ])

    const result: PointsResult = {
      wallet: ethers.getAddress(wallet),
      totalPoints,
      surveys: events.map((event) => ({
        surveyId: event.surveyId,
        points: event.points,
        claimedAt: new Date(event.timestamp * 1000).toISOString(),
        txHash: event.transactionHash,
      })),
    }

    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
