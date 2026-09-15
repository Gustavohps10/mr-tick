import { AppError, Either } from '@mr-tick/shared/helpers'

import { IWorkspacesRepository } from '@/contracts/data/repositories'
import { IListWorkspacesUseCase } from '@/contracts/use-cases/IListWorkspacesUseCase'
import { PagedResultDTO, WorkspaceDTO } from '@/dtos'

export class ListWorkspacesService implements IListWorkspacesUseCase {
  constructor(private readonly workspacesRepository: IWorkspacesRepository) {}

  public async execute(): Promise<
    Either<AppError, PagedResultDTO<WorkspaceDTO>>
  > {
    try {
      const result = await this.workspacesRepository.findAll()
      const workspaces: PagedResultDTO<WorkspaceDTO> = {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        items: result.items.map((w) => ({
          id: w.id,
          name: w.name,
          avatarUrl: w.avatarUrl,
          status: w.status,
          description: w.description,
          dataSourceConnections: w.dataSourceConnections.map((c) => ({
            id: c.id,
            dataSourceId: c.dataSourceId,
            status: c.status,
            config: c.config,
            member: c.member,
          })),
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        })),
      }
      return Either.success(workspaces)
    } catch (error) {
      return Either.failure(AppError.NotFound('ERRO_INESPERADO'))
    }
  }
}
