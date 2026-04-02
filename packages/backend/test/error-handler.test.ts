import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import {
  AppError,
  ValidationError,
  parseContractError,
  errorHandler,
} from '../src/middleware/errorHandler.js'

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(data: unknown) {
      res.body = data
      return res
    },
  }
  return res as unknown as Response
}

const mockReq = {} as Request
const mockNext = vi.fn() as NextFunction

// ---------------------------------------------------------------------------
// AppError
// ---------------------------------------------------------------------------
describe('AppError', () => {
  it('should carry statusCode, errorCode, and message', () => {
    const err = new AppError(404, 'NOT_FOUND', 'Resource not found')

    expect(err.statusCode).toBe(404)
    expect(err.errorCode).toBe('NOT_FOUND')
    expect(err.message).toBe('Resource not found')
  })

  it('should have name "AppError"', () => {
    const err = new AppError(400, 'BAD', 'bad')
    expect(err.name).toBe('AppError')
  })

  it('should be an instance of Error', () => {
    const err = new AppError(500, 'ERR', 'msg')
    expect(err).toBeInstanceOf(Error)
  })
})

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------
describe('ValidationError', () => {
  it('should join detail messages into the error message', () => {
    const details = [
      { field: 'name', message: 'Name is required' },
      { field: 'age', message: 'Age must be positive' },
    ]
    const err = new ValidationError(details)

    expect(err.message).toBe('Name is required; Age must be positive')
  })

  it('should have statusCode 400 and errorCode VALIDATION_ERROR', () => {
    const err = new ValidationError([{ field: 'x', message: 'required' }])

    expect(err.statusCode).toBe(400)
    expect(err.errorCode).toBe('VALIDATION_ERROR')
  })

  it('should expose the details array', () => {
    const details = [{ field: 'email', message: 'invalid email' }]
    const err = new ValidationError(details)

    expect(err.details).toEqual(details)
  })

  it('should be an instance of AppError', () => {
    const err = new ValidationError([{ field: 'a', message: 'b' }])
    expect(err).toBeInstanceOf(AppError)
  })

  it('should have name "ValidationError"', () => {
    const err = new ValidationError([{ field: 'a', message: 'b' }])
    expect(err.name).toBe('ValidationError')
  })
})

// ---------------------------------------------------------------------------
// parseContractError
// ---------------------------------------------------------------------------
describe('parseContractError', () => {
  const KNOWN_REVERTS = [
    { name: 'AlreadyClaimed', code: 'ALREADY_CLAIMED', status: 409 },
    { name: 'SurveyNotActive', code: 'SURVEY_INACTIVE', status: 400 },
    { name: 'MaxClaimsReached', code: 'MAX_CLAIMS_REACHED', status: 400 },
    { name: 'InvalidSecret', code: 'INVALID_SECRET', status: 400 },
    { name: 'SurveyAlreadyExists', code: 'SURVEY_EXISTS', status: 409 },
    { name: 'InvalidSurveyId', code: 'INVALID_SURVEY_ID', status: 400 },
    { name: 'InvalidPoints', code: 'INVALID_POINTS', status: 400 },
  ]

  it.each(KNOWN_REVERTS)('should map $name to $code ($status)', ({ name, code, status }) => {
    const err = { revert: { name } }
    const result = parseContractError(err)

    expect(result).toBeInstanceOf(AppError)
    expect(result!.errorCode).toBe(code)
    expect(result!.statusCode).toBe(status)
  })

  it('should fall back to reason when revert.name is absent', () => {
    const err = { reason: 'AlreadyClaimed' }
    const result = parseContractError(err)

    expect(result).toBeInstanceOf(AppError)
    expect(result!.errorCode).toBe('ALREADY_CLAIMED')
  })

  it('should prefer revert.name over reason', () => {
    const err = { revert: { name: 'InvalidSecret' }, reason: 'AlreadyClaimed' }
    const result = parseContractError(err)

    expect(result!.errorCode).toBe('INVALID_SECRET')
  })

  it('should return undefined for an unknown revert name', () => {
    const err = { revert: { name: 'SomethingUnknown' } }
    expect(parseContractError(err)).toBeUndefined()
  })

  it('should return undefined for null input', () => {
    expect(parseContractError(null)).toBeUndefined()
  })

  it('should return undefined for undefined input', () => {
    expect(parseContractError(undefined)).toBeUndefined()
  })

  it('should return undefined for a plain string', () => {
    expect(parseContractError('some string')).toBeUndefined()
  })

  it('should return undefined for an object without revert or reason', () => {
    expect(parseContractError({ code: 'CALL_EXCEPTION' })).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  it('should handle ValidationError with 400 and details', () => {
    const details = [
      { field: 'surveyId', message: 'Required' },
      { field: 'points', message: 'Must be positive' },
    ]
    const err = new ValidationError(details)
    const res = createMockRes()

    errorHandler(err, mockReq, res, mockNext)

    expect(res.statusCode).toBe(400)
    const body = res.body as Record<string, unknown>
    expect(body.success).toBe(false)
    expect(body.error).toBe('VALIDATION_ERROR')
    expect(body.details).toEqual(details)
  })

  it('should handle AppError with its status and code', () => {
    const err = new AppError(409, 'ALREADY_ADMIN', 'Already an admin')
    const res = createMockRes()

    errorHandler(err, mockReq, res, mockNext)

    expect(res.statusCode).toBe(409)
    const body = res.body as Record<string, unknown>
    expect(body.success).toBe(false)
    expect(body.error).toBe('ALREADY_ADMIN')
    expect(body.message).toBe('Already an admin')
  })

  it('should handle a known contract revert error', () => {
    const err = Object.assign(new Error('transaction reverted'), {
      revert: { name: 'MaxClaimsReached' },
    })
    const res = createMockRes()

    errorHandler(err, mockReq, res, mockNext)

    expect(res.statusCode).toBe(400)
    const body = res.body as Record<string, unknown>
    expect(body.error).toBe('MAX_CLAIMS_REACHED')
  })

  it('should return 500 for an unknown Error', () => {
    const err = new Error('Something went wrong')
    const res = createMockRes()

    errorHandler(err, mockReq, res, mockNext)

    expect(res.statusCode).toBe(500)
    const body = res.body as Record<string, unknown>
    expect(body.success).toBe(false)
    expect(body.error).toBe('INTERNAL_ERROR')
  })

  it('should prioritize ValidationError over AppError branch', () => {
    const err = new ValidationError([{ field: 'x', message: 'y' }])
    const res = createMockRes()

    errorHandler(err, mockReq, res, mockNext)

    const body = res.body as Record<string, unknown>
    expect(body.error).toBe('VALIDATION_ERROR')
    expect(body.details).toBeDefined()
  })
})
