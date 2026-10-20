import { AppError, Either } from '@mr-tick/shared/helpers'

import { IDataSourceResolver } from '@/contracts/resolvers'
import { ITaskPullUseCase, PullTasksInput } from '@/contracts/use-cases'
import { TaskDTO } from '@/dtos'

export class TaskPullService implements ITaskPullUseCase {
  public constructor(
    private readonly dataSourceResolver: IDataSourceResolver,
  ) {}

  public async execute(
    input: PullTasksInput,
  ): Promise<Either<AppError, TaskDTO[]>> {
    try {
      const adapterResult = await this.dataSourceResolver.getDataSource(
        input.workspaceId,
        input.connectionInstanceId,
      )
      if (adapterResult.isFailure()) return adapterResult.forwardFailure()
      const adapter = adapterResult.success

      const result = await adapter.getAuthenticatedMemberData()
      if (result.isFailure()) return result.forwardFailure()

      const member = result.success

      const pullResult = await adapter.tasksProvider.pull(
        member.id,
        input.checkpoint,
        input.batch,
      )
      if (pullResult.isFailure()) return pullResult.forwardFailure()

      return Either.success(pullResult.success)
    } catch {
      return Either.failure(AppError.NotFound('ERRO_INESPERADO'))
    }
  }
}
