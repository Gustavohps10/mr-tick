import { DataSourceConnection } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  IConnectionCredentialsVault,
  IConnectionLifecycleRepository,
  IConnectionPendingWorkGuard,
  IUnlinkConnectionUseCase,
  IWorkspacesRepository,
  UnlinkConnectionInput,
} from '@/contracts'
import { toWorkspaceConnectionDTO, WorkspaceDTO } from '@/dtos'
import {
  CredentialReference,
  CredentialReferenceFactory,
} from '@/utils/credential-reference'

export class UnlinkConnectionService implements IUnlinkConnectionUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly lifecycleRepository: IConnectionLifecycleRepository,
    private readonly credentialsVault: IConnectionCredentialsVault,
    private readonly pendingWorkGuard: IConnectionPendingWorkGuard,
  ) {}

  public async execute(
    input: UnlinkConnectionInput,
  ): Promise<Either<AppError, WorkspaceDTO>> {
    return this.pendingWorkGuard.withNoPendingWrites(
      input.workspaceId,
      [input.connectionInstanceId],
      () => this.unlink(input),
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

  private async unlink(
    input: UnlinkConnectionInput,
  ): Promise<Either<AppError, WorkspaceDTO>> {
    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success

    if (!workspace) {
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))
    }

    const targetConnection = workspace.connections.find(
      (connection) => connection.id === input.connectionInstanceId,
    )
    if (targetConnection === undefined) {
      return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
    }
    if (
      input.addonId !== undefined &&
      targetConnection.addonId !== input.addonId
    ) {
      return Either.failure(
        AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
      )
    }
    const extracted = this.extractConnectionReferences(
      targetConnection,
      workspace.id,
    )
    if (extracted.isFailure()) {
      return extracted.forwardFailure()
    }
    const references = extracted.success
    const result = workspace.removeConnection(input.connectionInstanceId)
    if (result.isFailure()) return result.forwardFailure()

    const operationId = crypto.randomUUID()
    const intentResult = await this.lifecycleRepository.beginLifecycle({
      kind: 'lifecycle',
      operationId,
      workspaceId: workspace.id,
      connectionId: input.connectionInstanceId,
      intent: 'connection.unlink',
      expectedRevision: targetConnection.generation,
      connectionGeneration: targetConnection.generation,
      reservationId: null,
      candidateReference: null,
      previousReferences: references.map((reference) => reference.id),
    })
    if (intentResult.isFailure()) return intentResult.forwardFailure()

    const updateResult = await this.workspacesRepository.update(workspace)
    if (updateResult.isFailure()) return updateResult.forwardFailure()

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

    const workspaceDTO: WorkspaceDTO = {
      id: workspace.id,
      name: workspace.name,
      status: workspace.status,
      connections: workspace.connections.map(toWorkspaceConnectionDTO),
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    }

    return Either.success(workspaceDTO)
  }
}
