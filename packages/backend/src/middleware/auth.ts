import type { Request, Response, NextFunction } from 'express'
import { ethers } from 'ethers'
import { config } from '../config.js'
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
      message: 'Admin authentication required. Please sign in with your admin wallet first.',
    })
    return
  }

  try {
    const recoveredAddress = ethers.verifyMessage(adminMessage, adminSignature)

    // Validate message timestamp to prevent replay attacks
    const parts = adminMessage.split(/[\s:]+/)
    const timestamp = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(timestamp) && timestamp < 1e12) {
      const ageMs = Date.now() - timestamp * 1000
      if (ageMs > config.maxMessageAgeMs) {
        res.status(400).json({
          success: false,
          error: 'EXPIRED_MESSAGE',
          message: 'Your admin signature has expired (older than 5 minutes). Please sign again.',
        })
        return
      }
      if (ageMs < -60_000) {
        res.status(400).json({
          success: false,
          error: 'INVALID_TIMESTAMP',
          message: 'Your device clock appears to be incorrect. Please check your system time.',
        })
        return
      }
    }

    const hasRole = await checkAdmin(recoveredAddress)
    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message:
          'Your wallet does not have admin permissions. Ask an existing admin to grant you the ADMIN_ROLE.',
      })
      return
    }

    next()
  } catch {
    res.status(401).json({
      success: false,
      error: 'INVALID_SIGNATURE',
      message: 'The signature is invalid or corrupted. Please sign in again with your wallet.',
    })
  }
}
