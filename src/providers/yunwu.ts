import type { VideoProvider, VideoProviderConfig, VideoGenerateOptions, VideoTaskStatus } from './base'
import { ProviderError, sanitizeString } from './errors'
import { downloadImageAsBase64 } from './utils'

/**
 * 云雾（yunwu）视频供应商
 * 协议：POST {apiBase}/v1/video/create → { id }
 *      GET  {apiBase}/v1/video/query?id=<taskId> → { status, video_url?, progress?, error? }
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
        // 单图场景必须成功；多图场景允许部分失败
        if (imageUrls.length === 1) throw new ProviderError('输入图片下载失败', 'retryable')
      }
    }
    if (imageUrls.length > 0 && images.length === 0) {
      throw new ProviderError('所有图片下载失败', 'retryable')
    }

    const body: Record<string, unknown> = {
      model,
      prompt,
      aspect_ratio: options?.aspectRatio || '16:9',
    }
    if (images.length > 0) body.images = images
    if (options?.duration) body.duration = options.duration

    let response: any
    try {
      response = await ctx.http.post(`${apiBase}/v1/video/create`, body, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: apiTimeout * 1000,
      })
    } catch (error: any) {
      throw new ProviderError(`创建视频任务请求失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }

    if (response?.error) {
      const msg = response.error.message || response.error.type || '创建任务失败'
      const kind = /quota|balance|额度|余额/i.test(String(msg)) ? 'quota' : 'fatal'
      throw new ProviderError(sanitizeString(msg), kind)
    }

    const taskId = response?.id ?? response?.data?.task_id
    if (!taskId) throw new ProviderError('未能获取任务 ID，请检查 API 响应格式', 'fatal')
    return String(taskId)
  }

  async queryTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    const { ctx, apiBase, apiKey, apiTimeout } = this.config
    let response: any
    try {
      response = await ctx.http.get(`${apiBase}/v1/video/query?id=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        timeout: apiTimeout * 1000,
      })
    } catch (error: any) {
      throw new ProviderError(`查询任务失败: ${sanitizeString(error?.message)}`, 'retryable', error)
    }
    return {
      status: (response?.status as VideoTaskStatus['status']) || 'pending',
      taskId: String(response?.id ?? taskId),
      videoUrl: response?.video_url || undefined,
      error: response?.error ? sanitizeString(response.error) : undefined,
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
