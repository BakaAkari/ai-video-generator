import type { Context } from 'koishi'
import type { Config } from '../shared/config'
import type { VideoProvider } from './base'
import { YunwuVideoProvider } from './yunwu'
import { KlingVideoProvider } from './kling'
import { OmniVideoProvider } from './omni'
import { SeedanceVideoProvider } from './seedance'
import { ViduVideoProvider } from './vidu'

/**
 * 创建视频供应商实例
 * provider = API 供应商（yunwu 云雾）；videoModel = 供应商内的 AI 模型选择器
 * 当前 5 个模型全部走云雾渠道，仅接口路径/参数格式不同
 */
export function createVideoProvider(ctx: Context, config: Config): VideoProvider {
  if (config.provider !== 'yunwu') {
    throw new Error(`不支持的 API 供应商: ${(config as Config).provider}`)
  }
  const base = {
    apiKey: config.apiKey,
    apiBase: config.apiBase,
    multiImageModelId: config.multiImageModelId,
    apiTimeout: config.apiTimeout,
    defaultSize: config.defaultSize,
    ctx,
  }
  switch (config.videoModel) {
    case 'grok':
      return new YunwuVideoProvider({ ...base, modelId: config.grokModelId })
    case 'kling':
      return new KlingVideoProvider({ ...base, modelId: config.klingModelName })
    case 'omni':
      return new OmniVideoProvider({ ...base, modelId: config.omniModelId })
    case 'seedance':
      return new SeedanceVideoProvider({ ...base, modelId: config.seedanceModelId })
    case 'vidu':
      return new ViduVideoProvider({ ...base, modelId: config.viduModelId })
    default:
      throw new Error(`不支持的视频模型: ${(config as Config).videoModel}`)
  }
}

export type { VideoProvider, VideoTaskStatus, VideoGenerateOptions } from './base'
