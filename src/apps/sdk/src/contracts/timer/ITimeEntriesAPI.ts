import type {
  CreateTimeEntryDTO,
  TimeEntriesFilterDTO,
  TimeEntryRecordDTO,
  UpdateTimeEntryDTO,
} from '@mr-tick/application'
import type { AppError, Either } from '@mr-tick/shared/helpers'

export type {
  CreateTimeEntryDTO,
  TimeEntriesFilterDTO,
  TimeEntryRecordDTO,
  UpdateTimeEntryDTO,
}
export type TimeEntryItemDTO = TimeEntryRecordDTO

export interface ITimeEntriesAPI {
  list(
    filter?: TimeEntriesFilterDTO,
  ): Promise<Either<AppError, TimeEntryRecordDTO[]>>
  getById(id: string): Promise<Either<AppError, TimeEntryRecordDTO | null>>
  create(
    payload: CreateTimeEntryDTO,
  ): Promise<Either<AppError, TimeEntryRecordDTO>>
  createSuggestion(
    payload: CreateTimeEntryDTO,
  ): Promise<Either<AppError, TimeEntryRecordDTO>>
  acceptSuggestion(id: string): Promise<Either<AppError, TimeEntryRecordDTO>>
  dismissSuggestion(id: string): Promise<Either<AppError, boolean>>
  update(
    id: string,
    payload: UpdateTimeEntryDTO,
  ): Promise<Either<AppError, TimeEntryRecordDTO>>
  delete(id: string): Promise<Either<AppError, boolean>>
}
