import type {
  CoreCacheQuery,
  CoreCacheValue,
  CoreTask,
  ILocalWorkspaceExecutor,
  LocalPersistenceCommand,
  LocalPersistenceResponse,
  LocalRuntimeCommand,
  LocalRuntimeQuery,
  LocalRuntimeResult,
} from '@mr-tick/application'
import {
  emptyResult,
  planLocalRuntimeCommand,
  resultFor,
  toPublicRecord,
} from '@mr-tick/application/local-runtime'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { MangoQuery } from 'rxdb'
import type { StoreApi } from 'zustand'

import type { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import type { SyncStore } from '@/stores/sync-store/types'

import {
  type BrowserCommand,
  BrowserCommandReceipts,
  commandFingerprint,
  type CommandReceipt,
  recordFingerprint,
} from './command-receipts'

export class BrowserWorkspaceExecutor implements ILocalWorkspaceExecutor {
  private tail: Promise<void> = Promise.resolve()
  constructor(
    readonly workspaceId: string,
    readonly store: StoreApi<SyncStore>,
    private readonly receipts: BrowserCommandReceipts,
    private readonly authorize: (
      input: BrowserCommand,
      before: import('@mr-tick/application').LocalTimeEntrySnapshot | null,
    ) => Promise<Either<AppError, BrowserCommand>>,
  ) {}

  queryCore(
    input: CoreCacheQuery,
    dataSourceId: string,
  ): Promise<Either<AppError, CoreCacheValue>> {
    return this.serial(async () => {
      try {
        const db = this.store.getState().db
        if (db === null)
          return Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE'))
        if (input.action === 'metadata') {
          const documents = await db.metadata
            .find({
              selector: {
                connectionInstanceId: input.connectionInstanceId,
                dataSourceId,
              },
              limit: 2,
            })
            .exec()
          if (documents.length === 0)
            return Either.failure(
              AppError.Http(503, 'CORE_METADATA_UNAVAILABLE'),
            )
          if (documents.length !== 1)
            return Either.failure(AppError.Http(409, 'CORE_METADATA_AMBIGUOUS'))
          for (const document of documents) {
            const record = document.toMutableJSON()
            return Either.success({
              kind: 'metadata',
              metadata: {
                workspaceId: input.workspaceId,
                connectionInstanceId: input.connectionInstanceId,
                dataSourceId,
                lastPulledAt: record.lastPulledAt,
                values: {
                  activities: record.activities,
                  taskStatuses: record.taskStatuses,
                  taskPriorities: record.taskPriorities,
                  trackStatuses: record.trackStatuses,
                  participantRoles: record.participantRoles,
                  estimationTypes: record.estimationTypes,
                },
              },
            })
          }
        }
        if (input.action === 'task') {
          const document = await db.tasks
            .findOne({
              selector: {
                connectionInstanceId: input.connectionInstanceId,
                sourceId: input.taskId,
                dataSourceId,
              },
            })
            .exec()
          if (document === null)
            return Either.failure(AppError.NotFound('TASK_NOT_FOUND'))
          return Either.success({
            kind: 'task',
            task: toCoreTask(input.workspaceId, document.toMutableJSON()),
          })
        }
        if (input.action !== 'tasks')
          return Either.failure(AppError.Internal('CORE_QUERY_INVALID'))
        const query: MangoQuery<SyncTaskRxDBDTO> = {
          selector: {
            connectionInstanceId: input.connectionInstanceId,
            dataSourceId,
          },
          sort: [{ sourceId: 'asc' }],
          limit: input.limit + 1,
        }
        if (input.search !== undefined && input.search.length > 0) {
          const literal = input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          query.selector = {
            ...query.selector,
            $or: [
              { title: { $regex: literal, $options: 'i' } },
              { sourceId: { $regex: literal, $options: 'i' } },
            ],
          }
        }
        const documents = await db.tasks.find(query).exec()
        return Either.success({
          kind: 'tasks',
          tasks: documents
            .slice(0, input.limit)
            .map((document) =>
              toCoreTask(input.workspaceId, document.toMutableJSON()),
            ),
          hasMore: documents.length > input.limit,
        })
      } catch (error) {
        if (error instanceof Error)
          return Either.failure(AppError.Internal(error.message))
        return Either.failure(AppError.Internal('CORE_CACHE_READ_FAILED'))
      }
    })
  }

  execute(
    input: LocalRuntimeCommand,
  ): Promise<Either<AppError, LocalRuntimeResult>> {
    return this.serial(async () => {
      const committed = await this.mutate(input)
      if (committed.isFailure()) return committed.forwardFailure()
      return Either.success({
        ...committed.success.result,
        replayed: committed.success.replayed === true,
      })
    })
  }

  query(
    input: LocalRuntimeQuery,
  ): Promise<Either<AppError, LocalRuntimeResult>> {
    return this.serial(async () => {
      try {
        const db = this.store.getState().db
        if (!db)
          return Either.failure(
            AppError.Http(503, 'WORKSPACE_DATABASE_UNAVAILABLE'),
          )
        if (input.action === 'get') {
          const document = await db.timeEntries.findOne(input.entryId).exec()
          if (!document) return Either.success(emptyResult())
          return Either.success(resultFor(document.toMutableJSON(true)))
        }
        const documents = await db.timeEntries.find().exec()
        const records = documents.map((document) =>
          document.toMutableJSON(true),
        )
        if (input.action === 'timerState') {
          const active = records.filter(
            (record) =>
              record.timeStatus === 'running' || record.timeStatus === 'paused',
          )
          if (active.length > 1)
            return Either.failure(AppError.Http(409, 'MULTIPLE_ACTIVE_TIMERS'))
          for (const record of active) return Either.success(resultFor(record))
          return Either.success(emptyResult())
        }
        const entries = records
          .filter((record) => {
            const filter = input.filter
            if (
              filter.connectionInstanceId !== undefined &&
              record.connectionInstanceId !== filter.connectionInstanceId
            )
              return false
            if (filter.taskId !== undefined && record.task.id !== filter.taskId)
              return false
            if (filter.source !== undefined && record.source !== filter.source)
              return false
            if (
              filter.startDate !== undefined &&
              record.startDate < filter.startDate
            )
              return false
            if (
              filter.endDate !== undefined &&
              record.startDate > filter.endDate
            )
              return false
            return true
          })
          .map((record) => toPublicRecord(record))
        return Either.success({ ...emptyResult(), entries })
      } catch (error) {
        if (error instanceof Error)
          return Either.failure(AppError.Internal(error.message))
        return Either.failure(AppError.Internal('LOCAL_QUERY_FAILED'))
      }
    })
  }

  requestInternal(
    input: LocalPersistenceCommand,
  ): Promise<LocalPersistenceResponse> {
    return this.serial(async () => {
      if (
        !input.commandId.trim() ||
        !input.entryId.trim() ||
        input.workspaceId !== this.workspaceId
      )
        return {
          ok: false,
          error: { messageKey: 'INVALID_COMMAND_SCOPE', statusCode: 422 },
        }
      const committed = await this.mutate(input)
      if (committed.isFailure())
        return {
          ok: false,
          error: {
            messageKey: committed.failure.messageKey,
            statusCode: committed.failure.statusCode,
          },
        }
      const record = committed.success.after
      if (record._deleted)
        return {
          ok: true,
          record: null,
          replayed: committed.success.replayed === true,
        }
      return { ok: true, record, replayed: committed.success.replayed === true }
    })
  }

  async recover(): Promise<Either<AppError, void>> {
    const pending = await this.receipts.pending()
    if (pending.isFailure()) return pending.forwardFailure()
    for (const receipt of pending.success) {
      const result = await this.commitReceipt(receipt)
      if (result.isFailure()) {
        const stored = await this.receipts.get(receipt.id)
        if (stored.isSuccess() && stored.success?.status === 'rejected')
          continue
        return result.forwardFailure()
      }
    }
    return Either.success()
  }

  async close(): Promise<Either<AppError, void>> {
    await this.tail
    try {
      await this.store.getState().destroy()
      await this.receipts.close()
      return Either.success()
    } catch (error) {
      if (error instanceof Error)
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal('WORKSPACE_CLOSE_FAILED'))
    }
  }

  serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async mutate(
    input: BrowserCommand,
  ): Promise<Either<AppError, CommandReceipt>> {
    try {
      const recovery = await this.recover()
      if (recovery.isFailure()) return recovery.forwardFailure()
      const saved = await this.receipts.get(input.commandId)
      if (saved.isFailure()) return saved.forwardFailure()
      const fingerprint = commandFingerprint(input)
      if (saved.success) {
        if (saved.success.fingerprint !== fingerprint)
          return Either.failure(
            AppError.Http(409, 'COMMAND_ID_PAYLOAD_MISMATCH'),
          )
        if (saved.success.status === 'committed')
          return Either.success({ ...saved.success, replayed: true })
        if (saved.success.status === 'rejected')
          return Either.failure(AppError.Http(409, 'COMMAND_STATE_CHANGED'))
        return this.commitReceipt(saved.success)
      }
      const db = this.store.getState().db
      if (!db)
        return Either.failure(
          AppError.Http(503, 'WORKSPACE_DATABASE_UNAVAILABLE'),
        )
      const document = await db.timeEntries.findOne(input.entryId).exec()
      const before = document ? document.toMutableJSON(true) : null
      let hasActiveTimer = false
      if (input.action === 'timerStart') {
        const active = await db.timeEntries
          .find({ selector: { timeStatus: { $in: ['running', 'paused'] } } })
          .exec()
        hasActiveTimer = active.length > 0
      }
      const authorized = await this.authorize(input, before)
      if (authorized.isFailure()) return authorized.forwardFailure()
      const planned = planLocalRuntimeCommand(
        authorized.success,
        before,
        new Date().toISOString(),
        hasActiveTimer,
      )
      if (planned.isFailure()) return planned.forwardFailure()
      const receipt: CommandReceipt = {
        id: input.commandId,
        fingerprint,
        entryId: input.entryId,
        before: before === null ? null : recordFingerprint(before),
        after: { ...planned.success, lastLocalCommandId: input.commandId },
        status: 'prepared',
        result: resultFor(planned.success),
      }
      const prepared = await this.receipts.save(receipt)
      if (prepared.isFailure()) return prepared.forwardFailure()
      return this.commitReceipt(receipt)
    } catch (error) {
      if (error instanceof Error)
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal('LOCAL_MUTATION_FAILED'))
    }
  }

  private async commitReceipt(
    receipt: CommandReceipt,
  ): Promise<Either<AppError, CommandReceipt>> {
    const db = this.store.getState().db
    if (!db)
      return Either.failure(
        AppError.Http(503, 'WORKSPACE_DATABASE_UNAVAILABLE'),
      )
    const document = await db.timeEntries.findOne(receipt.entryId).exec()
    if (!document) {
      if (receipt.after._deleted) return this.confirmReceipt(receipt)
      if (receipt.before !== null) return this.rejectReceipt(receipt)
      await db.timeEntries.insert(receipt.after)
      return this.confirmReceipt(receipt)
    }
    const current = document.toMutableJSON(true)
    if (current.lastLocalCommandId === receipt.id)
      return this.confirmReceipt(receipt)
    if (recordFingerprint(current) === recordFingerprint(receipt.after))
      return this.confirmReceipt(receipt)
    if (
      receipt.before === null ||
      recordFingerprint(current) !== receipt.before
    )
      return this.rejectReceipt(receipt)
    const updated = await document.incrementalModify((latest) => {
      if (recordFingerprint(latest) !== receipt.before) return latest
      return receipt.after
    })
    if (updated.lastLocalCommandId !== receipt.id)
      return this.rejectReceipt(receipt)
    return this.confirmReceipt(receipt)
  }

  private async rejectReceipt(
    receipt: CommandReceipt,
  ): Promise<Either<AppError, CommandReceipt>> {
    const rejected = await this.receipts.save({
      ...receipt,
      status: 'rejected',
    })
    if (rejected.isFailure()) return rejected.forwardFailure()
    return Either.failure(AppError.Http(409, 'COMMAND_STATE_CHANGED'))
  }

  private async confirmReceipt(
    receipt: CommandReceipt,
  ): Promise<Either<AppError, CommandReceipt>> {
    const committed: CommandReceipt = { ...receipt, status: 'committed' }
    const stored = await this.receipts.save(committed)
    if (stored.isFailure()) return stored.forwardFailure()
    return Either.success(committed)
  }
}

function toCoreTask(workspaceId: string, record: SyncTaskRxDBDTO): CoreTask {
  const task: CoreTask = {
    workspaceId,
    connectionInstanceId: record.connectionInstanceId,
    taskId: record.sourceId,
    dataSourceId: record.dataSourceId,
    title: record.title,
    status: { ...record.status },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
  if (record.description !== undefined && record.description !== null)
    task.description = record.description
  if (record.url !== undefined && record.url !== null) task.url = record.url
  if (record.projectName !== undefined && record.projectName !== null)
    task.projectName = record.projectName
  return task
}
