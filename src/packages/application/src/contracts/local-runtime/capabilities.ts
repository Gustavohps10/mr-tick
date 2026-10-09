import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { TimeEntryRecordDTO, TimerStateDTO } from '../../dtos'
import type {
  LocalEntryChanges,
  LocalEntryFilter,
  LocalEntryInput,
  LocalTimerInput,
} from './index'

/** Keep this identity unchanged when retrying an interrupted operation. */
export interface LocalOperationIdentity {
  commandId: string
  entryId: string
}
export interface LocalTimerStateDTO extends TimerStateDTO {
  entryId: string
  workspaceId: string
}
export interface ILocalTimeEntriesCapability {
  list(
    workspaceId: string,
    filter?: LocalEntryFilter,
  ): Promise<Either<AppError, TimeEntryRecordDTO[]>>
  getById(
    workspaceId: string,
    id: string,
  ): Promise<Either<AppError, TimeEntryRecordDTO | null>>
  create(
    workspaceId: string,
    payload: LocalEntryInput,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, TimeEntryRecordDTO>>
  createSuggestion(
    workspaceId: string,
    payload: LocalEntryInput,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, TimeEntryRecordDTO>>
  acceptSuggestion(
    workspaceId: string,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, TimeEntryRecordDTO>>
  dismissSuggestion(
    workspaceId: string,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, boolean>>
  update(
    workspaceId: string,
    payload: LocalEntryChanges,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, TimeEntryRecordDTO>>
  delete(
    workspaceId: string,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, boolean>>
}
export interface ILocalTimerCapability {
  getActiveEntry(
    workspaceId: string,
  ): Promise<Either<AppError, LocalTimerStateDTO | null>>
  requestControlLock(): Promise<Either<AppError, boolean>>
  releaseControlLock(): Promise<Either<AppError, void>>
  isControlLockHeld(): Promise<Either<AppError, boolean>>
  start(
    workspaceId: string,
    payload: LocalTimerInput,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, void>>
  pause(
    workspaceId: string,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, void>>
  resume(
    workspaceId: string,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, void>>
  stop(
    workspaceId: string,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, void>>
  logTime(
    workspaceId: string,
    payload: LocalEntryInput,
    operation: LocalOperationIdentity,
  ): Promise<Either<AppError, void>>
}
