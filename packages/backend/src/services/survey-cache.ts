/**
 * @module survey-cache
 *
 * In-memory cache for the survey list with a 30-second TTL.
 * When the event store is ready, survey events are read from the local
 * file cache (instant). Otherwise falls back to direct RPC queries.
 * Live survey info (claimCount, active status) is always fetched
 * via individual view-function calls.
 */
import * as blockchain from './blockchain.js'
import { getEventStore } from './event-store.js'
import { config } from '../config.js'
import type { SurveyInfo } from '../types.js'

let cachedSurveys: SurveyInfo[] | null = null
let cacheExpiry = 0

export async function getSurveysWithCache(): Promise<SurveyInfo[]> {
  if (cachedSurveys && Date.now() < cacheExpiry) {
    return cachedSurveys
  }

  let surveyEvents: Array<{ surveyId: number }>

  const store = getEventStore()
  if (store.isReady()) {
    surveyEvents = store.getSurveyRegisteredEvents()
  } else {
    surveyEvents = await blockchain.getSurveyRegisteredEvents()
  }

  const surveys: SurveyInfo[] = await Promise.all(
    surveyEvents.map(async (event) => {
      const info = await blockchain.getSurveyInfo(event.surveyId)
      return {
        surveyId: event.surveyId,
        title: info.title,
        points: info.points,
        maxClaims: Number(info.maxClaims),
        claimCount: Number(info.claimCount),
        active: info.active,
        registeredAt: new Date(Number(info.registeredAt) * 1000).toISOString(),
      }
    }),
  )

  cachedSurveys = surveys
  cacheExpiry = Date.now() + config.cacheTtlMs

  return surveys
}

export function invalidateCache(): void {
  cachedSurveys = null
  cacheExpiry = 0
}
