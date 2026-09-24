import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  GetCurrentUserInput,
  IDataSourceResolver,
  IWorkspacesRepository,
} from '@/contracts'
import type { IDataSourceAdapter } from '@/contracts/resolvers/IDataSourceAdapter'
import type { MemberDTO } from '@/dtos'

import { GetCurrentUserService } from './GetCurrentUserService'

describe('GetCurrentUserService', () => {
  let sut: GetCurrentUserService

  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let dataSourceResolverMock: Mocked<IDataSourceResolver>
  let adapterMock: Mocked<IDataSourceAdapter>
  let fakeWorkspace: Mocked<Workspace>

  const makeInput = (): GetCurrentUserInput => ({
    workspaceId: 'workspace-123',
    connectionInstanceId: 'conn-abc',
  })

  const fakeAuthMember = {
    id: 789,
    name: 'John Doe',
  }

  const fakeMemberDTO: MemberDTO = {
    id: 789,
    firstname: 'John',
    lastname: 'Doe',
    login: 'test-user',
    admin: false,
    customFields: [{ id: 123, name: 'chave', value: 'valor' }],
    createdOn: Date.now().toLocaleString(),
    lastLoginOn: Date.now().toLocaleString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    workspacesRepositoryMock = {
      findById: vi.fn(),
    } as Partial<IWorkspacesRepository> as Mocked<IWorkspacesRepository>

    dataSourceResolverMock = {
      getDataSource: vi.fn(),
    } as Partial<IDataSourceResolver> as Mocked<IDataSourceResolver>

    adapterMock = {
      getAuthenticatedMemberData: vi.fn(),
      membersProvider: {
        findById: vi.fn(),
      },
    } as unknown as Mocked<IDataSourceAdapter>

    fakeWorkspace = {
      id: 'workspace-123',
      status: 'configured',

      dataSourceConnections: [
        {
          status: 'connected',
          id: 'conn-abc',
          dataSourceId: 'plugin-1',
        },
      ],
    } as Partial<Workspace> as Mocked<Workspace>

    sut = new GetCurrentUserService(
      workspacesRepositoryMock,
      dataSourceResolverMock,
    )
  })

  it('should return the current user successfully', async () => {
    // Arrange
    const input = makeInput()

    workspacesRepositoryMock.findById.mockResolvedValue(fakeWorkspace)
    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeAuthMember as any),
    )
    ;(adapterMock.membersProvider.findById as any).mockResolvedValue(
      Either.success(fakeMemberDTO),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual(fakeMemberDTO)

    expect(workspacesRepositoryMock.findById).toHaveBeenCalledWith(
      input.workspaceId,
    )
    expect(dataSourceResolverMock.getDataSource).toHaveBeenCalledWith(
      input.workspaceId,
      input.connectionInstanceId,
    )
    expect(adapterMock.getAuthenticatedMemberData).toHaveBeenCalled()
    expect(adapterMock.membersProvider.findById).toHaveBeenCalledWith(
      fakeAuthMember.id.toString(),
    )
  })

  it('should return NotFoundError when workspace is not found', async () => {
    // Arrange
    const input = makeInput()
    workspacesRepositoryMock.findById.mockResolvedValue(undefined)

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')

    expect(dataSourceResolverMock.getDataSource).not.toHaveBeenCalled()
  })

  it('should return NotFoundError when connection instance is not found in workspace', async () => {
    // Arrange
    const input = makeInput()

    const workspaceWithoutConnection = {
      ...fakeWorkspace,
      dataSourceConnections: [],
    } as unknown as Mocked<Workspace>

    workspacesRepositoryMock.findById.mockResolvedValue(
      workspaceWithoutConnection,
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('CONEXAO_NAO_ENCONTRADA_OU_INVALIDA')

    expect(dataSourceResolverMock.getDataSource).not.toHaveBeenCalled()
  })

  it('should return forward the failure if getAuthenticatedMemberData fails', async () => {
    // Arrange
    const input = makeInput()
    const authError = AppError.Unauthorized('FALHA_DE_AUTENTICACAO')

    workspacesRepositoryMock.findById.mockResolvedValue(fakeWorkspace)
    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.failure(authError),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(authError)

    expect(adapterMock.membersProvider.findById).not.toHaveBeenCalled()
  })

  it('should return NotFoundError when user is not found in the external data source (adapter)', async () => {
    // Arrange
    const input = makeInput()

    workspacesRepositoryMock.findById.mockResolvedValue(fakeWorkspace)
    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeAuthMember as any),
    )
    ;(adapterMock.membersProvider.findById as any).mockResolvedValue(
      Either.success(null),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('USUARIO_NAO_ENCONTRADO')
  })

  it('should return NotFoundError (ERRO_AO_OBTER_USUARIO) when an exception is thrown', async () => {
    // Arrange
    const input = makeInput()
    const error = new Error('Unexpected adapter failure')

    workspacesRepositoryMock.findById.mockRejectedValue(error)

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ERRO_AO_OBTER_USUARIO')
  })
})
