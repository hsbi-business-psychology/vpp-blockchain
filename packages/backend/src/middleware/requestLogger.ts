import pinoHttp from 'pino-http'
import { logger } from '../lib/logger.js'

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/api/v1/health/live',
  },
})
