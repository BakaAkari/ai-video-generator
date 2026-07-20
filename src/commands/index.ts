import type { CommandDeps } from './video'
import { registerVideoCommands } from './video'
import { registerQueryCommand } from './query'
import { registerHelpAndBalanceCommands } from './help'

export function registerCommands(deps: CommandDeps): void {
  registerVideoCommands(deps)
  registerQueryCommand(deps)
  registerHelpAndBalanceCommands(deps)
}
