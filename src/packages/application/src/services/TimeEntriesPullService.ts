import { AppError, Either } from '@mr-tick/shared/helpers'

import { IDataSourceResolver } from '@/contracts/resolvers'
import {
  ITimeEntriesPullUseCase,
  PullTimeEntriesInput,
} from '@/contracts/use-cases'
import { TimeEntryDTO } from '@/dtos'

export class TimeEntriesPullService implements ITimeEntriesPullUseCase {
  public constructor(
    private readonly dataSourceResolver: IDataSourceResolver,
  ) {}

  public async execute(
    input: PullTimeEntriesInput,
  ): Promise<Either<AppError, TimeEntryDTO[]>> {
    try {
      const adapter = await this.dataSourceResolver.getDataSource(
        input.workspaceId,
        input.connectionInstanceId,
      )

      const result = await adapter.getAuthenticatedMemberData()
      if (result.isFailure()) return result.forwardFailure()

      const member = result.success

      return await adapter.timeEntriesProvider.pull(
        member.id.toString(),
        input.checkpoint,
        input.batch,
      )
    } catch {
      return Either.failure(AppError.NotFound('ERRO_INESPERADO'))
    }
  }
}
