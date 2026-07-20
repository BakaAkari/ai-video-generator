import { Context, Service } from 'koishi'
import type { Config } from '../shared/config'
import type { UserManager } from '../services/UserManager'
import type { VideoProvider } from '../providers/base'
import { computeVideoCost } from '../shared/billing'

declare module 'koishi' {
  interface Context {
    aiVideoGenerator: AiVideoGeneratorService
  }
}

/**
 * 对外服务：其他插件可通过 ctx.aiVideoGenerator 程序化调用视频生成
 */
export class AiVideoGeneratorService extends Service {
  private serviceConfig: Config

  constructor(
    ctx: Context,
    config: Config,
    private userManager: UserManager,
    private videoProvider: VideoProvider,
  ) {
    super(ctx, 'aiVideoGenerator')
    this.serviceConfig = config
  }

  /** 估算视频任务成本 */
  estimateCost(durationSec?: number): number {
    return computeVideoCost(this.serviceConfig.billing, durationSec ?? this.serviceConfig.defaultDuration)
  }

  /** 查询用户可用积分 */
  getBalance(userId: string, userName = '') {
    return this.userManager.getAvailableCredits(userId, userName || userId)
  }

  /**
   * 生成视频（阻塞式，含轮询）
   * @returns 视频 URL
   */
  async generateVideo(params: {
    userId: string
    userName?: string
    prompt: string
    imageUrls?: string[]
    duration?: number
    aspectRatio?: string
  }): Promise<string> {
    const { userId, prompt } = params
    const userName = params.userName || userId
    const duration = params.duration ?? this.serviceConfig.defaultDuration
    const cost = computeVideoCost(this.serviceConfig.billing, duration)

    const quota = this.userManager.checkAndReserveQuota(userId, userName, cost)
    if (!quota.allowed) throw new Error(quota.message)

    try {
      const url = await this.videoProvider.generateVideo(
        prompt,
        params.imageUrls ?? [],
        { duration, aspectRatio: params.aspectRatio },
        this.serviceConfig.videoMaxWaitTime,
      )
      this.userManager.commitUsage(userId, userName, cost, 'service:generateVideo')
      return url
    } catch (error) {
      this.userManager.refundUsage(userId, userName, cost, 'service:generateVideo 失败退款')
      throw error
    }
  }
}
