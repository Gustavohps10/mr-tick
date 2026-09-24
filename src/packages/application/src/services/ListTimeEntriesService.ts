import { AppError, Either } from '@mr-tick/shared/helpers'

import { IDataSourceResolver } from '@/contracts/resolvers'
import {
  IListTimeEntriesUseCase,
  ListTimeEntriesInput,
} from '@/contracts/use-cases/IListTimeEntriesUseCase'
import { PagedResultDTO, TimeEntryDTO } from '@/dtos'

export class ListTimeEntriesService implements IListTimeEntriesUseCase {
  public constructor(
    private readonly dataSourceResolver: IDataSourceResolver,
  ) {}

  public async execute(
    input: ListTimeEntriesInput,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    try {
      const adapter = await this.dataSourceResolver.getDataSource(
        input.workspaceId,
        input.connectionInstanceId,
      )

      const result = await adapter.getAuthenticatedMemberData()
      if (result.isFailure()) return result.forwardFailure()

      const member = result.success

      const startDate =
        input.startDate instanceof Date
          ? input.startDate
          : new Date(input.startDate)
      const endDate =
        input.endDate instanceof Date ? input.endDate : new Date(input.endDate)

      const timeEntriesResult =
        await adapter.timeEntriesProvider.findByMemberId(
          member.id.toString(),
          startDate,
          endDate,
        )
      if (timeEntriesResult.isFailure())
        return timeEntriesResult.forwardFailure()

      return Either.success(timeEntriesResult.success)
    } catch {
      return Either.failure(AppError.NotFound('ERRO_INESPERADO'))
    }
  }
}
