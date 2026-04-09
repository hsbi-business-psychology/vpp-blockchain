import type { IncomingMessage } from 'node:http'
import pinoHttp from 'pino-http'
import { logger } from '../lib/logger.js'

// @ts-expect-error -- pino-http v11 ESM types don't expose a callable default export
export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/api/v1/health/live',
  },
})
