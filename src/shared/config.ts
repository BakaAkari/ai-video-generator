import { Schema } from 'koishi'

export interface BillingConfig {
  /** 每个视频任务基础积分 */
  baseCredits: number
  /** 每秒视频附加积分 */
  perSecondCredits: number
  /** 每日免费积分额度 */
  dailyFreeCreditsLimit: number
}

export type VideoModel = 'grok' | 'kling' | 'omni' | 'seedance' | 'vidu'

export interface Config {
  /** API 供应商（中转商） */
  provider: 'yunwu'
  /** 视频生成 AI 模型（yunwu 供应商内选择） */
  videoModel: VideoModel
  /** 云雾 API Key（全模型共享） */
  apiKey: string
  /** API 基础地址 */
  apiBase: string
  /** grok 模型 ID */
  grokModelId: string
  /** grok 多图模型 ID（可选） */
  multiImageModelId?: string
  /** kling 模型名 */
  klingModelName: string
  /** omni(Gemini) 模型 ID */
  omniModelId: string
  /** seedance(豆包) 模型 ID */
  seedanceModelId: string
  /** vidu 模型 ID */
  viduModelId: string
  /** API 超时（秒） */
  apiTimeout: number
  /** 视频任务最长等待（秒） */
  videoMaxWaitTime: number
  /** 默认视频时长（秒） */
  defaultDuration: number
  /** 默认画面比例 */
  defaultAspectRatio: string
  /** 默认分辨率档位 */
  defaultSize: string
  /** 计费配置 */
  billing: BillingConfig
  /** 管理员 QQ 号列表（免积分、不受并发限制） */
  adminUsers: string[]
  /** 数据目录（默认 <koishi-data>/aka-ai-video-generator；指向图像版目录可共享积分） */
  dataDir?: string
  /** 日志级别 */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** 提示等待超时（秒） */
  promptTimeout: number
}

/** 模型选择块（判别联合的公共头） */
const ModelSelectSchema = Schema.object({
  provider: Schema.union([Schema.const('yunwu').description('云雾 (yunwu.ai)')])
    .default('yunwu')
    .description('API 供应商'),
  videoModel: Schema.union([
    Schema.const('grok').description('Grok Imagine（xAI，已实测）'),
    Schema.const('kling').description('可灵 Kling（已实测）'),
    Schema.const('seedance').description('豆包 Seedance（已实测）'),
    Schema.const('vidu').description('VIDU（已实测）'),
    Schema.const('omni').description('Gemini Omni（云雾侧未上线）'),
  ])
    .default('grok')
    .description('视频生成模型'),
  apiKey: Schema.string().role('secret').required().description('云雾 API 密钥（全模型共享）'),
  apiBase: Schema.string().default('https://yunwu.ai').description('API 基础地址'),
}).description('🎬 视频生成配置')

/** 各模型的专属配置字段（非当前模型的字段 hidden 保留值，对齐 v2 图像插件） */
const grokFields = {
  grokModelId: Schema.string().default('grok-imagine-video').description('Grok 模型 ID'),
  multiImageModelId: Schema.string().description('多图模型 ID（可选）'),
}
const klingFields = {
  klingModelName: Schema.union([
    Schema.const('kling-v3').description('kling-v3（最新，支持有声/4K/多镜头）'),
    Schema.const('kling-v2-6').description('kling-v2.6（有声须 pro）'),
    Schema.const('kling-v2-5-turbo').description('kling-v2.5-turbo'),
    Schema.const('kling-v2-1-master').description('kling-v2.1-master'),
    Schema.const('kling-v2-master').description('kling-v2-master'),
    Schema.const('kling-v1-6').description('kling-v1.6'),
    Schema.const('kling-v1').description('kling-v1（经典最便宜）'),
  ])
    .default('kling-v3')
    .description('可灵模型'),
}
const omniFields = {
  omniModelId: Schema.string().default('omni-flash').description('Omni 模型 ID'),
}
const seedanceFields = {
  seedanceModelId: Schema.string()
    .default('doubao-seedance-1-0-pro-fast-251015')
    .description('Seedance 模型 ID'),
}
const viduFields = {
  viduModelId: Schema.union([
    Schema.const('viduq3-pro').description('viduq3-pro（质量最高）'),
    Schema.const('viduq3-turbo').description('viduq3-turbo（速度更快）'),
    Schema.const('viduq2').description('viduq2'),
    Schema.const('viduq1').description('viduq1'),
  ])
    .default('viduq3-turbo')
    .description('VIDU 模型'),
}

const hiddenGrok = {
  grokModelId: Schema.string().default('grok-imagine-video').hidden(),
  multiImageModelId: Schema.string().hidden(),
}
const hiddenKling = { klingModelName: Schema.string().default('kling-v3').hidden() }
const hiddenOmni = { omniModelId: Schema.string().default('omni-flash').hidden() }
const hiddenSeedance = {
  seedanceModelId: Schema.string().default('doubao-seedance-1-0-pro-fast-251015').hidden(),
}
const hiddenVidu = { viduModelId: Schema.string().default('viduq3-turbo').hidden() }

const ModelConfigSchema = Schema.union([
  Schema.object({
    videoModel: Schema.const('grok').required(),
    ...grokFields,
    ...hiddenKling,
    ...hiddenOmni,
    ...hiddenSeedance,
    ...hiddenVidu,
  }),
  Schema.object({
    videoModel: Schema.const('kling').required(),
    ...hiddenGrok,
    ...klingFields,
    ...hiddenOmni,
    ...hiddenSeedance,
    ...hiddenVidu,
  }),
  Schema.object({
    videoModel: Schema.const('omni').required(),
    ...hiddenGrok,
    ...hiddenKling,
    ...omniFields,
    ...hiddenSeedance,
    ...hiddenVidu,
  }),
  Schema.object({
    videoModel: Schema.const('seedance').required(),
    ...hiddenGrok,
    ...hiddenKling,
    ...hiddenOmni,
    ...seedanceFields,
    ...hiddenVidu,
  }),
  Schema.object({
    videoModel: Schema.const('vidu').required(),
    ...hiddenGrok,
    ...hiddenKling,
    ...hiddenOmni,
    ...hiddenSeedance,
    ...viduFields,
  }),
])

// 判别联合静态类型与扁平 Config interface 存在结构性差异（v2 图像插件同款模式），运行时行为正确
export const Config = Schema.intersect([
  ModelSelectSchema,
  ModelConfigSchema,

  Schema.object({
    defaultDuration: Schema.number().default(5).min(1).max(15).description('默认视频时长（秒）'),
    defaultAspectRatio: Schema.union([
      Schema.const('16:9').description('16:9 横屏'),
      Schema.const('9:16').description('9:16 竖屏'),
      Schema.const('1:1').description('1:1 方形'),
    ])
      .default('16:9')
      .description('默认画面比例'),
    defaultSize: Schema.union([
      Schema.const('480p').description('480p（更快更便宜）'),
      Schema.const('720p').description('720p（默认）'),
    ])
      .default('720p')
      .description('默认分辨率（grok 专属；其他模型按各自默认）'),
    apiTimeout: Schema.number().default(60).min(10).max(300).description('API 请求超时（秒）'),
    videoMaxWaitTime: Schema.number().default(300).min(60).max(900).description('视频任务最长等待（秒）'),
  })
    .description('⚙️ 通用设置')
    .collapse(),

  Schema.object({
    billing: Schema.object({
      baseCredits: Schema.number().default(2).min(0).description('每个视频任务基础积分'),
      perSecondCredits: Schema.number().default(0.5).min(0).description('每秒视频附加积分'),
      dailyFreeCreditsLimit: Schema.number().default(0.4).min(0).description('每日免费积分额度'),
    }).description('积分计费规则'),
  })
    .description('💰 计费配置')
    .collapse(),

  Schema.object({
    adminUsers: Schema.array(Schema.string()).default([]).description('管理员 QQ 号列表（免积分、不受并发限制）'),
    dataDir: Schema.string().description('数据目录（留空使用默认；指向 aka-ai-image-generator 数据目录可共享积分账户）'),
    logLevel: Schema.union([
      Schema.const('info').description('普通信息'),
      Schema.const('debug').description('完整 debug 信息'),
      Schema.const('warn').description('仅警告'),
      Schema.const('error').description('仅错误'),
    ] as const)
      .default('info' as const)
      .description('日志输出详细程度'),
    promptTimeout: Schema.number().default(120).min(30).max(600).description('交互提示等待超时（秒）'),
  })
    .description('👑 管理与高级')
    .collapse(),
])

export const name = 'aka-ai-video-generator'
export const inject = { optional: ['puppeteer'] }
