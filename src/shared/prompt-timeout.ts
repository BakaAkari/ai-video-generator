import type { Config } from './config'

export function getPromptTimeoutMs(config: Config): number {
  return (config.promptTimeout || 120) * 1000
}

export function getPromptTimeoutText(config: Config): string {
  return `${config.promptTimeout || 120} 秒`
}

export function formatPromptTimeoutError(config: Config): string {
  return `等待超时（${getPromptTimeoutText(config)}），请重新发起命令`
}
