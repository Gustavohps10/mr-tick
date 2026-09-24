import type {
  CreatedTaskResult,
  DataSourceContext,
  ITaskProvider,
  PagedResultDTO,
  PaginationOptionsDTO,
  Task,
  TaskDTO,
  UpdatedTaskResult,
} from '@mr-tick/sdk'

import { FakeDatabaseStore } from './FakeDatabaseStore'

export class FakeTaskProvider implements ITaskProvider {
  private readonly store: FakeDatabaseStore

  constructor(private readonly context: DataSourceContext) {
    this.store = FakeDatabaseStore.getInstance()
  }

  private async simulateNetworkLatency(ms = 180): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  async pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<TaskDTO[]> {
    await this.simulateNetworkLatency()
    return this.store.pullTasks(checkpoint.id, checkpoint.updatedAt, batch)
  }

  async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<TaskDTO>> {
    const all = this.store.getTasks()
    const page = pagination?.page ?? 1
    const pageSize = pagination?.pageSize ?? all.length
    const startIndex = (page - 1) * pageSize
    const items = all.slice(startIndex, startIndex + pageSize)
    return {
      items,
      total: all.length,
      page,
      pageSize,
    }
  }

  async findById(id: string): Promise<TaskDTO | undefined> {
    return this.store.findTaskById(id)
  }

  async create(entity: Task): Promise<CreatedTaskResult> {
    this.store.saveTaskFromEntity(entity)
    return {
      id: entity.id,
      updatedAt: entity.updatedAt,
    }
  }

  async update(entity: Task): Promise<UpdatedTaskResult> {
    this.store.saveTaskFromEntity(entity)
    return {
      id: entity.id,
      updatedAt: entity.updatedAt,
    }
  }

  async delete(id: string): Promise<void> {
    this.store.deleteTask(id)
  }
}
