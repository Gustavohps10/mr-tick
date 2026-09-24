import {
  AppError,
  type CreatedTimeEntryResult,
  type DataSourceContext,
  Either,
  type ITimeEntryProvider,
  type PagedResultDTO,
  type PaginationOptionsDTO,
  TimeEntry,
  type TimeEntryDTO,
  type UpdatedTimeEntryResult,
} from '@mr-tick/sdk'

import { FakeDatabaseStore } from './FakeDatabaseStore'

export class FakeTimeEntryProvider implements ITimeEntryProvider {
  private readonly store: FakeDatabaseStore
  private readonly entityCache: Map<string, TimeEntry> = new Map()

  constructor(private readonly context: DataSourceContext) {
    this.store = FakeDatabaseStore.getInstance()
  }

  async findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PagedResultDTO<TimeEntryDTO>> {
    await this.simulateNetworkLatency()
    const items = this.store.findTimeEntriesByRange(
      memberId,
      startDate,
      endDate,
    )
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
    }
  }

  private async simulateNetworkLatency(ms = 180): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  async pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TimeEntryDTO[]>> {
    await this.simulateNetworkLatency()
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))

    const entries = this.store.pullTimeEntries(
      checkpoint.id,
      checkpoint.updatedAt,
      batch,
    )
    return Either.success(entries)
  }

  async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<TimeEntryDTO>> {
    const all = this.store.getTimeEntries()
    let page = 1
    if (pagination && pagination.page) {
      page = pagination.page
    }
    let pageSize = all.length
    if (pagination && pagination.pageSize) {
      pageSize = pagination.pageSize
    }
    const startIndex = (page - 1) * pageSize
    const items = all.slice(startIndex, startIndex + pageSize)
    return {
      items,
      total: all.length,
      page,
      pageSize,
    }
  }

  async findById(id: string): Promise<TimeEntry | undefined> {
    const cached = this.entityCache.get(id)
    if (cached) {
      return cached
    }
    const dto = this.store.findTimeEntryById(id)
    if (!dto) {
      return undefined
    }
    let finalId = id
    if (dto.id) {
      finalId = dto.id
    }
    const entity = TimeEntry.hydrate({
      id: finalId,
      task: { id: dto.task.id },
      activity: { id: dto.activity.id, name: dto.activity.name },
      user: { id: dto.user.id, name: dto.user.name },
      timeSpent: dto.timeSpent,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      startDate: dto.startDate,
      endDate: dto.endDate,
      comments: dto.comments,
    })
    this.entityCache.set(id, entity)
    return entity
  }

  async create(entity: TimeEntry): Promise<CreatedTimeEntryResult | void> {
    await this.simulateNetworkLatency()
    if (this.store.getSimulateAuthError()) {
      throw new Error('401 Unauthorized: TOKEN_EXPIRED')
    }
    if (entity.id) {
      this.entityCache.set(entity.id, entity)
    }
    this.store.saveTimeEntryFromEntity(entity)
    return {
      id: entity.id,
      updatedAt: entity.updatedAt,
    }
  }

  async update(entity: TimeEntry): Promise<UpdatedTimeEntryResult | void> {
    await this.simulateNetworkLatency()
    if (this.store.getSimulateAuthError()) {
      throw new Error('401 Unauthorized: TOKEN_EXPIRED')
    }
    if (entity.id) {
      this.entityCache.set(entity.id, entity)
    }
    this.store.saveTimeEntryFromEntity(entity)
    return {
      id: entity.id,
      updatedAt: entity.updatedAt,
    }
  }

  async delete(id: string): Promise<void> {
    await this.simulateNetworkLatency()
    this.entityCache.delete(id)
    this.store.deleteTimeEntry(id)
  }
}
