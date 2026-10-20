import type { AppError, Either } from '@mr-tick/shared/helpers'

export interface DisconnectAddonConnectionInput {
  workspaceId: string
  connectionInstanceId: string
  addonId?: string
}

export interface IDisconnectAddonConnectionUseCase {
  execute(
    input: DisconnectAddonConnectionInput,
  ): Promise<Either<AppError, void>>
}
