import { Workspace } from '@mr-tick/domain'

import { IRepositoryBase } from '@/contracts/data/repositories'
import { PagedResultDTO, PaginationOptionsDTO } from '@/dtos'

export interface IWorkspacesRepository extends IRepositoryBase<Workspace> {
  findAll(pagination?: PaginationOptionsDTO): Promise<PagedResultDTO<Workspace>>
}
