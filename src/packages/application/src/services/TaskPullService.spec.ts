import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ITaskProvider } from '@/contracts/data/providers'
import type { IDataSourceResolver } from '@/contracts/resolvers'
import type { IDataSourceAdapter } from '@/contracts/resolvers/IDataSourceAdapter'
import type { PullTasksInput } from '@/contracts/use-cases'
import type { TaskDTO } from '@/dtos'

import { TaskPullService } from './TaskPullService'

describe('TaskPullService', () => {
  let sut: TaskPullService

  let dataSourceResolverMock: Mocked<IDataSourceResolver>
  let adapterMock: Mocked<IDataSourceAdapter>
  let tasksProviderMock: Mocked<ITaskProvider>

  const fakeDate = new Date('2026-04-18T00:00:00.000Z')

  const makeInput = (): PullTasksInput => ({
    workspaceId: 'workspace-123',
    connectionInstanceId: 'conn-abc',
    checkpoint: {
      updatedAt: fakeDate,
      id: 'task-last-sync-1',
    },
    batch: 50,
  })

  const fakeMember = {
    id: 'member-123',
    firstname: 'John',
    lastname: 'Doe',
  }

  const fakeTasks: TaskDTO[] = [
    {
      id: 'task-1',
      title: 'Fix auth bug',
      status: { id: 'status-1', name: 'To Do' },
      createdAt: fakeDate,
      updatedAt: fakeDate,
    },
    {
      id: 'task-2',
      title: 'Update database schema',
      status: { id: 'status-2', name: 'In Progress' },
      createdAt: fakeDate,
      updatedAt: fakeDate,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    tasksProviderMock = {
      pull: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<ITaskProvider>

    adapterMock = {
      tasksProvider: tasksProviderMock,
      getAuthenticatedMemberData: vi.fn(),
    } as unknown as Mocked<IDataSourceAdapter>

    dataSourceResolverMock = {
      getDataSource: vi.fn(),
    } as unknown as Mocked<IDataSourceResolver>

    sut = new TaskPullService(dataSourceResolverMock)
  })

  it('should successfully pull tasks using the authenticated member from the adapter', async () => {
    // Arrange
    const input = makeInput()

    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeMember as any),
    )
    tasksProviderMock.pull.mockResolvedValue(fakeTasks)

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual(fakeTasks)

    expect(adapterMock.getAuthenticatedMemberData).toHaveBeenCalled()
    expect(tasksProviderMock.pull).toHaveBeenCalledWith(
      fakeMember.id,
      input.checkpoint,
      input.batch,
    )
  })

  it('should forward the failure if getAuthenticatedMemberData returns a failure', async () => {
    // Arrange
    const input = makeInput()
    const authError = AppError.Unauthorized('FALHA_DE_AUTENTICACAO')

    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.failure(authError),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBe(authError)

    expect(tasksProviderMock.pull).not.toHaveBeenCalled()
  })

  it('should return unexpected error when the data source resolver throws an exception', async () => {
    // Arrange
    const input = makeInput()
    dataSourceResolverMock.getDataSource.mockRejectedValue(
      new Error('Plugin not found'),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ERRO_INESPERADO')
    expect(result.failure.statusCode).toBe(404)
  })

  it('should return unexpected error when the adapter fails to pull tasks (throws)', async () => {
    // Arrange
    const input = makeInput()
    dataSourceResolverMock.getDataSource.mockResolvedValue(adapterMock)
    adapterMock.getAuthenticatedMemberData.mockResolvedValue(
      Either.success(fakeMember as any),
    )
    tasksProviderMock.pull.mockRejectedValue(
      new Error('API Rate Limit Exceeded'),
    )

    // Act
    const result = await sut.execute(input)

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ERRO_INESPERADO')
    expect(result.failure.statusCode).toBe(404)
  })
})
