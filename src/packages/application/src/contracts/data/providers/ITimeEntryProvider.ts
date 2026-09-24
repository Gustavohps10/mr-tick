import { AppError, Either } from '@mr-tick/shared/helpers'

import { PagedResultDTO, PaginationOptionsDTO, TimeEntryDTO } from '@/dtos'

export interface CreatedTimeEntryResult {
  id: string
  updatedAt?: Date
}

export interface UpdatedTimeEntryResult {
  id: string
  updatedAt?: Date
}

export interface ITimeEntryProvider {
  pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TimeEntryDTO[]>>
  findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>>
  create(entry: TimeEntryDTO): Promise<Either<AppError, CreatedTimeEntryResult>>
  update(entry: TimeEntryDTO): Promise<Either<AppError, UpdatedTimeEntryResult>>
  delete(id: string): Promise<Either<AppError, void>>
  findById(id: string): Promise<Either<AppError, TimeEntryDTO | null>>
  findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>>
}
