import type { CommandDeps } from './video'
import { CMD_BALANCE, CMD_HELP } from '../shared/constants'

export function registerHelpAndBalanceCommands(deps: CommandDeps): void {
  const { ctx, userManager, config } = deps

  ctx.command(CMD_BALANCE, '查询视频积分余额').action(async ({ session }) => {
    if (!session?.userId) return '会话无效'
    const userName = session.username || session.userId
    const { free, purchased, total } = userManager.getAvailableCredits(session.userId, userName)
    const sampleCost = config.billing.baseCredits + config.billing.perSecondCredits * config.defaultDuration
    return [
      `💰 视频积分余额`,
      `免费额度剩余：${free}（每日 ${config.billing.dailyFreeCreditsLimit}）`,
      `付费积分：${purchased}`,
      `合计可用：${total}`,
      ``,
      `参考：生成一个 ${config.defaultDuration} 秒视频约需 ${sampleCost} 积分`,
    ].join('\n')
  })

  ctx.command(CMD_HELP, '视频生成功能帮助').action(() => {
    return [
      `🎬 视频生成功能帮助`,
      ``,
      `【命令列表】`,
      `图生视频 [图片] <描述> — 用一张图片生成视频`,
      `多图生视频 [图片x2-4] <描述> — 多张图片合成视频`,
      `文生视频 <描述> — 纯文字生成视频（需模型支持）`,
      `查询视频 [任务ID] — 查询任务状态，不带参数则列出全部`,
      `视频余额 — 查询积分余额`,
      ``,
      `【可选参数】`,
      `-d <秒数> 指定视频时长（默认 ${config.defaultDuration} 秒）`,
      `-r <比例> 指定画面比例（默认 ${config.defaultAspectRatio}）`,
      ``,
      `【计费】`,
      `基础 ${config.billing.baseCredits} 积分 + ${config.billing.perSecondCredits} 积分/秒`,
      `生成失败自动退款；每日有 ${config.billing.dailyFreeCreditsLimit} 免费积分`,
      ``,
      `【提示】`,
      `描述越详细效果越好；也可以先发送命令再按提示发送图片`,
    ].join('\n')
  })
}
