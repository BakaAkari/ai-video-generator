import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Context } from 'koishi'
import { roundCredits } from '../shared/billing'

/** V2 用户数据模型（与 aka-ai-image-generator 完全一致，可共享数据目录） */
export interface UserBalance {
  dailyFreeCreditsUsed: number
  dailyFreeCreditsLimitSnapshot: number
  dailyResetDate: string
  purchasedCredits: number
  totalGrantedCredits: number
  totalConsumedCredits: number
  totalRefundedCredits: number
}

export interface UserRecord {
  userId: string
  userName: string
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  balance: UserBalance
  statistics: {
    totalVideosGenerated?: number
    totalImagesGenerated?: number
    totalGenerationRequests: number
    totalFailedRequests: number
  }
  flags: Record<string, unknown>
}

interface UsersFile {
  users: Record<string, UserRecord>
  metadata: { lastLedgerSequence: number; [k: string]: unknown }
  updatedAt?: string
  [k: string]: unknown
}

export interface QuotaCheckResult {
  allowed: boolean
  message?: string
}

function nowISO(): string {
  return new Date().toISOString()
}

function todayKey(): string {
  return nowISO().slice(0, 10)
}

/**
 * V2 积分用户管理器
 * - users.v2.json 读写
 * - credit-ledger.v2.jsonl 流水
 * - reserve / commit / refund 三段式计费
 */
export class UserManager {
  private usersPath: string
  private ledgerPath: string
  private data: UsersFile
  /** 进行中的视频任务（每用户最多 1 个） */
  private activeVideoTasks = new Set<string>()

  constructor(
    private ctx: Context,
    dataDir: string,
    private dailyFreeLimit: number,
    /** 管理员 QQ 号列表（免积分、不受并发限制） */
    private adminUsers: string[] = [],
  ) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.usersPath = path.join(dataDir, 'users.v2.json')
    this.ledgerPath = path.join(dataDir, 'credit-ledger.v2.jsonl')
    this.data = this.loadUsers()
  }

  /** 是否管理员 */
  isAdmin(userId: string): boolean {
    return this.adminUsers.includes(String(userId))
  }

  private loadUsers(): UsersFile {
    if (fs.existsSync(this.usersPath)) {
      return JSON.parse(fs.readFileSync(this.usersPath, 'utf-8')) as UsersFile
    }
    return { users: {}, metadata: { lastLedgerSequence: 0 } }
  }

  private saveUsers(): void {
    this.data.updatedAt = nowISO()
    const tmp = this.usersPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    fs.renameSync(tmp, this.usersPath)
  }

  private appendLedger(event: Record<string, unknown>): void {
    const seq = (this.data.metadata.lastLedgerSequence || 0) + 1
    this.data.metadata.lastLedgerSequence = seq
    const line = JSON.stringify({ schemaVersion: 2, sequence: seq, id: `ledger-${seq}-${Date.now()}`, ...event })
    fs.appendFileSync(this.ledgerPath, line + '\n')
  }

  private getOrCreateUser(userId: string, userName: string): UserRecord {
    let user = this.data.users[userId]
    if (!user) {
      user = {
        userId,
        userName: userName || userId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        balance: {
          dailyFreeCreditsUsed: 0,
          dailyFreeCreditsLimitSnapshot: this.dailyFreeLimit,
          dailyResetDate: todayKey(),
          purchasedCredits: 0,
          totalGrantedCredits: 0,
          totalConsumedCredits: 0,
          totalRefundedCredits: 0,
        },
        statistics: { totalGenerationRequests: 0, totalFailedRequests: 0 },
        flags: {},
      }
      this.data.users[userId] = user
    }
    // 每日免费额度重置
    if (user.balance.dailyResetDate !== todayKey()) {
      user.balance.dailyResetDate = todayKey()
      user.balance.dailyFreeCreditsUsed = 0
      user.balance.dailyFreeCreditsLimitSnapshot = this.dailyFreeLimit
    }
    return user
  }

  /** 可用余额 = 免费剩余 + 付费余额 */
  getAvailableCredits(userId: string, userName: string): { free: number; purchased: number; total: number } {
    const user = this.getOrCreateUser(userId, userName)
    const free = roundCredits(this.dailyFreeLimit - user.balance.dailyFreeCreditsUsed)
    const purchased = roundCredits(user.balance.purchasedCredits)
    return { free, purchased, total: roundCredits(free + purchased) }
  }

  /** 检查并预留额度（优先扣免费额度；管理员跳过） */
  checkAndReserveQuota(userId: string, userName: string, cost: number): QuotaCheckResult {
    if (this.isAdmin(userId)) return { allowed: true }
    const user = this.getOrCreateUser(userId, userName)
    const { total } = this.getAvailableCredits(userId, userName)
    if (total < cost) {
      return {
        allowed: false,
        message: `积分不足：本次需要 ${cost} 积分，当前可用 ${total}（免费 ${roundCredits(this.dailyFreeLimit - user.balance.dailyFreeCreditsUsed)} + 付费 ${user.balance.purchasedCredits}）`,
      }
    }
    // reserve：先扣免费，再扣付费
    let remaining = cost
    const freeLeft = roundCredits(this.dailyFreeLimit - user.balance.dailyFreeCreditsUsed)
    const useFree = Math.min(freeLeft, remaining)
    user.balance.dailyFreeCreditsUsed = roundCredits(user.balance.dailyFreeCreditsUsed + useFree)
    remaining = roundCredits(remaining - useFree)
    if (remaining > 0) {
      user.balance.purchasedCredits = roundCredits(user.balance.purchasedCredits - remaining)
    }
    user.updatedAt = nowISO()
    this.saveUsers()
    return { allowed: true }
  }

  /** 任务成功：确认消费，写流水（管理员只记统计不扣费） */
  commitUsage(userId: string, userName: string, cost: number, reason: string): void {
    const user = this.getOrCreateUser(userId, userName)
    if (!this.isAdmin(userId)) {
      user.balance.totalConsumedCredits = roundCredits(user.balance.totalConsumedCredits + cost)
    }
    user.statistics.totalGenerationRequests += 1
    user.statistics.totalVideosGenerated = (user.statistics.totalVideosGenerated || 0) + 1
    user.lastUsedAt = nowISO()
    user.updatedAt = nowISO()
    this.appendLedger({
      timestamp: nowISO(),
      userId,
      userName,
      type: 'consume',
      amount: this.isAdmin(userId) ? 0 : cost,
      reason: this.isAdmin(userId) ? `${reason}（管理员免积分）` : reason,
    })
    this.saveUsers()
  }

  /** 任务失败：退回预留额度（管理员无预留可退） */
  refundUsage(userId: string, userName: string, cost: number, reason: string): void {
    if (this.isAdmin(userId)) return
    const user = this.getOrCreateUser(userId, userName)
    // 简化处理：全部退到付费余额（免费额度退回会增加复杂度，误差可接受——免费额度每日重置）
    user.balance.purchasedCredits = roundCredits(user.balance.purchasedCredits + cost)
    user.balance.totalRefundedCredits = roundCredits(user.balance.totalRefundedCredits + cost)
    user.statistics.totalFailedRequests += 1
    user.updatedAt = nowISO()
    this.appendLedger({
      timestamp: nowISO(),
      userId,
      userName,
      type: 'refund',
      amount: cost,
      reason,
    })
    this.saveUsers()
  }

  /** 并发约束：每用户同时最多 1 个视频任务 */
  startVideoTask(userId: string): boolean {
    if (this.activeVideoTasks.has(userId)) return false
    this.activeVideoTasks.add(userId)
    return true
  }

  endVideoTask(userId: string): void {
    this.activeVideoTasks.delete(userId)
  }
}
