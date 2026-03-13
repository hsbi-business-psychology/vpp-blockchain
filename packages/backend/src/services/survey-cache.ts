/**
 * @module survey-cache
 *
 * Simple in-memory cache for the survey list. Fetching all surveys requires
 * multiple RPC calls (one `queryFilter` + one `getSurveyInfo` per survey),
 * which is expensive on public RPCs. The cache keeps results for 30 seconds
 * and is invalidated explicitly whenever a survey is registered or deactivated.
 */
import * as blockchain from './blockchain.js'
import type { SurveyInfo } from '../types.js'

const CACHE_TTL_MS = 30_000

let cachedSurveys: SurveyInfo[] | null = null
let cacheExpiry = 0

export async function getSurveysWithCache(): Promise<SurveyInfo[]> {
  if (cachedSurveys && Date.now() < cacheExpiry) {
    return cachedSurveys
  }

  const events = await blockchain.getSurveyRegisteredEvents()

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
