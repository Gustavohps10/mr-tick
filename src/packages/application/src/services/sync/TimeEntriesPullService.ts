import { AppError, Either } from '@mr-tick/shared/helpers'

import { IDataSourceResolver } from '@/contracts/resolvers'
import {
  ITimeEntriesPullUseCase,
  PullTimeEntriesInput,
} from '@/contracts/use-cases'
import { TimeEntryPullPageDTO } from '@/dtos'

export class TimeEntriesPullService implements ITimeEntriesPullUseCase {
  public constructor(
    private readonly dataSourceResolver: IDataSourceResolver,
  ) {}

  public async execute(
    input: PullTimeEntriesInput,
  ): Promise<Either<AppError, TimeEntryPullPageDTO>> {
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

      return await adapter.timeEntriesProvider.pull(
        member.id,
        input.checkpoint,
        input.batch,
      )
    } catch {
      return Either.failure(AppError.NotFound('ERRO_INESPERADO'))
    }
  }
}
