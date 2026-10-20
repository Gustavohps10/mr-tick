import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  CredentialReference,
  IConnectionCredentialsVault,
  IConnectionLifecycleRepository,
  IConnectionLifecycleTransactionBoundary,
  IWorkspacesRepository,
  WorkspaceJournalEntry,
  WorkspaceRefreshJournalEntry,
} from '@/contracts'
import { CredentialReferenceFactory } from '@/utils/credential-reference'

export class RecoverConnectionLifecycleService {
  constructor(
    private readonly lifecycleRepository: IConnectionLifecycleRepository,
    private readonly credentialsVault: IConnectionCredentialsVault,
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly transactionBoundary: IConnectionLifecycleTransactionBoundary,
  ) {}

  public async execute(): Promise<Either<AppError, void>> {
    const journalResult = await this.lifecycleRepository.inspectRecovery()
    if (journalResult.isFailure()) return journalResult.forwardFailure()

    for (const entry of journalResult.success) {
      if (entry.status === 'aborted') continue
      if (!this.isLifecycleEntry(entry)) {
        const abortResult = await this.lifecycleRepository.abortPending(
          entry.operationId,
        )
        if (abortResult.isFailure()) return abortResult.forwardFailure()
        continue
      }
      const recoveryResult = await this.recoverEntry(entry)
      if (recoveryResult.isFailure()) return recoveryResult.forwardFailure()
    }
    return Either.success()
  }

  private async recoverEntry(
    entry: WorkspaceJournalEntry,
  ): Promise<Either<AppError, void>> {
    if (entry.intent === 'connection.connect' && entry.reservationId === null)
      return Either.failure(
        AppError.ValidationError('WORKSPACE_JOURNAL_RESERVATION_INVALID'),
      )
    if (
      entry.phase === 'metadata_committed' ||
      entry.phase === 'cleanup_pending'
    ) {
      return this.recoverMetadataCommitted(entry)
    }

    if (entry.intent === 'connection.refresh') {
      if (entry.phase === 'candidate_cleanup_pending') {
        return this.recoverCandidateCleanupPending(entry)
      }

      if (entry.phase === 'candidate_written') {
        return this.recoverRefreshCandidateWritten(entry)
      }

      return this.recoverRefreshIntent(entry)
    }

    if (
      entry.phase === 'candidate_written' ||
      entry.phase === 'candidate_cleanup_pending'
    ) {
      return this.recoverCandidateCleanupPending(entry)
    }

    const aborted = await this.lifecycleRepository.abortPending(
      entry.operationId,
    )
    if (aborted.isFailure()) return aborted.forwardFailure()
    return Either.success()
  }

  private async recoverCandidateCleanupPending(
    entry: WorkspaceJournalEntry,
  ): Promise<Either<AppError, void>> {
    const candidateReference = entry.candidateReference
    if (candidateReference === null || candidateReference === undefined) {
      return Either.failure(
        AppError.ValidationError('WORKSPACE_JOURNAL_INVALID'),
      )
    }
    const reference = CredentialReferenceFactory.fromId(candidateReference)
    if (!reference) {
      return Either.failure(
        AppError.ValidationError('CREDENTIAL_REFERENCE_INVALID'),
      )
    }

    const isCandidateActive = await this.isCandidateActiveInWorkspace(
      entry.workspaceId,
      entry.connectionId,
      candidateReference,
    )
    if (isCandidateActive.isFailure()) {
      return isCandidateActive.forwardFailure()
    }
    if (isCandidateActive.success) {
      return this.recoverMetadataCommitted(entry)
    }

    const cleanupResult =
      await this.credentialsVault.removeCredential(reference)
    if (cleanupResult.kind === 'unavailable') {
      const advanced = await this.lifecycleRepository.advanceLifecycle(
        entry.operationId,
        'candidate_cleanup_pending',
      )
      if (advanced.isFailure()) return advanced.forwardFailure()
      return Either.failure(AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'))
    }

    const aborted = await this.lifecycleRepository.abortPending(
      entry.operationId,
    )
    if (aborted.isFailure()) return aborted.forwardFailure()
    return Either.success()
  }

  private async recoverRefreshCandidateWritten(
    entry: WorkspaceRefreshJournalEntry,
  ): Promise<Either<AppError, void>> {
    const candidateReference = entry.candidateReference
    if (candidateReference === null || candidateReference === undefined) {
      return Either.failure(
        AppError.ValidationError('WORKSPACE_JOURNAL_INVALID'),
      )
    }
    const reference = CredentialReferenceFactory.fromId(candidateReference)
    if (!reference) {
      return Either.failure(
        AppError.ValidationError('CREDENTIAL_REFERENCE_INVALID'),
      )
    }

    const isCandidateActive = await this.isCandidateActiveInWorkspace(
      entry.workspaceId,
      entry.connectionId,
      candidateReference,
    )
    if (isCandidateActive.isFailure()) {
      return isCandidateActive.forwardFailure()
    }
    if (isCandidateActive.success) {
      const advanced = await this.lifecycleRepository.advanceLifecycle(
        entry.operationId,
        'metadata_committed',
      )
      if (advanced.isFailure()) return advanced.forwardFailure()
      return this.recoverMetadataCommitted(entry)
    }

    const candidateRead = await this.credentialsVault.readCredential(reference)
    if (candidateRead.kind === 'unavailable') {
      return Either.failure(AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'))
    }

    const workspaceResult = await this.workspacesRepository.getById(
      entry.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined) {
      return this.discardCandidateAndAbort(entry, reference)
    }

    const connection = workspace.connections.find(
      (c) => c.id === entry.connectionId,
    )
    if (connection === undefined) {
      return this.discardCandidateAndAbort(entry, reference)
    }

    const targetAuth = connection.authorizations.find(
      (a) => a.authorizationId === entry.authorizationId,
    )
    if (targetAuth === undefined) {
      return this.discardCandidateAndAbort(entry, reference)
    }

    const expectedConnGen = entry.expectedConnectionGeneration
    const expectedAuthGen = entry.expectedAuthorizationGeneration

    if (candidateRead.kind === 'absent') {
      if (targetAuth.generation > expectedAuthGen) {
        return this.discardCandidateAndAbort(entry, reference)
      }
      if (
        targetAuth.generation === expectedAuthGen &&
        targetAuth.status === 'active'
      ) {
        const markResult = workspace.markAuthorizationReauthRequired(
          connection.id,
          targetAuth.authorizationId,
        )
        if (markResult.isFailure()) return markResult.forwardFailure()
        const saveResult = await this.workspacesRepository.update(workspace)
        if (saveResult.isFailure()) return saveResult.forwardFailure()
      }
      return this.discardCandidateAndAbort(entry, reference)
    }

    const registeredPrevRef = entry.previousReferences?.[0]
    const isExactPrevRef =
      registeredPrevRef !== undefined &&
      targetAuth.credentialReferenceId === registeredPrevRef
    const isExactConnection =
      connection.status === 'connected' &&
      connection.generation === expectedConnGen
    const isExactAuth =
      targetAuth.status === 'active' &&
      targetAuth.generation === expectedAuthGen

    if (isExactConnection && isExactAuth && isExactPrevRef) {
      const updated = workspace.connectAuthorization(
        connection.id,
        {
          authorizationRole: targetAuth.authorizationRole,
          authProfileId: targetAuth.authProfileId,
          identity: targetAuth.identity,
          authorizationId: targetAuth.authorizationId,
          credentialReferenceId: candidateReference,
        },
        connection.config,
      )
      if (updated.isFailure()) return updated.forwardFailure()

      const commitResult = await this.transactionBoundary.runInTransaction(
        async ({ workspaces, lifecycle }) => {
          const updateResult = await workspaces.update(workspace)
          if (updateResult.isFailure()) return updateResult.forwardFailure()

          const advanced = await lifecycle.advanceLifecycle(
            entry.operationId,
            'metadata_committed',
          )
          if (advanced.isFailure()) return advanced.forwardFailure()

          return Either.success(undefined)
        },
      )
      if (commitResult.isSuccess()) {
        return this.recoverMetadataCommitted(entry)
      }

      const freshWsResult = await this.workspacesRepository.getById(
        entry.workspaceId,
      )
      if (freshWsResult.isFailure()) return commitResult.forwardFailure()
      const freshWs = freshWsResult.success
      if (freshWs === undefined) return commitResult.forwardFailure()
      const freshConn = freshWs.connections.find(
        (c) => c.id === entry.connectionId,
      )
      const freshAuth = freshConn?.authorizations.find(
        (a) => a.authorizationId === entry.authorizationId,
      )

      if (
        freshAuth &&
        freshAuth.credentialReferenceId === candidateReference &&
        freshAuth.status === 'active'
      ) {
        const advanced = await this.lifecycleRepository.advanceLifecycle(
          entry.operationId,
          'metadata_committed',
        )
        if (advanced.isFailure()) return advanced.forwardFailure()
        return this.recoverMetadataCommitted(entry)
      }

      if (freshAuth && freshAuth.generation > expectedAuthGen) {
        return this.discardCandidateAndAbort(entry, reference)
      }

      if (
        freshAuth &&
        freshAuth.generation === expectedAuthGen &&
        freshAuth.status === 'active' &&
        freshConn
      ) {
        const markFresh = freshWs.markAuthorizationReauthRequired(
          freshConn.id,
          freshAuth.authorizationId,
        )
        if (markFresh.isFailure()) return markFresh.forwardFailure()
        const saveFresh = await this.workspacesRepository.update(freshWs)
        if (saveFresh.isFailure()) return saveFresh.forwardFailure()
        return this.discardCandidateAndAbort(entry, reference)
      }

      return commitResult.forwardFailure()
    }

    if (targetAuth.generation > expectedAuthGen) {
      return this.discardCandidateAndAbort(entry, reference)
    }

    if (
      targetAuth.generation === expectedAuthGen &&
      targetAuth.status === 'active'
    ) {
      const markResult = workspace.markAuthorizationReauthRequired(
        connection.id,
        targetAuth.authorizationId,
      )
      if (markResult.isFailure()) return markResult.forwardFailure()
      const saveResult = await this.workspacesRepository.update(workspace)
      if (saveResult.isFailure()) return saveResult.forwardFailure()
      return this.discardCandidateAndAbort(entry, reference)
    }

    return this.discardCandidateAndAbort(entry, reference)
  }

  private async discardCandidateAndAbort(
    entry: WorkspaceJournalEntry,
    reference: CredentialReference,
  ): Promise<Either<AppError, void>> {
    const cleanupResult =
      await this.credentialsVault.removeCredential(reference)
    if (cleanupResult.kind === 'unavailable') {
      const advanced = await this.lifecycleRepository.advanceLifecycle(
        entry.operationId,
        'candidate_cleanup_pending',
      )
      if (advanced.isFailure()) return advanced.forwardFailure()
      return Either.failure(AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'))
    }

    const aborted = await this.lifecycleRepository.abortPending(
      entry.operationId,
    )
    if (aborted.isFailure()) return aborted.forwardFailure()
    return Either.success()
  }

  private async recoverRefreshIntent(
    entry: WorkspaceRefreshJournalEntry,
  ): Promise<Either<AppError, void>> {
    const workspaceResult = await this.workspacesRepository.getById(
      entry.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (workspace === undefined) {
      const aborted = await this.lifecycleRepository.abortPending(
        entry.operationId,
      )
      if (aborted.isFailure()) return aborted.forwardFailure()
      return Either.success()
    }

    const connection = workspace.connections.find(
      (c) => c.id === entry.connectionId,
    )
    if (connection === undefined) {
      const aborted = await this.lifecycleRepository.abortPending(
        entry.operationId,
      )
      if (aborted.isFailure()) return aborted.forwardFailure()
      return Either.success()
    }

    const targetAuth = connection.authorizations.find(
      (a) => a.authorizationId === entry.authorizationId,
    )

    if (
      targetAuth !== undefined &&
      targetAuth.status === 'active' &&
      targetAuth.generation === entry.expectedAuthorizationGeneration
    ) {
      const markResult = workspace.markAuthorizationReauthRequired(
        connection.id,
        targetAuth.authorizationId,
      )
      if (markResult.isFailure()) return markResult.forwardFailure()

      const saveResult = await this.workspacesRepository.update(workspace)
      if (saveResult.isFailure()) return saveResult.forwardFailure()
    }

    if (
      entry.candidateReference !== null &&
      entry.candidateReference !== undefined
    ) {
      const ref = CredentialReferenceFactory.fromId(entry.candidateReference)
      if (ref !== undefined) {
        const cleanup = await this.credentialsVault.removeCredential(ref)
        if (cleanup.kind === 'unavailable') {
          const advanced = await this.lifecycleRepository.advanceLifecycle(
            entry.operationId,
            'candidate_cleanup_pending',
          )
          if (advanced.isFailure()) return advanced.forwardFailure()
          return Either.failure(
            AppError.Internal('CREDENTIALS_VAULT_UNAVAILABLE'),
          )
        }
      }
    }

    const aborted = await this.lifecycleRepository.abortPending(
      entry.operationId,
    )
    if (aborted.isFailure()) return aborted.forwardFailure()
    return Either.success()
  }

  private async isCandidateActiveInWorkspace(
    workspaceId: string,
    connectionId: string | null,
    candidateReference: string,
  ): Promise<Either<AppError, boolean>> {
    if (connectionId === null) {
      return Either.success(false)
    }

    const workspaceResult = await this.workspacesRepository.getById(workspaceId)
    if (workspaceResult.isFailure()) {
      return workspaceResult.forwardFailure()
    }

    const workspace = workspaceResult.success
    if (workspace === undefined) {
      return Either.success(false)
    }

    const connection = workspace.connections.find((c) => c.id === connectionId)
    if (connection === undefined) {
      return Either.success(false)
    }

    const hasActiveAuth = connection.authorizations.some(
      (auth) =>
        auth.credentialReferenceId === candidateReference &&
        auth.status === 'active',
    )

    return Either.success(hasActiveAuth)
  }

  private async recoverMetadataCommitted(
    entry: WorkspaceJournalEntry,
  ): Promise<Either<AppError, void>> {
    const previousReferences = entry.previousReferences
    if (previousReferences === undefined)
      return Either.failure(
        AppError.ValidationError('WORKSPACE_JOURNAL_INVALID'),
      )
    const references: CredentialReference[] = []
    for (const referenceId of previousReferences) {
      const reference = CredentialReferenceFactory.fromId(referenceId)
      if (!reference)
        return Either.failure(
          AppError.ValidationError('CREDENTIAL_REFERENCE_INVALID'),
        )
      references.push(reference)
    }
    const cleanupResults = await Promise.all(
      references.map((reference) =>
        this.credentialsVault.removeCredential(reference),
      ),
    )
    if (cleanupResults.some((result) => result.kind === 'unavailable')) {
      const advanced = await this.lifecycleRepository.advanceLifecycle(
        entry.operationId,
        'cleanup_pending',
      )
      if (advanced.isFailure()) return advanced.forwardFailure()
      return Either.success()
    }
    const finished = await this.lifecycleRepository.finishLifecycle(
      entry.operationId,
    )
    if (finished.isFailure()) return finished.forwardFailure()
    return Either.success()
  }

  private isLifecycleEntry(entry: WorkspaceJournalEntry): boolean {
    return (
      entry.kind === 'lifecycle' &&
      (entry.intent === 'connection.connect' ||
        entry.intent === 'connection.refresh' ||
        entry.intent === 'connection.disconnect' ||
        entry.intent === 'connection.archive' ||
        entry.intent === 'connection.restore' ||
        entry.intent === 'connection.unlink' ||
        entry.intent === 'delete')
    )
  }
}
