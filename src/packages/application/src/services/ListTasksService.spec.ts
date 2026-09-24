import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IDataSourceResolver } from '@/contracts/resolvers'
import type { IDataSourceAdapter } from '@/contracts/resolvers/IDataSourceAdapter'
import type { ListTasksInput } from '@/contracts/use-cases/IListTasksUseCase'
import type { TaskDTO } from '@/dtos'
import type { PagedResultDTO } from '@/dtos/pagination'

import { ListTaskService } from './ListTasksService' // ou ListTaskService, ajuste conforme o nome real do seu arquivo

describe('ListTasksService', () => {
  let sut: ListTaskService

  let dataSourceResolverMock: Mocked<IDataSourceResolver>
  let adapterMock: Mocked<IDataSourceAdapter>

  const fakeDate = new Date('2026-04-18T00:00:00.000Z')

  const makeInput = (): ListTasksInput =>
    ({
      workspaceId: 'workspace-123',
      pluginId: 'plugin-xyz',
      connectionInstanceId: 'conn-abc',
    }) as ListTasksInput

  const fakeMember = {
    id: 'member-123',
    firstname: 'John',
    lastname: 'Doe',
  }

  const fakeTasksPage: PagedResultDTO<TaskDTO> = {
    items: [
      {
        id: 'task-1',
        title: 'Fix login bug',
        description: 'Bug is preventing users from logging in via Google',
        url: 'https://tracker.example.com/issues/1',
        projectName: 'Mr-tick Auth App',
        status: {
          id: 'status-2',
          name: 'In Progress',
        },
        priority: {
          id: 'priority-1',
          name: 'High',
        },
        assignedTo: {
          id: 'user-1',
          name: 'John Doe',
        },
        createdAt: fakeDate,
        updatedAt: fakeDate,
      },
      {
        id: 'task-2',
        title: 'Update documentation',
        status: {
          id: 'status-1',
          name: 'To Do',
        },
        author: {
          id: 'user-2',
          name: 'Jane Smith',
        },
        createdAt: fakeDate,
        updatedAt: fakeDate,
      },
    ],
    total: 2,
    page: 1,
    pageSize: 10,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    dataSourceResolverMock = {
      getDataSource: vi.fn(),
    } as Partial<IDataSourceResolver> as Mocked<IDataSourceResolver>

    adapterMock = {
      // ADICIONADO: mock para a função de autenticação
      getAuthenticatedMemberData: vi.fn(),
      tasksProvider: {
        findAll: vi.fn(),
      },
    } as unknown as Mocked<IDataSourceAdapter>

    sut = new ListTaskService(dataSourceResolverMock)
  })

  it('should resolve the data source, fetch tasks and return a paginated result successfully', async () => {
    // Arrange
    const input = makeInput()

    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)

    // ADICIONADO: garantindo que a autenticação passe
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeMember as any),
    )
    ;(adapterMock.tasksProvider.findAll as any).mockResolvedValue(
      Either.success(fakeTasksPage),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual(fakeTasksPage)

    expect(dataSourceResolverMock.getDataSource).toHaveBeenCalledWith(
      input.workspaceId,
      input.connectionInstanceId,
    )
    expect(adapterMock.getAuthenticatedMemberData).toHaveBeenCalled()
    expect(adapterMock.tasksProvider.findAll).toHaveBeenCalledTimes(1)
  })

  it('should forward the failure if getAuthenticatedMemberData returns a failure', async () => {
    // Arrange
    const input = makeInput()
    const authError = AppError.Unauthorized('FALHA_DE_AUTENTICACAO')

    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    // Simulando falha na autenticação
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.failure(authError),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(authError)

    expect(adapterMock.tasksProvider.findAll).not.toHaveBeenCalled()
  })

  it('should return InternalServerError (ERRO_INESPERADO) when the data source resolver throws an exception', async () => {
    // Arrange
    const input = makeInput()
    const error = new Error('Plugin not found or inactive')

    dataSourceResolverMock.getDataSource.mockRejectedValue(error)

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ERRO_INESPERADO')

    expect(adapterMock.tasksProvider.findAll).not.toHaveBeenCalled()
  })

  it('should return InternalServerError (ERRO_INESPERADO) when the adapter fails to fetch tasks', async () => {
    // Arrange
    const input = makeInput()
    const error = new Error('API Rate Limit Exceeded')

    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeMember as any),
    )
    ;(adapterMock.tasksProvider.findAll as any).mockRejectedValue(error)

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ERRO_INESPERADO')
  })
})
