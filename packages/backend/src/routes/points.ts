/**
 * @route /api/points
 *
 * Public endpoint for querying a wallet's point balance and claim history.
 * Events are read from the local event store (instant, no RPC event queries).
 * Only `totalPoints` is fetched live from the contract for accuracy.
 */
import { Router } from 'express'
import type {} from 'express-serve-static-core'
import { ethers } from 'ethers'
import { AppError } from '../middleware/errorHandler.js'
import * as blockchain from '../services/blockchain.js'
import * as eventStore from '../services/event-store.js'
import type { PointsResult } from '../types.js'

const router: Router = Router()

router.get('/:wallet', async (req, res, next) => {
  try {
    const { wallet } = req.params

    if (!ethers.isAddress(wallet)) {
      throw new AppError(400, 'INVALID_ADDRESS', 'The provided wallet address is not valid')
    }

    const [totalPoints, events] = await Promise.all([
      blockchain.getTotalPoints(wallet),
      Promise.resolve(eventStore.getPointsAwardedByWallet(wallet)),
    ])

    const result: PointsResult = {
      wallet: ethers.getAddress(wallet),
      totalPoints,
      surveys: events.map((event) => ({
        surveyId: event.surveyId,
        points: event.points,
        claimedAt: new Date(event.timestamp * 1000).toISOString(),
        txHash: event.txHash,
      })),
    }

    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
