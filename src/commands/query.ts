import { h } from 'koishi'
import type { CommandDeps } from './video'
import { CMD_QUERY } from '../shared/constants'
import { sanitizeString } from '../providers/errors'

export function registerQueryCommand(deps: CommandDeps): void {
  const { ctx, userManager, videoProvider, store, logger } = deps

  ctx.command(`${CMD_QUERY} [taskId:text]`, '查询视频生成任务状态').action(async ({ session }, taskId) => {
    if (!session?.userId) return '会话无效'

    // 单任务查询
    if (taskId?.trim()) {
      const id = taskId.trim()
      try {
        const pending = store.get(id)
        if (pending && pending.userId !== session.userId) {
          return '该任务ID不属于当前用户，无法查询'
        }
        await session.send('正在查询视频生成状态...')
        const status = await videoProvider.queryTaskStatus(id)

        if (status.status === 'completed' && status.videoUrl) {
          await session.send(h.video(status.videoUrl))
          if (pending && !pending.charged) {
            userManager.commitUsage(pending.userId, pending.userName, pending.credits, pending.commandName)
            store.delete(id)
          }
          userManager.endVideoTask(session.userId)
          return '视频生成完成！'
        }
        if (status.status === 'processing' || status.status === 'pending') {
          const progress = status.progress ? `（进度：${status.progress}%）` : ''
          return `视频正在生成中${progress}，请稍后再次查询`
        }
        if (status.status === 'failed') {
          if (pending && !pending.charged) {
            userManager.refundUsage(pending.userId, pending.userName, pending.credits, `${pending.commandName} 失败退款`)
            store.delete(id)
          }
          userManager.endVideoTask(session.userId)
          return `视频生成失败：${status.error || '未知错误'}（积分已退回）`
        }
        return `❓ 未知状态：${status.status}`
      } catch (error: any) {
        logger.error('查询视频任务失败', { taskId: id, error: sanitizeString(error?.message) })
        return `查询失败：${sanitizeString(error?.message)}`
      }
    }

    // 列表查询
    const pendingTasks = store.listByUser(session.userId)
    if (pendingTasks.length === 0) {
      return '你当前没有可查询的待生成视频任务'
    }
    await session.send(`正在查询 ${pendingTasks.length} 个视频任务状态...`)

    const messages: string[] = []
    let completed = 0
    let processing = 0
    let failed = 0

    for (const task of pendingTasks) {
      try {
        const status = await videoProvider.queryTaskStatus(task.taskId)
        const short = task.taskId.slice(0, 16) + '…'
        if (status.status === 'completed' && status.videoUrl) {
          await session.send(h.video(status.videoUrl))
          if (!task.charged) {
            userManager.commitUsage(task.userId, task.userName, task.credits, task.commandName)
            store.delete(task.taskId)
          }
          completed++
          messages.push(`✅ ${short} 已完成`)
        } else if (status.status === 'processing' || status.status === 'pending') {
          processing++
          const progress = status.progress ? `（${status.progress}%）` : ''
          messages.push(`⏳ ${short} 生成中${progress}`)
        } else if (status.status === 'failed') {
          if (!task.charged) {
            userManager.refundUsage(task.userId, task.userName, task.credits, `${task.commandName} 失败退款`)
            store.delete(task.taskId)
          }
          failed++
          messages.push(`❌ ${short} 失败：${status.error || '未知错误'}`)
        } else {
          messages.push(`❓ ${short} 状态：${status.status}`)
        }
      } catch (error: any) {
        messages.push(`⚠️ ${task.taskId.slice(0, 16)}… 查询失败：${sanitizeString(error?.message)}`)
      }
    }

    if (completed > 0 || failed > 0) {
      userManager.endVideoTask(session.userId)
    }

    const parts: string[] = ['查询结果汇总：']
    if (completed) parts.push(`已完成：${completed} 个`)
    if (processing) parts.push(`生成中：${processing} 个`)
    if (failed) parts.push(`失败：${failed} 个`)
    parts.push('', ...messages)
    return parts.join('\n')
  })
}
