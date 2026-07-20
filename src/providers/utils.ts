import type { Context } from 'koishi'

/**
 * 下载图片并转为 base64 与 mimeType（对齐 v1 aka-ai-generator 实现）
 * - 支持 Koishi 内部协议 URL（internal:onebot/...、internal:lark/... 等），走 ctx.http.file()
 * - MIME 类型用魔数检测，不猜后缀
 * - 默认最大 10MB
 */
export async function downloadImageAsBase64(
  ctx: Context,
  url: string,
  timeoutSec: number,
  maxSize = 10 * 1024 * 1024,
): Promise<{ data: string; mimeType: string }> {
  let buffer: Buffer

  if (url.startsWith('internal:')) {
    // Koishi/Satori 内部资源引用（QQ/飞书等平台的图片附件）
    const fileResult = await ctx.http.file(url, { timeout: timeoutSec * 1000 })
    buffer = Buffer.from(fileResult.data)
  } else {
    const resp = await ctx.http.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: timeoutSec * 1000,
      headers: { Accept: 'image/*' },
    })
    buffer = Buffer.from(resp as ArrayBuffer)
  }

  if (buffer.length > maxSize) {
    throw new Error(`图片大小超过限制 (${(maxSize / 1024 / 1024).toFixed(1)}MB)`)
  }

  return { data: buffer.toString('base64'), mimeType: detectMimeType(buffer, url) }
}

/** 魔数检测 MIME（对齐 v1；fallback 到后缀，最后默认 jpeg） */
function detectMimeType(buffer: Buffer, url: string): string {
  if (buffer.length > 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif'
    if (
      buffer.length > 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return 'image/webp'
    }
  }
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.png')) return 'image/png'
  if (clean.endsWith('.webp')) return 'image/webp'
  if (clean.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}
