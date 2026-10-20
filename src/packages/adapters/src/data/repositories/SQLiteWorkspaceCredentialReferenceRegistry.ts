import {
  IWorkspaceCredentialReferenceRegistry,
  WorkspaceCredentialDeleteReservation,
  WorkspaceCredentialReference,
  WorkspaceCredentialReferenceInput,
  WorkspaceCredentialWriteReservation,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { Knex } from 'knex'

import {
  createSQLiteConnection,
  ensureDatabaseSchema,
  withSafeTransaction,
} from './sqlite-connection'

type WorkspaceCredentialReferenceRow = {
  workspace_id: string
  owner_id: string
  logical_reference_id: string
  status: string
  active_reference_id: string | null
  candidate_reference_id: string | null
  cleanup_reference_id: string | null
  created_at: string
  updated_at: string
}

function parseCredentialRefStatus(
  status: string,
): Either<AppError, WorkspaceCredentialReference['status']> {
  switch (status) {
    case 'active':
    case 'write_pending':
    case 'cleanup_pending':
    case 'delete_pending':
      return Either.success(status)
    default:
      return Either.failure(
        AppError.Internal(`INVALID_CREDENTIAL_REFERENCE_STATUS: ${status}`),
      )
  }
}

export class SQLiteWorkspaceCredentialReferenceRegistry implements IWorkspaceCredentialReferenceRegistry {
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

  public async reserveWorkspaceCredentialWrite(
    reservation: WorkspaceCredentialWriteReservation,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const existing = await trx<WorkspaceCredentialReferenceRow>(
        'workspace_credential_references',
      )
        .where('workspace_id', reservation.workspaceId)
        .where('owner_id', reservation.ownerId)
        .where('logical_reference_id', reservation.logicalReferenceId)
        .first()

      const now = new Date().toISOString()

      if (!existing) {
        await trx('workspace_credential_references').insert({
          workspace_id: reservation.workspaceId,
          owner_id: reservation.ownerId,
          logical_reference_id: reservation.logicalReferenceId,
          status: 'write_pending',
          active_reference_id: null,
          candidate_reference_id: reservation.candidateReferenceId,
          cleanup_reference_id: null,
          created_at: now,
          updated_at: now,
        })
        return Either.success(undefined)
      }

      await trx('workspace_credential_references')
        .where('workspace_id', reservation.workspaceId)
        .where('owner_id', reservation.ownerId)
        .where('logical_reference_id', reservation.logicalReferenceId)
        .update({
          status: 'write_pending',
          candidate_reference_id: reservation.candidateReferenceId,
          updated_at: now,
        })

      return Either.success(undefined)
    })
  }

  public async commitWorkspaceCredentialWrite(
    reservation: WorkspaceCredentialWriteReservation,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const now = new Date().toISOString()
      await trx('workspace_credential_references')
        .where('workspace_id', reservation.workspaceId)
        .where('owner_id', reservation.ownerId)
        .where('logical_reference_id', reservation.logicalReferenceId)
        .update({
          status: 'cleanup_pending',
          active_reference_id: reservation.candidateReferenceId,
          cleanup_reference_id: reservation.previousReferenceId,
          candidate_reference_id: null,
          updated_at: now,
        })
      return Either.success(undefined)
    })
  }

  public async finishWorkspaceCredentialWrite(
    reservation: WorkspaceCredentialWriteReservation,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const now = new Date().toISOString()
      await trx('workspace_credential_references')
        .where('workspace_id', reservation.workspaceId)
        .where('owner_id', reservation.ownerId)
        .where('logical_reference_id', reservation.logicalReferenceId)
        .update({
          status: 'active',
          cleanup_reference_id: null,
          updated_at: now,
        })
      return Either.success(undefined)
    })
  }

  public async rollbackWorkspaceCredentialWrite(
    reservation: WorkspaceCredentialWriteReservation,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const now = new Date().toISOString()
      let status: 'active' | 'delete_pending' = 'delete_pending'
      if (
        reservation.previousReferenceId !== null &&
        reservation.previousReferenceId !== undefined &&
        reservation.previousReferenceId.length > 0
      ) {
        status = 'active'
      }
      await trx('workspace_credential_references')
        .where('workspace_id', reservation.workspaceId)
        .where('owner_id', reservation.ownerId)
        .where('logical_reference_id', reservation.logicalReferenceId)
        .update({
          status,
          candidate_reference_id: null,
          updated_at: now,
        })
      return Either.success(undefined)
    })
  }

  public async reserveWorkspaceCredentialDelete(
    reservation: WorkspaceCredentialDeleteReservation,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      const now = new Date().toISOString()
      await trx('workspace_credential_references')
        .where('workspace_id', reservation.workspaceId)
        .where('owner_id', reservation.ownerId)
        .where('logical_reference_id', reservation.logicalReferenceId)
        .update({
          status: 'delete_pending',
          cleanup_reference_id: reservation.previousReferenceId,
          updated_at: now,
        })
      return Either.success(undefined)
    })
  }

  public async finishWorkspaceCredentialDelete(
    reservation: WorkspaceCredentialDeleteReservation,
  ): Promise<Either<AppError, void>> {
    return this.unregisterWorkspaceCredentialReference(reservation)
  }

  public async getWorkspaceCredentialReference(
    reference: WorkspaceCredentialReferenceInput,
  ): Promise<Either<AppError, WorkspaceCredentialReference | undefined>> {
    const initResult = await ensureDatabaseSchema(this.db)
    if (initResult.isFailure()) return initResult.forwardFailure()

    try {
      const row = await this.db<WorkspaceCredentialReferenceRow>(
        'workspace_credential_references',
      )
        .where('workspace_id', reference.workspaceId)
        .where('owner_id', reference.ownerId)
        .where('logical_reference_id', reference.logicalReferenceId)
        .first()

      if (!row) return Either.success(undefined)

      const statusResult = parseCredentialRefStatus(row.status)
      if (statusResult.isFailure()) return statusResult.forwardFailure()

      return Either.success({
        workspaceId: row.workspace_id,
        ownerId: row.owner_id,
        logicalReferenceId: row.logical_reference_id,
        status: statusResult.success,
        activeReferenceId: row.active_reference_id,
        candidateReferenceId: row.candidate_reference_id,
        cleanupReferenceId: row.cleanup_reference_id,
      })
    } catch (error) {
      if (error instanceof Error) {
        return Either.failure(AppError.Internal(error.message))
      }
      return Either.failure(AppError.Internal('DATABASE_ERROR'))
    }
  }

  public async listPendingWorkspaceCredentialReferences(): Promise<
    Either<AppError, WorkspaceCredentialReference[]>
  > {
    const initResult = await ensureDatabaseSchema(this.db)
    if (initResult.isFailure()) return initResult.forwardFailure()

    try {
      const rows = await this.db<WorkspaceCredentialReferenceRow>(
        'workspace_credential_references',
      )
        .whereNot('status', 'active')
        .orderBy('created_at', 'asc')

      const items: WorkspaceCredentialReference[] = []
      for (const row of rows) {
        const statusResult = parseCredentialRefStatus(row.status)
        if (statusResult.isFailure()) return statusResult.forwardFailure()

        items.push({
          workspaceId: row.workspace_id,
          ownerId: row.owner_id,
          logicalReferenceId: row.logical_reference_id,
          status: statusResult.success,
          activeReferenceId: row.active_reference_id,
          candidateReferenceId: row.candidate_reference_id,
          cleanupReferenceId: row.cleanup_reference_id,
        })
      }

      return Either.success(items)
    } catch (error) {
      if (error instanceof Error) {
        return Either.failure(AppError.Internal(error.message))
      }
      return Either.failure(AppError.Internal('DATABASE_ERROR'))
    }
  }

  public async unregisterWorkspaceCredentialReference(
    reference: WorkspaceCredentialReferenceInput,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      await trx('workspace_credential_references')
        .where('workspace_id', reference.workspaceId)
        .where('owner_id', reference.ownerId)
        .where('logical_reference_id', reference.logicalReferenceId)
        .delete()
      return Either.success(undefined)
    })
  }

  public async listWorkspaceCredentialReferences(
    workspaceId: string,
  ): Promise<Either<AppError, WorkspaceCredentialReference[]>> {
    const initResult = await ensureDatabaseSchema(this.db)
    if (initResult.isFailure()) return initResult.forwardFailure()

    try {
      const rows = await this.db<WorkspaceCredentialReferenceRow>(
        'workspace_credential_references',
      )
        .where('workspace_id', workspaceId)
        .orderBy('created_at', 'asc')

      const items: WorkspaceCredentialReference[] = []
      for (const row of rows) {
        const statusResult = parseCredentialRefStatus(row.status)
        if (statusResult.isFailure()) return statusResult.forwardFailure()

        items.push({
          workspaceId: row.workspace_id,
          ownerId: row.owner_id,
          logicalReferenceId: row.logical_reference_id,
          status: statusResult.success,
          activeReferenceId: row.active_reference_id,
          candidateReferenceId: row.candidate_reference_id,
          cleanupReferenceId: row.cleanup_reference_id,
        })
      }

      return Either.success(items)
    } catch (error) {
      if (error instanceof Error) {
        return Either.failure(AppError.Internal(error.message))
      }
      return Either.failure(AppError.Internal('DATABASE_ERROR'))
    }
  }
}
