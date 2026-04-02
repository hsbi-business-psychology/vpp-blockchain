import type { StoredSurveyEvent, StoredPointsEvent } from './event-store.types.js'

export interface EventStore {
  start(): Promise<void>
  stop(): void
  sync(): Promise<void>
  isReady(): boolean
  getSurveyRegisteredEvents(): StoredSurveyEvent[]
  getPointsAwardedByWallet(wallet: string): StoredPointsEvent[]
  getCurrentAdmins(): string[]
  getLastSyncedBlock(): number
}
