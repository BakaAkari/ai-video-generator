import type { CommandDeps } from './video'
import { CMD_MODELS } from '../shared/constants'
import { fetchModelCatalog, formatCatalogMessage } from '../services/ModelCatalog'
import { sanitizeString } from '../providers/errors'

export function registerModelsCommand(deps: CommandDeps): void {
  const { ctx, config } = deps

  ctx.command(CMD_MODELS, '查询供应商提供的可用视频模型列表').action(async ({ session }) => {
    if (!session) return '会话无效'

    await session.send('正在从供应商查询模型列表...')

    try {
      const catalog = await fetchModelCatalog(config.apiBase, config.apiKey, config.apiTimeout)
      // 根据当前配置确定当前模型 ID
      const currentModelId =
        config.videoModel === 'grok' ? config.grokModelId :
        config.videoModel === 'kling' ? config.klingModelName :
        config.videoModel === 'omni' ? config.omniModelId :
        config.videoModel === 'seedance' ? config.seedanceModelId :
        config.videoModel === 'vidu' ? config.viduModelId :
        '未知'

      return formatCatalogMessage(catalog, config.provider, currentModelId)
    } catch (error: any) {
      return `查询模型列表失败：${sanitizeString(error?.message)}\n请检查 API Key 和 API 地址是否正确，网络是否可达。`
    }
  })
}
