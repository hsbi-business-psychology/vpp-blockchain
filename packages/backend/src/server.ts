import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { resolve, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { apiLimiter } from './middleware/rateLimit.js'
import { errorHandler } from './middleware/errorHandler.js'
import claimRouter from './routes/claim.js'
import pointsRouter from './routes/points.js'
import surveysRouter from './routes/surveys.js'
import walletsRouter from './routes/wallets.js'
import healthRouter from './routes/health.js'
import statusRouter from './routes/status.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createApp(): Express {
  const app = express()

  // Security & parsing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: [
            "'self'",
            'https://base.drpc.org',
            'https://1rpc.io',
            'https://*.base.org',
            'https://*.basescan.org',
          ],
        },
      },
    }) as any,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(cors({ origin: config.frontendUrl, methods: ['GET', 'POST'] }) as any)
  app.use(express.json())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(apiLimiter as any)

  // Routes
  app.use('/api/claim', claimRouter)
  app.use('/api/points', pointsRouter)
  app.use('/api/surveys', surveysRouter)
  app.use('/api/wallets', walletsRouter)
  app.use('/api/health', healthRouter)
  app.use('/api/status', statusRouter)

  // Error handling for API routes
  app.use(errorHandler)

  // Serve frontend in production (static SPA files next to the backend)
  const publicDir = resolve(__dirname, '../public')
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir))
    app.get('*', (_req, res) => {
      res.sendFile(resolve(publicDir, 'index.html'))
    })
  }

  return app
}

// Start the server only when this file is the entry point (not during tests)
if (process.env.NODE_ENV !== 'test') {
  const app = createApp()
  app.listen(config.port, () => {
    console.log(`VPP Backend listening on port ${config.port}`)
    console.log(`  Health: http://localhost:${config.port}/api/health`)
  })
}
