import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { config } from './config.js'
import { apiLimiter } from './middleware/rateLimit.js'
import { errorHandler } from './middleware/errorHandler.js'
import claimRouter from './routes/claim.js'
import pointsRouter from './routes/points.js'
import surveysRouter from './routes/surveys.js'
import healthRouter from './routes/health.js'

export function createApp(): Express {
  const app = express()

  // Security & parsing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(helmet() as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(cors({ origin: config.frontendUrl, methods: ['GET', 'POST'] }) as any)
  app.use(express.json())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(apiLimiter as any)

  // Routes
  app.use('/api/claim', claimRouter)
  app.use('/api/points', pointsRouter)
  app.use('/api/surveys', surveysRouter)
  app.use('/api/health', healthRouter)

  // Error handling (must be last)
  app.use(errorHandler)

  return app
}

// Start the server when this file is run directly
const app = createApp()
app.listen(config.port, () => {
  console.log(`VPP Backend listening on port ${config.port}`)
  console.log(`  Health: http://localhost:${config.port}/api/health`)
})
