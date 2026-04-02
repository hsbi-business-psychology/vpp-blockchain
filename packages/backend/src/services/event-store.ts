/**
 * @module event-store
 *
 * Factory for the EventStore implementation. Currently provides a
 * JSON-file-based store suitable for single-instance deployments.
 * Swap the implementation here to use Redis, Postgres or any other
 * backend without touching route handlers.
 */
import type { EventStore } from './event-store.interface.js'
import { JsonFileEventStore } from './json-file-event-store.js'

let instance: EventStore | null = null

export function getEventStore(): EventStore {
  if (!instance) {
    instance = new JsonFileEventStore()
  }
  return instance
}

export type { EventStore }
export * from './event-store.types.js'
