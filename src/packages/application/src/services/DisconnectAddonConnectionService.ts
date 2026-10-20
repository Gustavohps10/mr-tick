import { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  DisconnectAddonConnectionInput,
  IConnectionLifecycleCoordinator,
  IDisconnectAddonConnectionUseCase,
  IWorkspacesRepository,
} from '@/contracts'

export class DisconnectAddonConnectionService implements IDisconnectAddonConnectionUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly connectionLifecycleCoordinator: IConnectionLifecycleCoordinator,
  ) {}

  public async execute(
    input: DisconnectAddonConnectionInput,
  ): Promise<Either<AppError, void>> {
    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const connection = workspace.connections.find(
      (item) => item.id === input.connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))

    const addonId =
      input.addonId !== undefined ? input.addonId : connection.addonId

    return this.connectionLifecycleCoordinator.disconnect({
      workspaceId: input.workspaceId,
      connectionInstanceId: input.connectionInstanceId,
      addonId,
    })
  }
}
