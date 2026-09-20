import { Task } from '@mr-tick/domain'

import { PagedResultDTO, PaginationOptionsDTO, TaskDTO } from '@/dtos'

export interface CreatedTaskResult {
  id: string
  updatedAt?: Date
}

export interface UpdatedTaskResult {
  id: string
  updatedAt?: Date
}

export interface ITaskProvider {
  pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<TaskDTO[]>
  findAll(pagination?: PaginationOptionsDTO): Promise<PagedResultDTO<TaskDTO>>
  findById(id: string): Promise<TaskDTO | undefined>
  create(task: Task): Promise<CreatedTaskResult | void>
  update(task: Task): Promise<UpdatedTaskResult | void>
  delete(id: string): Promise<void>
}
