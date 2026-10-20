import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  IConnectionCredentialsVault,
  IConnectionLifecycleRepository,
  IConnectionPendingWorkGuard,
  ICredentialsVault,
  IWorkspacesRepository,
  UnlinkConnectionInput,
} from '@/contracts'
import { toWorkspaceConnectionDTO } from '@/dtos'
import { CredentialReferenceFactory } from '@/utils/credential-reference'

import { UnlinkConnectionService } from './UnlinkConnectionService'

describe('UnlinkConnectionService', () => {
  let sut: UnlinkConnectionService

  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let lifecycleRepositoryMock: Mocked<IConnectionLifecycleRepository>
  let credentialsVaultMock: Mocked<
    IConnectionCredentialsVault & ICredentialsVault
  >
  let pendingWorkGuardMock: IConnectionPendingWorkGuard
  let fakeWorkspace: Mocked<Workspace>

  const fakeDate = new Date('2026-04-18T00:00:00.000Z')

  const makeInput = (
    connectionInstanceId: string,
    addonId = 'plugin-x',
  ): UnlinkConnectionInput => ({
    workspaceId: 'workspace-123',
    connectionInstanceId,
    addonId,
  })

  beforeEach(() => {
    vi.clearAllMocks()

    workspacesRepositoryMock = {
      create: vi.fn(),
      getById: vi.fn(),
      list: vi.fn(),
      update: vi.fn().mockResolvedValue(Either.success(undefined)),
      remove: vi.fn(),
    } as unknown as Mocked<IWorkspacesRepository>

    lifecycleRepositoryMock = {
      beginLifecycle: vi.fn().mockResolvedValue(Either.success(undefined)),
      advanceLifecycle: vi.fn().mockResolvedValue(Either.success(undefined)),
      finishLifecycle: vi.fn().mockResolvedValue(Either.success(undefined)),
    } as unknown as Mocked<IConnectionLifecycleRepository>

    credentialsVaultMock = {
      readCredential: vi.fn(),
      saveToken: vi.fn(),
      getToken: vi.fn(),
      deleteToken: vi.fn(),
      hasToken: vi.fn(),
      replaceToken: vi.fn(),
      writeCredential: vi.fn().mockResolvedValue({ kind: 'completed' }),
      removeCredential: vi.fn().mockResolvedValue({ kind: 'completed' }),
    } as Mocked<IConnectionCredentialsVault & ICredentialsVault>

    pendingWorkGuardMock = {
      withNoPendingWrites: vi.fn(
        async (_workspaceId, _connectionIds, operation) => operation(),
      ),
    }

    fakeWorkspace = {
      id: 'workspace-123',
      name: 'Mr-tick Workspace',
      status: 'configured',
      connections: [
        {
          id: 'conn-1',
          addonId: 'plugin-x',
          authorizationId: 'auth-x',
          generation: 1,
          status: 'connected',
          authorizations: [
            {
              authorizationId: 'auth-x',
              authorizationRole: 'primary',
              authProfileId: 'profile-x',
              credentialReferenceId: CredentialReferenceFactory.create({
                ownerId: 'plugin-x',
                workspaceId: 'workspace-123',
                connectionId: 'conn-1',
                authorizationId: 'auth-x',
              }).id,
              generation: 1,
              status: 'active',
              identity: {
                kind: 'human',
                providerId: 'plugin-x',
                tenantId: 't1',
                providerSubjectId: '1',
                displayName: 'User',
              },
              createdAt: fakeDate.toISOString(),
              updatedAt: fakeDate.toISOString(),
            },
          ],
        },
        {
          id: 'conn-2',
          addonId: 'plugin-y',
          authorizationId: 'auth-y',
          generation: 1,
          status: 'connected',
          authorizations: [
            {
              authorizationId: 'auth-y',
              authorizationRole: 'primary',
              authProfileId: 'profile-y',
              credentialReferenceId: CredentialReferenceFactory.create({
                ownerId: 'plugin-y',
                workspaceId: 'workspace-123',
                connectionId: 'conn-2',
                authorizationId: 'auth-y',
              }).id,
              generation: 1,
              status: 'active',
              identity: {
                kind: 'human',
                providerId: 'plugin-y',
                tenantId: 't2',
                providerSubjectId: '2',
                displayName: 'User 2',
              },
              createdAt: fakeDate.toISOString(),
              updatedAt: fakeDate.toISOString(),
            },
          ],
        },
      ],
      createdAt: fakeDate,
      updatedAt: fakeDate,
      removeConnection: vi.fn(),
    } as unknown as Mocked<Workspace>

    sut = new UnlinkConnectionService(
      workspacesRepositoryMock,
      lifecycleRepositoryMock,
      credentialsVaultMock,
      pendingWorkGuardMock,
    )

    workspacesRepositoryMock.getById.mockImplementation(async (id: string) => {
      if (fakeWorkspace && fakeWorkspace.id === id) {
        return Either.success(fakeWorkspace as unknown as Workspace)
      }
      return Either.success(undefined)
    })
  })

  it('should unlink a specific data source, clear its credentials, update the repository, and return a DTO', async () => {
    // Arrange
    const input = makeInput('conn-1')

    fakeWorkspace.removeConnection.mockReturnValue(Either.success())
    workspacesRepositoryMock.update.mockResolvedValue(Either.success(undefined))

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isSuccess()).toBe(true)

    expect(credentialsVaultMock.removeCredential).toHaveBeenCalledWith(
      CredentialReferenceFactory.create({
        ownerId: 'plugin-x',
        workspaceId: input.workspaceId,
        connectionId: 'conn-1',
        authorizationId: 'auth-x',
      }),
    )

    expect(fakeWorkspace.removeConnection).toHaveBeenCalledWith('conn-1')
    expect(workspacesRepositoryMock.update).toHaveBeenCalledWith(fakeWorkspace)
    expect(lifecycleRepositoryMock.beginLifecycle).toHaveBeenCalled()
    expect(lifecycleRepositoryMock.finishLifecycle).toHaveBeenCalled()

    expect(result.success).toEqual({
      id: fakeWorkspace.id,
      name: fakeWorkspace.name,
      status: fakeWorkspace.status,
      connections: fakeWorkspace.connections.map(toWorkspaceConnectionDTO),
      createdAt: fakeWorkspace.createdAt,
      updatedAt: fakeWorkspace.updatedAt,
    })
  })

  it('should unlink only the addon-owned connection', async () => {
    // Arrange
    const input = makeInput('conn-2', 'plugin-y')

    fakeWorkspace.removeConnection.mockReturnValue(Either.success())
    workspacesRepositoryMock.update.mockResolvedValue(Either.success(undefined))

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isSuccess()).toBe(true)

    expect(credentialsVaultMock.removeCredential).toHaveBeenCalledTimes(1)

    expect(fakeWorkspace.removeConnection).toHaveBeenCalledWith('conn-2')
  })

  it('should return NotFound error when the workspace does not exist', async () => {
    // Arrange
    const input = makeInput('conn-1')
    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(undefined),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.statusCode).toBe(404)
    expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')

    expect(credentialsVaultMock.removeCredential).not.toHaveBeenCalled()
    expect(fakeWorkspace.removeConnection).not.toHaveBeenCalled()
    expect(workspacesRepositoryMock.update).not.toHaveBeenCalled()
  })

  it('rejects unlink by a different addon without touching journal or vault', async () => {
    const result = await sut.execute(makeInput('conn-2', 'plugin-x'))
    expect(result.isFailure()).toBe(true)
    expect(lifecycleRepositoryMock.beginLifecycle).not.toHaveBeenCalled()
    expect(credentialsVaultMock.removeCredential).not.toHaveBeenCalled()
  })

  it('should forward failure when the domain entity rejects the unlink operation', async () => {
    // Arrange
    const input = makeInput('conn-1')
    const domainError = AppError.ValidationError('CONEXAO_NAO_ENCONTRADA')

    fakeWorkspace.removeConnection.mockReturnValue(Either.failure(domainError))

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(domainError)

    expect(credentialsVaultMock.removeCredential).not.toHaveBeenCalled()
    expect(lifecycleRepositoryMock.beginLifecycle).not.toHaveBeenCalled()
  })

  it('should forward a typed repository failure', async () => {
    // Arrange
    const input = makeInput('conn-1')
    const error = AppError.Internal('DATABASE_UNAVAILABLE')

    workspacesRepositoryMock.getById.mockResolvedValue(Either.failure(error))

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.statusCode).toBe(500)
    expect(result.failure.messageKey).toBe('DATABASE_UNAVAILABLE')

    expect(credentialsVaultMock.removeCredential).not.toHaveBeenCalled()
    expect(fakeWorkspace.removeConnection).not.toHaveBeenCalled()
    expect(workspacesRepositoryMock.update).not.toHaveBeenCalled()
  })

  it('removes only the persisted opaque credential references across multiple authorizations without reconstructing via connection.authorizationId', async () => {
    const candidateRead = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'plugin-multi',
      workspaceId: fakeWorkspace.id,
      connectionId: 'conn-multi',
      authorizationId: 'auth-read',
      operationId: 'op-1',
    })
    const candidateWrite = CredentialReferenceFactory.createConnectionCandidate(
      {
        ownerId: 'plugin-multi',
        workspaceId: fakeWorkspace.id,
        connectionId: 'conn-multi',
        authorizationId: 'auth-write',
        operationId: 'op-2',
      },
    )
    const multiConnection = {
      id: 'conn-multi',
      addonId: 'plugin-multi',
      authorizationId: 'auth-legacy-reconstruction',
      generation: 1,
      status: 'connected',
      authorizations: [
        {
          authorizationId: 'auth-read',
          authorizationRole: 'read',
          authProfileId: 'profile-read',
          credentialReferenceId: candidateRead.id,
          generation: 1,
          status: 'active',
          identity: {
            kind: 'human',
            providerId: 'plugin-multi',
            tenantId: 't1',
            providerSubjectId: '1',
            displayName: 'Read User',
          },
          createdAt: fakeDate.toISOString(),
          updatedAt: fakeDate.toISOString(),
        },
        {
          authorizationId: 'auth-write',
          authorizationRole: 'write',
          authProfileId: 'profile-write',
          credentialReferenceId: candidateWrite.id,
          generation: 1,
          status: 'active',
          identity: {
            kind: 'human',
            providerId: 'plugin-multi',
            tenantId: 't1',
            providerSubjectId: '2',
            displayName: 'Write User',
          },
          createdAt: fakeDate.toISOString(),
          updatedAt: fakeDate.toISOString(),
        },
      ],
    }
    const workspaceWithMulti = {
      ...fakeWorkspace,
      connections: [multiConnection],
      removeConnection: vi.fn().mockReturnValue(Either.success()),
    } as unknown as Mocked<Workspace>

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(workspaceWithMulti as unknown as Workspace),
    )

    const result = await sut.execute(makeInput('conn-multi', 'plugin-multi'))

    expect(result.isSuccess()).toBe(true)
    expect(lifecycleRepositoryMock.beginLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        previousReferences: [candidateRead.id, candidateWrite.id],
      }),
    )
    expect(credentialsVaultMock.removeCredential).toHaveBeenCalledTimes(2)
    expect(credentialsVaultMock.removeCredential).toHaveBeenCalledWith(
      candidateRead,
    )
    expect(credentialsVaultMock.removeCredential).toHaveBeenCalledWith(
      candidateWrite,
    )
  })

  it('fails with CREDENTIALS_CLEANUP_PENDING and advances lifecycle to cleanup_pending when vault removal fails', async () => {
    const candidate = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'plugin-x',
      workspaceId: fakeWorkspace.id,
      connectionId: 'conn-1',
      authorizationId: 'auth-x',
      operationId: 'op-vault-fail',
    })
    const connection = {
      id: 'conn-1',
      addonId: 'plugin-x',
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
          createdAt: fakeDate.toISOString(),
          updatedAt: fakeDate.toISOString(),
        },
      ],
    }
    const workspace = {
      ...fakeWorkspace,
      connections: [connection],
      removeConnection: vi.fn().mockReturnValue(Either.success()),
    } as unknown as Mocked<Workspace>

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(workspace as unknown as Workspace),
    )
    credentialsVaultMock.removeCredential.mockResolvedValue({
      kind: 'unavailable',
    })

    const result = await sut.execute(makeInput('conn-1', 'plugin-x'))

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CREDENTIALS_CLEANUP_PENDING')
    expect(lifecycleRepositoryMock.advanceLifecycle).toHaveBeenCalledWith(
      expect.any(String),
      'cleanup_pending',
    )
  })

  it('deduplicates shared credential references across authorizations in a connection', async () => {
    const candidate = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'plugin-x',
      workspaceId: fakeWorkspace.id,
      connectionId: 'conn-shared',
      authorizationId: 'auth-shared',
      operationId: 'op-shared',
    })
    const connection = {
      id: 'conn-shared',
      addonId: 'plugin-x',
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
          createdAt: fakeDate.toISOString(),
          updatedAt: fakeDate.toISOString(),
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
          createdAt: fakeDate.toISOString(),
          updatedAt: fakeDate.toISOString(),
        },
      ],
    }
    const workspace = {
      ...fakeWorkspace,
      connections: [connection],
      removeConnection: vi.fn().mockReturnValue(Either.success()),
    } as unknown as Mocked<Workspace>

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(workspace as unknown as Workspace),
    )
    credentialsVaultMock.removeCredential.mockResolvedValue({
      kind: 'completed',
    })

    const result = await sut.execute(makeInput('conn-shared', 'plugin-x'))

    expect(result.isSuccess()).toBe(true)
    expect(credentialsVaultMock.removeCredential).toHaveBeenCalledTimes(1)
    expect(credentialsVaultMock.removeCredential).toHaveBeenCalledWith(
      expect.objectContaining({ id: candidate.id }),
    )
    expect(lifecycleRepositoryMock.beginLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        previousReferences: [candidate.id],
      }),
    )
  })

  it('unlinks data source using targeted findById without calling readSnapshot (Rule 34)', async () => {
    const workspace = {
      ...fakeWorkspace,
      removeConnection: vi.fn().mockReturnValue(Either.success()),
    } as unknown as Mocked<Workspace>

    workspacesRepositoryMock.getById.mockResolvedValue(
      Either.success(workspace as unknown as Workspace),
    )

    const result = await sut.execute(makeInput('conn-1', 'plugin-x'))

    expect(result.isSuccess()).toBe(true)
    expect(workspacesRepositoryMock.getById).toHaveBeenCalledWith(
      'workspace-123',
    )
  })
})
