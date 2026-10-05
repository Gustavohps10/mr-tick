import {
  AppError,
  type CreatedTimeEntryResult,
  createTimeEntrySnapshotPage,
  type DataSourceContext,
  Either,
  type ITimeEntryProvider,
  type PagedResultDTO,
  type PaginationOptionsDTO,
  type TimeEntryCreateIdempotency,
  type TimeEntryDTO,
  type TimeEntryPullCheckpointDTO,
  type TimeEntryPullPageDTO,
  type UpdatedTimeEntryResult,
} from '@mr-tick/sdk'

import { FakeDatabaseStore } from './FakeDatabaseStore'

export class FakeTimeEntryProvider implements ITimeEntryProvider {
  public readonly timeEntryCreateIdempotency: TimeEntryCreateIdempotency =
    'reconcilable'

  private readonly store: FakeDatabaseStore

  constructor(
    private readonly context: DataSourceContext,
    private readonly storageMode: 'exact' | 'redmine' = 'exact',
  ) {
    this.store = FakeDatabaseStore.getInstance()
  }

  async findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    if (this.store.consumeTimeEntryListFailure())
      return Either.failure(
        AppError.Http(503, 'FAKE_TIME_ENTRY_LIST_UNAVAILABLE'),
      )
    const items = this.store.findTimeEntriesByRange(
      memberId,
      startDate,
      endDate,
    )
    if (this.store.consumeTimeEntryPartialList())
      return Either.success({
        items: items.slice(0, 1),
        total: items.length,
        page: 1,
        pageSize: 1,
      })
    return Either.success({
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
    })
  }

  async pull(
    memberId: string,
    checkpoint: TimeEntryPullCheckpointDTO,
    batch: number,
  ): Promise<Either<AppError, TimeEntryPullPageDTO>> {
    this.store.recordTimeEntryPullAttempt()
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))
    const entries = this.store.getTimeEntries()
    const enriched = entries.map((entry) => {
      if (entry.task.id && !entry.taskData) {
        const task = this.store.findTaskById(entry.task.id)
        if (task)
          return {
            ...entry,
            taskData: {
              id: task.id,
              title: task.title,
              tracker: task.tracker,
              status: task.status,
            },
          }
      }
      return entry
    })
    const page = await createTimeEntrySnapshotPage(
      enriched,
      checkpoint,
      batch,
      memberId,
    )
    if (page.isSuccess()) this.store.recordTimeEntryPullPage(page.success.items)
    await this.store.waitForTimeEntryPullRelease()
    return page
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
    this.store.recordTimeEntryFindByIdAttempt()
    if (this.store.consumeCanonicalReadFailure())
      return Either.failure(
        AppError.Http(503, 'FAKE_CANONICAL_READ_UNAVAILABLE'),
      )
    const dto = this.store.findTimeEntryById(id)
    if (!dto) return Either.success(null)
    return Either.success(dto)
  }

  async findByCorrelation(
    correlationId: string,
  ): Promise<Either<AppError, TimeEntryDTO | null>> {
    this.store.recordTimeEntryFindByCorrelationAttempt()
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))

    const dto = this.store.findTimeEntryByCorrelationId(correlationId)
    if (!dto) return Either.success(null)
    return Either.success(dto)
  }

  async create(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, CreatedTimeEntryResult>> {
    this.store.startTimeEntryCreate()
    try {
      await this.store.waitForTimeEntryCreateRelease()
      if (this.store.getSimulateAuthError())
        return Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))

      const remoteId = crypto.randomUUID()
      const stored = this.canonicalState({ ...entry, id: remoteId })
      this.store.saveTimeEntry(stored)
      if (this.store.consumeTimeEntryCreateResponseLoss())
        return Either.failure(AppError.Internal('FAKE_CREATE_RESPONSE_LOST'))

      const saved = this.store.findTimeEntryById(remoteId)
      if (!saved)
        return Either.failure(AppError.Internal('FAKE_STORED_ENTRY_MISSING'))
      return Either.success({
        id: remoteId,
        updatedAt: saved.updatedAt,
        entry: saved,
      })
    } finally {
      this.store.finishTimeEntryCreate()
    }
  }

  async update(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, UpdatedTimeEntryResult>> {
    if (!entry.id)
      return Either.failure(AppError.ValidationError('TIME_ENTRY_ID_MISSING'))
    await this.store.waitForUpdateRelease(entry.id)
    return this.persistUpdate(entry, entry.id)
  }

  async updateConditional(
    entry: TimeEntryDTO,
    expected: TimeEntryDTO,
  ): Promise<Either<AppError, UpdatedTimeEntryResult>> {
    if (!entry.id)
      return Either.failure(AppError.ValidationError('TIME_ENTRY_ID_MISSING'))
    await this.store.waitForUpdateRelease(entry.id)
    const current = this.store.findTimeEntryById(entry.id)
    if (
      !current ||
      current.updatedAt.getTime() !== expected.updatedAt.getTime() ||
      current.task.id !== expected.task.id ||
      current.activity.id !== expected.activity.id ||
      current.user.id !== expected.user.id ||
      current.timeSpent !== expected.timeSpent ||
      current.comments !== expected.comments ||
      current.startDate?.getTime() !== expected.startDate?.getTime() ||
      current.endDate?.getTime() !== expected.endDate?.getTime()
    )
      return Either.failure(AppError.Http(412, 'REMOTE_TIME_ENTRY_CHANGED'))
    // No await between the condition and the write: this fake models server-side CAS.
    return this.persistUpdate(entry, entry.id)
  }

  private persistUpdate(
    entry: TimeEntryDTO,
    id: string,
  ): Either<AppError, UpdatedTimeEntryResult> {
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))
    if (this.store.consumeUpdateFailure(id))
      return Either.failure(
        AppError.Http(
          this.store.getUpdateFailureStatus(),
          'FAKE_TIME_ENTRY_UPDATE_UNAVAILABLE',
        ),
      )
    const stored = this.canonicalState(entry)
    this.store.saveTimeEntry(stored)
    const saved = this.store.findTimeEntryById(id)
    if (!saved)
      return Either.failure(AppError.Internal('FAKE_STORED_ENTRY_MISSING'))
    if (this.store.consumeLegacyUpdateResult(id))
      return Either.success({ id, updatedAt: saved.updatedAt })
    return Either.success({ id, updatedAt: saved.updatedAt, entry: saved })
  }

  private canonicalState(entry: TimeEntryDTO): TimeEntryDTO {
    const stored = { ...entry, updatedAt: new Date() }
    if (
      this.storageMode === 'exact' &&
      !this.store.getLegacyWriteNormalization()
    )
      return stored
    const day = entry.startDate ? entry.startDate : entry.createdAt
    const startDate = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      12,
    )
    const timeSpent = Number(entry.timeSpent.toFixed(2))
    return {
      ...stored,
      startDate,
      timeSpent,
      endDate: new Date(startDate.getTime() + timeSpent * 3600000),
    }
  }

  async delete(id: string): Promise<Either<AppError, void>> {
    this.store.recordTimeEntryDeleteAttempt()
    await this.store.waitForDeleteRelease(id)
    const failureStatus = this.store.consumeDeleteFailure()
    if (failureStatus !== undefined)
      return Either.failure(
        AppError.Http(failureStatus.statusCode, failureStatus.messageKey),
      )
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('TOKEN_EXPIRED'))

    this.store.deleteTimeEntry(id)
    return Either.success(undefined)
  }
}
