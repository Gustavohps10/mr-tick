import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type { IWorkspacesRepository } from '@/contracts/data/repositories'
import type {
  PagedResultDTO,
  PaginationOptionsDTO,
  WorkspaceFilterDTO,
} from '@/dtos'

import { ListWorkspacesService } from './ListWorkspacesService'

class MockWorkspacesRepository implements IWorkspacesRepository {
  public pages: PagedResultDTO<Workspace>[] = []
  public listCalls: {
    filter?: WorkspaceFilterDTO
    pagination?: PaginationOptionsDTO
  }[] = []
  public failError: AppError | null = null

  public async list(
    filter?: WorkspaceFilterDTO,
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<Workspace>>> {
    this.listCalls.push({ filter, pagination })
    if (this.failError !== null) {
      return Either.failure(this.failError)
    }
    let targetPage = 1
    if (pagination?.page !== undefined) {
      targetPage = pagination.page
    }
    const found = this.pages[targetPage - 1]
    if (found !== undefined) {
      return Either.success(found)
    }
    let targetPageSize = 50
    if (pagination?.pageSize !== undefined) {
      targetPageSize = pagination.pageSize
    }
    return Either.success({
      items: [],
      total: 0,
      page: targetPage,
      pageSize: targetPageSize,
    })
  }

  public async create(_workspace: Workspace): Promise<Either<AppError, void>> {
    return Either.success()
  }
  public async getById(
    _id: string,
  ): Promise<Either<AppError, Workspace | undefined>> {
    return Either.success(undefined)
  }
  public async update(_workspace: Workspace): Promise<Either<AppError, void>> {
    return Either.success()
  }
  public async remove(_id: string): Promise<Either<AppError, void>> {
    return Either.success()
  }
}

describe('ListWorkspacesService', () => {
  let sut: ListWorkspacesService
  let repository: MockWorkspacesRepository

  const fakeDate = new Date('2026-04-18T00:00:00.000Z')

  function createFakeWorkspace(id: string, name: string): Workspace {
    const ws = Workspace.create({ name })
    if (ws.isFailure()) {
      throw new Error('Falha ao criar workspace no teste')
    }
    return Workspace.hydrate({
      id,
      name,
      status: 'configured',
      description: 'Test env',
      avatarUrl: undefined,
      connections: [],
      createdAt: fakeDate,
      updatedAt: fakeDate,
      revision: 1,
    })
  }

  beforeEach(() => {
    repository = new MockWorkspacesRepository()
    sut = new ListWorkspacesService(repository)
  })

  it('fetches all pages deterministically when total exceeds 50 and last workspace is accessible', async () => {
    const page1Items: Workspace[] = []
    for (let i = 1; i <= 50; i += 1) {
      page1Items.push(createFakeWorkspace(`workspace-${i}`, `Workspace ${i}`))
    }

    const page2Items: Workspace[] = []
    for (let i = 51; i <= 55; i += 1) {
      page2Items.push(createFakeWorkspace(`workspace-${i}`, `Workspace ${i}`))
    }

    repository.pages = [
      {
        items: page1Items,
        total: 55,
        page: 1,
        pageSize: 50,
      },
      {
        items: page2Items,
        total: 55,
        page: 2,
        pageSize: 50,
      },
    ]

    const result = await sut.execute()

    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return

    expect(result.success.total).toBe(55)
    expect(result.success.items).toHaveLength(55)
    expect(result.success.items[0]?.id).toBe('workspace-1')
    expect(result.success.items[54]?.id).toBe('workspace-55')
    expect(result.success.items[54]?.name).toBe('Workspace 55')
    expect(repository.listCalls).toHaveLength(2)
  })

  it('applies pagination options when specifically requested', async () => {
    const page2Items = [
      createFakeWorkspace('workspace-11', 'Workspace 11'),
      createFakeWorkspace('workspace-12', 'Workspace 12'),
    ]
    repository.pages = [
      {
        items: [],
        total: 12,
        page: 1,
        pageSize: 10,
      },
      {
        items: page2Items,
        total: 12,
        page: 2,
        pageSize: 10,
      },
    ]

    const result = await sut.execute({
      pagination: { page: 2, pageSize: 10 },
    })

    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return

    expect(result.success.page).toBe(2)
    expect(result.success.pageSize).toBe(10)
    expect(result.success.items).toHaveLength(2)
    expect(result.success.items[0]?.id).toBe('workspace-11')
    expect(repository.listCalls).toHaveLength(1)
    expect(repository.listCalls[0]?.pagination?.page).toBe(2)
  })

  it('propagates failure from repository', async () => {
    repository.failError = AppError.Internal('REPOSITORY_FAILURE')

    const result = await sut.execute()

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return
    expect(result.failure.messageKey).toBe('REPOSITORY_FAILURE')
  })
})
