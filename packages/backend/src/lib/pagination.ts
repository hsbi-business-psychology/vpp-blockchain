export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

/**
 * Parse optional `page` and `limit` query parameters.
 * Returns `null` when neither is provided so callers can skip
 * pagination and return the full list (backward-compatible).
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams | null {
  const page = Number(query.page)
  const limit = Number(query.limit)

  if (!page && !limit) return null

  return {
    page: Math.max(1, page || 1),
    limit: Math.min(100, Math.max(1, limit || 20)),
  }
}

/**
 * Slice an array according to pagination parameters.
 * When `params` is `null` the full array is returned without metadata.
 */
export function paginate<T>(
  items: T[],
  params: PaginationParams | null,
): { items: T[]; pagination?: PaginationMeta } {
  if (!params) return { items }

  const total = items.length
  const start = (params.page - 1) * params.limit

  return {
    items: items.slice(start, start + params.limit),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
  }
}
