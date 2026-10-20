import type {
  ConnectionIdentity,
  ConnectionProfileDescriptor,
} from '@mr-tick/domain'
import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  AddonConnectionAuthenticator,
  CredentialVaultMutationResult,
  CredentialVaultReadResult,
  IAddonAuthenticatorRegistry,
  IConnectionCredentialsVault,
  IConnectionLifecycleRepository,
  IConnectionLifecycleTransactionBoundary,
  IConnectionPendingWorkGuard,
  IConnectionReservationRepository,
  IWorkspacesRepository,
  WorkspaceJournalEntry,
  WorkspaceLifecycleOperation,
} from '@/contracts'
import type { PagedResultDTO } from '@/dtos'
import type { CredentialReference } from '@/utils/credential-reference'
import { CredentialReferenceFactory } from '@/utils/credential-reference'

import { ConnectionLifecycleCoordinator } from './ConnectionLifecycleCoordinator'

class InMemoryCredentialsVault implements IConnectionCredentialsVault {
  public storage = new Map<string, string>()

  public async writeCredential(
    reference: CredentialReference,
    payload: string,
  ): Promise<CredentialVaultMutationResult> {
    this.storage.set(reference.id, payload)
    return { kind: 'completed' }
  }

  public async readCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultReadResult> {
    const val = this.storage.get(reference.id)
    if (val === undefined) return { kind: 'absent' }
    return { kind: 'present', token: val }
  }

  public async removeCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultMutationResult> {
    this.storage.delete(reference.id)
    return { kind: 'completed' }
  }
}

class InMemoryWorkspacesRepository implements IWorkspacesRepository {
  public workspaces = new Map<string, Workspace>()

  public async getById(
    id: string,
  ): Promise<Either<AppError, Workspace | undefined>> {
    const ws = this.workspaces.get(id)
    if (ws === undefined) return Either.success(undefined)
    return Either.success(ws)
  }

  public async list(): Promise<Either<AppError, PagedResultDTO<Workspace>>> {
    return Either.success({
      items: Array.from(this.workspaces.values()),
      total: this.workspaces.size,
      page: 1,
      pageSize: 10,
    })
  }

  public async create(workspace: Workspace): Promise<Either<AppError, void>> {
    this.workspaces.set(workspace.id, workspace)
    return Either.success(undefined)
  }

  public async update(workspace: Workspace): Promise<Either<AppError, void>> {
    this.workspaces.set(workspace.id, workspace)
    return Either.success(undefined)
  }

  public async remove(id: string): Promise<Either<AppError, void>> {
    this.workspaces.delete(id)
    return Either.success(undefined)
  }
}

class InMemoryLifecycleRepository implements IConnectionLifecycleRepository {
  public operations: WorkspaceLifecycleOperation[] = []
  public advancedPhases: Array<{ operationId: string; phase: string }> = []
  public finished: string[] = []

  public async beginLifecycle(
    operation: WorkspaceLifecycleOperation,
  ): Promise<Either<AppError, void>> {
    this.operations.push(operation)
    return Either.success(undefined)
  }

  public async advanceLifecycle(
    operationId: string,
    phase:
      | 'candidate_written'
      | 'cleanup_pending'
      | 'candidate_cleanup_pending'
      | 'metadata_committed',
  ): Promise<Either<AppError, void>> {
    this.advancedPhases.push({ operationId, phase })
    return Either.success(undefined)
  }

  public async finishLifecycle(
    operationId: string,
  ): Promise<Either<AppError, void>> {
    this.finished.push(operationId)
    return Either.success(undefined)
  }

  public async abortPending(): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }

  public async inspectRecovery(): Promise<
    Either<AppError, WorkspaceJournalEntry[]>
  > {
    return Either.success([])
  }
}

class InMemoryReservationRepository implements IConnectionReservationRepository {
  public async reserveConnectionSlot(): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }
  public async releaseConnectionSlot(): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }
  public async findConnectionReservation(): Promise<
    Either<AppError, undefined>
  > {
    return Either.success(undefined)
  }
  public async recoverPendingConnectionReservations(): Promise<
    Either<AppError, void>
  > {
    return Either.success(undefined)
  }
}

class FakeAuthenticatorRegistry implements IAddonAuthenticatorRegistry {
  private authenticators = new Map<string, AddonConnectionAuthenticator>()

  public register(
    addonId: string,
    authenticator: AddonConnectionAuthenticator,
  ): void {
    this.authenticators.set(
      `${addonId}:${authenticator.authProfileId}`,
      authenticator,
    )
  }

  public unregister(addonId: string, authProfileId: string): void {
    this.authenticators.delete(`${addonId}:${authProfileId}`)
  }

  public getAuthenticator(
    addonId: string,
    authProfileId: string,
  ): AddonConnectionAuthenticator | undefined {
    return this.authenticators.get(`${addonId}:${authProfileId}`)
  }

  public getAuthenticatorsForAddon(
    addonId: string,
  ): readonly AddonConnectionAuthenticator[] {
    const result: AddonConnectionAuthenticator[] = []
    for (const [key, auth] of this.authenticators.entries()) {
      if (key.startsWith(`${addonId}:`)) {
        result.push(auth)
      }
    }
    return result
  }
}

export {
  FakeAuthenticatorRegistry,
  InMemoryCredentialsVault,
  InMemoryLifecycleRepository,
  InMemoryReservationRepository,
  InMemoryWorkspacesRepository,
}

export const profile: ConnectionProfileDescriptor = {
  connectionProfileId: 'discord-profile',
  cardinality: 'single',
  default: true,
  roles: [
    {
      authorizationRole: 'primary',
      allowedAuthProfileIds: ['discord-oauth'],
      defaultAuthProfileId: 'discord-oauth',
    },
  ],
}

export const identity: Extract<ConnectionIdentity, { kind: 'human' }> = {
  kind: 'human',
  providerId: 'discord',
  tenantId: '123',
  providerSubjectId: 'user-123',
  displayName: 'Discord User',
}

export function createRefreshTestSetup(): {
  credentialsVault: InMemoryCredentialsVault
  workspacesRepository: InMemoryWorkspacesRepository
  lifecycleRepository: InMemoryLifecycleRepository
  reservationRepository: InMemoryReservationRepository
  authenticatorRegistry: FakeAuthenticatorRegistry
  coordinator: ConnectionLifecycleCoordinator
  createConnectedWorkspace: (opts?: {
    workspaceId?: string
    connectionId?: string
    addonId?: string
    authorizationId?: string
  }) => Promise<{ workspace: Workspace; initialRefId: string }>
} {
  const credentialsVault = new InMemoryCredentialsVault()
  const workspacesRepository = new InMemoryWorkspacesRepository()
  const lifecycleRepository = new InMemoryLifecycleRepository()
  const reservationRepository = new InMemoryReservationRepository()
  const authenticatorRegistry = new FakeAuthenticatorRegistry()

  const pendingWorkGuard: IConnectionPendingWorkGuard = {
    withNoPendingWrites: async (_w, _c, op) => op(),
  }
  const transactionBoundary: IConnectionLifecycleTransactionBoundary = {
    runInTransaction: async (cb) =>
      cb({
        workspaces: workspacesRepository,
        lifecycle: lifecycleRepository,
      }),
  }

  const coordinator = new ConnectionLifecycleCoordinator(
    credentialsVault,
    workspacesRepository,
    lifecycleRepository,
    reservationRepository,
    pendingWorkGuard,
    transactionBoundary,
    authenticatorRegistry,
  )

  async function createConnectedWorkspace(opts?: {
    workspaceId?: string
    connectionId?: string
    addonId?: string
    authorizationId?: string
  }): Promise<{ workspace: Workspace; initialRefId: string }> {
    const wsResult = Workspace.create({ name: 'Workspace Test' })
    const workspace = wsResult.success
    const wsId =
      opts?.workspaceId !== undefined ? opts.workspaceId : workspace.id
    const connId =
      opts?.connectionId !== undefined ? opts.connectionId : 'conn-1'
    const addonId = opts?.addonId !== undefined ? opts.addonId : 'discord-addon'
    const authId =
      opts?.authorizationId !== undefined ? opts.authorizationId : 'auth-1'

    workspace.createConnection(connId, addonId, profile)

    const initialCandidate =
      CredentialReferenceFactory.createConnectionCandidate({
        ownerId: addonId,
        workspaceId: wsId,
        connectionId: connId,
        authorizationId: authId,
        operationId: 'op-init',
      })
    await credentialsVault.writeCredential(
      initialCandidate,
      JSON.stringify({
        accessToken: 'initial-access-token',
        refreshToken: 'initial-refresh-token',
      }),
    )

    workspace.connectAuthorization(
      connId,
      {
        authorizationRole: 'primary',
        authProfileId: 'discord-oauth',
        identity: identity,
        authorizationId: authId,
        credentialReferenceId: initialCandidate.id,
      },
      { channelId: 'general' },
    )

    await workspacesRepository.create(workspace)
    return { workspace, initialRefId: initialCandidate.id }
  }

  return {
    credentialsVault,
    workspacesRepository,
    lifecycleRepository,
    reservationRepository,
    authenticatorRegistry,
    coordinator,
    createConnectedWorkspace,
  }
}
