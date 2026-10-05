import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  PagedResultDTO,
  PaginationOptionsDTO,
  TimeEntryDTO,
  TimeEntryPullCheckpointDTO,
  TimeEntryPullPageDTO,
} from '@/dtos'

export interface CreatedTimeEntryResult {
  id: string
  updatedAt?: Date
  /**
   * Estado do apontamento exatamente como o destino o gravou (valores
   * normalizados, como horas arredondadas). O destino é a fonte da verdade:
   * quando presente, substitui o que o usuário digitou.
   */
  entry?: TimeEntryDTO
}

export interface UpdatedTimeEntryResult {
  id: string
  updatedAt?: Date
  /** Ver {@link CreatedTimeEntryResult.entry}. */
  entry?: TimeEntryDTO
}

export type TimeEntryCreateIdempotency = 'native' | 'reconcilable' | 'none'

export interface ITimeEntryProvider {
  readonly timeEntryCreateIdempotency?: TimeEntryCreateIdempotency
  pull(
    memberId: string,
    checkpoint: TimeEntryPullCheckpointDTO,
    batch: number,
  ): Promise<Either<AppError, TimeEntryPullPageDTO>>
  findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>>
  findByCorrelation?(
    correlationId: string,
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, TimeEntryDTO | null>>
  create(entry: TimeEntryDTO): Promise<Either<AppError, CreatedTimeEntryResult>>
  update(entry: TimeEntryDTO): Promise<Either<AppError, UpdatedTimeEntryResult>>
  /** Server must atomically compare the expected revision/snapshot and write.
   * A mismatch returns 409/412 without changing the remote record.
   * Omit this method when the backend cannot guarantee the condition.
   */
  updateConditional?(
    entry: TimeEntryDTO,
    expected: TimeEntryDTO,
  ): Promise<Either<AppError, UpdatedTimeEntryResult>>
  delete(id: string): Promise<Either<AppError, void>>
  findById(id: string): Promise<Either<AppError, TimeEntryDTO | null>>
  findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>>
}
