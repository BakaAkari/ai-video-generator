import type { VideoProvider, VideoProviderConfig, VideoGenerateOptions, VideoTaskStatus } from './base'
import { ProviderError, sanitizeString } from './errors'
import { downloadImageAsBase64 } from './utils'
import { withRetry } from './policies/retry'

/**
 * 云雾 → 火山引擎豆包 Seedance 视频
 * 文档：yunwu.apifox.cn api-410229637（创建）/ 351558937（查询）
 * 创建：POST {apiBase}/volc/v1/contents/generations/tasks
 *   { model: "doubao-seedance-1-5-pro-251215",
 *     content: [{type:"text",text},{type:"image_url",image_url:{url}}],
 *     ratio: "adaptive"|"16:9"|"9:16"|..., duration: 4-12, watermark: false }
 *   → { id: "cgt-...", status: "submitted" }
 * 查询：GET {apiBase}/volc/v1/contents/generations/tasks/{id}
 *   → { id, status: queued|running|succeeded|failed,
 *        content: { video_url }, error: { message } }
 * 图片传 URL 或 base64 dataURI（火山支持 data:image/...;base64,...）
 */
export class SeedanceVideoProvider implements VideoProvider {
  constructor(private config: VideoProviderConfig) {}

  async createVideoTask(prompt: string, imageUrls: string[], options?: VideoGenerateOptions): Promise<string> {
    if (!this.config.modelId) throw new ProviderError('未配置 seedance 模型 ID', 'fatal')
    const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [imageUrls].filter(Boolean)

    const content: any[] = [{ type: 'text', text: prompt }]
    if (urls.length > 0) {
      // 火山要求 image_url.url；internal: 协议需转 base64 dataURI
      let url = urls[0]
      if (url.startsWith('internal:')) {
        const { data, mimeType } = await downloadImageAsBase64(this.config.ctx, url, this.config.apiTimeout)
        url = `data:${mimeType};base64,${data}`
      }
      content.push({ type: 'image_url', image_url: { url }, role: 'first_frame' })
    }

    const body: Record<string, unknown> = {
      model: this.config.modelId,
      content,
      ratio: options?.aspectRatio || 'adaptive',
      watermark: false,
    }
    if (options?.duration) body.duration = options.duration

    let response: any
    try {
      response = await withRetry(
        () =>
          this.config.ctx.http.post(`${this.config.apiBase}/volc/v1/contents/generations/tasks`, body, {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: this.config.apiTimeout * 1000,
          }),
        { maxAttempts: 3, baseDelayMs: 3000 },
      )
    } catch (error: any) {
      throw new ProviderError(`创建 seedance 任务请求失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }

    if (response?.error) {
      const msg = response.error.message || '创建任务失败'
      const kind = /quota|balance|额度|余额/i.test(String(msg)) ? 'quota' : 'fatal'
      throw new ProviderError(sanitizeString(msg), kind)
    }
    const taskId = response?.id
    if (!taskId) throw new ProviderError('未能获取 seedance 任务 ID', 'fatal')
    return String(taskId)
  }

  async queryTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    let response: any
    try {
      response = await this.config.ctx.http.get(
        `${this.config.apiBase}/volc/v1/contents/generations/tasks/${encodeURIComponent(taskId)}`,
        {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          timeout: this.config.apiTimeout * 1000,
        },
      )
    } catch (error: any) {
      throw new ProviderError(`查询 seedance 任务失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }
    return {
      status: normalizeSeedanceStatus(response?.status),
      taskId: String(response?.id ?? taskId),
      videoUrl: response?.content?.video_url || undefined,
      error: response?.error?.message ? sanitizeString(response.error.message) : undefined,
    }
  }

  async generateVideo(
    prompt: string,
    imageUrls: string[],
    options?: VideoGenerateOptions,
    maxWaitTimeSec = 300,
    pollIntervalMs = 5000,
  ): Promise<string> {
    const taskId = await this.createVideoTask(prompt, imageUrls, options)
    const maxAttempts = Math.ceil((maxWaitTimeSec * 1000) / pollIntervalMs)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs))
      const status = await this.queryTaskStatus(taskId)
      if (status.status === 'completed') {
        if (status.videoUrl) return status.videoUrl
        throw new ProviderError('视频已完成但未返回视频 URL', 'fatal')
      }
      if (status.status === 'failed') {
        throw new ProviderError(status.error || 'seedance 视频生成失败', 'fatal')
      }
    }
    throw new ProviderError(`等待超时，任务ID: ${taskId}`, 'retryable')
  }
}

function normalizeSeedanceStatus(raw: unknown): VideoTaskStatus['status'] {
  const s = String(raw || 'queued')
  if (s === 'succeeded') return 'completed'
  if (s === 'failed' || s === 'cancelled' || s === 'expired') return 'failed'
  if (s === 'queued') return 'pending'
  return 'processing'
}
