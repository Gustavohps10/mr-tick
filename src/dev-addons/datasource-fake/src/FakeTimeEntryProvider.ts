import {
  AppError,
  type CreatedTimeEntryResult,
  type DataSourceContext,
  Either,
  type ITimeEntryProvider,
  type PagedResultDTO,
  type PaginationOptionsDTO,
  type TimeEntryDTO,
  type UpdatedTimeEntryResult,
} from '@mr-tick/sdk'

import { FakeDatabaseStore } from './FakeDatabaseStore'

export class FakeTimeEntryProvider implements ITimeEntryProvider {
  private readonly store: FakeDatabaseStore

  constructor(private readonly context: DataSourceContext) {
    this.store = FakeDatabaseStore.getInstance()
  }

  async findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    await this.simulateNetworkLatency()
    const items = this.store.findTimeEntriesByRange(
      memberId,
      startDate,
      endDate,
    )
    return Either.success({
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
    })
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
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
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
    return Either.success({
      items,
      total: all.length,
      page,
      pageSize,
    })
  }

  async findById(id: string): Promise<Either<AppError, TimeEntryDTO | null>> {
    const dto = this.store.findTimeEntryById(id)
    if (!dto) return Either.success(null)
    return Either.success(dto)
  }

  async create(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, CreatedTimeEntryResult>> {
    await this.simulateNetworkLatency()
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))

    this.store.saveTimeEntry(entry)
    const resultId = entry.id ? entry.id : crypto.randomUUID()
    return Either.success({
      id: resultId,
      updatedAt: entry.updatedAt ? entry.updatedAt : new Date(),
    })
  }

  async update(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, UpdatedTimeEntryResult>> {
    await this.simulateNetworkLatency()
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))

    this.store.saveTimeEntry(entry)
    const resultId = entry.id ? entry.id : crypto.randomUUID()
    return Either.success({
      id: resultId,
      updatedAt: entry.updatedAt ? entry.updatedAt : new Date(),
    })
  }

  async delete(id: string): Promise<Either<AppError, void>> {
    await this.simulateNetworkLatency()
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))

    this.store.deleteTimeEntry(id)
    return Either.success(undefined)
  }
}
