import * as fs from 'node:fs'
import * as path from 'node:path'

/** 未完成视频任务记录 */
export interface PendingVideoTask {
  taskId: string
  userId: string
  userName: string
  commandName: string
  credits: number
  charged: boolean
  createdAt: string
  prompt: string
}

/**
 * pending 视频任务持久化存储
 * 文件：video-pending-tasks.json（taskId → PendingVideoTask）
 */
export class VideoContextStore {
  private filePath: string
  private tasks: Record<string, PendingVideoTask>

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'video-pending-tasks.json')
    this.tasks = this.load()
  }

  private load(): Record<string, PendingVideoTask> {
    if (fs.existsSync(this.filePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
      } catch {
        return {}
      }
    }
    return {}
  }

  private save(): void {
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.tasks, null, 2))
    fs.renameSync(tmp, this.filePath)
  }

  add(task: PendingVideoTask): void {
    this.tasks[task.taskId] = task
    this.save()
  }

  get(taskId: string): PendingVideoTask | undefined {
    return this.tasks[taskId]
  }

  markCharged(taskId: string): void {
    const t = this.tasks[taskId]
    if (t) {
      t.charged = true
      this.save()
    }
  }

  delete(taskId: string): void {
    delete this.tasks[taskId]
    this.save()
  }

  listByUser(userId: string): PendingVideoTask[] {
    return Object.values(this.tasks).filter((t) => t.userId === userId)
  }

  listAll(): PendingVideoTask[] {
    return Object.values(this.tasks)
  }
}
