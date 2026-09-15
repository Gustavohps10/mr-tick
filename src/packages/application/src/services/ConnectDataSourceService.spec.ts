import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ConnectDataSourceInput,
  ICredentialsStorage,
  IDataSourceResolver,
  IWorkspacesRepository,
} from '@/contracts'
import type { IDataSourceAdapter } from '@/contracts/resolvers/IDataSourceAdapter'
import type { IAuthenticationStrategy } from '@/contracts/strategies'

import { ConnectDataSourceService } from './ConnectDataSourceService'

describe('ConnectDataSourceService', () => {
  let sut: ConnectDataSourceService

  let credentialsStorageMock: Mocked<ICredentialsStorage>
  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let dataSourceResolverMock: Mocked<IDataSourceResolver>

  let authenticationStrategyMock: Mocked<IAuthenticationStrategy>
  let adapterMock: IDataSourceAdapter
  let fakeWorkspace: Mocked<Workspace>

  const fakeMember = {
    id: 'member-123',
    firstname: 'John',
    lastname: 'Doe',
    login: 'johndoe',
    avatarUrl: 'https://example.com/avatar.png',
  }

  const fakeCredentials = {
    accessToken: 'external-abc',
  }

  const makeInput = (): ConnectDataSourceInput<
    Record<string, string>,
    Record<string, string>
  > => ({
    workspaceId: 'workspace-1',
    pluginId: 'plugin-1',
    connectionInstanceId: 'conn-1',
    credentials: { token: 'raw-token' },
    configuration: { host: 'localhost' },
  })

  beforeEach(() => {
    vi.clearAllMocks()

    credentialsStorageMock = {
      saveToken: vi.fn(),
      deleteToken: vi.fn(),
      getToken: vi.fn(),
      hasToken: vi.fn(),
      replaceToken: vi.fn(),
    } as Partial<ICredentialsStorage> as Mocked<ICredentialsStorage>

    workspacesRepositoryMock = {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as Partial<IWorkspacesRepository> as Mocked<IWorkspacesRepository>

    dataSourceResolverMock = {
      getDataSource: vi.fn(),
      getDataSourcesForWorkspace: vi.fn(),
      getConfigFields: vi.fn(),
    } as Partial<IDataSourceResolver> as Mocked<IDataSourceResolver>

    authenticationStrategyMock = {
      authenticate: vi.fn(),
    } as Partial<IAuthenticationStrategy> as Mocked<IAuthenticationStrategy>

    adapterMock = {
      authenticationStrategy: authenticationStrategyMock,
    } as Partial<IDataSourceAdapter> as IDataSourceAdapter

    fakeWorkspace = {
      id: 'workspace-1',
      connectDataSource: vi.fn(),
    } as Partial<Workspace> as Mocked<Workspace>

    sut = new ConnectDataSourceService(
      credentialsStorageMock,
      workspacesRepositoryMock,
      dataSourceResolverMock,
    )
  })

  it('should authenticate, save credentials, update workspace and return member successfully', async () => {
    // Arrange
    const input = makeInput()

    workspacesRepositoryMock.findById.mockResolvedValue(fakeWorkspace)
    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)

    authenticationStrategyMock.authenticate.mockResolvedValue(
      Either.success({
        member: fakeMember as any,
        credentials: fakeCredentials,
      }),
    )

    fakeWorkspace.connectDataSource.mockReturnValue(Either.success())

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual({
      member: fakeMember,
    })

    const storageKey = `workspace-connection-${input.workspaceId}-${input.connectionInstanceId}`

    expect(credentialsStorageMock.saveToken).toHaveBeenCalledWith(
      'mr-tick',
      storageKey,
      JSON.stringify({
        member: fakeMember,
        credentials: fakeCredentials,
      }),
    )

    expect(fakeWorkspace.connectDataSource).toHaveBeenCalledWith(
      input.connectionInstanceId,
      {
        id: fakeMember.id.toString(),
        name: `${fakeMember.firstname} ${fakeMember.lastname}`,
        login: fakeMember.login,
        avatarUrl: fakeMember.avatarUrl,
      },
      input.configuration,
    )

    expect(workspacesRepositoryMock.update).toHaveBeenCalledWith(fakeWorkspace)
  })

  it('should return NotFoundError when workspace does not exist', async () => {
    // Arrange
    const input = makeInput()
    workspacesRepositoryMock.findById.mockResolvedValue(undefined)

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(404)
    expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')

    expect(dataSourceResolverMock.getDataSource).not.toHaveBeenCalled()
  })

  it('should return failure when authentication strategy fails', async () => {
    // Arrange
    const input = makeInput()
    const authError = AppError.Internal('AUTH_FAILED')

    workspacesRepositoryMock.findById.mockResolvedValue(fakeWorkspace)
    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)

    authenticationStrategyMock.authenticate.mockResolvedValue(
      Either.failure(authError),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(authError)

    expect(credentialsStorageMock.saveToken).not.toHaveBeenCalled()
    expect(fakeWorkspace.connectDataSource).not.toHaveBeenCalled()
  })

  it('should delete storage token and return failure when workspace entity rejects data source connection', async () => {
    // Arrange
    const input = makeInput()
    const domainError = AppError.ValidationError('CONNECTION_ALREADY_EXISTS')
    const storageKey = `workspace-connection-${input.workspaceId}-${input.connectionInstanceId}`

    workspacesRepositoryMock.findById.mockResolvedValue(fakeWorkspace)
    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)

    authenticationStrategyMock.authenticate.mockResolvedValue(
      Either.success({
        member: fakeMember as any,
        credentials: fakeCredentials,
      }),
    )

    fakeWorkspace.connectDataSource.mockReturnValue(Either.failure(domainError))

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(domainError)

    expect(credentialsStorageMock.deleteToken).toHaveBeenCalledWith(
      'mr-tick',
      storageKey,
    )
    expect(workspacesRepositoryMock.update).not.toHaveBeenCalled()
  })

  it('should delete storage token and return InternalServerError when an exception is thrown', async () => {
    // Arrange
    const input = makeInput()
    const error = new Error('Database connection lost')
    const storageKey = `workspace-connection-${input.workspaceId}-${input.connectionInstanceId}`

    workspacesRepositoryMock.findById.mockRejectedValue(error)

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(500)
    expect(result.failure.messageKey).toBe('ERRO_AO_CONECTAR_DATA_SOURCE')

    expect(credentialsStorageMock.deleteToken).toHaveBeenCalledTimes(1)
    expect(credentialsStorageMock.deleteToken).toHaveBeenCalledWith(
      'mr-tick',
      storageKey,
    )
  })
})
