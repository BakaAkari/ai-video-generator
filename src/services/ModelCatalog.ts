/**
 * 模型目录服务 — 查询供应商提供的视频模型清单
 * 调用 /v1/models（OpenAI 兼容）+ /api/pricing（new-api 定价表）
 */
export interface VideoModelEntry {
  id: string
  /** 供应商家族（grok / kling / vidu / seedance / omni / veo / sora / wan / pixverse / hailuo / skyreels 等） */
  family: string
  /** 定价倍率（从 /api/pricing 获取，缺失为 '?'） */
  pricingMultiplier?: string
  /** 定价分组名（从 /api/pricing 获取） */
  pricingGroup?: string
  /** 模型原始元数据（/v1/models 返回的 owned_by 等） */
  ownedBy?: string
}

export interface ModelCatalog {
  families: Record<string, VideoModelEntry[]>
  totalModels: number
  fetchedAt: string
}

/** 视频模型识别：按 ID 前缀/关键词匹配已知视频模型家族 */
function classifyVideoModel(modelId: string): string | null {
  const lower = modelId.toLowerCase()
  if (lower.includes('grok-imagine-video')) return 'grok'
  if (lower.startsWith('kling')) return 'kling'
  if (lower.startsWith('vidu') || lower.includes('viduq')) return 'vidu'
  if (lower.includes('seedance') || (lower.includes('doubao') && lower.includes('video'))) return 'seedance'
  if (lower.startsWith('omni-') || lower.includes('omni-flash') || lower.includes('omni-video')) return 'omni'
  if (lower.startsWith('veo-') || lower.startsWith('google/veo')) return 'veo'
  if (lower.startsWith('sora-') || lower.startsWith('openai/sora')) return 'sora'
  if (lower.startsWith('wan') && (lower.includes('video') || lower.includes('i2v') || lower.includes('t2v'))) return 'wan'
  if (lower.includes('pixverse')) return 'pixverse'
  if (lower.includes('hailuo') || lower.includes('minimax-video')) return 'hailuo'
  if (lower.includes('happyhorse')) return 'happyhorse'
  if (lower.includes('skyreels')) return 'skyreels'
  if (lower.includes('cinema-') || lower.includes('cinema2')) return 'cinema'
  if (lower.startsWith('wan2.') && !lower.includes('image')) return 'wan'
  if (lower === 'miaosi-v4' || lower.includes('miaosi')) return 'skyreels'
  return null
}

/** 从新 API 拉取模型清单 + 定价表，构建视频模型目录 */
export async function fetchModelCatalog(apiBase: string, apiKey: string, timeoutSec: number): Promise<ModelCatalog> {
  const fetchJson = async (url: string) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutSec * 1000)
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    } finally {
      clearTimeout(timer)
    }
  }

  // 并行拉取
  const [modelsResult, pricingResult] = await Promise.allSettled([
    fetchJson(`${apiBase}/v1/models`),
    fetchJson(`${apiBase}/api/pricing`),
  ])

  // 解析定价表 → modelId → { group, multiplier }
  const pricingMap = new Map<string, { group: string; multiplier: string }>()
  if (pricingResult.status === 'fulfilled' && pricingResult.value?.data) {
    for (const item of pricingResult.value.data) {
      const id = item?.model_id || item?.id || item?.name || ''
      if (id && typeof id === 'string') {
        pricingMap.set(id.toLowerCase(), {
          group: item?.grouping_name || item?.group || '',
          multiplier: item?.model_ratio ?? item?.multiplier ?? item?.ratio ?? '',
        })
      }
    }
  }

  // 解析 /v1/models
  const families: Record<string, VideoModelEntry[]> = {}
  let totalModels = 0

  if (modelsResult.status === 'fulfilled' && modelsResult.value?.data) {
    const modelList: any[] = Array.isArray(modelsResult.value.data)
      ? modelsResult.value.data
      : []

    for (const m of modelList) {
      const id: string = m?.id || ''
      if (!id) continue
      const family = classifyVideoModel(id)
      if (!family) continue

      const pricing = pricingMap.get(id.toLowerCase())
      const entry: VideoModelEntry = {
        id,
        family,
        ownedBy: m?.owned_by || undefined,
        pricingMultiplier: pricing?.multiplier ? String(pricing.multiplier) : undefined,
        pricingGroup: pricing?.group || undefined,
      }

      if (!families[family]) families[family] = []
      families[family].push(entry)
      totalModels++
    }
  }

  return { families, totalModels, fetchedAt: new Date().toISOString() }
}

/** 家族中文名映射 */
const FAMILY_NAMES: Record<string, string> = {
  grok: 'Grok (xAI)',
  kling: '可灵 Kling',
  vidu: 'VIDU',
  seedance: '豆包 Seedance',
  omni: 'Gemini Omni',
  veo: 'Veo (Google)',
  sora: 'Sora (OpenAI)',
  wan: '通义万相 Wan',
  pixverse: 'PixVerse',
  hailuo: 'Hailuo (MiniMax)',
  happyhorse: 'HappyHorse',
  skyreels: 'SkyReels',
  cinema: 'Cinema',
}

/** 格式化目录为可发送的聊天消息 */
export function formatCatalogMessage(catalog: ModelCatalog, configProvider: string, configModel: string): string {
  const lines: string[] = [`📋 视频模型目录（供应商：${configProvider === 'yunwu' ? '云雾 yunwu.ai' : configProvider}）`, '']

  const familyOrder = ['grok', 'kling', 'vidu', 'seedance', 'omni', 'veo', 'sora', 'wan', 'pixverse', 'hailuo', 'happyhorse', 'skyreels', 'cinema']

  for (const family of familyOrder) {
    const models = catalog.families[family]
    if (!models || models.length === 0) continue
    const familyName = FAMILY_NAMES[family] || family
    lines.push(`【${familyName}】`)
    // 排序：当前配置的模型排第一
    const sorted = [...models].sort((a) => (a.id === configModel ? -1 : 1))
    for (const m of sorted) {
      const marker = m.id === configModel ? '  ← 当前' : ''
      const pricing = m.pricingGroup
        ? `  [${m.pricingGroup}${m.pricingMultiplier ? ` ×${m.pricingMultiplier}` : ''}]`
        : ''
      lines.push(`  ${m.id}${pricing}${marker}`)
    }
    lines.push('')
  }

  if (catalog.totalModels === 0) {
    lines.push('⚠️ 未发现视频模型。请检查 API Key 是否正确，或 API 地址是否可达。')
    if (catalog.families && Object.keys(catalog.families).length === 0) {
      lines.push('（提示：云雾 /v1/models 可能返回不含视频模型，请确保 key 所在分组已开启对应模型权限）')
    }
  }

  lines.push(`共 ${catalog.totalModels} 个视频模型，查询时间：${catalog.fetchedAt}`)
  return lines.join('\n')
}
