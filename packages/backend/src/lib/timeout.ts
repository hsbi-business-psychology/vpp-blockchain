/** Rejects with `message` when `promise` has not settled within `ms`. The
 * underlying work is not cancelled; callers that can abort should do so
 * themselves (e.g. FetchRequest.timeout). */
export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message ?? `no answer within ${ms} ms`)), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}
