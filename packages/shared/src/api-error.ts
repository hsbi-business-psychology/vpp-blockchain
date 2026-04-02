/**
 * Structured error thrown by `apiFetch` when the backend returns a non-success
 * response.  Preserves the machine-readable `code` (e.g. "ALREADY_CLAIMED")
 * so callers can branch on it instead of matching substrings.
 */
export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}
