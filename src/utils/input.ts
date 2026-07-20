import { h, type Session } from 'koishi'

/** 从消息内容中解析图片 URL 与纯文本 */
export function parseMessageImagesAndText(content: string): { images: h[]; text: string } {
  const elements = h.parse(content)
  const images: h[] = []
  const textParts: string[] = []
  for (const el of elements) {
    if (el.type === 'img' || el.type === 'image') {
      images.push(el)
    } else if (el.type === 'text' && el.attrs.content?.trim()) {
      textParts.push(el.attrs.content.trim())
    }
  }
  return { images, text: textParts.join(' ') }
}

/** 从命令参数与引用消息中收集图片 URL */
export function collectImagesFromParamAndQuote(session: Session, imgParam?: string): string[] {
  const urls: string[] = []
  if (imgParam) {
    const { images } = parseMessageImagesAndText(imgParam)
    for (const img of images) {
      const src = img.attrs.src || img.attrs.url
      if (src) urls.push(src)
    }
  }
  const quote = session.quote
  if (quote?.content) {
    const { images } = parseMessageImagesAndText(quote.content)
    for (const img of images) {
      const src = img.attrs.src || img.attrs.url
      if (src) urls.push(src)
    }
  }
  return urls
}

/** 获取会话用户名 */
export function getSessionUserName(session: Session): string {
  return session.username || session.author?.name || session.userId || 'unknown'
}
