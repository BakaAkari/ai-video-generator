import { ProviderError } from '../errors'

export interface RetryPolicyOptions {
  maxAttempts: number
  baseDelayMs: number
}

/** 指数退避重试（仅对 retryable 错误重试） */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryPolicyOptions = { maxAttempts: 3, baseDelayMs: 1000 },
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (error instanceof ProviderError && error.kind !== 'retryable') throw error
      if (attempt === options.maxAttempts) break
      const delay = options.baseDelayMs * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}
