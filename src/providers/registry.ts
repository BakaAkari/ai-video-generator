import type { Context } from 'koishi'
import type { Config } from '../shared/config'
import type { VideoProvider } from './base'
import { YunwuVideoProvider } from './yunwu'
import { KlingVideoProvider } from './kling'
import { OmniVideoProvider } from './omni'
import { SeedanceVideoProvider } from './seedance'
import { ViduVideoProvider } from './vidu'

/** 创建视频供应商实例（provider 只是选择器，模型配置按 provider 自动切换，对齐 v2 图像插件） */
export function createVideoProvider(ctx: Context, config: Config): VideoProvider {
  const base = {
    apiKey: config.apiKey,
    apiBase: config.apiBase,
    multiImageModelId: config.multiImageModelId,
    apiTimeout: config.apiTimeout,
    defaultSize: config.defaultSize,
    ctx,
  }
  switch (config.provider) {
    case 'yunwu':
      return new YunwuVideoProvider({ ...base, modelId: config.yunwuModelId })
    case 'kling':
      return new KlingVideoProvider({ ...base, modelId: config.klingModelName })
    case 'omni':
      return new OmniVideoProvider({ ...base, modelId: config.omniModelId })
    case 'seedance':
      return new SeedanceVideoProvider({ ...base, modelId: config.seedanceModelId })
    case 'vidu':
      return new ViduVideoProvider({ ...base, modelId: config.viduModelId })
    default:
      throw new Error(`不支持的视频供应商类型: ${(config as Config).provider}`)
  }
}

export type { VideoProvider, VideoTaskStatus, VideoGenerateOptions } from './base'
