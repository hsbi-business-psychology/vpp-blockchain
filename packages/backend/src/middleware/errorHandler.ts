/**
 * @module errorHandler
 *
 * Centralised error handling for the Express API.
 *
 * - `AppError` is thrown by route handlers for expected errors (validation,
 *   auth failures, business logic). Each carries an HTTP status code and a
 *   machine-readable error code.
 * - `parseContractError` maps Solidity custom revert reasons (e.g.
 *   `AlreadyClaimed`, `MaxClaimsReached`) to matching `AppError` instances
 *   so the frontend receives a useful error instead of a generic 500.
 * - The `errorHandler` middleware is registered last and catches everything.
 */
import type { Request, Response, NextFunction } from 'express'
import { logger } from '../lib/logger.js'

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(public readonly details: Array<{ field: string; message: string }>) {
    super(400, 'VALIDATION_ERROR', details.map((d) => d.message).join('; '))
    this.name = 'ValidationError'
  }
}

const REVERT_MAP: Record<string, { status: number; code: string; message: string }> = {
  AlreadyClaimed: {
    status: 409,
    code: 'ALREADY_CLAIMED',
    message:
      'This wallet has already claimed points for this survey. Each wallet can only claim once per survey.',
  },
  SurveyNotActive: {
    status: 400,
    code: 'SURVEY_INACTIVE',
    message:
      'This survey has been deactivated and no longer accepts claims. Contact the survey administrator.',
  },
  MaxClaimsReached: {
    status: 400,
    code: 'MAX_CLAIMS_REACHED',
    message:
      'The maximum number of participants for this survey has been reached. No more claims are accepted.',
  },
  InvalidSecret: {
    // V1-only revert. Kept in the map so that legacy V1 contracts encountered
    // during migration still surface a useful error rather than a generic 500.
    status: 400,
    code: 'INVALID_SECRET',
    message:
      'The survey secret is incorrect. Make sure you are using the original claim link from the survey.',
  },
  NotClaimed: {
    status: 404,
    code: 'NOT_CLAIMED',
    message:
      'This wallet has not claimed this survey, so there is nothing to revoke. Check the wallet and survey ID.',
  },
  SurveyAlreadyActive: {
    status: 409,
    code: 'SURVEY_ALREADY_ACTIVE',
    message: 'This survey is already active. Use deactivate to disable it.',
  },
  LastAdmin: {
    status: 409,
    code: 'LAST_ADMIN',
    message:
      'Refusing to remove the last admin — at least one ADMIN_ROLE holder must remain. ' +
      'Add another admin first, then retry the removal.',
  },
  SurveyAlreadyExists: {
    status: 409,
    code: 'SURVEY_EXISTS',
    message: 'A survey with this ID is already registered. Choose a different survey ID.',
  },
  InvalidSurveyId: {
    status: 400,
    code: 'INVALID_SURVEY_ID',
    message: 'The survey ID must be a positive integer (e.g. 1, 2, 3).',
  },
  InvalidPoints: {
    status: 400,
    code: 'INVALID_POINTS',
    message: 'Points must be between 1 and 255.',
  },
  SurveyNotFound: {
    status: 404,
    code: 'SURVEY_NOT_FOUND',
    message: 'No survey found with this ID. It may not have been registered yet.',
  },
  ZeroAddress: {
    status: 400,
    code: 'ZERO_ADDRESS',
    message: 'The zero address is not allowed.',
  },
  WalletAlreadySubmitted: {
    status: 409,
    code: 'ALREADY_SUBMITTED',
    message:
      'This wallet is already marked as submitted. It has already been used for thesis admission.',
  },
  WalletNotSubmitted: {
    status: 404,
    code: 'NOT_SUBMITTED',
    message: 'This wallet is not marked as submitted, so there is nothing to undo.',
  },
  AccessControlUnauthorizedAccount: {
    status: 403,
    code: 'ROLE_UNAUTHORIZED',
    message:
      'The backend wallet does not have the required role to perform this action. ' +
      'Check that the wallet has both ADMIN_ROLE and MINTER_ROLE on the smart contract.',
  },
}

/**
 * Converts an ethers.js contract revert error into an AppError if it matches
 * a known custom error. Returns undefined for unrecognized errors.
 */
export function parseContractError(err: unknown): AppError | undefined {
  if (err == null || typeof err !== 'object') return undefined
  const rec = err as Record<string, unknown>
  const reason = rec.reason as string | undefined
  const revertData = rec.revert as { name?: string } | undefined
  const errorName = revertData?.name ?? reason

  if (errorName && REVERT_MAP[errorName]) {
    const mapped = REVERT_MAP[errorName]
    return new AppError(mapped.status, mapped.code, mapped.message)
  }

  const shortMessage = rec.shortMessage as string | undefined
  if (shortMessage) {
    for (const name of Object.keys(REVERT_MAP)) {
      if (shortMessage.includes(name)) {
        const mapped = REVERT_MAP[name]
        return new AppError(mapped.status, mapped.code, mapped.message)
      }
    }
  }

  return undefined
}

/**
 * Detects ethers.js provider-level errors like INSUFFICIENT_FUNDS that occur
 * before a transaction reaches the contract. Returns an AppError with a clear
 * message, or undefined for unrecognized errors.
 */
export function parseProviderError(err: unknown): AppError | undefined {
  if (err == null || typeof err !== 'object') return undefined

  const code = (err as Record<string, unknown>).code as string | undefined
  if (code === 'INSUFFICIENT_FUNDS') {
    return new AppError(
      503,
      'INSUFFICIENT_FUNDS',
      'The backend wallet does not have enough ETH to pay transaction fees. ' +
        'Please contact the system administrator to top up the wallet.',
    )
  }

  const message = (err as Record<string, unknown>).message
  if (
    typeof message === 'string' &&
    /insufficient funds/i.test(message) &&
    !/revert/i.test(message)
  ) {
    return new AppError(
      503,
      'INSUFFICIENT_FUNDS',
      'The backend wallet does not have enough ETH to pay transaction fees. ' +
        'Please contact the system administrator to top up the wallet.',
    )
  }

  return undefined
}

/**
 * Central error handler. Must be registered as the last middleware so that
 * errors thrown or passed via `next(err)` in route handlers are caught here.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: err.message,
      details: err.details,
    })
    return
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.errorCode,
      message: err.message,
    })
    return
  }

  const contractErr = parseContractError(err)
  if (contractErr) {
    res.status(contractErr.statusCode).json({
      success: false,
      error: contractErr.errorCode,
      message: contractErr.message,
    })
    return
  }

  const providerErr = parseProviderError(err)
  if (providerErr) {
    logger.warn({ err }, 'Transaction failed: insufficient funds in backend wallet')
    res.status(providerErr.statusCode).json({
      success: false,
      error: providerErr.errorCode,
      message: providerErr.message,
    })
    return
  }

  logger.error({ err }, 'Unhandled error')

  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again later or contact the administrator.',
  })
}
