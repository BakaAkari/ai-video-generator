import type { VideoProvider, VideoProviderConfig, VideoGenerateOptions, VideoTaskStatus } from './base'
import { ProviderError, sanitizeString } from './errors'
import { downloadImageAsBase64 } from './utils'
import { withRetry } from './policies/retry'

/**
 * 云雾（yunwu）视频供应商 —— xAI grok 官方格式
 * 文档：https://yunwu.apifox.cn/doc-7764812（官方格式）
 * 创建：POST {apiBase}/v1/videos/generations
 *       { model, prompt, resolution(480p|720p), aspect_ratio(1:1|16:9|9:16), duration(1-15),
 *         image:{url} | reference_images:[{url}] }
 *       → { request_id }
 * 查询：GET  {apiBase}/v1/videos/{request_id}
 *       → { id, status, video_url?, error? }
 */
export class YunwuVideoProvider implements VideoProvider {
  constructor(private config: VideoProviderConfig) {}

  async createVideoTask(prompt: string, imageUrls: string[], options?: VideoGenerateOptions): Promise<string> {
    const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls]
    if (urls.length > 1 && this.config.multiImageModelId) {
      return this.createTaskWithModel(this.config.multiImageModelId, prompt, urls, options)
    }
    if (!this.config.modelId) {
      throw new ProviderError('未配置单图/文生视频模型 ID', 'fatal')
    }
    return this.createTaskWithModel(this.config.modelId, prompt, urls, options)
  }

  private async createTaskWithModel(
    model: string,
    prompt: string,
    imageUrls: string[],
    options?: VideoGenerateOptions,
  ): Promise<string> {
    const { ctx, apiBase, apiKey, apiTimeout } = this.config

    // 下载图片并转 base64 dataURI（容忍部分失败）
    const images: string[] = []
    for (const url of imageUrls) {
      try {
        const { data, mimeType } = await downloadImageAsBase64(ctx, url, apiTimeout)
        images.push(`data:${mimeType};base64,${data}`)
      } catch {
        if (imageUrls.length === 1) throw new ProviderError('输入图片下载失败', 'retryable')
      }
    }
    if (imageUrls.length > 0 && images.length === 0) {
      throw new ProviderError('所有图片下载失败', 'retryable')
    }

    const body: Record<string, unknown> = {
      model,
      prompt,
      resolution: (options?.size || this.config.defaultSize || '720P').toLowerCase().replace('p', '') + 'p',
      aspect_ratio: options?.aspectRatio || '16:9',
    }
    if (options?.duration) body.duration = options.duration
    // 官方格式：单图 image.url；多图 reference_images[].url
    if (images.length === 1) {
      body.image = { url: images[0] }
    } else if (images.length > 1) {
      body.reference_images = images.map((u) => ({ url: u }))
    }

    let response: any
    try {
      // 云雾/上游偶发 429（Too Many Requests），重试 3 次（3s/6s 退避）
      response = await withRetry(
        () =>
          ctx.http.post(`${apiBase}/v1/videos/generations`, body, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: apiTimeout * 1000,
          }),
        { maxAttempts: 3, baseDelayMs: 3000 },
      )
    } catch (error: any) {
      throw new ProviderError(`创建视频任务请求失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }

    if (response?.error) {
      const msg = response.error.message || response.error.type || '创建任务失败'
      const kind = /quota|balance|额度|余额/i.test(String(msg)) ? 'quota' : 'fatal'
      throw new ProviderError(sanitizeString(msg), kind)
    }

    const taskId = response?.request_id ?? response?.id ?? response?.data?.task_id
    if (!taskId) throw new ProviderError('未能获取任务 ID，请检查 API 响应格式', 'fatal')
    return String(taskId)
  }

  async queryTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    const { ctx, apiBase, apiKey, apiTimeout } = this.config
    let response: any
    try {
      response = await ctx.http.get(`${apiBase}/v1/videos/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: apiTimeout * 1000,
      })
    } catch (error: any) {
      throw new ProviderError(`查询任务失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }
    const errMsg = response?.error
      ? sanitizeString(typeof response.error === 'string' ? response.error : response.error.message)
      : undefined
    return {
      status: normalizeGrokStatus(response?.status),
      taskId: String(response?.id ?? taskId),
      videoUrl: response?.video_url || response?.video?.url || undefined,
      error: errMsg,
      progress: typeof response?.progress === 'number' ? response.progress : undefined,
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
        throw new ProviderError(status.error || '视频生成失败', 'fatal')
      }
    }
    throw new ProviderError(`等待超时，任务ID: ${taskId}`, 'retryable')
  }
}

/**
 * grok 官方格式状态映射
 * 实测状态值：pending / processing / completed / failed（查询接口返回）
 */
function normalizeGrokStatus(raw: unknown): VideoTaskStatus['status'] {
  const s = String(raw || 'pending')
  if (s === 'completed' || s === 'done') return 'completed'
  if (s === 'failed' || s === 'error') return 'failed'
  if (s === 'pending' || s === 'queued') return 'pending'
  return 'processing'
}
