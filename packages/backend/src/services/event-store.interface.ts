import type { StoredSurveyEvent, StoredPointsEvent } from './event-store.types.js'

export interface EventStore {
  start(): Promise<void>
  stop(): void
  sync(): Promise<void>
  /**
   * Returns true when the last successful sync was longer than `staleMs` ago.
   * Used by request handlers to opportunistically refresh the cache when the
   * background interval may have been paused (e.g. by Plesk/Passenger
   * between requests).
   */
  isStale(staleMs: number): boolean
  isReady(): boolean
  getSurveyRegisteredEvents(): StoredSurveyEvent[]
  getPointsAwardedByWallet(wallet: string): StoredPointsEvent[]
  getCurrentAdmins(): string[]
  getLastSyncedBlock(): number
}
