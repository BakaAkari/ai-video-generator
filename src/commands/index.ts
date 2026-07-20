import type { CommandDeps } from './video'
import { registerVideoCommands } from './video'
import { registerQueryCommand } from './query'
import { registerModelsCommand } from './models'
import { registerHelpAndBalanceCommands } from './help'

export function registerCommands(deps: CommandDeps): void {
  registerVideoCommands(deps)
  registerQueryCommand(deps)
  registerModelsCommand(deps)
  registerHelpAndBalanceCommands(deps)
}
