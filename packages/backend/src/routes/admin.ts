/**
 * @route /api/admin
 *
 * Manages ADMIN_ROLE on the smart contract. All transactions are executed
 * through the backend's Minter wallet so that admins don't need to hold
 * ETH themselves — only a valid EIP-191 signature is required.
 *
 *   GET    /        – List current admin addresses with labels + role flags.
 *   POST   /add     – Grant ADMIN_ROLE to a new address.
 *   POST   /remove  – Revoke ADMIN_ROLE from an address (Minter is protected).
 *   PUT    /label   – Set / clear a human-readable label for an address.
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
import { getAllLabels, setLabel, MAX_LABEL_LENGTH } from '../services/admin-labels.js'

const router: Router = Router()

const roleSchema = z.object({
  address: z.string().refine(ethers.isAddress, 'Invalid Ethereum address'),
  adminSignature: z.string().min(1),
  adminMessage: z.string().min(1),
})

const labelSchema = z.object({
  address: z.string().refine(ethers.isAddress, 'Invalid Ethereum address'),
  label: z.string().max(MAX_LABEL_LENGTH, `Label exceeds ${MAX_LABEL_LENGTH} characters`),
  adminSignature: z.string().min(1),
  adminMessage: z.string().min(1),
})

interface AdminEntry {
  address: string
  label: string | null
  isMinter: boolean
}

function buildEntries(addresses: string[]): AdminEntry[] {
  const labels = getAllLabels()
  const minter = blockchain.getMinterAddress().toLowerCase()
  return addresses.map((raw) => {
    const checksum = ethers.getAddress(raw)
    return {
      address: checksum,
      label: labels[checksum] ?? null,
      isMinter: checksum.toLowerCase() === minter,
    }
  })
}

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
    res.json({ success: true, data: { admins: buildEntries(admins) } })
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

    // Defense in depth: even though the frontend hides the remove button
    // for the Minter wallet, refuse the action server-side. Without the
    // Minter's ADMIN_ROLE the backend cannot mint points or grant new
    // admins — losing it would brick the entire app and require a
    // contract redeploy or DEFAULT_ADMIN intervention to recover.
    const minter = blockchain.getMinterAddress().toLowerCase()
    if (parsed.data.address.toLowerCase() === minter) {
      throw new AppError(
        400,
        'MINTER_PROTECTED',
        'The Minter wallet cannot be removed — the backend would lose its ability to mint points or manage admins. Edit the label only.',
      )
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

/**
 * Sets or clears the human-readable label for an admin address. Empty
 * string clears the label. Stored in `data/admin-labels.json` (off-chain
 * UX metadata only — no on-chain side effects).
 */
router.put('/label', requireAdminHandler, async (req, res, next) => {
  try {
    const parsed = labelSchema.safeParse(req.body)
    if (!parsed.success) {
      throwValidationError(parsed.error)
    }

    const checksum = ethers.getAddress(parsed.data.address)
    const newLabel = setLabel(checksum, parsed.data.label)

    res.json({
      success: true,
      data: {
        address: checksum,
        label: newLabel,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
