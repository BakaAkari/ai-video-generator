import type { BillingConfig } from './config'

/** 计算一个视频任务的积分成本 */
export function computeVideoCost(billing: BillingConfig, durationSec: number): number {
  const raw = billing.baseCredits + billing.perSecondCredits * Math.max(0, durationSec)
  return roundCredits(raw)
}

export function roundCredits(value: number): number {
  return Math.round(Math.max(0, value || 0) * 100) / 100
}
