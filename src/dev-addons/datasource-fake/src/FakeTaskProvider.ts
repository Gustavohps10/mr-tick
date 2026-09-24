import {
  AppError,
  type CreatedTaskResult,
  type DataSourceContext,
  Either,
  type ITaskProvider,
  type PagedResultDTO,
  type PaginationOptionsDTO,
  type TaskDTO,
  type UpdatedTaskResult,
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
  ): Promise<Either<AppError, TaskDTO[]>> {
    await this.simulateNetworkLatency()
    return Either.success(
      this.store.pullTasks(checkpoint.id, checkpoint.updatedAt, batch),
    )
  }

  async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TaskDTO>>> {
    const all = this.store.getTasks()
    const page = pagination?.page ?? 1
    const pageSize = pagination?.pageSize ?? all.length
    const startIndex = (page - 1) * pageSize
    const items = all.slice(startIndex, startIndex + pageSize)
    return Either.success({
      items,
      total: all.length,
      page,
      pageSize,
    })
  }

  async findById(id: string): Promise<Either<AppError, TaskDTO | null>> {
    const task = this.store.findTaskById(id)
    if (!task) return Either.success(null)
    return Either.success(task)
  }

  async create(task: TaskDTO): Promise<Either<AppError, CreatedTaskResult>> {
    this.store.saveTask(task)
    return Either.success({
      id: task.id,
      updatedAt: task.updatedAt,
    })
  }

  async update(task: TaskDTO): Promise<Either<AppError, UpdatedTaskResult>> {
    this.store.saveTask(task)
    return Either.success({
      id: task.id,
      updatedAt: task.updatedAt,
    })
  }

  async delete(id: string): Promise<Either<AppError, void>> {
    this.store.deleteTask(id)
    return Either.success(undefined)
  }
}
