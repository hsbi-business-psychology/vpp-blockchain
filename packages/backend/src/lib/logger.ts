import pino from 'pino'

// Paths that must never appear in logs in plaintext, even if a caller
// accidentally passes the entire `req` / `body` / `err` object to the logger.
//
// Threat model: a Plesk-tenant operator with read access to our log files
// must not see admin signatures (replay window 5 min — see audit M2 / F6.4),
// nor HMAC claim tokens / nonces, nor the live MINTER_PRIVATE_KEY when ethers
// includes the rejected value in its INVALID_ARGUMENT errors (M13 / F2.5).
//
// Wildcards (`*`) match exactly one path segment. Specific paths (e.g.
// `req.headers["x-admin-signature"]`) are bracketed when the segment contains
// non-identifier characters.
const REDACT_PATHS = [
  // ---------------------------------------------------------------------
  // Headers — admin signature transport + standard auth headers
  // ---------------------------------------------------------------------
  'req.headers["x-admin-signature"]',
  'req.headers["x-admin-message"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',

  // ---------------------------------------------------------------------
  // Body fields — claim flow (POST /api/v1/claim) + admin sig flow
  // ---------------------------------------------------------------------
  '*.adminSignature',
  '*.adminMessage',
  'body.signature',
  'body.message',
  'body.token',
  'body.nonce',
  'req.body.signature',
  'req.body.message',
  'req.body.token',
  'req.body.nonce',
  'req.body.adminSignature',
  'req.body.adminMessage',

  // ---------------------------------------------------------------------
  // Secret material — never log, even if a caller forwards config or env
  // ---------------------------------------------------------------------
  '*.privateKey',
  '*.minterPrivateKey',
  '*.MINTER_PRIVATE_KEY',
  '*.HMAC_KEY',
  '*.hmacKey',

  // ---------------------------------------------------------------------
  // Error envelopes — ethers' INVALID_ARGUMENT errors include `value`
  // (the rejected argument) and `argument` (its name). For a malformed
  // minter PK, `value` is the key itself (audit M13 / F2.5).
  // We list the concrete envelope paths instead of a wildcard `*.value`
  // so that legitimate `value` fields elsewhere remain debuggable.
  // ---------------------------------------------------------------------
  'err.value',
  'err.argument',
  'err.info.value',
  'err.cause.value',
  'err.error.value',
  'error.value',
  'error.argument',
] as const

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [...REDACT_PATHS],
    censor: '[REDACTED]',
    remove: false,
  },
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})
