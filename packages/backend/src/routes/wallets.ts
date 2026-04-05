import { Router } from 'express'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { requireAdminHandler } from '../middleware/auth.js'
import * as blockchain from '../services/blockchain.js'

const router: Router = Router()

function validateAddress(address: string): string {
  if (!ethers.isAddress(address)) {
    throw new AppError(
      400,
      'INVALID_ADDRESS',
      'The wallet address is not valid. It must start with 0x followed by 40 hex characters.',
    )
  }
  return ethers.getAddress(address)
}

// GET /api/wallets/:address/submitted — check submission status (public)
router.get('/:address/submitted', async (req, res, next) => {
  try {
    const address = validateAddress(req.params.address as string)
    const submitted = await blockchain.isWalletSubmitted(address)
    const totalPoints = await blockchain.getTotalPoints(address)

    res.json({
      success: true,
      data: { address, submitted, totalPoints },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/wallets/:address/mark-submitted — mark wallet as submitted (admin only)
router.post('/:address/mark-submitted', requireAdminHandler, async (req, res, next) => {
  try {
    const address = validateAddress(req.params.address as string)

    const alreadySubmitted = await blockchain.isWalletSubmitted(address)
    if (alreadySubmitted) {
      throw new AppError(
        409,
        'ALREADY_SUBMITTED',
        'This wallet is already marked as submitted. It has already been used for thesis admission.',
      )
    }

    const receipt = await blockchain.markWalletSubmitted(address)

    res.json({
      success: true,
      data: {
        address,
        txHash: receipt.hash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
      },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/wallets/:address/unmark-submitted — remove submission mark (admin only)
router.post('/:address/unmark-submitted', requireAdminHandler, async (req, res, next) => {
  try {
    const address = validateAddress(req.params.address as string)

    const isSubmitted = await blockchain.isWalletSubmitted(address)
    if (!isSubmitted) {
      throw new AppError(
        409,
        'NOT_SUBMITTED',
        'This wallet is not marked as submitted, so there is nothing to undo.',
      )
    }

    const receipt = await blockchain.unmarkWalletSubmitted(address)

    res.json({
      success: true,
      data: {
        address,
        txHash: receipt.hash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
