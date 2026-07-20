import type { VideoProvider, VideoProviderConfig, VideoGenerateOptions, VideoTaskStatus } from './base'
import { ProviderError, sanitizeString } from './errors'
import { downloadImageAsBase64 } from './utils'
import { withRetry } from './policies/retry'

/**
 * 云雾 → VIDU 专属接口
 * 文档：yunwu.apifox.cn api-407353658（文生）/ 407755273（图生）/ 407353662（查询）
 * 官方文档：https://platform.vidu.cn/docs/text-to-video
 * 创建文生：POST {apiBase}/ent/v2/text2video
 * 创建图生：POST {apiBase}/ent/v2/img2video
 *   { model: viduq3-pro|viduq3-turbo|viduq2|viduq1, prompt, style?: general|anime,
 *     duration: 1-16, aspect_ratio: 16:9|9:16|3:4|4:3|1:1,
 *     resolution: 540p|720p|1080p, images?: [url] }
 *   → { task_id, state: "created" }
 * 查询：GET {apiBase}/ent/v2/tasks/{task_id}/creations
 *   → { task_id, state: created|processing|success|failed,
 *        creations: [{ url, cover_url }], error? }
 */
export class ViduVideoProvider implements VideoProvider {
  constructor(private config: VideoProviderConfig) {}

  async createVideoTask(prompt: string, imageUrls: string[], options?: VideoGenerateOptions): Promise<string> {
    if (!this.config.modelId) throw new ProviderError('未配置 vidu 模型 ID', 'fatal')
    const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [imageUrls].filter(Boolean)
    const isI2V = urls.length > 0
    const endpoint = isI2V ? 'img2video' : 'text2video'

    const body: Record<string, unknown> = {
      model: this.config.modelId,
      prompt,
      aspect_ratio: options?.aspectRatio || '16:9',
    }
    if (options?.duration) body.duration = options.duration
    if (isI2V) {
      // vidu 收图片 URL 数组；internal: 协议转 base64 dataURI
      let url = urls[0]
      if (url.startsWith('internal:')) {
        const { data, mimeType } = await downloadImageAsBase64(this.config.ctx, url, this.config.apiTimeout)
        url = `data:${mimeType};base64,${data}`
      }
      body.images = [url]
    }

    let response: any
    try {
      response = await withRetry(
        () =>
          this.config.ctx.http.post(`${this.config.apiBase}/ent/v2/${endpoint}`, body, {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: this.config.apiTimeout * 1000,
          }),
        { maxAttempts: 3, baseDelayMs: 3000 },
      )
    } catch (error: any) {
      throw new ProviderError(`创建 vidu 任务请求失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }

    if (response?.error || response?.err_msg) {
      const msg = response?.error?.message || response?.err_msg || '创建任务失败'
      const kind = /quota|balance|额度|余额/i.test(String(msg)) ? 'quota' : 'fatal'
      throw new ProviderError(sanitizeString(msg), kind)
    }
    const taskId = response?.task_id
    if (!taskId) throw new ProviderError('未能获取 vidu 任务 ID', 'fatal')
    return String(taskId)
  }

  async queryTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    let response: any
    try {
      response = await this.config.ctx.http.get(
        `${this.config.apiBase}/ent/v2/tasks/${encodeURIComponent(taskId)}/creations`,
        {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          timeout: this.config.apiTimeout * 1000,
        },
      )
    } catch (error: any) {
      throw new ProviderError(`查询 vidu 任务失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }
    return {
      status: normalizeViduStatus(response?.state),
      taskId: String(response?.task_id ?? taskId),
      videoUrl: response?.creations?.[0]?.url || undefined,
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
        throw new ProviderError(status.error || 'vidu 视频生成失败', 'fatal')
      }
    }
    throw new ProviderError(`等待超时，任务ID: ${taskId}`, 'retryable')
  }
}

function normalizeViduStatus(raw: unknown): VideoTaskStatus['status'] {
  const s = String(raw || 'created')
  if (s === 'success') return 'completed'
  if (s === 'failed') return 'failed'
  if (s === 'created') return 'pending'
  return 'processing'
}
