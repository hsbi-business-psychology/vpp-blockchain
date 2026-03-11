import type { Request, Response, NextFunction } from 'express'

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

const REVERT_MAP: Record<string, { status: number; code: string; message: string }> = {
  AlreadyClaimed: {
    status: 409,
    code: 'ALREADY_CLAIMED',
    message: 'This wallet has already claimed this survey',
  },
  SurveyNotActive: { status: 400, code: 'SURVEY_INACTIVE', message: 'Survey is no longer active' },
  MaxClaimsReached: {
    status: 400,
    code: 'MAX_CLAIMS_REACHED',
    message: 'Maximum number of claims reached for this survey',
  },
  InvalidSecret: { status: 400, code: 'INVALID_SECRET', message: 'Invalid survey secret' },
  SurveyAlreadyExists: {
    status: 409,
    code: 'SURVEY_EXISTS',
    message: 'A survey with this ID already exists',
  },
  InvalidSurveyId: { status: 400, code: 'INVALID_SURVEY_ID', message: 'Invalid survey ID' },
  InvalidPoints: { status: 400, code: 'INVALID_POINTS', message: 'Invalid point value' },
}

/**
 * Converts an ethers.js contract revert error into an AppError if it matches
 * a known custom error. Returns undefined for unrecognized errors.
 */
export function parseContractError(err: unknown): AppError | undefined {
  if (err == null || typeof err !== 'object') return undefined
  const reason = (err as Record<string, unknown>).reason as string | undefined
  const revertData = (err as Record<string, unknown>).revert as { name?: string } | undefined
  const errorName = revertData?.name ?? reason
  if (errorName && REVERT_MAP[errorName]) {
    const mapped = REVERT_MAP[errorName]
    return new AppError(mapped.status, mapped.code, mapped.message)
  }
  return undefined
}

/**
 * Central error handler. Must be registered as the last middleware so that
 * errors thrown or passed via `next(err)` in route handlers are caught here.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
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

  console.error('[unhandled error]', err)

  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  })
}
