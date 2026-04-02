/**
 * @route /api/admin
 *
 * Manages ADMIN_ROLE on the smart contract. All transactions are executed
 * through the backend's Minter wallet so that admins don't need to hold
 * ETH themselves — only a valid EIP-191 signature is required.
 *
 *   GET    /       – List current admin addresses (event store or RPC fallback).
 *   POST   /add    – Grant ADMIN_ROLE to a new address.
 *   POST   /remove – Revoke ADMIN_ROLE from an address.
 */
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { throwValidationError } from '../lib/validation.js'
import { requireAdmin } from '../middleware/auth.js'
import * as blockchain from '../services/blockchain.js'
import { getEventStore } from '../services/event-store.js'

const router: Router = Router()

const roleSchema = z.object({
  address: z.string().refine(ethers.isAddress, 'Invalid Ethereum address'),
  adminSignature: z.string().min(1),
  adminMessage: z.string().min(1),
})

router.get('/', async (_req, res, next) => {
  try {
    const store = getEventStore()
    let admins: string[]
    if (store.isReady()) {
      admins = store.getCurrentAdmins()
    } else {
      admins = await blockchain.getAdminAddresses()
    }
    res.json({ success: true, data: { admins } })
  } catch (err) {
    next(err)
  }
})

router.post('/add', requireAdmin as unknown as RequestHandler, async (req, res, next) => {
  try {
    const parsed = roleSchema.safeParse(req.body)
    if (!parsed.success) {
      throwValidationError(parsed.error)
    }

    const alreadyAdmin = await blockchain.isAdmin(parsed.data.address)
    if (alreadyAdmin) {
      throw new AppError(
        409,
        'ALREADY_ADMIN',
        'This address already has admin permissions. No action needed.',
      )
    }

    const receipt = await blockchain.addAdmin(parsed.data.address)
    await getEventStore().sync()

    res.status(201).json({
      success: true,
      data: {
        txHash: receipt.hash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/remove', requireAdmin as unknown as RequestHandler, async (req, res, next) => {
  try {
    const parsed = roleSchema.safeParse(req.body)
    if (!parsed.success) {
      throwValidationError(parsed.error)
    }

    const isCurrentAdmin = await blockchain.isAdmin(parsed.data.address)
    if (!isCurrentAdmin) {
      throw new AppError(
        404,
        'NOT_ADMIN',
        'This address does not have admin permissions, so there is nothing to remove.',
      )
    }

    const receipt = await blockchain.removeAdmin(parsed.data.address)
    await getEventStore().sync()

    res.json({
      success: true,
      data: {
        txHash: receipt.hash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
