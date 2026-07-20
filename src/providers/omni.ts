import type { VideoProvider, VideoProviderConfig, VideoGenerateOptions, VideoTaskStatus } from './base'
import { ProviderError, sanitizeString } from './errors'
import { downloadImageAsBase64 } from './utils'
import { withRetry } from './policies/retry'

/**
 * 云雾 → Gemini Omni 视频（统一格式通道）
 * 文档：yunwu.apifox.cn api-465029143（创建）/ 463239679（查询结果）
 * 创建：POST {apiBase}/v1/video/create
 *   { model: "omni-flash"|"omni-flash-edit", prompt,
 *     type?: 1文生|2首尾帧|3垫图|4编辑,
 *     aspect_ratio?: 16:9|9:16, images?: [url], seconds?: "8" }
 *   → { id: "omni-flash_X:task_...", status: "queued", status_update_time }
 * 查询：GET {apiBase}/v1/video/query?id={id}
 *   → { id, status, video_url?, error? }
 * 模型 ID 用云雾定价表里的 gemini-omni-flash-preview 或 omni-flash（按渠道实际接受值）
 */
export class OmniVideoProvider implements VideoProvider {
  constructor(private config: VideoProviderConfig) {}

  async createVideoTask(prompt: string, imageUrls: string[], options?: VideoGenerateOptions): Promise<string> {
    if (!this.config.modelId) throw new ProviderError('未配置 omni 模型 ID', 'fatal')
    const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [imageUrls].filter(Boolean)

    const body: Record<string, unknown> = {
      model: this.config.modelId,
      prompt,
      aspect_ratio: options?.aspectRatio || '16:9',
      type: urls.length > 0 ? 3 : 1,
    }
    if (options?.duration) body.seconds = String(options.duration)
    if (urls.length > 0) {
      // images 收 URL 数组；internal: 协议转 base64 dataURI
      const images: string[] = []
      for (const url of urls.slice(0, 3)) {
        if (url.startsWith('internal:')) {
          const { data, mimeType } = await downloadImageAsBase64(this.config.ctx, url, this.config.apiTimeout)
          images.push(`data:${mimeType};base64,${data}`)
        } else {
          images.push(url)
        }
      }
      body.images = images
    }

    let response: any
    try {
      response = await withRetry(
        () =>
          this.config.ctx.http.post(`${this.config.apiBase}/v1/video/create`, body, {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: this.config.apiTimeout * 1000,
          }),
        { maxAttempts: 3, baseDelayMs: 3000 },
      )
    } catch (error: any) {
      throw new ProviderError(`创建 omni 任务请求失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }

    if (response?.error) {
      const msg = response.error.message || response.error.type || '创建任务失败'
      const kind = /quota|balance|额度|余额/i.test(String(msg)) ? 'quota' : 'fatal'
      throw new ProviderError(sanitizeString(msg), kind)
    }
    const taskId = response?.id ?? response?.data?.task_id
    if (!taskId) throw new ProviderError('未能获取 omni 任务 ID', 'fatal')
    return String(taskId)
  }

  async queryTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    let response: any
    try {
      response = await this.config.ctx.http.get(
        `${this.config.apiBase}/v1/video/query?id=${encodeURIComponent(taskId)}`,
        {
          headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: 'application/json' },
          timeout: this.config.apiTimeout * 1000,
        },
      )
    } catch (error: any) {
      throw new ProviderError(`查询 omni 任务失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }
    return {
      status: normalizeOmniStatus(response?.status),
      taskId: String(response?.id ?? taskId),
      videoUrl: response?.video_url || response?.video?.url || undefined,
      error: response?.error
        ? sanitizeString(typeof response.error === 'string' ? response.error : response.error.message)
        : undefined,
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
        throw new ProviderError(status.error || 'omni 视频生成失败', 'fatal')
      }
    }
    throw new ProviderError(`等待超时，任务ID: ${taskId}`, 'retryable')
  }
}

function normalizeOmniStatus(raw: unknown): VideoTaskStatus['status'] {
  const s = String(raw || 'queued')
  if (s === 'completed' || s === 'done' || s === 'success' || s === 'video_generation_completed') return 'completed'
  if (s === 'failed' || s === 'error') return 'failed'
  if (s === 'queued' || s === 'pending') return 'pending'
  return 'processing'
}
