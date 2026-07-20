import type { Context } from 'koishi'
import type { Config } from '../shared/config'
import type { VideoProvider } from './base'
import { YunwuVideoProvider } from './yunwu'

/** 创建视频供应商实例 */
export function createVideoProvider(ctx: Context, config: Config): VideoProvider {
  switch (config.provider) {
    case 'yunwu':
      return new YunwuVideoProvider({
        apiKey: config.apiKey,
        apiBase: config.apiBase,
        modelId: config.videoModelId,
        multiImageModelId: config.multiImageModelId,
        apiTimeout: config.apiTimeout,
        defaultSize: config.defaultSize,
        ctx,
      })
    default:
      throw new Error(`不支持的视频供应商类型: ${(config as Config).provider}`)
  }
}

export type { VideoProvider, VideoTaskStatus, VideoGenerateOptions } from './base'
