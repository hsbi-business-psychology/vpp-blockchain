import type { Request, Response, NextFunction } from 'express'
import { ethers } from 'ethers'
import { isAdmin as checkAdmin } from '../services/blockchain.js'

/**
 * Express middleware that verifies an EIP-191 signed message from an admin
 * wallet. The request body must contain `adminSignature` and `adminMessage`.
 * The recovered signer must hold ADMIN_ROLE on the smart contract.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const adminSignature =
    (req.body as Record<string, string | undefined>).adminSignature ||
    (req.headers['x-admin-signature'] as string | undefined)
  const adminMessage =
    (req.body as Record<string, string | undefined>).adminMessage ||
    (req.headers['x-admin-message'] as string | undefined)

  if (!adminSignature || !adminMessage) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Missing admin signature or message',
    })
    return
  }

  try {
    const recoveredAddress = ethers.verifyMessage(adminMessage, adminSignature)

    const hasRole = await checkAdmin(recoveredAddress)
    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Signer does not hold ADMIN_ROLE on the contract',
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
