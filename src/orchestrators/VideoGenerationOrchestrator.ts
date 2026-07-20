import { h, type Session } from 'koishi'
import type { Config } from '../shared/config'
import type { Logger } from '../shared/logging'
import type { UserManager } from '../services/UserManager'
import type { VideoProvider } from '../providers/base'
import type { VideoContextStore } from '../core/video-context-store'
import { POLL_INTERVAL_MS } from '../shared/constants'
import { sanitizeString } from '../providers/errors'

export interface VideoFlowDeps {
  config: Config
  logger: Logger
  userManager: UserManager
  videoProvider: VideoProvider
  store: VideoContextStore
}

export interface VideoFlowInput {
  session: Session
  userId: string
  userName: string
  commandName: string
  prompt: string
  imageUrls: string[]
  duration: number
  aspectRatio: string
  cost: number
}

/**
 * 视频生成主流程：
 * reserve → 提交任务 → 轮询 → 发送 → commit / refund
 * 轮询超时：登记 pending task，用户可通过「查询视频」跟进
 */
export async function runVideoGenerationFlow(deps: VideoFlowDeps, input: VideoFlowInput): Promise<string> {
  const { config, logger, userManager, videoProvider, store } = deps
  const { session, userId, userName, commandName, prompt, imageUrls, duration, aspectRatio, cost } = input

  // 1. reserve 额度
  const quota = userManager.checkAndReserveQuota(userId, userName, cost)
  if (!quota.allowed) return quota.message!

  // 2. 提交任务
  let taskId: string
  try {
    taskId = await videoProvider.createVideoTask(prompt, imageUrls, { duration, aspectRatio })
  } catch (error: any) {
    userManager.refundUsage(userId, userName, cost, `${commandName} 创建失败退款`)
    logger.error('创建视频任务失败', { userId, error: sanitizeString(error?.message) })
    return `创建视频任务失败：${sanitizeString(error?.message)}`
  }

  await session.send(`视频任务已提交（任务ID: ${taskId.slice(0, 16)}…），预计需要 1-5 分钟，生成完成后自动发送`)

  // 3. 登记 pending（先记为未扣费，轮询成功后再 commit）
  store.add({
    taskId,
    userId,
    userName,
    commandName,
    credits: cost,
    charged: false,
    createdAt: new Date().toISOString(),
    prompt: prompt.slice(0, 100),
  })

  // 4. 轮询
  const maxAttempts = Math.ceil((config.videoMaxWaitTime * 1000) / POLL_INTERVAL_MS)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    let status
    try {
      status = await videoProvider.queryTaskStatus(taskId)
    } catch (error: any) {
      logger.warn('轮询失败（继续）', { taskId, attempt, error: sanitizeString(error?.message) })
      continue
    }

    if (status.status === 'completed' && status.videoUrl) {
      try {
        await session.send(h.video(status.videoUrl))
      } catch (error: any) {
        logger.error('发送视频失败', { taskId, error: sanitizeString(error?.message) })
        // 视频已生成但发送失败——仍然扣费（成本已发生），给出 URL 让用户手动取
        userManager.commitUsage(userId, userName, cost, commandName)
        store.delete(taskId)
        userManager.endVideoTask(userId)
        return `视频已生成但发送失败，请手动下载：${status.videoUrl}`
      }
      userManager.commitUsage(userId, userName, cost, commandName)
      store.delete(taskId)
      userManager.endVideoTask(userId)
      logger.info('视频生成完成', { taskId, userId, cost })
      return '视频生成完成！'
    }

    if (status.status === 'failed') {
      userManager.refundUsage(userId, userName, cost, `${commandName} 失败退款`)
      store.delete(taskId)
      userManager.endVideoTask(userId)
      logger.warn('视频生成失败', { taskId, userId, error: status.error })
      return `视频生成失败：${status.error || '未知错误'}（积分已退回）`
    }
  }

  // 5. 超时：保留 pending，提示用户手动查询
  logger.info('视频任务轮询超时，转人工查询', { taskId, userId })
  return `视频仍在生成中（已等待 ${config.videoMaxWaitTime} 秒）。\n任务ID：${taskId}\n稍后可发送「查询视频 ${taskId}」获取结果。`
}
