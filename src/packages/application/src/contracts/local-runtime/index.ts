import type { AppError, Either, FieldErrors } from '@mr-tick/shared/helpers'

import type {
  CreateTimeEntryDTO,
  TimeEntryRecordDTO,
  TimerStateDTO,
} from '../../dtos'

export interface LocalEntryInput extends CreateTimeEntryDTO {
  activityName?: string
  userId?: string
  userName?: string
}
export interface LocalEntryChanges {
  taskId?: string
  activityId?: string
  activityName?: string
  userId?: string
  userName?: string
  connectionInstanceId?: string
  dataSourceId?: string
  comments?: string
  timeSpentSeconds?: number
  pauseSeconds?: number
  startDate?: string
  endDate?: string
}
export interface LocalTimerInput extends LocalEntryInput {
  mode: 'countup' | 'countdown'
}
export interface LocalCommandIdentity {
  commandId: string
  workspaceId: string
  entryId: string
}
export type LocalRuntimeCommand =
  | (LocalCommandIdentity & {
      action: 'create' | 'suggest'
      payload: LocalEntryInput
    })
  | (LocalCommandIdentity & { action: 'update'; payload: LocalEntryChanges })
  | (LocalCommandIdentity & { action: 'timerStart'; payload: LocalTimerInput })
  | (LocalCommandIdentity & {
      action:
        | 'delete'
        | 'acceptSuggestion'
        | 'dismissSuggestion'
        | 'timerPause'
        | 'timerResume'
        | 'timerStop'
    })
export interface LocalEntryFilter {
  connectionInstanceId?: string
  taskId?: string
  startDate?: string
  endDate?: string
  source?: 'manual' | 'timer' | 'ai_suggestion' | 'addon'
}
export type LocalRuntimeQuery =
  | { action: 'list'; workspaceId: string; filter: LocalEntryFilter }
  | { action: 'get'; workspaceId: string; entryId: string }
  | { action: 'timerState'; workspaceId: string }
export type LocalRuntimeRequest = LocalRuntimeCommand | LocalRuntimeQuery
export interface LocalRuntimeResult {
  /** A durable replay does not emit a second notification or addon event. */
  replayed?: boolean
  entry: TimeEntryRecordDTO | null
  entries: TimeEntryRecordDTO[]
  timer: TimerStateDTO | null
  deleted: boolean
}
export interface LocalRuntimeFailure {
  messageKey: string
  statusCode: number
  details?: FieldErrors
}
export type LocalRuntimeResponse =
  | { ok: true; value: LocalRuntimeResult }
  | { ok: false; error: LocalRuntimeFailure }
export interface ILocalRuntimeAPI {
  request(input: LocalRuntimeRequest): Promise<LocalRuntimeResponse>
}
/** Persistence owns durable command receipts and commit recovery. */
export interface ILocalWorkspaceExecutor {
  execute(
    input: LocalRuntimeCommand,
  ): Promise<Either<AppError, LocalRuntimeResult>>
  query(input: LocalRuntimeQuery): Promise<Either<AppError, LocalRuntimeResult>>
  close(): Promise<Either<AppError, void>>
}
export interface ILocalWorkspaceFactory {
  open(workspaceId: string): Promise<Either<AppError, ILocalWorkspaceExecutor>>
}
export interface ILocalRuntimeEvents {
  committed(command: LocalRuntimeCommand, result: LocalRuntimeResult): void
}
export * from './capabilities'
export type {
  ILocalPersistenceAPI,
  ILocalSyncAPI,
  LocalPersistenceCommand,
  LocalPersistenceResponse,
  LocalSyncRequest,
  LocalSyncResponse,
} from './internal'
export type {
  LocalConflictSelection,
  LocalTaskSnapshot,
  LocalTimeEntrySnapshot,
  TimeEntryRemoteState,
  TimerJournalEntry,
} from './internal'
export type { LocalRuntimeSyncStatus } from './internal'
export type {
  AddonSourceInfo,
  ConflictData,
  ConflictDataSnapshot,
  RecordSyncStatus,
  TimerConfig,
} from './internal'
