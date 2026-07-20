import type { Context } from 'koishi'

/** 视频任务状态（grok 统一格式另有 image_downloading/video_generating 等中间态，统一映射） */
export interface VideoTaskStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  taskId: string
  videoUrl?: string
  error?: string
  progress?: number
}

/** 视频生成选项 */
export interface VideoGenerateOptions {
  duration?: number
  /** grok 统一格式：2:3 | 3:2 | 1:1 */
  aspectRatio?: string
  /** grok 统一格式：720P | 1080P（暂只支持 720P） */
  size?: string
}

/** 视频供应商配置 */
export interface VideoProviderConfig {
  apiKey: string
  apiBase: string
  modelId?: string
  multiImageModelId?: string
  apiTimeout: number
  /** 默认尺寸档位（grok：720P） */
  defaultSize?: string
  ctx: Context
}

/** 视频供应商接口 */
export interface VideoProvider {
  /** 创建视频任务（自动按图片数量路由单图/多图模型），返回 taskId */
  createVideoTask(
    prompt: string,
    imageUrls: string[],
    options?: VideoGenerateOptions,
  ): Promise<string>

  /** 查询任务状态 */
  queryTaskStatus(taskId: string): Promise<VideoTaskStatus>

  /** 生成视频（创建 + 轮询等待），返回视频 URL */
  generateVideo(
    prompt: string,
    imageUrls: string[],
    options?: VideoGenerateOptions,
    maxWaitTimeSec?: number,
  ): Promise<string>
}
