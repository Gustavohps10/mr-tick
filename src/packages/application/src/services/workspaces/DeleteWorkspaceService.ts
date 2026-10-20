import { DataSourceConnection, Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  DeleteWorkspaceInput,
  IConnectionCredentialsVault,
  IConnectionLifecycleRepository,
  IConnectionPendingWorkGuard,
  IDeleteWorkspaceUseCase,
  IFileStorage,
  IWorkspaceCredentialReferenceRegistry,
  IWorkspacesRepository,
} from '@/contracts'
import {
  CredentialReference,
  CredentialReferenceFactory,
} from '@/utils/credential-reference'

export class DeleteWorkspaceService implements IDeleteWorkspaceUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly lifecycleRepository: IConnectionLifecycleRepository,
    private readonly credentialRegistry: IWorkspaceCredentialReferenceRegistry,
    private readonly fileStorage: IFileStorage,
    private readonly credentialsVault: IConnectionCredentialsVault,
    private readonly pendingWorkGuard: IConnectionPendingWorkGuard,
  ) {}

  public async execute({
    workspaceId,
  }: DeleteWorkspaceInput): Promise<Either<AppError, void>> {
    const workspaceResult = await this.workspacesRepository.getById(workspaceId)
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success

    if (!workspace) {
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))
    }

    return this.pendingWorkGuard.withNoPendingWrites(workspaceId, [], () =>
      this.deleteWorkspace(workspaceId, workspace),
    )
  }

  private extractConnectionReferences(
    connection: DataSourceConnection,
    workspaceId: string,
  ): Either<AppError, CredentialReference[]> {
    const references: CredentialReference[] = []
    const seenReferenceIds = new Set<string>()

    if (connection.authorizations !== undefined) {
      for (const auth of connection.authorizations) {
        if (auth.credentialReferenceId === undefined) {
          continue
        }
        const parsed = CredentialReferenceFactory.fromId(
          auth.credentialReferenceId,
        )
        if (parsed === undefined) {
          return Either.failure(
            AppError.ValidationError('CREDENTIAL_REFERENCE_INVALID'),
          )
        }
        if (seenReferenceIds.has(parsed.id)) {
          continue
        }
        seenReferenceIds.add(parsed.id)
        references.push(parsed)
      }
    }

    return Either.success(references)
  }

  private async deleteWorkspace(
    workspaceId: string,
    workspace: Workspace,
  ): Promise<Either<AppError, void>> {
    const references: CredentialReference[] = []
    for (const connection of workspace.connections) {
      const extracted = this.extractConnectionReferences(
        connection,
        workspace.id,
      )
      if (extracted.isFailure()) {
        return extracted.forwardFailure()
      }
      for (const ref of extracted.success) {
        if (!references.some((existing) => existing.id === ref.id)) {
          references.push(ref)
        }
      }
    }
    const registeredReferences =
      await this.credentialRegistry.listWorkspaceCredentialReferences(
        workspaceId,
      )
    if (registeredReferences.isFailure())
      return registeredReferences.forwardFailure()
    if (
      registeredReferences.success.some(
        (reference) => reference.status !== 'active',
      )
    )
      return Either.failure(
        AppError.Http(409, 'ADDON_CREDENTIAL_WRITE_PENDING'),
      )
    for (const registered of registeredReferences.success) {
      if (registered.activeReferenceId === null) continue
      const reference = CredentialReferenceFactory.fromId(
        registered.activeReferenceId,
      )
      if (!reference)
        return Either.failure(
          AppError.ValidationError('CREDENTIAL_REFERENCE_INVALID'),
        )
      if (!references.some((existing) => existing.id === reference.id)) {
        references.push(reference)
      }
    }
    const operationId = crypto.randomUUID()
    const intentResult = await this.lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId,
      workspaceId,
      connectionId: null,
      intent: 'delete',
      expectedRevision: 0,
      reservationId: null,
      candidateReference: null,
      previousReferences: references.map((reference) => reference.id),
    })
    if (intentResult.isFailure()) return intentResult.forwardFailure()

    const deleteResult = await this.workspacesRepository.remove(workspaceId)
    if (deleteResult.isFailure()) return deleteResult.forwardFailure()

    const cleanupResults = await Promise.all(
      references.map((reference) =>
        this.credentialsVault.removeCredential(reference),
      ),
    )
    if (cleanupResults.some((result) => result.kind === 'unavailable')) {
      const pendingResult = await this.lifecycleRepository.advanceLifecycle(
        operationId,
        'cleanup_pending',
      )
      if (pendingResult.isFailure()) return pendingResult.forwardFailure()
      return Either.failure(AppError.Internal('CREDENTIALS_CLEANUP_PENDING'))
    }
    const finishResult =
      await this.lifecycleRepository.finishLifecycle(operationId)
    if (finishResult.isFailure()) return finishResult.forwardFailure()

    if (workspace.avatarUrl) {
      const avatarPath = `workspaces/avatars/${workspace.id}.png`
      try {
        await this.fileStorage.delete(avatarPath, true)
      } catch {
        return Either.failure(
          AppError.Internal('WORKSPACE_AVATAR_DELETE_FAILED'),
        )
      }
    }

    return Either.success()
  }
}
