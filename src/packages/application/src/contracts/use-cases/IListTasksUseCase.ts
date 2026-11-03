import { AppError, Either } from '@mr-tick/shared/helpers'

import { PagedResultDTO, TaskDTO } from '@/dtos'

export interface ListTasksInput {
  workspaceId: string
  connectionInstanceId: string
  search?: string
  resolveExactId?: string
  consumerId?: string
  ids?: string[]
  page?: number
  pageSize?: number
}

export interface IListTasksUseCase {
  execute(
    input: ListTasksInput,
  ): Promise<Either<AppError, PagedResultDTO<TaskDTO>>>
}
