import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  ConnectDataSourceInput,
  IConnectDataSourceUseCase,
  ICredentialsVault,
  IDataSourceResolver,
  IWorkspacesRepository,
} from '@/contracts'
import { ConnectionResultDTO } from '@/dtos/ConnectionResultDTO'

export class ConnectDataSourceService implements IConnectDataSourceUseCase {
  constructor(
    private readonly credentialsVault: ICredentialsVault,
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly dataSourceResolver: IDataSourceResolver,
  ) {}

  public async execute<
    Credentials extends Record<string, string | number | boolean>,
    Configuration extends Record<string, string | number | boolean>,
  >(
    input: ConnectDataSourceInput<Credentials, Configuration>,
  ): Promise<Either<AppError, ConnectionResultDTO>> {
    const vaultKey = `workspace-connection-${input.workspaceId}-${input.connectionInstanceId}`

    try {
      const workspace = await this.workspacesRepository.findById(
        input.workspaceId,
      )

      if (!workspace) {
        return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))
      }

      const adapter = await this.dataSourceResolver.getDataSource(
        input.workspaceId,
        input.connectionInstanceId,
        {
          config: input.configuration,
          credentials: input.credentials,
        },
      )

      const authResult = await adapter.authenticationStrategy.authenticate({
        configuration: input.configuration,
        credentials: input.credentials,
      })

      if (authResult.isFailure()) {
        return authResult.forwardFailure()
      }

      const { member, credentials } = authResult.success

      await this.credentialsVault.saveToken(
        'mr-tick',
        vaultKey,
        JSON.stringify({
          member,
          credentials,
        }),
      )

      const connectResult = workspace.connectDataSource(
        input.connectionInstanceId,
        {
          id: member.id.toString(),
          name: `${member.firstname} ${member.lastname}`,
          login: member.login,
          avatarUrl: member.avatarUrl,
        },
        input.configuration,
      )

      if (connectResult.isFailure()) {
        await this.credentialsVault.deleteToken('mr-tick', vaultKey)
        return connectResult.forwardFailure()
      }

      await this.workspacesRepository.update(workspace)

      return Either.success<ConnectionResultDTO>({
        member,
      })
    } catch {
      await this.credentialsVault.deleteToken('mr-tick', vaultKey)

      return Either.failure(AppError.Internal('ERRO_AO_CONECTAR_DATA_SOURCE'))
    }
  }
}
