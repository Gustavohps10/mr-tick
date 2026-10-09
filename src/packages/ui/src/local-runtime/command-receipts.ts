import type {
  LocalPersistenceCommand,
  LocalRuntimeCommand,
  LocalRuntimeResult,
  LocalTimeEntrySnapshot,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

export type BrowserCommand = LocalRuntimeCommand | LocalPersistenceCommand
export interface CommandReceipt {
  replayed?: boolean
  id: string
  fingerprint: string
  entryId: string
  before: string | null
  after: LocalTimeEntrySnapshot
  status: 'prepared' | 'committed' | 'rejected'
  result: LocalRuntimeResult
}

/** A durable outbox. A successful write means its IndexedDB transaction committed. */
export class BrowserCommandReceipts {
  private readonly database: Promise<IDBDatabase>
  private readonly name: string

  constructor(workspaceId: string) {
    this.name = `mr-tick-command-receipts-${workspaceId}`
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('receipts', { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async get(id: string): Promise<Either<AppError, CommandReceipt | null>> {
    const result = await this.transaction<CommandReceipt | undefined>(
      'readonly',
      (store) => store.get(id),
    )
    if (result.isFailure()) return result.forwardFailure()
    if (result.success === undefined) return Either.success(null)
    return Either.success(result.success)
  }

  async save(receipt: CommandReceipt): Promise<Either<AppError, void>> {
    const result = await this.transaction<IDBValidKey>('readwrite', (store) =>
      store.put(receipt),
    )
    if (result.isFailure()) return result.forwardFailure()
    return Either.success()
  }

  async pending(): Promise<Either<AppError, CommandReceipt[]>> {
    const result = await this.transaction<CommandReceipt[]>(
      'readonly',
      (store) => store.getAll(),
    )
    if (result.isFailure()) return result.forwardFailure()
    return Either.success(
      result.success.filter((receipt) => receipt.status === 'prepared'),
    )
  }

  async close(): Promise<void> {
    const database = await this.database
    database.close()
  }

  async delete(): Promise<void> {
    await this.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () =>
        reject(new Error('COMMAND_RECEIPTS_DELETE_BLOCKED'))
    })
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<Either<AppError, T>> {
    try {
      const database = await this.database
      return await new Promise((resolve) => {
        const transaction = database.transaction('receipts', mode)
        const request = operation(transaction.objectStore('receipts'))
        transaction.oncomplete = () => resolve(Either.success(request.result))
        transaction.onabort = () =>
          resolve(
            Either.failure(
              AppError.Internal(
                transaction.error?.message ??
                  'COMMAND_RECEIPTS_TRANSACTION_ABORTED',
              ),
            ),
          )
        transaction.onerror = () =>
          resolve(
            Either.failure(
              AppError.Internal(
                transaction.error?.message ??
                  'COMMAND_RECEIPTS_TRANSACTION_FAILED',
              ),
            ),
          )
      })
    } catch (error) {
      if (error instanceof Error)
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(
        AppError.Internal('COMMAND_RECEIPTS_STORAGE_FAILURE'),
      )
    }
  }
}

export function recordFingerprint(record: LocalTimeEntrySnapshot): string {
  return JSON.stringify({
    id: record.id,
    connectionInstanceId: record.connectionInstanceId,
    dataSourceId: record.dataSourceId,
    deleted: record._deleted,
    syncStatus: record.syncStatus,
    remoteDeleted: record.remoteDeleted,
    deletionConfirmed: record.deletionConfirmed,
    creationAttemptId: record.creationAttemptId,
    creationState: record.creationState,
    confirmationState: record.confirmationState,
    remoteState: record.remoteState,
    syncError: record.syncError,
    syncFailure: record.syncFailure,
    remoteId: record.remoteId,
    lastPulledAt: record.lastPulledAt,
    lastPushedAt: record.lastPushedAt,
    remoteUpdatedAt: record.remoteUpdatedAt,
    task: record.task,
    taskData: record.taskData,
    activity: record.activity,
    user: record.user,
    startDate: record.startDate,
    endDate: record.endDate,
    timeSpent: record.timeSpent,
    comments: record.comments,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    timeStatus: record.timeStatus,
    source: record.source,
    addonSource: record.addonSource,
    type: record.type,
    conflictData: record.conflictData,
    journal: record.journal,
    timerConfig: record.timerConfig,
  })
}

export function commandFingerprint(command: BrowserCommand): string {
  const keys = new Set<string>()
  JSON.stringify(
    command,
    (
      key: string,
      value: object | string | number | boolean | null | undefined,
    ) => {
      keys.add(key)
      return value
    },
  )
  return JSON.stringify(command, Array.from(keys).sort())
}
