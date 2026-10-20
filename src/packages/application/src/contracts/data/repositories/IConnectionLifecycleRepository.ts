import { AppError, Either } from '@mr-tick/shared/helpers'

type BaseJournalEntry = {
  kind: 'pure' | 'lifecycle'
  operationId: string
  workspaceId: string
  expectedRevision: number
  connectionGeneration?: number
  reservationId: string | null
  attempts: number
  cleanupPending: boolean
  status: 'pending' | 'recovery_required' | 'completed' | 'aborted'
  phase?:
    | 'intent'
    | 'candidate_written'
    | 'metadata_committed'
    | 'cleanup_pending'
    | 'candidate_cleanup_pending'
  candidateReference?: string | null
  previousReferences?: string[]
}

export type WorkspaceRefreshJournalEntry = BaseJournalEntry & {
  intent: 'connection.refresh'
  connectionId: string
  authorizationId: string
  expectedAuthorizationGeneration: number
  expectedConnectionGeneration: number
}

export type WorkspaceGeneralJournalEntry = BaseJournalEntry & {
  intent:
    | 'create'
    | 'workspace.update'
    | 'connection.connect'
    | 'connection.disconnect'
    | 'connection.archive'
    | 'connection.restore'
    | 'connection.link'
    | 'connection.reserve'
    | 'connection.unlink'
    | 'workspace.configure'
    | 'workspace.identity'
    | 'delete'
  connectionId: string | null
  authorizationId?: string | null
  expectedAuthorizationGeneration?: number
  expectedConnectionGeneration?: number
}

export type WorkspaceJournalEntry =
  WorkspaceRefreshJournalEntry | WorkspaceGeneralJournalEntry

type BaseLifecycleOperation = {
  kind: 'lifecycle'
  operationId: string
  workspaceId: string
  expectedRevision: number
  reservationId: string | null
  candidateReference: string | null
  previousReferences: string[]
  connectionGeneration?: number
}

export type WorkspaceRefreshLifecycleOperation = BaseLifecycleOperation & {
  intent: 'connection.refresh'
  connectionId: string
  authorizationId: string
  expectedAuthorizationGeneration: number
  expectedConnectionGeneration: number
}

export type WorkspaceGeneralLifecycleOperation = BaseLifecycleOperation & {
  intent:
    | 'connection.connect'
    | 'connection.disconnect'
    | 'connection.archive'
    | 'connection.restore'
    | 'connection.unlink'
    | 'delete'
  connectionId: string | null
  authorizationId?: string | null
  expectedAuthorizationGeneration?: number
  expectedConnectionGeneration?: number
}

export type WorkspaceLifecycleOperation =
  WorkspaceRefreshLifecycleOperation | WorkspaceGeneralLifecycleOperation

export interface IConnectionLifecycleRepository {
  beginLifecycle(
    operation: WorkspaceLifecycleOperation,
  ): Promise<Either<AppError, void>>
  advanceLifecycle(
    operationId: string,
    phase:
      | 'candidate_written'
      | 'metadata_committed'
      | 'cleanup_pending'
      | 'candidate_cleanup_pending',
  ): Promise<Either<AppError, void>>
  finishLifecycle(operationId: string): Promise<Either<AppError, void>>
  inspectRecovery(): Promise<Either<AppError, WorkspaceJournalEntry[]>>
  abortPending(operationId: string): Promise<Either<AppError, void>>
}
