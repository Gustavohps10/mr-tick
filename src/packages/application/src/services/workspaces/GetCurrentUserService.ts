import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  GetCurrentUserInput,
  IDataSourceResolver,
  IGetCurrentUserUseCase,
  IWorkspacesRepository,
} from '@/contracts'
import { MemberDTO } from '@/dtos'

export class GetCurrentUserService implements IGetCurrentUserUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly dataSourceResolver: IDataSourceResolver,
  ) {}

  public async execute(
    input: GetCurrentUserInput,
  ): Promise<Either<AppError, MemberDTO>> {
    try {
      const workspaceResult = await this.workspacesRepository.getById(
        input.workspaceId,
      )
      if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
      const workspace = workspaceResult.success

      if (!workspace)
        return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

      const connection = workspace.connections.find(
        (c) => c.id === input.connectionInstanceId,
      )

      if (!connection)
        return Either.failure(
          AppError.NotFound('CONEXAO_NAO_ENCONTRADA_OU_INVALIDA'),
        )

      const adapterResult = await this.dataSourceResolver.getDataSource(
        input.workspaceId,
        connection.id,
      )
      if (adapterResult.isFailure()) return adapterResult.forwardFailure()
      const adapter = adapterResult.success

      const result = await adapter.getAuthenticatedMemberData()
      if (result.isFailure()) return result.forwardFailure()

      const userResult = await adapter.membersProvider.findById(
        result.success.id,
      )
      if (userResult.isFailure()) return userResult.forwardFailure()

      const user = userResult.success
      if (!user)
        return Either.failure(AppError.NotFound('USUARIO_NAO_ENCONTRADO'))

      return Either.success(user)
    } catch {
      return Either.failure(AppError.NotFound('ERRO_AO_OBTER_USUARIO'))
    }
  }
}
