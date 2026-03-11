import type { Request, Response, NextFunction } from 'express'
import { ethers } from 'ethers'
import { config } from '../config.js'

/**
 * Express middleware that verifies an EIP-191 signed message from an admin
 * wallet. The request body must contain `adminSignature` and `adminMessage`.
 * The recovered signer must be in the configured ADMIN_WALLETS list.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const { adminSignature, adminMessage } = req.body as {
    adminSignature?: string
    adminMessage?: string
  }

  if (!adminSignature || !adminMessage) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Missing admin signature or message',
    })
    return
  }

  try {
    const recoveredAddress = ethers.verifyMessage(adminMessage, adminSignature).toLowerCase()

    if (!config.adminWallets.includes(recoveredAddress)) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Signer is not an authorized admin wallet',
      })
      return
    }

    next()
  } catch {
    res.status(401).json({
      success: false,
      error: 'INVALID_SIGNATURE',
      message: 'Could not recover a valid address from the signature',
    })
  }
}
