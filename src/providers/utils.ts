import type { Context } from 'koishi'

/** 下载图片并转为 base64 data 与 mimeType */
export async function downloadImageAsBase64(
  ctx: Context,
  url: string,
  timeoutSec: number,
): Promise<{ data: string; mimeType: string }> {
  const resp = await ctx.http.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: timeoutSec * 1000,
  })
  const mimeType = guessMimeType(url)
  const base64 = Buffer.from(resp as ArrayBuffer).toString('base64')
  return { data: base64, mimeType }
}

function guessMimeType(url: string): string {
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.png')) return 'image/png'
  if (clean.endsWith('.webp')) return 'image/webp'
  if (clean.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}
