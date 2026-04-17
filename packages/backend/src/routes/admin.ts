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
import { Router } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { throwValidationError } from '../lib/validation.js'
import { requireAdminHandler } from '../middleware/auth.js'
import * as blockchain from '../services/blockchain.js'
import { getEventStore } from '../services/event-store.js'

const router: Router = Router()

const roleSchema = z.object({
  address: z.string().refine(ethers.isAddress, 'Invalid Ethereum address'),
  adminSignature: z.string().min(1),
  adminMessage: z.string().min(1),
})

router.get('/', requireAdminHandler, async (_req, res, next) => {
  try {
    const store = getEventStore()

    // Plesk/Passenger occasionally pauses the worker between requests,
    // which means the background sync interval might not have fired in
    // a while. Refresh opportunistically:
    //  - very stale (>5 min): await the sync so the caller sees the
    //    current list right now (this is the path that fixes the
    //    "I just added an admin and they don't show up" UX)
    //  - moderately stale (>30s): kick off a background sync, return
    //    cached data, next request will see the update
    if (store.isStale(300_000)) {
      await store.sync()
    } else if (store.isStale(30_000)) {
      void store.sync()
    }

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

router.post('/add', requireAdminHandler, async (req, res, next) => {
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

router.post('/remove', requireAdminHandler, async (req, res, next) => {
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
