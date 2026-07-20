import type { Context } from 'koishi'
import type { Config } from '../shared/config'
import type { VideoProvider } from './base'
import { YunwuVideoProvider } from './yunwu'
import { KlingVideoProvider } from './kling'
import { OmniVideoProvider } from './omni'
import { SeedanceVideoProvider } from './seedance'
import { ViduVideoProvider } from './vidu'

/** 创建视频供应商实例（provider 与云雾专属接口一一对应） */
export function createVideoProvider(ctx: Context, config: Config): VideoProvider {
  const providerConfig = {
    apiKey: config.apiKey,
    apiBase: config.apiBase,
    modelId: config.videoModelId,
    multiImageModelId: config.multiImageModelId,
    apiTimeout: config.apiTimeout,
    defaultSize: config.defaultSize,
    ctx,
  }
  switch (config.provider) {
    case 'yunwu':
      return new YunwuVideoProvider(providerConfig)
    case 'kling':
      return new KlingVideoProvider(providerConfig)
    case 'omni':
      return new OmniVideoProvider(providerConfig)
    case 'seedance':
      return new SeedanceVideoProvider(providerConfig)
    case 'vidu':
      return new ViduVideoProvider(providerConfig)
    default:
      throw new Error(`不支持的视频供应商类型: ${(config as Config).provider}`)
  }
}

export type { VideoProvider, VideoTaskStatus, VideoGenerateOptions } from './base'
