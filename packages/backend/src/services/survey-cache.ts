/**
 * @module survey-cache
 *
 * In-memory cache for the survey list with a 30-second TTL.
 * Survey events are read from the local event store (instant),
 * then live survey info (claimCount, active status) is fetched
 * via individual view-function calls.
 */
import * as blockchain from './blockchain.js'
import * as eventStore from './event-store.js'
import type { SurveyInfo } from '../types.js'

const CACHE_TTL_MS = 30_000

let cachedSurveys: SurveyInfo[] | null = null
let cacheExpiry = 0

export async function getSurveysWithCache(): Promise<SurveyInfo[]> {
  if (cachedSurveys && Date.now() < cacheExpiry) {
    return cachedSurveys
  }

  const events = eventStore.getSurveyRegisteredEvents()

  const surveys: SurveyInfo[] = await Promise.all(
    events.map(async (event) => {
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
  cacheExpiry = Date.now() + CACHE_TTL_MS

  return surveys
}

export function invalidateCache(): void {
  cachedSurveys = null
  cacheExpiry = 0
}
