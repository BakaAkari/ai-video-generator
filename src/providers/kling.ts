import type { VideoProvider, VideoProviderConfig, VideoGenerateOptions, VideoTaskStatus } from './base'
import { ProviderError, sanitizeString } from './errors'
import { downloadImageAsBase64 } from './utils'
import { withRetry } from './policies/retry'

/**
 * 云雾 → 可灵 Kling 专属接口
 * 文档：yunwu.apifox.cn api-386060323（文生）/ 386132041（图生）/ 386109649（查询）
 * 创建文生：POST {apiBase}/kling/v1/videos/text2video
 * 创建图生：POST {apiBase}/kling/v1/videos/image2video
 *   { model_name: kling-v1|v1-6|v2-master|v2-1-master|v2-5-turbo|v2-6|v3,
 *     prompt, negative_prompt?, mode: std|pro|4k, sound: on|off,
 *     aspect_ratio: 16:9|9:16|1:1, duration: "5"|"10"(v3: 3-15), image?(base64) }
 *   → { code: 0, message: "SUCCEED", data: { task_id } }
 * 查询：GET {apiBase}/kling/v1/videos/{text2video|image2video}/{task_id}
 *   → { code: 0, data: { task_status: submitted|processing|succeed|failed,
 *        task_result: { videos: [{ url }] }, task_status_msg } }
 */
export class KlingVideoProvider implements VideoProvider {
  constructor(private config: VideoProviderConfig) {}

  async createVideoTask(prompt: string, imageUrls: string[], options?: VideoGenerateOptions): Promise<string> {
    if (!this.config.modelId) throw new ProviderError('未配置 kling model_name', 'fatal')
    const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [imageUrls].filter(Boolean)
    const isI2V = urls.length > 0
    const endpoint = isI2V ? 'image2video' : 'text2video'

    const body: Record<string, unknown> = {
      model_name: this.config.modelId,
      prompt,
      aspect_ratio: options?.aspectRatio || '16:9',
      duration: String(options?.duration || 5),
    }
    if (isI2V) {
      // kling image2video 收 base64（不带 data: 前缀）
      const { data } = await downloadImageAsBase64(this.config.ctx, urls[0], this.config.apiTimeout)
      body.image = data
    }

    let response: any
    try {
      response = await withRetry(
        () =>
          this.config.ctx.http.post(`${this.config.apiBase}/kling/v1/videos/${endpoint}`, body, {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: this.config.apiTimeout * 1000,
          }),
        { maxAttempts: 3, baseDelayMs: 3000 },
      )
    } catch (error: any) {
      throw new ProviderError(`创建 kling 任务请求失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }

    if (response?.code !== 0) {
      const msg = response?.message || '创建任务失败'
      const kind = /quota|balance|额度|余额/i.test(String(msg)) ? 'quota' : 'fatal'
      throw new ProviderError(sanitizeString(msg), kind)
    }
    const taskId = response?.data?.task_id
    if (!taskId) throw new ProviderError('未能获取 kling 任务 ID', 'fatal')
    // 记录端点，查询时需要区分 text2video/image2video
    return `${endpoint}:${taskId}`
  }

  async queryTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    const [endpoint, realId] = taskId.includes(':') ? taskId.split(':', 2) : ['text2video', taskId]
    let response: any
    try {
      response = await this.config.ctx.http.get(
        `${this.config.apiBase}/kling/v1/videos/${endpoint}/${encodeURIComponent(realId)}`,
        {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          timeout: this.config.apiTimeout * 1000,
        },
      )
    } catch (error: any) {
      throw new ProviderError(`查询 kling 任务失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }
    const data = response?.data ?? {}
    return {
      status: normalizeKlingStatus(data.task_status),
      taskId: realId,
      videoUrl: data.task_result?.videos?.[0]?.url || undefined,
      error: data.task_status_msg ? sanitizeString(data.task_status_msg) : undefined,
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
        throw new ProviderError(status.error || 'kling 视频生成失败', 'fatal')
      }
    }
    throw new ProviderError(`等待超时，任务ID: ${taskId}`, 'retryable')
  }
}

function normalizeKlingStatus(raw: unknown): VideoTaskStatus['status'] {
  const s = String(raw || 'submitted')
  if (s === 'succeed') return 'completed'
  if (s === 'failed') return 'failed'
  if (s === 'submitted') return 'pending'
  return 'processing'
}
