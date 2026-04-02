/**
 * @module server
 *
 * Express application factory for the VPP Backend.
 *
 * The backend acts as a stateless relayer between the frontend and the
 * Base blockchain. It never stores data itself — all state lives on-chain.
 *
 * Responsibilities:
 *   1. Verify EIP-191 signatures from students and admins.
 *   2. Forward validated requests to the SurveyPoints smart contract
 *      using the Minter wallet (gas is paid by the project, not users).
 *   3. Serve the compiled frontend SPA in production.
 *
 * In test mode (`NODE_ENV=test`) the server is not started automatically;
 * test suites call `createApp()` directly.
 */
import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { resolve, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { apiLimiter } from './middleware/rateLimit.js'
import { errorHandler } from './middleware/errorHandler.js'
import { createApiRouter } from './routes/index.js'
import { getEventStore } from './services/event-store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createApp(): Express {
  const app = express()

  // Security & parsing
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(cors({ origin: config.frontendUrl, methods: ['GET', 'POST'] }) as any)
  app.use(express.json())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(apiLimiter as any)

  // Versioned API routes
  app.use('/api/v1', createApiRouter())

  // Backward-compatible redirect: /api/* -> /api/v1/*
  app.use('/api', (req, res) => {
    res.redirect(308, `/api/v1${req.url}`)
  })

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
  const server = app.listen(config.port, () => {
    console.log(`VPP Backend listening on port ${config.port}`)
    console.log(`  Health: http://localhost:${config.port}/api/v1/health`)
  })

  const eventStore = getEventStore()
  eventStore.start().catch((err) => {
    console.error('Event store initial sync failed (will retry periodically):', err)
  })

  async function shutdown(signal: string) {
    console.log(`\n${signal} received — shutting down gracefully...`)

    server.close(() => {
      console.log('HTTP server closed')
    })

    eventStore.stop()
    console.log('Event store stopped')

    setTimeout(() => {
      console.error('Graceful shutdown timed out — forcing exit')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}
