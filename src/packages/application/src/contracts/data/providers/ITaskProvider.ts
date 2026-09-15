import { Task } from '@mr-tick/domain'

import { PagedResultDTO, PaginationOptionsDTO, TaskDTO } from '@/dtos'

export interface ITaskProvider {
  pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<TaskDTO[]>
  findAll(pagination?: PaginationOptionsDTO): Promise<PagedResultDTO<TaskDTO>>
  findById(id: string): Promise<TaskDTO | undefined>
  create(task: Task): Promise<void>
  update(task: Task): Promise<void>
  delete(id: string): Promise<void>
}
