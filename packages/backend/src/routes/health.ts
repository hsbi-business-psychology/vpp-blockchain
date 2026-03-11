import { Router } from 'express'
import type {} from 'express-serve-static-core'
import * as blockchain from '../services/blockchain.js'
import type { HealthResult } from '../types.js'

const router: Router = Router()
const startedAt = Date.now()

router.get('/', async (_req, res) => {
  let blockNumber: number | null = null
  let network: string | null = null
  let connected = false

  try {
    ;[blockNumber, network] = await Promise.all([
      blockchain.getBlockNumber(),
      blockchain.getNetwork(),
    ])
    connected = true
  } catch {
    // blockchain unreachable — report as disconnected
  }

  const result: HealthResult = {
    status: connected ? 'ok' : 'degraded',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    blockchain: { connected, network, blockNumber },
  }

  res.status(connected ? 200 : 503).json(result)
})

export default router
