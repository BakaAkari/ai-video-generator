import type { Context } from 'koishi'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export class Logger {
  constructor(
    private ctx: Context,
    private level: LogLevel,
  ) {}

  private should(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level]
  }

  debug(msg: string, meta?: Record<string, unknown>) {
    if (this.should('debug')) this.ctx.logger('aka-video').debug(msg, meta ?? '')
  }
  info(msg: string, meta?: Record<string, unknown>) {
    if (this.should('info')) this.ctx.logger('aka-video').info(msg, meta ?? '')
  }
  warn(msg: string, meta?: Record<string, unknown>) {
    if (this.should('warn')) this.ctx.logger('aka-video').warn(msg, meta ?? '')
  }
  error(msg: string, meta?: Record<string, unknown>) {
    if (this.should('error')) this.ctx.logger('aka-video').error(msg, meta ?? '')
  }
}
