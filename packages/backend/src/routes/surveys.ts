/**
 * @route /api/surveys
 *
 * CRUD-like endpoints for survey management (admin-only except GET).
 *
 *   POST   /              – Register a new survey on-chain.
 *   GET    /              – List all registered surveys (cached, 30 s TTL).
 *   POST   /:id/deactivate – Deactivate a survey (no more claims accepted).
 *   GET    /:id/template  – Download a SoSci or LimeSurvey template file
 *                           with the embedded claim button.
 */
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { requireAdmin } from '../middleware/auth.js'
import * as blockchain from '../services/blockchain.js'
import * as eventStore from '../services/event-store.js'
import { getSurveysWithCache, invalidateCache } from '../services/survey-cache.js'
import {
  generateSoSciTemplate,
  generateLimeSurveyTemplate,
  type TemplateFormat,
} from '../services/template.js'
import { parsePagination, paginate } from '../lib/pagination.js'
import type { SurveyRegisterResult } from '../types.js'

const router: Router = Router()

const registerSchema = z.object({
  surveyId: z.number().int().positive(),
  secret: z.string().min(1),
  points: z.number().int().min(1).max(255),
  maxClaims: z.number().int().min(0).default(0),
  title: z.string().default(''),
  adminSignature: z.string().min(1),
  adminMessage: z.string().min(1),
})

// POST /api/surveys — register a new survey (admin only)
router.post('/', requireAdmin as unknown as RequestHandler, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0].message)
    }

    const { surveyId, secret, points, maxClaims, title } = parsed.data

    // Check if survey already exists
    const existing = await blockchain.getSurveyInfo(surveyId)
    if (existing.points !== 0) {
      throw new AppError(
        409,
        'SURVEY_EXISTS',
        'A survey with this ID is already registered. Choose a different survey ID.',
      )
    }

    const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret))
    const receipt = await blockchain.registerSurvey(surveyId, secretHash, points, maxClaims, title)
    await eventStore.sync()

    const result: SurveyRegisterResult = {
      txHash: receipt.hash,
      explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
      templateDownloadUrl: `/api/v1/surveys/${surveyId}/template?secret=${encodeURIComponent(
        secret,
      )}`,
    }

    invalidateCache()

    res.status(201).json({ success: true, data: result })
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

// POST /api/surveys/:id/deactivate — deactivate a survey (admin only)
router.post(
  '/:id/deactivate',
  requireAdmin as unknown as RequestHandler,
  async (req, res, next) => {
    try {
      const surveyId = parseInt(req.params.id as string, 10)
      if (isNaN(surveyId) || surveyId <= 0) {
        throw new AppError(
          400,
          'INVALID_SURVEY_ID',
          'The survey ID must be a positive integer (e.g. 1, 2, 3).',
        )
      }

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
  },
)

// GET /api/surveys/:id/template — download survey template (SoSci or LimeSurvey)
router.get('/:id/template', async (req, res, next) => {
  try {
    const surveyId = parseInt(req.params.id as string, 10)
    if (isNaN(surveyId) || surveyId <= 0) {
      throw new AppError(
        400,
        'INVALID_SURVEY_ID',
        'The survey ID must be a positive integer (e.g. 1, 2, 3).',
      )
    }

    const secret = req.query.secret as string | undefined
    if (!secret) {
      throw new AppError(
        400,
        'MISSING_SECRET',
        'The survey secret is required to generate the template. Enter the secret you set when registering the survey.',
      )
    }

    const format = ((req.query.format as string) || 'sosci') as TemplateFormat
    if (format !== 'sosci' && format !== 'limesurvey') {
      throw new AppError(
        400,
        'INVALID_FORMAT',
        'Unsupported template format. Choose either "sosci" or "limesurvey".',
      )
    }

    const info = await blockchain.getSurveyInfo(surveyId)
    if (info.points === 0) {
      throw new AppError(
        404,
        'SURVEY_NOT_FOUND',
        'No survey found with this ID. It may not have been registered yet.',
      )
    }

    if (format === 'limesurvey') {
      const lss = generateLimeSurveyTemplate(surveyId, secret, info.points)
      res.setHeader('Content-Type', 'application/xml')
      res.setHeader('Content-Disposition', `attachment; filename="vpp-survey-${surveyId}.lss"`)
      res.send(lss)
    } else {
      const xml = generateSoSciTemplate(surveyId, secret, info.points)
      res.setHeader('Content-Type', 'application/xml')
      res.setHeader('Content-Disposition', `attachment; filename="vpp-survey-${surveyId}.xml"`)
      res.send(xml)
    }
  } catch (err) {
    next(err)
  }
})

export default router
