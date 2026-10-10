import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  DisconnectDataSourceInput,
  ICredentialsVault,
  IDisconnectDataSourceUseCase,
  IWorkspacesRepository,
} from '@/contracts'
import { getMemberVaultKey } from '@/utils'

export class DisconnectDataSourceService implements IDisconnectDataSourceUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly credentialsVault: ICredentialsVault,
  ) {}

  public async execute(
    input: DisconnectDataSourceInput,
  ): Promise<Either<AppError, void>> {
    try {
      const workspace = await this.workspacesRepository.findById(
        input.workspaceId,
      )

      if (!workspace) {
        return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))
      }

      const vaultKey = `workspace-session-${input.workspaceId}-${input.connectionInstanceId}`
      const memberKey = getMemberVaultKey(
        input.workspaceId,
        input.connectionInstanceId,
      )

      await this.credentialsVault.deleteToken('mr-tick', vaultKey)
      await this.credentialsVault.deleteToken('mr-tick', memberKey)

      const result = workspace.disconnectDataSource(input.connectionInstanceId)

      if (result.isFailure()) {
        return result.forwardFailure()
      }

      await this.workspacesRepository.update(workspace)

      return Either.success(undefined)
    } catch (error: unknown) {
      return Either.failure(AppError.NotFound('ERRO_AO_DESCONECTAR'))
    }
  }
}
