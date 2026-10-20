import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  CredentialVaultMutationResult,
  IConnectionCredentialsVault,
  ICredentialsVault,
  IWorkspaceCredentialReferenceRegistry,
  WorkspaceCredentialDeleteReservation,
  WorkspaceCredentialReference,
  WorkspaceCredentialWriteReservation,
} from '@/contracts'
import { CredentialReferenceFactory } from '@/utils/credential-reference'

export class RecoverAddonWorkspaceCredentialWritesService {
  constructor(
    private readonly referenceRegistry: IWorkspaceCredentialReferenceRegistry,
    private readonly credentialsVault: ICredentialsVault,
    private readonly connectionCredentialsVault: IConnectionCredentialsVault,
  ) {}

  public async execute(): Promise<Either<AppError, void>> {
    const pendingResult =
      await this.referenceRegistry.listPendingWorkspaceCredentialReferences()
    if (pendingResult.isFailure()) return pendingResult.forwardFailure()
    for (const reference of pendingResult.success) {
      const recoveryResult = await this.recoverReference(reference)
      if (recoveryResult.isFailure()) return recoveryResult.forwardFailure()
    }
    return Either.success()
  }

  private async recoverReference(
    reference: WorkspaceCredentialReference,
  ): Promise<Either<AppError, void>> {
    if (reference.status === 'write_pending')
      return this.recoverPendingWrite(reference)
    if (reference.status === 'cleanup_pending')
      return this.recoverCleanup(reference)
    if (reference.status === 'delete_pending')
      return this.recoverDelete(reference)
    return Either.success()
  }

  private async recoverPendingWrite(
    reference: WorkspaceCredentialReference,
  ): Promise<Either<AppError, void>> {
    if (reference.candidateReferenceId === null)
      return Either.failure(
        AppError.ValidationError('ADDON_CREDENTIAL_RECOVERY_INVALID'),
      )
    const candidate = CredentialReferenceFactory.fromId(
      reference.candidateReferenceId,
    )
    if (candidate === undefined)
      return Either.failure(
        AppError.ValidationError('CREDENTIAL_REFERENCE_INVALID'),
      )
    const candidateResult = await this.credentialsVault.getToken(
      candidate.service,
      candidate.account,
    )
    if (candidateResult.kind === 'unavailable')
      return Either.failure(
        AppError.Internal('ADDON_CREDENTIAL_RECOVERY_UNAVAILABLE'),
      )
    const reservation: WorkspaceCredentialWriteReservation = {
      workspaceId: reference.workspaceId,
      ownerId: reference.ownerId,
      logicalReferenceId: reference.logicalReferenceId,
      candidateReferenceId: candidate.id,
      previousReferenceId: reference.activeReferenceId,
    }
    if (candidateResult.kind === 'absent')
      return this.referenceRegistry.rollbackWorkspaceCredentialWrite(
        reservation,
      )
    const commitResult =
      await this.referenceRegistry.commitWorkspaceCredentialWrite(reservation)
    if (commitResult.isFailure()) return commitResult.forwardFailure()
    const cleanupResult = await this.removeReference(
      reference.activeReferenceId,
    )
    if (cleanupResult.isFailure()) return cleanupResult.forwardFailure()
    return this.referenceRegistry.finishWorkspaceCredentialWrite(reservation)
  }

  private async recoverCleanup(
    reference: WorkspaceCredentialReference,
  ): Promise<Either<AppError, void>> {
    if (reference.activeReferenceId === null)
      return Either.failure(
        AppError.ValidationError('ADDON_CREDENTIAL_RECOVERY_INVALID'),
      )
    const reservation: WorkspaceCredentialWriteReservation = {
      workspaceId: reference.workspaceId,
      ownerId: reference.ownerId,
      logicalReferenceId: reference.logicalReferenceId,
      candidateReferenceId: reference.activeReferenceId,
      previousReferenceId: reference.cleanupReferenceId,
    }
    const cleanupResult = await this.removeReference(
      reference.cleanupReferenceId,
    )
    if (cleanupResult.isFailure()) return cleanupResult.forwardFailure()
    return this.referenceRegistry.finishWorkspaceCredentialWrite(reservation)
  }

  private async recoverDelete(
    reference: WorkspaceCredentialReference,
  ): Promise<Either<AppError, void>> {
    const reservation: WorkspaceCredentialDeleteReservation = {
      workspaceId: reference.workspaceId,
      ownerId: reference.ownerId,
      logicalReferenceId: reference.logicalReferenceId,
      previousReferenceId: reference.activeReferenceId,
    }
    const cleanupResult = await this.removeReference(
      reference.activeReferenceId,
    )
    if (cleanupResult.isFailure()) return cleanupResult.forwardFailure()
    return this.referenceRegistry.finishWorkspaceCredentialDelete(reservation)
  }

  private async removeReference(
    referenceId: string | null,
  ): Promise<Either<AppError, void>> {
    if (referenceId === null) return Either.success()
    const reference = CredentialReferenceFactory.fromId(referenceId)
    if (reference === undefined)
      return Either.failure(
        AppError.ValidationError('CREDENTIAL_REFERENCE_INVALID'),
      )
    const result =
      await this.connectionCredentialsVault.removeCredential(reference)
    if (this.isUnavailable(result))
      return Either.failure(
        AppError.Internal('ADDON_CREDENTIAL_CLEANUP_PENDING'),
      )
    return Either.success()
  }

  private isUnavailable(result: CredentialVaultMutationResult): boolean {
    return result.kind === 'unavailable'
  }
}
