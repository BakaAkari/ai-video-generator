export type ProviderErrorKind = 'retryable' | 'fatal' | 'quota'

export class ProviderError extends Error {
  constructor(
    message: string,
    public kind: ProviderErrorKind = 'fatal',
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export function sanitizeString(input: unknown, maxLen = 200): string {
  const s = String(input ?? '')
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) return sanitizeString(error.message)
  return sanitizeString(error)
}
