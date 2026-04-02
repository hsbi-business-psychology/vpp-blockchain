export interface StoredSurveyEvent {
  surveyId: number
  points: number
  maxClaims: number
  blockNumber: number
  txHash: string
  timestamp: number
}

export interface StoredPointsEvent {
  wallet: string
  surveyId: number
  points: number
  blockNumber: number
  txHash: string
  timestamp: number
}

export interface StoredRoleEvent {
  type: 'grant' | 'revoke'
  account: string
  blockNumber: number
  logIndex: number
}

export interface EventStoreData {
  lastSyncedBlock: number
  surveyRegistered: StoredSurveyEvent[]
  pointsAwarded: StoredPointsEvent[]
  roleChanges: StoredRoleEvent[]
}
