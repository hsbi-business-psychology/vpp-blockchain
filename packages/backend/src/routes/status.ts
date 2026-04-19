import { Router } from 'express'
import { ethers } from 'ethers'
import { requireAdminHandler } from '../middleware/auth.js'
import * as blockchain from '../services/blockchain.js'

const router: Router = Router()

const AVG_GAS_PER_CLAIM = 55_000n
const AVG_GAS_PER_REGISTER = 80_000n

// GET /api/status — system status with wallet balance (admin only)
router.get('/', requireAdminHandler, async (_req, res, next) => {
  try {
    const [balance, blockNumber, network, contractVersion] = await Promise.all([
      blockchain.getMinterBalance(),
      blockchain.getBlockNumber(),
      blockchain.getNetwork(),
      blockchain.getContractVersion(),
    ])

    const feeData = await blockchain.provider.getFeeData()
    const gasPrice = feeData.gasPrice ?? 1_000_000n

    const estimatedClaimsRemaining = Number(balance / (AVG_GAS_PER_CLAIM * gasPrice))
    const estimatedRegistrationsRemaining = Number(balance / (AVG_GAS_PER_REGISTER * gasPrice))
    const costPerClaim = ethers.formatEther(AVG_GAS_PER_CLAIM * gasPrice)
    const costPerRegistration = ethers.formatEther(AVG_GAS_PER_REGISTER * gasPrice)

    const balanceEth = ethers.formatEther(balance)
    // Two thresholds: `lowBalance` is the legacy heuristic (less than ~100
    // claim Tx of head room at the current gas price) and matches the
    // existing admin UI banner. `belowWarn` / `belowMin` map to the
    // explicit operator-configurable hard/soft thresholds set up in
    // services/blockchain.ts (audit F2.4) so an external runbook /
    // monitor can read the same numbers the backend uses.
    const lowBalance = balance < AVG_GAS_PER_CLAIM * gasPrice * 100n
    const belowWarn = balance < blockchain.WARN_BALANCE_WEI
    const belowMin = balance < blockchain.MIN_BALANCE_WEI

    res.json({
      success: true,
      data: {
        minterAddress: blockchain.getMinterAddress(),
        balance: balanceEth,
        lowBalance,
        belowWarn,
        belowMin,
        warnThresholdEth: ethers.formatEther(blockchain.WARN_BALANCE_WEI),
        minThresholdEth: ethers.formatEther(blockchain.MIN_BALANCE_WEI),
        gasPrice: ethers.formatUnits(gasPrice, 'gwei'),
        estimates: {
          claimsRemaining: estimatedClaimsRemaining,
          registrationsRemaining: estimatedRegistrationsRemaining,
          costPerClaim,
          costPerRegistration,
        },
        blockchain: {
          network,
          blockNumber,
          contractAddress: blockchain.getContractAddress(),
          contractVersion,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
