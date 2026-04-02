import type { ZodError } from 'zod'
import { ValidationError } from '../middleware/errorHandler.js'

export function throwValidationError(zodError: ZodError): never {
  const details = zodError.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }))
  throw new ValidationError(details)
}
