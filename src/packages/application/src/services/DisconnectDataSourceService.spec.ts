import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  DisconnectDataSourceInput,
  ICredentialsVault,
  IWorkspacesRepository,
} from '@/contracts'
import { getMemberVaultKey } from '@/utils'

import { DisconnectDataSourceService } from './DisconnectDataSourceService'

describe('DisconnectDataSourceService', () => {
  let sut: DisconnectDataSourceService

  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let credentialsVaultMock: Mocked<ICredentialsVault>
  let fakeWorkspace: Mocked<Workspace>

  const makeInput = (): DisconnectDataSourceInput => ({
    workspaceId: 'workspace-123',
    connectionInstanceId: 'conn-abc',
  })

  beforeEach(() => {
    vi.clearAllMocks()

    workspacesRepositoryMock = {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IWorkspacesRepository>

    credentialsVaultMock = {
      saveToken: vi.fn(),
      deleteToken: vi.fn(),
      getToken: vi.fn(),
      hasToken: vi.fn(),
      replaceToken: vi.fn(),
    } as unknown as Mocked<ICredentialsVault>

    fakeWorkspace = {
      id: 'workspace-123',
      disconnectDataSource: vi.fn(),
    } as unknown as Mocked<Workspace>

    sut = new DisconnectDataSourceService(
      workspacesRepositoryMock,
      credentialsVaultMock,
    )
  })

  it('should disconnect the data source, delete tokens, update workspace and return success', async () => {
    // Arrange
    const input = makeInput()

    workspacesRepositoryMock.findById.mockResolvedValue(fakeWorkspace)
    fakeWorkspace.disconnectDataSource.mockReturnValue(Either.success())

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isSuccess()).toBe(true)

    const expectedStorageKey = `workspace-session-${input.workspaceId}-${input.connectionInstanceId}`
    const expectedMemberKey = getMemberVaultKey(
      input.workspaceId,
      input.connectionInstanceId,
    )

    expect(credentialsVaultMock.deleteToken).toHaveBeenCalledTimes(2)
    expect(credentialsVaultMock.deleteToken).toHaveBeenCalledWith(
      'mr-tick',
      expectedStorageKey,
    )
    expect(credentialsVaultMock.deleteToken).toHaveBeenCalledWith(
      'mr-tick',
      expectedMemberKey,
    )

    expect(fakeWorkspace.disconnectDataSource).toHaveBeenCalledWith(
      input.connectionInstanceId,
    )
    expect(workspacesRepositoryMock.update).toHaveBeenCalledWith(fakeWorkspace)
  })

  it('should return NotFound error when the workspace does not exist', async () => {
    // Arrange
    const input = makeInput()
    workspacesRepositoryMock.findById.mockResolvedValue(undefined)

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(404)
    expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')

    expect(credentialsVaultMock.deleteToken).not.toHaveBeenCalled()
    expect(fakeWorkspace.disconnectDataSource).not.toHaveBeenCalled()
    expect(workspacesRepositoryMock.update).not.toHaveBeenCalled()
  })

  it('should forward the failure when the domain entity rejects the disconnection', async () => {
    // Arrange
    const input = makeInput()
    const domainError = AppError.ValidationError('CONEXAO_NAO_ENCONTRADA')

    workspacesRepositoryMock.findById.mockResolvedValue(fakeWorkspace)
    fakeWorkspace.disconnectDataSource.mockReturnValue(
      Either.failure(domainError),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(domainError)

    expect(credentialsVaultMock.deleteToken).toHaveBeenCalledTimes(2)
    expect(workspacesRepositoryMock.update).not.toHaveBeenCalled()
  })

  it('should return NotFound error (mapped from catch) when an exception is thrown', async () => {
    // Arrange
    const input = makeInput()
    workspacesRepositoryMock.findById.mockRejectedValue(new Error('DB Error'))

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(404)
    expect(result.failure.messageKey).toBe('ERRO_AO_DESCONECTAR')

    expect(credentialsVaultMock.deleteToken).not.toHaveBeenCalled()
    expect(workspacesRepositoryMock.update).not.toHaveBeenCalled()
  })
})
