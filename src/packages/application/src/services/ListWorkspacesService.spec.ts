import { Workspace } from '@mr-tick/domain'
import { AppError } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IWorkspacesRepository } from '@/contracts/data/repositories'
import type { PagedResultDTO } from '@/dtos/pagination'

import { ListWorkspacesService } from './ListWorkspacesService'

describe('ListWorkspacesService', () => {
  let sut: ListWorkspacesService
  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>

  const fakeDate = new Date('2026-04-18T00:00:00.000Z')

  const fakeWorkspaces = [
    Workspace.hydrate({
      id: 'workspace-1',
      name: 'Mr-tick Development',
      status: 'configured',
      description: 'Dev env',
      avatarUrl: undefined,
      dataSourceConnections: [],
      createdAt: fakeDate,
      updatedAt: fakeDate,
    }),
    Workspace.hydrate({
      id: 'workspace-2',
      name: 'Mr-tick Production',
      status: 'configured',
      description: 'Prod env',
      avatarUrl: undefined,
      dataSourceConnections: [],
      createdAt: fakeDate,
      updatedAt: fakeDate,
    }),
  ]

  const fakeWorkspacesPage: PagedResultDTO<Workspace> = {
    items: fakeWorkspaces,
    total: 2,
    page: 1,
    pageSize: 10,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    workspacesRepositoryMock = {
      findAll: vi.fn(),
    } as unknown as Mocked<IWorkspacesRepository>

    sut = new ListWorkspacesService(workspacesRepositoryMock)
  })

  it('should fetch all workspaces and return a paginated result successfully', async () => {
    // Arrange
    workspacesRepositoryMock.findAll.mockResolvedValue(fakeWorkspacesPage)

    // Act
    const result = await sut.execute()

    // Assert
    expect(result.isSuccess()).toBe(true)
    expect(result.success.total).toBe(2)
    expect(result.success.items[0].id).toBe('workspace-1')
    expect(workspacesRepositoryMock.findAll).toHaveBeenCalledTimes(1)
  })

  it('should return Internal error when the repository throws an exception', async () => {
    // Arrange
    const error = new Error('Database connection timeout')
    workspacesRepositoryMock.findAll.mockRejectedValue(error)

    // Act
    const result = await sut.execute()

    // Assert
    expect(result.isFailure()).toBe(true)
    expect(result.failure).toBeInstanceOf(AppError)
    expect(result.failure.messageKey).toBe('ERRO_INESPERADO')
    expect(workspacesRepositoryMock.findAll).toHaveBeenCalledTimes(1)
  })
})
