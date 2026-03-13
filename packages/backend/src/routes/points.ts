/**
 * @route /api/points
 *
 * Public endpoint for querying a wallet's point balance and claim history.
 * Uses the event store when ready (instant), otherwise falls back to
 * direct RPC event queries. `totalPoints` is always fetched live.
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

    let claimEvents: Array<{
      surveyId: number
      points: number
      timestamp: number
      txHash: string
    }>

    if (eventStore.isReady()) {
      claimEvents = eventStore.getPointsAwardedByWallet(wallet)
    } else {
      const rpcEvents = await blockchain.getPointsAwardedEvents(wallet)
      claimEvents = rpcEvents.map((e) => ({
        surveyId: e.surveyId,
        points: e.points,
        timestamp: e.timestamp,
        txHash: e.transactionHash,
      }))
    }

    const totalPoints = await blockchain.getTotalPoints(wallet)

    const result: PointsResult = {
      wallet: ethers.getAddress(wallet),
      totalPoints,
      surveys: claimEvents.map((event) => ({
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
