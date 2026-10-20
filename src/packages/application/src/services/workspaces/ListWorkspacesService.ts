import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import { IWorkspacesRepository } from '@/contracts/data/repositories'
import {
  IListWorkspacesUseCase,
  ListWorkspacesOptions,
} from '@/contracts/use-cases/IListWorkspacesUseCase'
import { PagedResultDTO, toWorkspaceConnectionDTO, WorkspaceDTO } from '@/dtos'

function mapWorkspaceToDTO(w: Workspace): WorkspaceDTO {
  return {
    id: w.id,
    name: w.name,
    avatarUrl: w.avatarUrl,
    status: w.status,
    description: w.description,
    connections: w.connections.map(toWorkspaceConnectionDTO),
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }
}

export class ListWorkspacesService implements IListWorkspacesUseCase {
  constructor(private readonly workspacesRepository: IWorkspacesRepository) {}

  public async execute(
    options?: ListWorkspacesOptions,
  ): Promise<Either<AppError, PagedResultDTO<WorkspaceDTO>>> {
    if (options?.pagination !== undefined) {
      const result = await this.workspacesRepository.list(
        options.filter,
        options.pagination,
      )
      if (result.isFailure()) {
        return result.forwardFailure()
      }
      const page = result.success
      return Either.success({
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        items: page.items.map(mapWorkspaceToDTO),
      })
    }

    const allItems: WorkspaceDTO[] = []
    let page = 1
    const pageSize = 50
    let total = 0
    let keepPaging = true

    while (keepPaging) {
      const result = await this.workspacesRepository.list(options?.filter, {
        page,
        pageSize,
      })
      if (result.isFailure()) {
        return result.forwardFailure()
      }
      const pageResult = result.success
      allItems.push(...pageResult.items.map(mapWorkspaceToDTO))
      total = pageResult.total
      if (pageResult.items.length === 0 || allItems.length >= total) {
        keepPaging = false
      }
      page += 1
    }

    return Either.success({
      page: 1,
      pageSize: allItems.length,
      total,
      items: allItems,
    })
  }
}
