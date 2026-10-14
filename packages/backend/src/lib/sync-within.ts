import type { EventStore } from '../services/event-store.interface.js'

/** How long a write route waits for the event cache after its transaction. */
export const POST_WRITE_SYNC_WAIT_MS = 5_000

/**
 * Starts an event-store sync and waits for it at most `maxWaitMs`. Write
 * routes call this after their transaction so the next read usually sees
 * the change, without holding the response while a long catch-up runs (a
 * claim used to wait up to the 45 s sync watchdog). The sync keeps running
 * in the background when the wait ends.
 */
export async function syncWithin(
  store: Pick<EventStore, 'sync'>,
  maxWaitMs = POST_WRITE_SYNC_WAIT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, maxWaitMs)
  })
  try {
    await Promise.race([store.sync().catch(() => undefined), timeout])
  } finally {
    clearTimeout(timer)
  }
}
