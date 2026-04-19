import type { IncomingMessage, ServerResponse } from 'node:http'
import pinoHttp from 'pino-http'
import { logger } from '../lib/logger.js'

// Header names that must always be redacted in request logs. Lower-cased
// because Node normalises incoming header names. See audit M13 / F6.4.
const SENSITIVE_HEADERS = new Set([
  'x-admin-signature',
  'x-admin-message',
  'authorization',
  'cookie',
])

function redactHeaders(headers: IncomingMessage['headers']): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(headers)) {
    out[name] = SENSITIVE_HEADERS.has(name.toLowerCase()) ? '[REDACTED]' : value
  }
  return out
}

// @ts-expect-error -- pino-http v11 ESM types don't expose a callable default export
export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/api/v1/health/live',
  },
  serializers: {
    // Mirror pino's stdSerializers but with our header redactor in front.
    // We do this in addition to logger.redact paths so that a future
    // pino-http upgrade or accidental `req.headers` log does not bypass
    // the protection.
    req: (req: IncomingMessage & { id?: string | number }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      headers: redactHeaders(req.headers),
      remoteAddress: (req.socket as { remoteAddress?: string } | null | undefined)?.remoteAddress,
      remotePort: (req.socket as { remotePort?: number } | null | undefined)?.remotePort,
    }),
    res: (res: ServerResponse) => ({
      statusCode: res.statusCode,
    }),
  },
})
