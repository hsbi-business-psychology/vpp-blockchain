import { Router } from 'express'
import type {} from 'express-serve-static-core'
import * as blockchain from '../services/blockchain.js'
import { getEventStore } from '../services/event-store.js'
import type { HealthResult } from '../types.js'

const router: Router = Router()
const startedAt = Date.now()

router.get('/live', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.floor((Date.now() - startedAt) / 1000) })
})

async function checkReady(): Promise<HealthResult> {
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
    // blockchain unreachable
  }

  const eventStore = getEventStore()
  const eventStoreReady = eventStore.isReady()
  const lastSyncedBlock = eventStore.getLastSyncedBlock()

  const ready = connected && eventStoreReady

  return {
    status: ready ? 'ok' : 'degraded',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    blockchain: { connected, network, blockNumber },
    eventStore: { ready: eventStoreReady, lastSyncedBlock },
  }
}

router.get('/ready', async (_req, res) => {
  const result = await checkReady()
  res.status(result.status === 'ok' ? 200 : 503).json(result)
})

router.get('/', async (_req, res) => {
  const result = await checkReady()
  res.status(result.status === 'ok' ? 200 : 503).json(result)
})

export default router
