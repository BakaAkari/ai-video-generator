import type { Config } from '../shared/config'
import { computeVideoCost } from '../shared/billing'

export interface ParsedVideoArgs {
  prompt: string
  duration: number
  aspectRatio: string
  size: string
  cost: number
}

/** 解析视频命令的可选参数（支持 -d/--duration 秒数、-r/--ratio 比例） */
export function parseVideoArgs(rest: string, config: Config): ParsedVideoArgs {
  let duration = config.defaultDuration
  let aspectRatio = config.defaultAspectRatio
  let prompt = rest || ''

  const durationMatch = prompt.match(/(?:-d|--duration)\s+(\d+)/)
  if (durationMatch) {
    duration = Math.min(30, Math.max(1, parseInt(durationMatch[1], 10)))
    prompt = prompt.replace(durationMatch[0], '')
  }
  const ratioMatch = prompt.match(/(?:-r|--ratio)\s+([\d:]+)/)
  if (ratioMatch) {
    aspectRatio = ratioMatch[1]
    prompt = prompt.replace(ratioMatch[0], '')
  }

  prompt = prompt.trim()
  return {
    prompt,
    duration,
    aspectRatio,
    size: config.defaultSize,
    cost: computeVideoCost(config.billing, duration),
  }
}
