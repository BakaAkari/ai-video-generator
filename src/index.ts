import { Context } from 'koishi'
import * as path from 'node:path'
import { Config, name } from './shared/config'
import { DATA_DIR_NAME } from './shared/constants'
import { Logger } from './shared/logging'
import { UserManager } from './services/UserManager'
import { VideoContextStore } from './core/video-context-store'
import { createVideoProvider } from './providers/registry'
import { AiVideoGeneratorService } from './service/AiVideoGeneratorService'
import { registerCommands } from './commands'

export { Config, name }
export const inject = { optional: ['puppeteer'] }

export function apply(ctx: Context, config: Config) {
  const logger = new Logger(ctx, config.logLevel)
  const dataDir = config.dataDir
    ? path.resolve(config.dataDir)
    : path.join(ctx.baseDir, 'data', DATA_DIR_NAME)

  logger.info('插件启动', { dataDir, provider: config.provider })

  const userManager = new UserManager(ctx, dataDir, config.billing.dailyFreeCreditsLimit)
  const store = new VideoContextStore(dataDir)
  const videoProvider = createVideoProvider(ctx, config)

  // 注册服务（直接实例化，避免 ctx.plugin 参数传递的类型约束）
  ctx.plugin((innerCtx) => {
    ;(innerCtx as Context).aiVideoGenerator = new AiVideoGeneratorService(innerCtx, config, userManager, videoProvider)
  })

  registerCommands({
    ctx,
    config,
    logger,
    userManager,
    videoProvider,
    store,
  })

  // 启动时报告未完成的 pending 任务（供运维感知；自动恢复轮询留待 M1）
  const pending = store.listAll()
  if (pending.length > 0) {
    logger.warn(`检测到 ${pending.length} 个未完成视频任务，用户可通过「查询视频」命令跟进`, {
      taskIds: pending.map((t) => t.taskId),
    })
  }
}
