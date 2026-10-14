/**
 * @module survey-cache
 *
 * In-memory cache for the survey list with a 30-second TTL.
 * When the event store is ready, survey events are read from the local
 * file cache (instant). Otherwise falls back to direct RPC queries.
 * Surveys that have a stored HMAC key are listed as well, so a survey
 * registered through this backend shows up even while the event cache is
 * behind. Live survey info (claimCount, active status) is always fetched
 * via individual view-function calls.
 */
import * as blockchain from './blockchain.js'
import { getEventStore } from './event-store.js'
import { listKeyedSurveyIds } from './survey-keys.js'
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

  const fromEvents = surveyEvents.map((event) => event.surveyId)
  const known = new Set(fromEvents)
  const keyedOnly = listKeyedSurveyIds().filter((id) => !known.has(id))

  const surveys: SurveyInfo[] = (
    await Promise.all(
      // A stored key alone does not prove the registration transaction
      // went through; loadSurvey skips ids the chain has no record of. RPC
      // errors fail the request rather than caching a shortened list.
      [...fromEvents, ...keyedOnly].map((surveyId) => loadSurvey(surveyId)),
    )
  ).filter((survey): survey is SurveyInfo => survey !== null)

  cachedSurveys = surveys
  cacheExpiry = Date.now() + config.cacheTtlMs

  return surveys
}

async function loadSurvey(surveyId: number): Promise<SurveyInfo | null> {
  const info = await blockchain.getSurveyInfo(surveyId)
  if (Number(info.registeredAt) === 0) return null
  return {
    surveyId,
    title: info.title,
    points: info.points,
    maxClaims: Number(info.maxClaims),
    claimCount: Number(info.claimCount),
    active: info.active,
    registeredAt: new Date(Number(info.registeredAt) * 1000).toISOString(),
  }
}

export function invalidateCache(): void {
  cachedSurveys = null
  cacheExpiry = 0
}
