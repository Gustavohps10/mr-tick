import { TimeEntry } from '@mr-tick/domain'
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
  ): Promise<PagedResultDTO<TimeEntryDTO>>
  create(entry: TimeEntry): Promise<CreatedTimeEntryResult | void>
  update(entry: TimeEntry): Promise<UpdatedTimeEntryResult | void>
  delete(id: string): Promise<void>
  findById(id: string): Promise<TimeEntry | undefined>
  findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<TimeEntryDTO>>
}
