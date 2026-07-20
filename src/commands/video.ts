import type { Context, Session } from 'koishi'
import type { Config } from '../shared/config'
import type { Logger } from '../shared/logging'
import type { UserManager } from '../services/UserManager'
import type { VideoProvider } from '../providers/base'
import type { VideoContextStore } from '../core/video-context-store'
import { runVideoGenerationFlow } from '../orchestrators/VideoGenerationOrchestrator'
import { collectImagesFromParamAndQuote, getSessionUserName, parseMessageImagesAndText } from '../utils/input'
import { parseVideoArgs } from '../utils/parser'
import { getPromptTimeoutMs, formatPromptTimeoutError } from '../shared/prompt-timeout'
import { CMD_TEXT2VIDEO, CMD_IMG2VIDEO, CMD_MULTI_IMG2VIDEO, MAX_MULTI_IMAGES } from '../shared/constants'

export interface CommandDeps {
  ctx: Context
  config: Config
  logger: Logger
  userManager: UserManager
  videoProvider: VideoProvider
  store: VideoContextStore
}

export function registerVideoCommands(deps: CommandDeps): void {
  const { ctx, config, userManager } = deps

  // 文生视频
  ctx
    .command(`${CMD_TEXT2VIDEO} <prompt:text>`, '文字描述生成视频')
    .option('duration', '-d <seconds:int> 视频时长（秒）')
    .option('ratio', '-r <ratio:string> 画面比例，如 16:9')
    .action(async ({ session, options }, prompt) => {
      if (!session) return '会话无效'
      return executeVideoCommand(deps, session, {
        mode: 'text',
        rest: prompt || '',
        commandName: CMD_TEXT2VIDEO,
      })
    })

  // 图生视频（单图）
  ctx
    .command(`${CMD_IMG2VIDEO} [rest:text]`, '单张图片生成视频')
    .option('duration', '-d <seconds:int> 视频时长（秒）')
    .option('ratio', '-r <ratio:string> 画面比例，如 16:9')
    .action(async ({ session }, rest) => {
      if (!session) return '会话无效'
      return executeVideoCommand(deps, session, {
        mode: 'single',
        rest: rest || '',
        commandName: CMD_IMG2VIDEO,
      })
    })

  // 多图生视频
  ctx
    .command(`${CMD_MULTI_IMG2VIDEO} [rest:text]`, '多张图片合成视频（2-4张）')
    .option('duration', '-d <seconds:int> 视频时长（秒）')
    .option('ratio', '-r <ratio:string> 画面比例，如 16:9')
    .action(async ({ session }, rest) => {
      if (!session) return '会话无效'
      return executeVideoCommand(deps, session, {
        mode: 'multiple',
        rest: rest || '',
        commandName: CMD_MULTI_IMG2VIDEO,
      })
    })

  // 别名：视频生成 = 图生视频
  ctx
    .command('视频生成 [rest:text]', '视频生成（等同于图生视频）')
    .alias(CMD_IMG2VIDEO)
    .action(async ({ session }, rest) => {
      if (!session) return '会话无效'
      return executeVideoCommand(deps, session, {
        mode: 'single',
        rest: rest || '',
        commandName: '视频生成',
      })
    })
}

interface ExecuteOptions {
  mode: 'text' | 'single' | 'multiple'
  rest: string
  commandName: string
}

async function executeVideoCommand(deps: CommandDeps, session: Session, options: ExecuteOptions): Promise<string> {
  const { config, userManager } = deps
  if (!session?.userId) return '会话无效'

  const userId = session.userId
  const userName = getSessionUserName(session)

  // 并发约束
  if (!userManager.startVideoTask(userId)) {
    return '您有一个视频任务正在进行中，请等待完成'
  }

  try {
    // 参数解析
    const args = parseVideoArgs(options.rest, config)

    // 图片收集
    let imageUrls = collectImagesFromParamAndQuote(session, options.rest)
    let finalPrompt = args.prompt

    if (options.mode === 'single' && imageUrls.length > 1) {
      return '单图生视频只支持 1 张图片，请使用「多图生视频」命令'
    }
    if (options.mode === 'multiple' && imageUrls.length > MAX_MULTI_IMAGES) {
      return `最多支持 ${MAX_MULTI_IMAGES} 张图片，请减少图片数量`
    }

    // 需要图片但没有 → prompt 用户发图
    if (options.mode !== 'text' && imageUrls.length === 0) {
      await session.send(
        options.mode === 'single'
          ? '请发送一张图片（可附带文字描述）'
          : `请发送 2-${MAX_MULTI_IMAGES} 张图片（可附带文字描述，发送完成后输入任意文字结束）`,
      )
      while (true) {
        const msg = await session.prompt(getPromptTimeoutMs(config))
        if (!msg) return formatPromptTimeoutError(config)
        const { images, text } = parseMessageImagesAndText(msg)
        for (const img of images) {
          const src = img.attrs.src || img.attrs.url
          if (src) imageUrls.push(src)
        }
        if (text && !finalPrompt) finalPrompt = text
        if (options.mode === 'single' && imageUrls.length > 0) break
        if (options.mode === 'multiple') {
          if (imageUrls.length >= MAX_MULTI_IMAGES) break
          if (imageUrls.length > 0 && text) break
          if (imageUrls.length > 0) {
            await session.send(`已收到 ${imageUrls.length} 张图片，可继续发送或输入文字结束`)
          }
        }
      }
    }

    if (options.mode === 'single' && imageUrls.length === 0) return '未检测到输入图片'
    if (options.mode === 'multiple' && imageUrls.length === 0) return '未检测到输入图片'

    // 没有描述 → prompt 用户输入
    if (!finalPrompt) {
      await session.send('请输入视频描述（描述视频中的动作和场景变化）\n提示：描述越详细，生成效果越好')
      const promptMsg = await session.prompt(getPromptTimeoutMs(config))
      if (!promptMsg) return formatPromptTimeoutError(config)
      const { images, text } = parseMessageImagesAndText(promptMsg)
      if (images.length > 0) return '检测到图片，本步骤仅支持文字输入'
      if (!text) return '未检测到描述'
      finalPrompt = text
    }

    if (options.mode === 'multiple' && imageUrls.length >= 2) {
      await session.send(`已收到 ${imageUrls.length} 张图片，将用于多图视频合成`)
    }

    return await runVideoGenerationFlow(deps, {
      session,
      userId,
      userName,
      commandName: options.commandName,
      prompt: finalPrompt,
      imageUrls,
      duration: args.duration,
      aspectRatio: args.aspectRatio,
      cost: args.cost,
    })
  } finally {
    // 注意：orchestrator 在任务终结时会调用 endVideoTask；
    // 提前返回（输入校验失败等）时由这里兜底
    userManager.endVideoTask(userId)
  }
}
