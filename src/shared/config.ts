import { Schema } from 'koishi'

export interface BillingConfig {
  /** 每个视频任务基础积分 */
  baseCredits: number
  /** 每秒视频附加积分 */
  perSecondCredits: number
  /** 每日免费积分额度 */
  dailyFreeCreditsLimit: number
}

export interface Config {
  /** 视频供应商 */
  provider: 'yunwu'
  /** API Key */
  apiKey: string
  /** API 基础地址 */
  apiBase: string
  /** 单图/文生视频模型 ID */
  videoModelId: string
  /** 多图视频模型 ID（可选） */
  multiImageModelId?: string
  /** API 超时（秒） */
  apiTimeout: number
  /** 视频任务最长等待（秒） */
  videoMaxWaitTime: number
  /** 默认视频时长（秒） */
  defaultDuration: number
  /** 默认画面比例（grok：2:3 | 3:2 | 1:1） */
  defaultAspectRatio: string
  /** 默认尺寸档位（grok：720P，1080P 暂未开放） */
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

export const Config: Schema<Config> = Schema.object({
  provider: Schema.union(['yunwu'] as const).default('yunwu').description('视频供应商'),
  apiKey: Schema.string().required().description('API Key'),
  apiBase: Schema.string().default('https://yunwu.ai').description('API 基础地址'),
  videoModelId: Schema.string().required().description('单图/文生视频模型 ID'),
  multiImageModelId: Schema.string().description('多图视频模型 ID（可选，配置后多图请求走该模型）'),
  apiTimeout: Schema.number().default(60).description('API 超时（秒）'),
  videoMaxWaitTime: Schema.number().default(300).description('视频任务最长等待（秒）'),
  defaultDuration: Schema.number().default(5).description('默认视频时长（秒）'),
  defaultAspectRatio: Schema.string().default('16:9').description('默认画面比例（grok 官方格式支持 1:1 / 16:9 / 9:16）'),
  defaultSize: Schema.string().default('720p').description('默认分辨率（grok 官方格式：480p / 720p）'),
  billing: Schema.object({
    baseCredits: Schema.number().default(2).description('每个视频任务基础积分'),
    perSecondCredits: Schema.number().default(0.5).description('每秒视频附加积分'),
    dailyFreeCreditsLimit: Schema.number().default(0.4).description('每日免费积分额度'),
  }).description('计费配置'),
  adminUsers: Schema.array(Schema.string()).default([]).description('管理员 QQ 号列表（免积分）'),
  dataDir: Schema.string().description('数据目录（留空使用默认；指向 aka-ai-image-generator 数据目录可共享积分账户）'),
  logLevel: Schema.union(['debug', 'info', 'warn', 'error'] as const).default('info').description('日志级别'),
  promptTimeout: Schema.number().default(120).description('交互提示等待超时（秒）'),
})

export const name = 'aka-ai-video-generator'
export const inject = { optional: ['puppeteer'] }
