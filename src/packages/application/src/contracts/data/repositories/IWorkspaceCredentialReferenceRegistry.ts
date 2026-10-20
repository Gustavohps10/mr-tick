import { AppError, Either } from '@mr-tick/shared/helpers'

export type WorkspaceCredentialReferenceInput = {
  workspaceId: string
  ownerId: string
  logicalReferenceId: string
}

export type WorkspaceCredentialWriteReservation =
  WorkspaceCredentialReferenceInput & {
    candidateReferenceId: string
    previousReferenceId: string | null
  }

export type WorkspaceCredentialDeleteReservation =
  WorkspaceCredentialReferenceInput & {
    previousReferenceId: string | null
  }

export type WorkspaceCredentialReference = WorkspaceCredentialReferenceInput & {
  status: 'active' | 'write_pending' | 'cleanup_pending' | 'delete_pending'
  activeReferenceId: string | null
  candidateReferenceId: string | null
  cleanupReferenceId: string | null
}

export interface IWorkspaceCredentialReferenceRegistry {
  reserveWorkspaceCredentialWrite(
    reservation: WorkspaceCredentialWriteReservation,
  ): Promise<Either<AppError, void>>
  commitWorkspaceCredentialWrite(
    reservation: WorkspaceCredentialWriteReservation,
  ): Promise<Either<AppError, void>>
  finishWorkspaceCredentialWrite(
    reservation: WorkspaceCredentialWriteReservation,
  ): Promise<Either<AppError, void>>
  rollbackWorkspaceCredentialWrite(
    reservation: WorkspaceCredentialWriteReservation,
  ): Promise<Either<AppError, void>>
  reserveWorkspaceCredentialDelete(
    reservation: WorkspaceCredentialDeleteReservation,
  ): Promise<Either<AppError, void>>
  finishWorkspaceCredentialDelete(
    reservation: WorkspaceCredentialDeleteReservation,
  ): Promise<Either<AppError, void>>
  getWorkspaceCredentialReference(
    reference: WorkspaceCredentialReferenceInput,
  ): Promise<Either<AppError, WorkspaceCredentialReference | undefined>>
  listPendingWorkspaceCredentialReferences(): Promise<
    Either<AppError, WorkspaceCredentialReference[]>
  >
  unregisterWorkspaceCredentialReference(
    reference: WorkspaceCredentialReferenceInput,
  ): Promise<Either<AppError, void>>
  listWorkspaceCredentialReferences(
    workspaceId: string,
  ): Promise<Either<AppError, WorkspaceCredentialReference[]>>
}
