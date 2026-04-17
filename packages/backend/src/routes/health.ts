import { Router } from 'express'
import type {} from 'express-serve-static-core'
import { config } from '../config.js'
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

/**
 * Operator diagnostic. Reveals just enough to debug RPC connectivity issues
 * from the live server WITHOUT leaking secrets:
 *   - the RPC host (not the full URL — providers sometimes carry API keys
 *     in the path)
 *   - a fresh, non-cached chainId probe straight from `fetch()` so we can
 *     tell whether the failure is in the network layer (timeout / blocked
 *     egress) or in ethers' batching layer
 *   - the configured contract address and explorer base URL
 */
async function probeRpc(rpcUrl: string): Promise<{
  host: string
  ok: boolean
  chainId?: string
  httpStatus?: number
  error?: string
  elapsedMs: number
}> {
  let host: string
  try {
    host = new URL(rpcUrl).host
  } catch {
    host = '(invalid URL)'
  }
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const json = (await r.json()) as { result?: string; error?: { message?: string } }
    if (json.result) {
      return {
        host,
        ok: true,
        chainId: json.result,
        httpStatus: r.status,
        elapsedMs: Date.now() - start,
      }
    }
    return {
      host,
      ok: false,
      httpStatus: r.status,
      error: json.error?.message ?? 'no result and no error in JSON-RPC response',
      elapsedMs: Date.now() - start,
    }
  } catch (err) {
    return {
      host,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - start,
    }
  }
}

router.get('/diag', async (_req, res) => {
  const urls = config.rpcUrl
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)

  const probes = await Promise.all(urls.map(probeRpc))

  res.json({
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    rpc: {
      configured: urls.length,
      probes,
      anyOk: probes.some((p) => p.ok),
    },
    contractAddress: config.contractAddress,
    explorerBaseUrl: config.explorerBaseUrl,
  })
})

export default router
