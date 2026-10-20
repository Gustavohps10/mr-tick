import {
  IConnectionLifecycleRepository,
  WorkspaceJournalEntry,
  WorkspaceLifecycleOperation,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { Knex } from 'knex'

import {
  createSQLiteConnection,
  ensureDatabaseSchema,
  withSafeTransaction,
} from './sqlite-connection'

type JournalRow = {
  operation_id: string
  kind: string
  workspace_id: string
  connection_id: string | null
  authorization_id: string | null
  expected_authorization_generation: number | null
  expected_connection_generation: number | null
  intent: string
  expected_revision: number
  connection_generation: number | null
  reservation_id: string | null
  attempts: number
  cleanup_pending: boolean | number
  status: string
  phase: string | null
  candidate_reference: string | null
  previous_references: string | null
  created_at: string
  updated_at: string
}

function parseJournalStatus(
  status: string,
): Either<AppError, WorkspaceJournalEntry['status']> {
  switch (status) {
    case 'pending':
    case 'recovery_required':
    case 'completed':
    case 'aborted':
      return Either.success(status)
    default:
      return Either.failure(
        AppError.Internal(`INVALID_JOURNAL_STATUS: ${status}`),
      )
  }
}

function parseJournalPhase(
  phase: string | null,
): Either<AppError, WorkspaceJournalEntry['phase'] | undefined> {
  if (phase === null) return Either.success(undefined)
  switch (phase) {
    case 'intent':
    case 'candidate_written':
    case 'metadata_committed':
    case 'cleanup_pending':
    case 'candidate_cleanup_pending':
      return Either.success(phase)
    default:
      return Either.failure(
        AppError.Internal(`INVALID_JOURNAL_PHASE: ${phase}`),
      )
  }
}

function parseJournalIntent(
  intent: string,
): Either<AppError, WorkspaceJournalEntry['intent']> {
  switch (intent) {
    case 'create':
    case 'workspace.update':
    case 'connection.connect':
    case 'connection.refresh':
    case 'connection.disconnect':
    case 'connection.archive':
    case 'connection.restore':
    case 'connection.link':
    case 'connection.reserve':
    case 'connection.unlink':
    case 'workspace.configure':
    case 'workspace.identity':
    case 'delete':
      return Either.success(intent)
    default:
      return Either.failure(
        AppError.Internal(`INVALID_JOURNAL_INTENT: ${intent}`),
      )
  }
}

export class SQLiteConnectionLifecycleRepository implements IConnectionLifecycleRepository {
  public readonly db: Knex
  private readonly ownsConnection: boolean

  constructor(storagePathOrDb: string | Knex) {
    if (typeof storagePathOrDb !== 'string') {
      this.db = storagePathOrDb
      this.ownsConnection = false
      return
    }
    this.db = createSQLiteConnection(storagePathOrDb)
    this.ownsConnection = true
  }

  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.db.destroy()
    }
  }

  public async beginLifecycle(
    operation: WorkspaceLifecycleOperation,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const now = new Date().toISOString()
      const existing = await trx<JournalRow>('workspace_journal')
        .where('operation_id', operation.operationId)
        .first()

      if (existing) {
        return Either.failure(AppError.Http(409, 'OPERATION_ALREADY_EXISTS'))
      }

      await trx('workspace_journal').insert({
        operation_id: operation.operationId,
        kind: operation.kind,
        workspace_id: operation.workspaceId,
        connection_id: operation.connectionId,
        authorization_id: operation.authorizationId ?? null,
        expected_authorization_generation:
          operation.expectedAuthorizationGeneration ?? null,
        expected_connection_generation:
          operation.expectedConnectionGeneration ?? null,
        intent: operation.intent,
        expected_revision: operation.expectedRevision,
        connection_generation: operation.connectionGeneration ?? null,
        reservation_id: operation.reservationId,
        attempts: 0,
        cleanup_pending: 0,
        status: 'pending',
        phase: 'intent',
        candidate_reference: operation.candidateReference,
        previous_references: JSON.stringify(operation.previousReferences),
        created_at: now,
        updated_at: now,
      })

      return Either.success(undefined)
    })
  }

  public async advanceLifecycle(
    operationId: string,
    phase:
      | 'candidate_written'
      | 'metadata_committed'
      | 'cleanup_pending'
      | 'candidate_cleanup_pending',
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const now = new Date().toISOString()
      const existing = await trx<JournalRow>('workspace_journal')
        .where('operation_id', operationId)
        .first()

      if (!existing) {
        return Either.failure(AppError.NotFound('OPERATION_NOT_FOUND'))
      }

      if (existing.status === 'aborted') {
        return Either.failure(AppError.Http(409, 'LIFECYCLE_OPERATION_ABORTED'))
      }

      await trx('workspace_journal')
        .where('operation_id', operationId)
        .update({
          phase,
          cleanup_pending:
            phase === 'cleanup_pending' || phase === 'candidate_cleanup_pending'
              ? 1
              : 0,
          updated_at: now,
        })

      return Either.success(undefined)
    })
  }

  public async finishLifecycle(
    operationId: string,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const now = new Date().toISOString()
      const existing = await trx<JournalRow>('workspace_journal')
        .where('operation_id', operationId)
        .first()

      if (!existing) {
        return Either.failure(AppError.NotFound('OPERATION_NOT_FOUND'))
      }

      if (existing.status === 'aborted') {
        return Either.failure(AppError.Http(409, 'LIFECYCLE_OPERATION_ABORTED'))
      }

      await trx('workspace_journal').where('operation_id', operationId).update({
        status: 'completed',
        cleanup_pending: 0,
        updated_at: now,
      })

      return Either.success(undefined)
    })
  }

  public async inspectRecovery(): Promise<
    Either<AppError, WorkspaceJournalEntry[]>
  > {
    const initResult = await ensureDatabaseSchema(this.db)
    if (initResult.isFailure()) return initResult.forwardFailure()

    try {
      const rows = await this.db<JournalRow>('workspace_journal')
        .whereNot('status', 'completed')
        .whereNot('status', 'aborted')
        .orderBy('created_at', 'asc')

      const entries: WorkspaceJournalEntry[] = []
      for (const row of rows) {
        const statusResult = parseJournalStatus(row.status)
        if (statusResult.isFailure()) return statusResult.forwardFailure()

        const phaseResult = parseJournalPhase(row.phase)
        if (phaseResult.isFailure()) return phaseResult.forwardFailure()

        const intentResult = parseJournalIntent(row.intent)
        if (intentResult.isFailure()) return intentResult.forwardFailure()

        let previousReferences: string[] = []
        if (row.previous_references) {
          try {
            previousReferences = JSON.parse(row.previous_references)
          } catch {
            return Either.failure(
              AppError.Internal('INVALID_PREVIOUS_REFERENCES_JSON'),
            )
          }
        }

        if (intentResult.success === 'connection.refresh') {
          if (
            row.connection_id === null ||
            row.authorization_id === null ||
            row.expected_authorization_generation === null ||
            row.expected_connection_generation === null
          ) {
            return Either.failure(
              AppError.ValidationError('WORKSPACE_JOURNAL_INVALID'),
            )
          }

          entries.push({
            kind: row.kind === 'lifecycle' ? 'lifecycle' : 'pure',
            operationId: row.operation_id,
            workspaceId: row.workspace_id,
            connectionId: row.connection_id,
            authorizationId: row.authorization_id,
            expectedAuthorizationGeneration:
              row.expected_authorization_generation,
            expectedConnectionGeneration: row.expected_connection_generation,
            intent: 'connection.refresh',
            expectedRevision: row.expected_revision,
            connectionGeneration: row.connection_generation ?? undefined,
            reservationId: row.reservation_id,
            attempts: row.attempts,
            cleanupPending: Boolean(row.cleanup_pending),
            status: statusResult.success,
            phase: phaseResult.success,
            candidateReference: row.candidate_reference,
            previousReferences,
          })
          continue
        }

        entries.push({
          kind: row.kind === 'lifecycle' ? 'lifecycle' : 'pure',
          operationId: row.operation_id,
          workspaceId: row.workspace_id,
          connectionId: row.connection_id,
          authorizationId: row.authorization_id ?? undefined,
          expectedAuthorizationGeneration:
            row.expected_authorization_generation !== null
              ? row.expected_authorization_generation
              : undefined,
          expectedConnectionGeneration:
            row.expected_connection_generation !== null
              ? row.expected_connection_generation
              : undefined,
          intent: intentResult.success,
          expectedRevision: row.expected_revision,
          connectionGeneration: row.connection_generation ?? undefined,
          reservationId: row.reservation_id,
          attempts: row.attempts,
          cleanupPending: Boolean(row.cleanup_pending),
          status: statusResult.success,
          phase: phaseResult.success,
          candidateReference: row.candidate_reference,
          previousReferences,
        })
      }

      return Either.success(entries)
    } catch (error) {
      if (error instanceof Error) {
        return Either.failure(AppError.Internal(error.message))
      }
      return Either.failure(AppError.Internal('DATABASE_ERROR'))
    }
  }

  public async abortPending(
    operationId: string,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const now = new Date().toISOString()
      await trx('workspace_journal').where('operation_id', operationId).update({
        status: 'aborted',
        cleanup_pending: 0,
        updated_at: now,
      })
      return Either.success(undefined)
    })
  }
}
