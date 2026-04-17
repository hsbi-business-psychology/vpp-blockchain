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
  // Plesk/Passenger pauses Node workers between requests, which means the
  // 60s background sync interval can drift or skip entirely. Use any /ready
  // probe (typically Uptime monitoring) as an opportunity to refresh the
  // cache. Fire-and-forget so we don't slow down the health probe.
  if (eventStore.isStale(60_000)) {
    void eventStore.sync()
  }

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
  // Probe ALL URLs that the FallbackProvider could route to — both the
  // operator-configured RPC_URL list AND the hard-coded public Base
  // fallbacks. Otherwise an operator looking at /diag would see only the
  // misconfigured primary as "down" and panic, even though the system was
  // happily serving traffic via a fallback.
  const configured = config.rpcUrl
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  const effective = blockchain.getEffectiveRpcUrls()
  const fallbackUrls = effective.filter((u) => !configured.includes(u))

  const [configuredProbes, fallbackProbes] = await Promise.all([
    Promise.all(configured.map(probeRpc)),
    Promise.all(fallbackUrls.map(probeRpc)),
  ])

  // Surface the event-store internals so operators can tell whether the
  // background sync is keeping up. Added after a production incident where
  // /ready showed lastSyncedBlock frozen for >30 min while the worker
  // uptime kept growing — without these fields it was impossible to tell
  // whether sync() was looping with errors, stuck mid-call, or simply not
  // being scheduled.
  const eventStore = getEventStore() as unknown as {
    getSyncDebug?: () => unknown
  }
  const sync = typeof eventStore.getSyncDebug === 'function' ? eventStore.getSyncDebug() : null

  res.json({
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    rpc: {
      configured: configured.length,
      configuredProbes,
      fallbacks: fallbackUrls.length,
      fallbackProbes,
      anyOk: configuredProbes.some((p) => p.ok) || fallbackProbes.some((p) => p.ok),
    },
    eventStore: sync,
    contractAddress: config.contractAddress,
    explorerBaseUrl: config.explorerBaseUrl,
  })
})

export default router
