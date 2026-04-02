import { Router } from 'express'
import adminRouter from './admin.js'
import claimRouter from './claim.js'
import healthRouter from './health.js'
import pointsRouter from './points.js'
import statusRouter from './status.js'
import surveysRouter from './surveys.js'
import walletsRouter from './wallets.js'

export function createApiRouter(): Router {
  const router = Router()
  router.use('/admin', adminRouter)
  router.use('/claim', claimRouter)
  router.use('/health', healthRouter)
  router.use('/points', pointsRouter)
  router.use('/status', statusRouter)
  router.use('/surveys', surveysRouter)
  router.use('/wallets', walletsRouter)
  return router
}
