import { CredentialReferenceFactory } from '@mr-tick/application'
import { DataSourceConnection, Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type {
  CredentialReference,
  CredentialVaultMutationResult,
  FileData,
  IConnectionCredentialsVault,
  IConnectionLifecycleRepository,
  IConnectionPendingWorkGuard,
  IFileStorage,
  IWorkspaceCredentialReferenceRegistry,
  IWorkspacesRepository,
  WorkspaceCredentialReference,
  WorkspaceLifecycleOperation,
} from '@/contracts'
import type { PagedResultDTO } from '@/dtos'

import { DeleteWorkspaceService } from './DeleteWorkspaceService'

class FakeWorkspacesRepository implements IWorkspacesRepository {
  public workspaces: Workspace[] = []
  public deleteResult: Either<AppError, void> = Either.success(undefined)
  public readonly deleteCalls: string[] = []
  public readonly findByIdCalls: string[] = []

  public async create(workspace: Workspace): Promise<Either<AppError, void>> {
    this.workspaces.push(workspace)
    return Either.success(undefined)
  }

  public async getById(
    id: string,
  ): Promise<Either<AppError, Workspace | undefined>> {
    this.findByIdCalls.push(id)
    const found = this.workspaces.find((w) => w.id === id)
    return Either.success(found)
  }

  public async list(): Promise<Either<AppError, PagedResultDTO<Workspace>>> {
    return Either.success({
      items: this.workspaces,
      total: this.workspaces.length,
      page: 1,
      pageSize: 50,
    })
  }

  public async update(workspace: Workspace): Promise<Either<AppError, void>> {
    const idx = this.workspaces.findIndex((w) => w.id === workspace.id)
    if (idx >= 0) this.workspaces[idx] = workspace
    return Either.success(undefined)
  }

  public async remove(id: string): Promise<Either<AppError, void>> {
    this.deleteCalls.push(id)
    this.workspaces = this.workspaces.filter((w) => w.id !== id)
    return this.deleteResult
  }
}

class FakeConnectionLifecycleRepository implements IConnectionLifecycleRepository {
  public beginLifecycleResult: Either<AppError, void> =
    Either.success(undefined)
  public advanceLifecycleResult: Either<AppError, void> =
    Either.success(undefined)
  public finishLifecycleResult: Either<AppError, void> =
    Either.success(undefined)

  public readonly beginLifecycleCalls: WorkspaceLifecycleOperation[] = []
  public readonly advanceLifecycleCalls: Array<{
    operationId: string
    phase:
      | 'candidate_written'
      | 'metadata_committed'
      | 'cleanup_pending'
      | 'candidate_cleanup_pending'
  }> = []
  public readonly finishLifecycleCalls: string[] = []

  public async beginLifecycle(
    operation: WorkspaceLifecycleOperation,
  ): Promise<Either<AppError, void>> {
    this.beginLifecycleCalls.push(operation)
    return this.beginLifecycleResult
  }

  public async advanceLifecycle(
    operationId: string,
    phase:
      | 'candidate_written'
      | 'metadata_committed'
      | 'cleanup_pending'
      | 'candidate_cleanup_pending',
  ): Promise<Either<AppError, void>> {
    this.advanceLifecycleCalls.push({ operationId, phase })
    return this.advanceLifecycleResult
  }

  public async finishLifecycle(
    operationId: string,
  ): Promise<Either<AppError, void>> {
    this.finishLifecycleCalls.push(operationId)
    return this.finishLifecycleResult
  }

  public async inspectRecovery() {
    return Either.success([])
  }

  public async abortPending(
    operationId: string,
  ): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }
}

class FakeWorkspaceCredentialReferenceRegistry implements IWorkspaceCredentialReferenceRegistry {
  public listWorkspaceCredentialReferencesResult: Either<
    AppError,
    WorkspaceCredentialReference[]
  > = Either.success([])

  public async listWorkspaceCredentialReferences(
    workspaceId: string,
  ): Promise<Either<AppError, WorkspaceCredentialReference[]>> {
    return this.listWorkspaceCredentialReferencesResult
  }

  public async reserveWorkspaceCredentialWrite(): Promise<
    Either<AppError, void>
  > {
    return Either.success(undefined)
  }
  public async commitWorkspaceCredentialWrite(): Promise<
    Either<AppError, void>
  > {
    return Either.success(undefined)
  }
  public async finishWorkspaceCredentialWrite(): Promise<
    Either<AppError, void>
  > {
    return Either.success(undefined)
  }
  public async rollbackWorkspaceCredentialWrite(): Promise<
    Either<AppError, void>
  > {
    return Either.success(undefined)
  }
  public async reserveWorkspaceCredentialDelete(): Promise<
    Either<AppError, void>
  > {
    return Either.success(undefined)
  }
  public async finishWorkspaceCredentialDelete(): Promise<
    Either<AppError, void>
  > {
    return Either.success(undefined)
  }
  public async getWorkspaceCredentialReference(): Promise<
    Either<AppError, any>
  > {
    return Either.success(undefined)
  }
  public async listPendingWorkspaceCredentialReferences(): Promise<
    Either<AppError, any>
  > {
    return Either.success([])
  }
  public async unregisterWorkspaceCredentialReference(): Promise<
    Either<AppError, void>
  > {
    return Either.success(undefined)
  }
}

class FakeFileStorage implements IFileStorage {
  public shouldFailDelete = false
  public readonly deleteCalls: Array<{
    filePath: string
    ignoreExtension: boolean
  }> = []

  public async write(filePath: string, data: FileData): Promise<void> {}

  public async read(filePath: string): Promise<FileData> {
    return Buffer.from('')
  }

  public async exists(filePath: string): Promise<boolean> {
    return false
  }

  public async delete(
    filePath: string,
    ignoreExtension: boolean = false,
  ): Promise<void> {
    this.deleteCalls.push({ filePath, ignoreExtension })
    if (this.shouldFailDelete) {
      throw new Error('FILE_DELETE_FAILED')
    }
  }

  public getPublicUrl(filePath: string): string {
    return `public-url/${filePath}`
  }
}

class FakeConnectionCredentialsVault implements IConnectionCredentialsVault {
  public mutationResult: CredentialVaultMutationResult = { kind: 'completed' }
  public readonly removeCredentialCalls: CredentialReference[] = []

  public async writeCredential(
    reference: CredentialReference,
    payload: string,
  ): Promise<CredentialVaultMutationResult> {
    return this.mutationResult
  }

  public async readCredential(reference: CredentialReference): Promise<any> {
    return { kind: 'absent' }
  }

  public async removeCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultMutationResult> {
    this.removeCredentialCalls.push(reference)
    return this.mutationResult
  }
}

class FakePendingWorkGuard implements IConnectionPendingWorkGuard {
  public async withNoPendingWrites<T>(
    workspaceId: string,
    connectionInstanceIds: readonly string[],
    operation: () => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    return operation()
  }
}

describe('DeleteWorkspaceService', () => {
  let sut: DeleteWorkspaceService
  let workspacesRepository: FakeWorkspacesRepository
  let lifecycleRepository: FakeConnectionLifecycleRepository
  let credentialRegistry: FakeWorkspaceCredentialReferenceRegistry
  let fileStorage: FakeFileStorage
  let credentialsVault: FakeConnectionCredentialsVault
  let pendingWorkGuard: FakePendingWorkGuard

  const makeInput = () => ({
    workspaceId: 'ws-123',
  })

  beforeEach(() => {
    workspacesRepository = new FakeWorkspacesRepository()
    lifecycleRepository = new FakeConnectionLifecycleRepository()
    credentialRegistry = new FakeWorkspaceCredentialReferenceRegistry()
    fileStorage = new FakeFileStorage()
    credentialsVault = new FakeConnectionCredentialsVault()
    pendingWorkGuard = new FakePendingWorkGuard()

    sut = new DeleteWorkspaceService(
      workspacesRepository,
      lifecycleRepository,
      credentialRegistry,
      fileStorage,
      credentialsVault,
      pendingWorkGuard,
    )
  })

  it('should delete workspace and its avatar from storage if it exists', async () => {
    const workspace = Workspace.create({ name: 'Mr-tick Workspace' }).success
    const input = { workspaceId: workspace.id }
    workspace.updateAvatarUrl('https://storage.com/avatars/ws-123.png')

    workspacesRepository.workspaces = [workspace]

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(fileStorage.deleteCalls).toEqual([
      {
        filePath: `workspaces/avatars/${workspace.id}.png`,
        ignoreExtension: true,
      },
    ])
    expect(workspacesRepository.deleteCalls).toEqual([input.workspaceId])
    expect(lifecycleRepository.finishLifecycleCalls).toHaveLength(1)
  })

  it('should only delete workspace if no avatar exists', async () => {
    const workspace = Workspace.create({ name: 'No Avatar Workspace' }).success
    const input = { workspaceId: workspace.id }

    workspacesRepository.workspaces = [workspace]

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(fileStorage.deleteCalls).toHaveLength(0)
    expect(workspacesRepository.deleteCalls).toEqual([input.workspaceId])
    expect(lifecycleRepository.finishLifecycleCalls).toHaveLength(1)
  })

  it('should return NotFound error when workspace does not exist', async () => {
    const input = makeInput()
    workspacesRepository.workspaces = []

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.statusCode).toBe(404)
    expect(fileStorage.deleteCalls).toHaveLength(0)
    expect(workspacesRepository.deleteCalls).toHaveLength(0)
  })

  it('journals and removes workspace-scoped addon references by owner', async () => {
    const workspace = Workspace.create({ name: 'Addon Workspace' }).success
    const input = { workspaceId: workspace.id }
    const reference = CredentialReferenceFactory.createAddonWorkspace(
      'addon-owner',
      workspace.id,
    )
    workspacesRepository.workspaces = [workspace]
    credentialRegistry.listWorkspaceCredentialReferencesResult = Either.success(
      [
        {
          workspaceId: workspace.id,
          ownerId: 'addon-owner',
          logicalReferenceId: reference.id,
          status: 'active',
          activeReferenceId: reference.id,
          candidateReferenceId: null,
          cleanupReferenceId: null,
        },
      ],
    )

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(lifecycleRepository.beginLifecycleCalls).toEqual([
      expect.objectContaining({ previousReferences: [reference.id] }),
    ])
    expect(credentialsVault.removeCredentialCalls).toEqual([reference])
    expect(workspacesRepository.deleteCalls).toEqual([input.workspaceId])
  })

  it('maps avatar storage failures to an Either error', async () => {
    const workspace = Workspace.create({
      name: 'Storage Fail Workspace',
    }).success
    const input = { workspaceId: workspace.id }
    workspace.updateAvatarUrl('https://storage.com/avatars/ws-123.png')
    fileStorage.shouldFailDelete = true

    workspacesRepository.workspaces = [workspace]

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.statusCode).toBe(500)
    expect(result.failure.messageKey).toBe('WORKSPACE_AVATAR_DELETE_FAILED')
    expect(workspacesRepository.deleteCalls).toEqual([input.workspaceId])
  })

  it('fails with 409 ADDON_CREDENTIAL_WRITE_PENDING when references are in-flight', async () => {
    const workspace = Workspace.create({
      name: 'In-Flight Workspace',
    }).success
    const input = { workspaceId: workspace.id }
    workspacesRepository.workspaces = [workspace]
    credentialRegistry.listWorkspaceCredentialReferencesResult = Either.success(
      [
        {
          workspaceId: workspace.id,
          ownerId: 'addon-owner',
          logicalReferenceId: 'ref-1',
          status: 'write_pending',
          activeReferenceId: null,
          candidateReferenceId: 'candidate-1',
          cleanupReferenceId: null,
        },
      ],
    )

    const result = await sut.execute(input)

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.statusCode).toBe(409)
    expect(result.failure.messageKey).toBe('ADDON_CREDENTIAL_WRITE_PENDING')
    expect(workspacesRepository.deleteCalls).toHaveLength(0)
    expect(credentialsVault.removeCredentialCalls).toHaveLength(0)
  })

  it('cleans up single-cardinality connection credentials with candidate and active keys', async () => {
    const candidate = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'plugin-x',
      workspaceId: 'ws-single',
      connectionId: 'conn-1',
      authorizationId: 'auth-x',
      operationId: 'op-1',
    })
    const connection: DataSourceConnection = {
      id: 'conn-1',
      addonId: 'plugin-x',
      connectionProfileId: 'profile-x',
      cardinality: 'single',
      generation: 1,
      status: 'connected',
      authorizations: [
        {
          authorizationId: 'auth-x',
          authorizationRole: 'primary',
          authProfileId: 'profile-x',
          credentialReferenceId: candidate.id,
          generation: 1,
          status: 'active',
          identity: {
            kind: 'human',
            providerId: 'plugin-x',
            tenantId: 't1',
            providerSubjectId: '1',
            displayName: 'User',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    const workspaceWithSingle = Workspace.hydrate({
      id: 'ws-single',
      name: 'Single Workspace',
      description: undefined,
      avatarUrl: undefined,
      status: 'configured',
      connections: [connection],
      createdAt: new Date(),
      updatedAt: new Date(),
      revision: 1,
    })

    workspacesRepository.workspaces = [workspaceWithSingle]

    const result = await sut.execute({ workspaceId: 'ws-single' })

    expect(result.isSuccess()).toBe(true)
    expect(lifecycleRepository.beginLifecycleCalls).toEqual([
      expect.objectContaining({ previousReferences: [candidate.id] }),
    ])
    expect(credentialsVault.removeCredentialCalls).toEqual([candidate])
    expect(workspacesRepository.deleteCalls).toEqual(['ws-single'])
  })

  it('cleans up multi-cardinality connection credentials for every declared connection instance', async () => {
    const candidateRead = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'plugin-x',
      workspaceId: 'ws-multi',
      connectionId: 'conn-read',
      authorizationId: 'auth-read',
      operationId: 'op-multi-read',
    })
    const candidateWrite = CredentialReferenceFactory.createConnectionCandidate(
      {
        ownerId: 'plugin-x',
        workspaceId: 'ws-multi',
        connectionId: 'conn-write',
        authorizationId: 'auth-write',
        operationId: 'op-multi-write',
      },
    )
    const connectionRead: DataSourceConnection = {
      id: 'conn-read',
      addonId: 'plugin-x',
      connectionProfileId: 'profile-read',
      cardinality: 'multi',
      generation: 1,
      status: 'connected',
      authorizations: [
        {
          authorizationId: 'auth-read',
          authorizationRole: 'primary',
          authProfileId: 'profile-read',
          credentialReferenceId: candidateRead.id,
          generation: 1,
          status: 'active',
          identity: {
            kind: 'human',
            providerId: 'plugin-x',
            tenantId: 't1',
            providerSubjectId: '1',
            displayName: 'User',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    const connectionWrite: DataSourceConnection = {
      id: 'conn-write',
      addonId: 'plugin-x',
      connectionProfileId: 'profile-write',
      cardinality: 'multi',
      generation: 1,
      status: 'connected',
      authorizations: [
        {
          authorizationId: 'auth-write',
          authorizationRole: 'primary',
          authProfileId: 'profile-write',
          credentialReferenceId: candidateWrite.id,
          generation: 1,
          status: 'active',
          identity: {
            kind: 'human',
            providerId: 'plugin-x',
            tenantId: 't1',
            providerSubjectId: '2',
            displayName: 'User 2',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    const workspaceWithMulti = Workspace.hydrate({
      id: 'ws-multi',
      name: 'Multi Workspace',
      description: undefined,
      avatarUrl: undefined,
      status: 'configured',
      connections: [connectionRead, connectionWrite],
      createdAt: new Date(),
      updatedAt: new Date(),
      revision: 1,
    })

    workspacesRepository.workspaces = [workspaceWithMulti]

    const result = await sut.execute({ workspaceId: 'ws-multi' })

    expect(result.isSuccess()).toBe(true)
    expect(lifecycleRepository.beginLifecycleCalls).toEqual([
      expect.objectContaining({
        previousReferences: [candidateRead.id, candidateWrite.id],
      }),
    ])
    expect(credentialsVault.removeCredentialCalls).toEqual([
      candidateRead,
      candidateWrite,
    ])
    expect(workspacesRepository.deleteCalls).toEqual(['ws-multi'])
  })

  it('fails with CREDENTIALS_CLEANUP_PENDING and advances lifecycle to cleanup_pending when vault removal fails', async () => {
    const candidate = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'plugin-x',
      workspaceId: 'ws-vault-fail',
      connectionId: 'conn-1',
      authorizationId: 'auth-x',
      operationId: 'op-vault-fail',
    })
    const connection: DataSourceConnection = {
      id: 'conn-1',
      addonId: 'plugin-x',
      connectionProfileId: 'profile-x',
      cardinality: 'single',
      generation: 1,
      status: 'connected',
      authorizations: [
        {
          authorizationId: 'auth-x',
          authorizationRole: 'primary',
          authProfileId: 'profile-x',
          credentialReferenceId: candidate.id,
          generation: 1,
          status: 'active',
          identity: {
            kind: 'human',
            providerId: 'plugin-x',
            tenantId: 't1',
            providerSubjectId: '1',
            displayName: 'User',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    const workspace = Workspace.hydrate({
      id: 'ws-vault-fail',
      name: 'Vault Fail Workspace',
      description: undefined,
      avatarUrl: undefined,
      status: 'configured',
      connections: [connection],
      createdAt: new Date(),
      updatedAt: new Date(),
      revision: 1,
    })

    workspacesRepository.workspaces = [workspace]
    credentialsVault.mutationResult = { kind: 'unavailable' }

    const result = await sut.execute({ workspaceId: 'ws-vault-fail' })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.messageKey).toBe('CREDENTIALS_CLEANUP_PENDING')
    expect(lifecycleRepository.advanceLifecycleCalls).toEqual([
      expect.objectContaining({
        phase: 'cleanup_pending',
      }),
    ])
  })

  it('deduplicates shared credential references across authorizations in a connection', async () => {
    const candidate = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'plugin-x',
      workspaceId: 'ws-shared-ref',
      connectionId: 'conn-shared',
      authorizationId: 'auth-shared',
      operationId: 'op-shared',
    })
    const connection: DataSourceConnection = {
      id: 'conn-shared',
      addonId: 'plugin-x',
      connectionProfileId: 'profile-x',
      cardinality: 'single',
      generation: 1,
      status: 'connected',
      authorizations: [
        {
          authorizationId: 'auth-1',
          authorizationRole: 'primary',
          authProfileId: 'profile-x',
          credentialReferenceId: candidate.id,
          generation: 1,
          status: 'active',
          identity: {
            kind: 'human',
            providerId: 'plugin-x',
            tenantId: 't1',
            providerSubjectId: '1',
            displayName: 'User',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          authorizationId: 'auth-2',
          authorizationRole: 'secondary',
          authProfileId: 'profile-x',
          credentialReferenceId: candidate.id,
          generation: 1,
          status: 'active',
          identity: {
            kind: 'human',
            providerId: 'plugin-x',
            tenantId: 't1',
            providerSubjectId: '1',
            displayName: 'User',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    const workspace = Workspace.hydrate({
      id: 'ws-shared-ref',
      name: 'Shared Ref Workspace',
      description: undefined,
      avatarUrl: undefined,
      status: 'configured',
      connections: [connection],
      createdAt: new Date(),
      updatedAt: new Date(),
      revision: 1,
    })

    workspacesRepository.workspaces = [workspace]
    credentialsVault.mutationResult = { kind: 'completed' }

    const result = await sut.execute({ workspaceId: 'ws-shared-ref' })

    expect(result.isSuccess()).toBe(true)
    expect(credentialsVault.removeCredentialCalls).toHaveLength(1)
    expect(credentialsVault.removeCredentialCalls).toEqual([
      expect.objectContaining({ id: candidate.id }),
    ])
    expect(lifecycleRepository.beginLifecycleCalls).toEqual([
      expect.objectContaining({
        previousReferences: [candidate.id],
      }),
    ])
  })

  it('deletes workspace using targeted findById and delete adhering to Rule 37', async () => {
    const workspace = Workspace.create({ name: 'Rule 34 Workspace' }).success
    const input = { workspaceId: workspace.id }

    workspacesRepository.workspaces = [workspace]

    const result = await sut.execute(input)

    expect(result.isSuccess()).toBe(true)
    expect(workspacesRepository.findByIdCalls).toContain(input.workspaceId)
    expect(workspacesRepository.deleteCalls).toEqual([input.workspaceId])
  })
})
