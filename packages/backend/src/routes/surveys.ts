/**
 * @route /api/v1/surveys
 *
 * V2 survey management. The V1 endpoints accepted a plaintext secret;
 * V2 generates a per-survey HMAC key automatically and stores it in
 * the off-chain survey-keys store. Admins never have to think about
 * the secret material — it is generated, embedded into the SoSci
 * template on download, and rotated through dedicated endpoints.
 *
 *   GET    /              – List all surveys (cached, 30s TTL).
 *   POST   /              – Register a new survey + generate HMAC key.
 *   POST   /:id/deactivate – Stop accepting claims (admin).
 *   POST   /:id/reactivate – Re-enable a deactivated survey (admin).
 *   POST   /:id/revoke    – Revoke a previously awarded claim (admin).
 *   POST   /:id/template  – Download SoSci/LimeSurvey template embedding
 *                           the HMAC key (admin).
 *   POST   /:id/key/rotate – Generate a fresh HMAC key (admin).
 *   GET    /:id/key       – Return the current HMAC key (admin).
 */
import { Router } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { throwValidationError } from '../lib/validation.js'
import { requireAdminHandler } from '../middleware/auth.js'
import * as blockchain from '../services/blockchain.js'
import { getEventStore } from '../services/event-store.js'
import { getSurveysWithCache, invalidateCache } from '../services/survey-cache.js'
import { generateSoSciTemplate, generateLimeSurveyTemplate } from '../services/template.js'
import { parsePagination, paginate } from '../lib/pagination.js'
import {
  createKey,
  deleteKey,
  getKeyCreatedAt,
  getSurveyKey,
  hasKey,
  rotateKey,
} from '../services/survey-keys.js'

const router: Router = Router()

const registerSchema = z.object({
  surveyId: z.number().int().positive(),
  points: z.number().int().min(1).max(255),
  maxClaims: z.number().int().min(0).default(0),
  title: z.string().default(''),
  adminSignature: z.string().min(1),
  adminMessage: z.string().min(1),
})

function parseSurveyId(raw: unknown): number {
  const id = parseInt(String(raw), 10)
  if (isNaN(id) || id <= 0) {
    throw new AppError(
      400,
      'INVALID_SURVEY_ID',
      'The survey ID must be a positive integer (e.g. 1, 2, 3).',
    )
  }
  return id
}

// POST /api/v1/surveys — register a new survey (admin only)
router.post('/', requireAdminHandler, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      throwValidationError(parsed.error)
    }

    const { surveyId, points, maxClaims, title } = parsed.data

    const existing = await blockchain.getSurveyInfo(surveyId)
    if (existing.points !== 0) {
      throw new AppError(
        409,
        'SURVEY_EXISTS',
        'A survey with this ID is already registered. Choose a different survey ID.',
      )
    }

    // The off-chain key MUST exist before anyone tries to claim. Generate
    // it before the on-chain TX so a successful registration always has a
    // matching key. createKey throws if a key for this surveyId is already
    // present — that would only happen if a previous attempt registered
    // the key but failed to broadcast the contract TX. In that rare case
    // we surface a clear error so the admin can call /key/rotate or /key
    // to recover instead of silently overwriting.
    let surveyKey: string
    try {
      surveyKey = createKey(surveyId)
    } catch {
      throw new AppError(
        409,
        'KEY_EXISTS',
        `A leftover HMAC key for survey ${surveyId} exists from a previous failed registration. ` +
          `Use POST /api/v1/surveys/${surveyId}/key/rotate to roll it before retrying.`,
      )
    }

    let receipt: ethers.TransactionReceipt
    try {
      receipt = await blockchain.registerSurvey(surveyId, points, maxClaims, title)
    } catch (err) {
      // Roll back the key so retrying the registration starts from a clean
      // slate. Failure to delete is logged but not surfaced — the admin
      // sees the original on-chain failure, which is the actionable one.
      deleteKey(surveyId)
      throw err
    }
    await getEventStore().sync()

    invalidateCache()

    res.status(201).json({
      success: true,
      data: {
        txHash: receipt.hash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
        templateDownloadUrl: `/api/v1/surveys/${surveyId}/template`,
        // The HMAC key is returned in the response BODY, never logged. The
        // admin needs it once to paste into SoSci. They can also retrieve
        // it later via GET /:id/key (admin-authenticated).
        key: surveyKey,
        keyCreatedAt: new Date(getKeyCreatedAt(surveyId) ?? Date.now()).toISOString(),
      },
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/surveys — list all registered surveys (cached, optional pagination)
router.get('/', async (req, res, next) => {
  try {
    const allSurveys = await getSurveysWithCache()
    const params = parsePagination(req.query as Record<string, unknown>)
    const { items, pagination } = paginate(allSurveys, params)

    res.json({ success: true, data: items, ...(pagination && { pagination }) })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/deactivate', requireAdminHandler, async (req, res, next) => {
  try {
    const surveyId = parseSurveyId(req.params.id)

    const info = await blockchain.getSurveyInfo(surveyId)
    if (info.points === 0) {
      throw new AppError(
        404,
        'SURVEY_NOT_FOUND',
        'No survey found with this ID. It may not have been registered yet.',
      )
    }
    if (!info.active) {
      throw new AppError(409, 'ALREADY_INACTIVE', 'This survey is already deactivated.')
    }

    const receipt = await blockchain.deactivateSurvey(surveyId)
    await getEventStore().sync()
    invalidateCache()

    res.json({
      success: true,
      data: {
        txHash: receipt.hash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/reactivate', requireAdminHandler, async (req, res, next) => {
  try {
    const surveyId = parseSurveyId(req.params.id)

    const info = await blockchain.getSurveyInfo(surveyId)
    if (info.points === 0) {
      throw new AppError(
        404,
        'SURVEY_NOT_FOUND',
        'No survey found with this ID. It may not have been registered yet.',
      )
    }

    const receipt = await blockchain.reactivateSurvey(surveyId)
    await getEventStore().sync()
    invalidateCache()

    res.json({
      success: true,
      data: {
        txHash: receipt.hash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
      },
    })
  } catch (err) {
    next(err)
  }
})

const revokeSchema = z.object({
  student: z.string().refine(ethers.isAddress, 'Invalid wallet address'),
  adminSignature: z.string().min(1),
  adminMessage: z.string().min(1),
})

router.post('/:id/revoke', requireAdminHandler, async (req, res, next) => {
  try {
    const surveyId = parseSurveyId(req.params.id)
    const parsed = revokeSchema.safeParse(req.body)
    if (!parsed.success) {
      throwValidationError(parsed.error)
    }

    const receipt = await blockchain.revokePoints(parsed.data.student, surveyId)
    await getEventStore().sync()
    invalidateCache()

    res.json({
      success: true,
      data: {
        txHash: receipt.hash,
        explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
      },
    })
  } catch (err) {
    next(err)
  }
})

const templateSchema = z.object({
  format: z.enum(['sosci', 'limesurvey']).default('sosci'),
})

router.post('/:id/template', requireAdminHandler, async (req, res, next) => {
  try {
    const surveyId = parseSurveyId(req.params.id)

    const parsed = templateSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      throwValidationError(parsed.error)
    }
    const { format } = parsed.data

    const info = await blockchain.getSurveyInfo(surveyId)
    if (info.points === 0) {
      throw new AppError(
        404,
        'SURVEY_NOT_FOUND',
        'No survey found with this ID. It may not have been registered yet.',
      )
    }

    const surveyKey = getSurveyKey(surveyId)
    if (!surveyKey) {
      throw new AppError(
        404,
        'KEY_NOT_FOUND',
        'No HMAC key on file for this survey. Re-register the survey or call POST /key/rotate to create one.',
      )
    }

    if (format === 'limesurvey') {
      const lss = generateLimeSurveyTemplate(surveyId, surveyKey, info.points)
      res.setHeader('Content-Type', 'application/xml')
      res.setHeader('Content-Disposition', `attachment; filename="vpp-survey-${surveyId}.lss"`)
      res.send(lss)
    } else {
      const xml = generateSoSciTemplate(surveyId, surveyKey, info.points)
      res.setHeader('Content-Type', 'application/xml')
      res.setHeader('Content-Disposition', `attachment; filename="vpp-survey-${surveyId}.xml"`)
      res.send(xml)
    }
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/surveys/:id/key — return current HMAC key (admin only).
// Used when the admin lost the key from the registration response and
// needs it again for SoSci config without rotating.
router.get('/:id/key', requireAdminHandler, async (req, res, next) => {
  try {
    const surveyId = parseSurveyId(req.params.id)
    const key = getSurveyKey(surveyId)
    if (!key) {
      throw new AppError(
        404,
        'KEY_NOT_FOUND',
        'No HMAC key on file for this survey. Use POST /key/rotate to create one.',
      )
    }
    const createdAt = getKeyCreatedAt(surveyId)
    res.json({
      success: true,
      data: {
        surveyId,
        key,
        createdAt: createdAt ? new Date(createdAt).toISOString() : null,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/key/rotate', requireAdminHandler, async (req, res, next) => {
  try {
    const surveyId = parseSurveyId(req.params.id)

    const info = await blockchain.getSurveyInfo(surveyId)
    if (info.points === 0) {
      throw new AppError(
        404,
        'SURVEY_NOT_FOUND',
        'No survey found with this ID. Cannot rotate a key for an unregistered survey.',
      )
    }

    let key: string
    if (hasKey(surveyId)) {
      key = rotateKey(surveyId)
    } else {
      // First-ever key — happens when an admin registered a V1 survey and
      // the V2 backend never had a key for it. Treat as a regular create
      // so the admin gets a key without having to re-register.
      key = createKey(surveyId)
    }
    res.json({
      success: true,
      data: {
        surveyId,
        key,
        createdAt: new Date(getKeyCreatedAt(surveyId) ?? Date.now()).toISOString(),
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
