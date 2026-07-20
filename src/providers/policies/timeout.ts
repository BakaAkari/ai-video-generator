/** 超时包装 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时（${Math.round(timeoutMs / 1000)}s）`)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
