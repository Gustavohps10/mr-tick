import { AppError, Either } from '@mr-tick/shared/helpers'

import { PagedResultDTO, PaginationOptionsDTO, TaskDTO } from '@/dtos'

export interface CreatedTaskResult {
  id: string
  updatedAt?: Date
}

export interface UpdatedTaskResult {
  id: string
  updatedAt?: Date
}

export interface ITaskProvider {
  pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TaskDTO[]>>
  findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TaskDTO>>>
  findById(id: string): Promise<Either<AppError, TaskDTO | null>>
  create(task: TaskDTO): Promise<Either<AppError, CreatedTaskResult>>
  update(task: TaskDTO): Promise<Either<AppError, UpdatedTaskResult>>
  delete(id: string): Promise<Either<AppError, void>>
}
