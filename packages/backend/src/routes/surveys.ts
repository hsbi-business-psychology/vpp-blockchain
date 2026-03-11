import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ethers } from 'ethers'
import { config } from '../config.js'
import { AppError } from '../middleware/errorHandler.js'
import { requireAdmin } from '../middleware/auth.js'
import * as blockchain from '../services/blockchain.js'
import { generateSoSciTemplate } from '../services/template.js'
import type { SurveyInfo, SurveyRegisterResult } from '../types.js'

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
      throw new AppError(409, 'SURVEY_EXISTS', 'A survey with this ID already exists')
    }

    const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret))
    const receipt = await blockchain.registerSurvey(surveyId, secretHash, points, maxClaims, title)

    const result: SurveyRegisterResult = {
      txHash: receipt.hash,
      explorerUrl: `${config.explorerBaseUrl}/tx/${receipt.hash}`,
      templateDownloadUrl: `/api/surveys/${surveyId}/template?secret=${encodeURIComponent(secret)}`,
    }

    res.status(201).json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/surveys — list all registered surveys
router.get('/', async (_req, res, next) => {
  try {
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

    res.json({ success: true, data: surveys })
  } catch (err) {
    next(err)
  }
})

// POST /api/surveys/:id/deactivate — deactivate a survey (admin only)
router.post('/:id/deactivate', requireAdmin as unknown as RequestHandler, async (req, res, next) => {
  try {
    const surveyId = parseInt(req.params.id, 10)
    if (isNaN(surveyId) || surveyId <= 0) {
      throw new AppError(400, 'INVALID_SURVEY_ID', 'Survey ID must be a positive integer')
    }

    const info = await blockchain.getSurveyInfo(surveyId)
    if (info.points === 0) {
      throw new AppError(404, 'SURVEY_NOT_FOUND', 'Survey does not exist')
    }
    if (!info.active) {
      throw new AppError(409, 'ALREADY_INACTIVE', 'Survey is already inactive')
    }

    const receipt = await blockchain.deactivateSurvey(surveyId)

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

// GET /api/surveys/:id/template — download SoSci Survey XML template
router.get('/:id/template', async (req, res, next) => {
  try {
    const surveyId = parseInt(req.params.id, 10)
    if (isNaN(surveyId) || surveyId <= 0) {
      throw new AppError(400, 'INVALID_SURVEY_ID', 'Survey ID must be a positive integer')
    }

    const secret = req.query.secret as string | undefined
    if (!secret) {
      throw new AppError(400, 'MISSING_SECRET', 'Secret query parameter is required')
    }

    const info = await blockchain.getSurveyInfo(surveyId)
    if (info.points === 0) {
      throw new AppError(404, 'SURVEY_NOT_FOUND', 'Survey does not exist')
    }

    const xml = generateSoSciTemplate(surveyId, secret, info.points)

    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Content-Disposition', `attachment; filename="vpp-survey-${surveyId}.xml"`)
    res.send(xml)
  } catch (err) {
    next(err)
  }
})

export default router
