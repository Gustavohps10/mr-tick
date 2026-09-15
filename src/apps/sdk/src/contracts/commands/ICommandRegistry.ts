export type CommandArgument =
  string | number | boolean | Record<string, string | number | boolean>

export type CommandResult = object | string | number | boolean | void

export type CommandHandler = (
  ...args: CommandArgument[]
) => Promise<CommandResult> | CommandResult

export interface ICommandRegistry {
  register(commandId: string, handler: CommandHandler): void
  unregister(commandId: string): void
  execute(commandId: string, ...args: CommandArgument[]): Promise<CommandResult>
  has?(commandId: string): boolean
}
