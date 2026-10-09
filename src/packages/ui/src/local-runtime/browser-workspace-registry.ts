import type {
  IHostBridge,
  ILocalRuntimeEvents,
  ILocalWorkspaceFactory,
  LocalPersistenceCommand,
  LocalPersistenceResponse,
  LocalRuntimeSyncStatus,
  LocalSyncRequest,
  LocalSyncResponse,
  LocalTimeEntrySnapshot,
} from '@mr-tick/application'
import { LocalRuntime } from '@mr-tick/application/local-runtime'
import {
  AppError,
  Either,
  isNonEmptyString,
  isRecord,
} from '@mr-tick/shared/helpers'
import { removeRxDatabase } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'

import { createSyncStore } from '@/stores/sync-store/createSyncStore'
import { getReplicationFailures } from '@/stores/sync-store/ReplicationError'
import {
  ensurePlugins,
  getDatabaseName,
  removeDatabaseFromCache,
} from '@/stores/sync-store/storage'

import { BrowserWorkspaceExecutor } from './browser-workspace-executor'
import { type BrowserCommand, BrowserCommandReceipts } from './command-receipts'

export interface BrowserRuntimeBridge extends Pick<
  IHostBridge,
  'tasks' | 'metadata' | 'timeEntries'
> {
  workspaces: Pick<IHostBridge['workspaces'], 'getById' | 'listAll'>
  events: Pick<IHostBridge['events'], 'emit'>
}

export interface BrowserRuntimeOptions {
  isDevelopment: boolean
  useMemoryStorage: boolean
  retryTime?: number
}

type ForgetWorkspace = (
  workspaceId: string,
  dispose: () => Promise<Either<AppError, void>>,
) => Promise<Either<AppError, void>>

export class BrowserWorkspaceRegistry implements ILocalWorkspaceFactory {
  private stopping = false
  private readonly workspaces = new Map<string, BrowserWorkspaceExecutor>()
  private readonly openings = new Map<
    string,
    Promise<Either<AppError, BrowserWorkspaceExecutor>>
  >()
  private readonly maintenance = new Map<string, Promise<LocalSyncResponse>>()
  private readonly remoteOperations = new Map<string, Promise<void>>()
  private readonly statusSubscriptions = new Map<string, () => void>()
  private readonly receipts = new Map<string, BrowserCommandReceipts>()

  constructor(
    private readonly bridge: BrowserRuntimeBridge,
    private readonly options: BrowserRuntimeOptions,
  ) {}

  open(
    workspaceId: string,
  ): Promise<Either<AppError, BrowserWorkspaceExecutor>> {
    if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0)
      return Promise.resolve(
        Either.failure(AppError.ValidationError('WORKSPACE_REQUIRED')),
      )
    if (this.stopping)
      return Promise.resolve(
        Either.failure(AppError.Http(503, 'RUNTIME_STOPPING')),
      )
    if (this.maintenance.has(workspaceId))
      return Promise.resolve(
        Either.failure(AppError.Http(503, 'WORKSPACE_MAINTENANCE')),
      )
    const existing = this.workspaces.get(workspaceId)
    if (existing !== undefined) return Promise.resolve(Either.success(existing))
    const pending = this.openings.get(workspaceId)
    if (pending !== undefined) return pending
    const opening = this.initialize(workspaceId)
    this.openings.set(workspaceId, opening)
    void opening.then(
      () => this.openings.delete(workspaceId),
      () => this.openings.delete(workspaceId),
    )
    return opening
  }

  async start(): Promise<Either<AppError, void>> {
    try {
      const response = await this.bridge.workspaces.listAll()
      if (!response.isSuccess) {
        if (response.error !== undefined)
          return Either.failure(
            AppError.Http(response.statusCode, response.error),
          )
        return Either.failure(
          AppError.Http(response.statusCode, 'WORKSPACE_LIST_FAILED'),
        )
      }
      if (response.data === undefined)
        return Either.failure(AppError.Internal('WORKSPACE_LIST_MISSING'))
      for (const workspace of response.data) {
        const opened = await this.open(workspace.id)
        if (opened.isFailure()) return opened.forwardFailure()
      }
      return Either.success()
    } catch (error) {
      if (error instanceof Error) return runtimeFailure(error)
      return Either.failure(AppError.Internal('LOCAL_RUNTIME_FAILURE'))
    }
  }

  async requestInternal(
    input: LocalPersistenceCommand,
  ): Promise<LocalPersistenceResponse> {
    if (!isRecord(input) || !isNonEmptyString(input.workspaceId))
      return {
        ok: false,
        error: { messageKey: 'WORKSPACE_REQUIRED', statusCode: 422 },
      }
    if (!isNonEmptyString(input.commandId) || !isNonEmptyString(input.entryId))
      return {
        ok: false,
        error: { messageKey: 'COMMAND_IDENTITY_REQUIRED', statusCode: 422 },
      }
    try {
      const opened = await this.open(input.workspaceId)
      if (opened.isFailure())
        return {
          ok: false,
          error: {
            messageKey: opened.failure.messageKey,
            statusCode: opened.failure.statusCode,
          },
        }
      const admission = this.admissionError(input.workspaceId)
      if (admission !== null)
        return {
          ok: false,
          error: {
            messageKey: admission.messageKey,
            statusCode: admission.statusCode,
          },
        }
      const db = opened.success.store.getState().db
      let before: LocalTimeEntrySnapshot | null = null
      if (db !== null) {
        const stored = await db.timeEntries.findOne(input.entryId).exec()
        if (stored !== null) before = stored.toMutableJSON()
      }
      const beforeMutation = this.admissionError(input.workspaceId)
      if (beforeMutation !== null)
        return {
          ok: false,
          error: {
            messageKey: beforeMutation.messageKey,
            statusCode: beforeMutation.statusCode,
          },
        }
      const response = await opened.success.requestInternal(input)
      if (response.ok && !response.replayed) {
        await this.publishTimerProjection(
          input.workspaceId,
          projectionAction(before, response.record),
          input.entryId,
        )
        this.safeEmit('local-runtime:persistence-committed', {
          workspaceId: input.workspaceId,
          command: input,
          record: response.record,
        })
      }
      return response
    } catch (error) {
      if (error instanceof Error)
        return {
          ok: false,
          error: { messageKey: error.message, statusCode: 500 },
        }
      return {
        ok: false,
        error: { messageKey: 'LOCAL_PERSISTENCE_FAILED', statusCode: 500 },
      }
    }
  }

  async requestSync(
    input: LocalSyncRequest,
    forgetWorkspace: ForgetWorkspace,
  ): Promise<LocalSyncResponse> {
    const validation = validateSyncRequest(input)
    if (validation.isFailure()) return syncFailure(validation.failure)
    if (this.stopping)
      return syncFailure(AppError.Http(503, 'RUNTIME_STOPPING'))
    if (input.action === 'drop' || input.action === 'reset') {
      if (this.maintenance.has(input.workspaceId))
        return syncFailure(AppError.Http(409, 'WORKSPACE_MAINTENANCE'))
      const operation = this.replaceWorkspace(input, forgetWorkspace)
      this.maintenance.set(input.workspaceId, operation)
      try {
        return await operation
      } finally {
        this.maintenance.delete(input.workspaceId)
      }
    }
    const opened = await this.open(input.workspaceId)
    if (opened.isFailure()) return syncFailure(opened.failure)
    if (this.stopping)
      return syncFailure(AppError.Http(503, 'RUNTIME_STOPPING'))
    if (this.maintenance.has(input.workspaceId))
      return syncFailure(AppError.Http(503, 'WORKSPACE_MAINTENANCE'))
    if (input.action === 'status')
      return {
        ok: true,
        statuses: serializeSyncStatuses(
          opened.success.store.getState().statuses,
        ),
      }
    return this.remoteSerial(input.workspaceId, async () => {
      const store = opened.success.store.getState()
      try {
        switch (input.action) {
          case 'status':
            return { ok: true, statuses: serializeSyncStatuses(store.statuses) }
          case 'connect': {
            if (
              input.connectionInstanceId === undefined ||
              input.dataSourceId === undefined
            )
              return syncFailure(
                AppError.ValidationError('CONNECTION_CONTEXT_REQUIRED'),
              )
            const workspace = await this.bridge.workspaces.getById({
              body: { workspaceId: input.workspaceId },
            })
            if (!workspace.isSuccess) {
              if (workspace.error !== undefined)
                return syncFailure(
                  AppError.Http(workspace.statusCode, workspace.error),
                )
              return syncFailure(AppError.NotFound('WORKSPACE_NOT_FOUND'))
            }
            if (workspace.data === undefined)
              return syncFailure(AppError.NotFound('WORKSPACE_NOT_FOUND'))
            const connection = workspace.data.dataSourceConnections.find(
              (item) =>
                item.id === input.connectionInstanceId &&
                item.dataSourceId === input.dataSourceId,
            )
            if (connection === undefined || connection.status !== 'connected')
              return syncFailure(AppError.Http(409, 'CONNECTION_NOT_CONNECTED'))
            await store.connectDataSource({
              connectionInstanceId: input.connectionInstanceId,
              dataSourceId: input.dataSourceId,
            })
            return { ok: true }
          }
          case 'disconnect': {
            if (input.connectionInstanceId === undefined)
              return syncFailure(
                AppError.ValidationError('CONNECTION_REQUIRED'),
              )
            await store.disconnectDataSource(input.connectionInstanceId)
            return { ok: true }
          }
          case 'forceSync':
            await store.forceSync(input.connectionInstanceId, input.direction)
            return { ok: true }
          case 'reconcile':
            await store.reconcile(input.connectionInstanceId, input.windowDays)
            return { ok: true }
          case 'drop':
          case 'reset':
            return syncFailure(
              AppError.Http(409, 'WORKSPACE_MAINTENANCE_REQUIRED'),
            )
        }
      } catch (error) {
        if (error instanceof Error)
          return syncFailure(runtimeFailure(error).failure)
        return syncFailure(AppError.Internal('LOCAL_SYNC_FAILED'))
      }
    })
  }

  async quiesce(): Promise<void> {
    this.stopping = true
    await Promise.all(this.maintenance.values())
    await Promise.all(this.openings.values())
    await Promise.all(this.remoteOperations.values())
  }

  async close(): Promise<Either<AppError, void>> {
    await this.quiesce()
    let failure: AppError | null = null
    for (const workspaceId of this.workspaces.keys()) {
      const result = await this.releaseWorkspace(workspaceId)
      if (result.isFailure() && failure === null) failure = result.failure
    }
    this.workspaces.clear()
    if (failure !== null) return Either.failure(failure)
    return Either.success()
  }

  async publishTimerProjection(
    workspaceId: string,
    action: string,
    entryId?: string,
  ): Promise<void> {
    const executor = this.workspaces.get(workspaceId)
    if (executor === undefined) return
    try {
      const result = await executor.query({ action: 'timerState', workspaceId })
      if (result.isFailure()) return
      const db = executor.store.getState().db
      let contextId = entryId
      if (contextId === undefined && result.success.entry !== null)
        contextId = result.success.entry.id
      let context: LocalTimeEntrySnapshot | null = null
      if (db !== null && contextId !== undefined) {
        const stored = await db.timeEntries.findOne(contextId).exec()
        if (stored !== null) context = stored.toMutableJSON()
      }
      let taskName = context?.taskData?.title
      if (
        taskName === undefined &&
        context !== null &&
        db !== null &&
        context.task.id.length > 0
      ) {
        const task = await db.tasks
          .findOne({
            selector: {
              connectionInstanceId: context.connectionInstanceId,
              sourceId: context.task.id,
            },
          })
          .exec()
        if (task !== null) taskName = task.title
      }
      this.safeEmit('local-runtime:timer-projection', {
        workspaceId,
        timer: result.success.timer,
        entryId: contextId,
        taskName,
        taskId: context?.task.id,
        comments: context?.comments,
        action,
      })
    } catch (error) {
      console.error('[LocalRuntime] Timer projection failed:', error)
    }
  }

  private async replaceWorkspace(
    input: LocalSyncRequest,
    forgetWorkspace: ForgetWorkspace,
  ): Promise<LocalSyncResponse> {
    try {
      const opening = this.openings.get(input.workspaceId)
      if (opening !== undefined) await opening
      const forgotten = await forgetWorkspace(input.workspaceId, async () => {
        const closed = await this.releaseWorkspace(input.workspaceId)
        if (closed.isFailure()) return closed.forwardFailure()
        await ensurePlugins(this.options.isDevelopment)
        const dbName = getDatabaseName(
          input.workspaceId,
          this.options.useMemoryStorage,
        )
        removeDatabaseFromCache(
          input.workspaceId,
          this.options.useMemoryStorage,
        )
        if (this.options.useMemoryStorage)
          await removeRxDatabase(dbName, getRxStorageMemory(), false)
        if (!this.options.useMemoryStorage)
          await removeRxDatabase(dbName, getRxStorageDexie(), false)
        const journal = new BrowserCommandReceipts(input.workspaceId)
        await journal.delete()
        return Either.success()
      })
      if (forgotten.isFailure()) return syncFailure(forgotten.failure)
      this.safeEmit('local-runtime:sync-status', {
        workspaceId: input.workspaceId,
        statuses: [],
      })
      if (input.action === 'drop') return { ok: true }
      if (this.stopping)
        return syncFailure(AppError.Http(503, 'RUNTIME_STOPPING'))
      const opened = await this.initialize(input.workspaceId)
      if (opened.isFailure()) return syncFailure(opened.failure)
      return {
        ok: true,
        statuses: serializeSyncStatuses(
          opened.success.store.getState().statuses,
        ),
      }
    } catch (error) {
      if (error instanceof Error)
        return syncFailure(runtimeFailure(error).failure)
      return syncFailure(AppError.Internal('LOCAL_SYNC_FAILED'))
    }
  }

  private admissionError(workspaceId: string): AppError | null {
    if (this.stopping) return AppError.Http(503, 'RUNTIME_STOPPING')
    if (this.maintenance.has(workspaceId))
      return AppError.Http(503, 'WORKSPACE_MAINTENANCE')
    return null
  }
  private remoteSerial(
    workspaceId: string,
    operation: () => Promise<LocalSyncResponse>,
  ): Promise<LocalSyncResponse> {
    let previous = this.remoteOperations.get(workspaceId)
    if (previous === undefined) previous = Promise.resolve()
    const result = previous.then(operation)
    const settled = result.then(
      () => undefined,
      () => undefined,
    )
    this.remoteOperations.set(workspaceId, settled)
    void settled.then(() => {
      if (this.remoteOperations.get(workspaceId) === settled)
        this.remoteOperations.delete(workspaceId)
    })
    return result
  }
  private async releaseWorkspace(
    workspaceId: string,
  ): Promise<Either<AppError, void>> {
    await this.remoteOperations.get(workspaceId)
    const unsubscribe = this.statusSubscriptions.get(workspaceId)
    this.statusSubscriptions.delete(workspaceId)
    if (unsubscribe !== undefined) unsubscribe()
    const executor = this.workspaces.get(workspaceId)
    this.workspaces.delete(workspaceId)
    const receipts = this.receipts.get(workspaceId)
    this.receipts.delete(workspaceId)
    let failure: AppError | null = null
    if (executor !== undefined) {
      const closed = await executor.close()
      if (closed.isFailure()) failure = closed.failure
    }
    if (receipts !== undefined) {
      try {
        await receipts.close()
      } catch (error) {
        if (failure === null && error instanceof Error)
          failure = AppError.Internal(error.message)
        if (failure === null)
          failure = AppError.Internal('WORKSPACE_CLOSE_FAILED')
      }
    }
    if (failure !== null) return Either.failure(failure)
    return Either.success()
  }

  private safeEmit(channel: string, payload: object): void {
    try {
      this.bridge.events.emit(channel, payload)
    } catch (error) {
      console.error('[LocalRuntime] Event delivery failed:', channel, error)
    }
  }
  private async authorize(
    input: BrowserCommand,
    before: LocalTimeEntrySnapshot | null,
  ): Promise<Either<AppError, BrowserCommand>> {
    if (input.action === 'insertRecord') {
      if (input.record.id !== input.entryId || input.record._deleted)
        return Either.failure(AppError.ValidationError('INVALID_INSERT_RECORD'))
      return Either.success(input)
    }
    if (input.action === 'editRecord') {
      if (input.changes.id !== undefined && input.changes.id !== input.entryId)
        return Either.failure(AppError.ValidationError('ENTRY_ID_IMMUTABLE'))
      return Either.success(input)
    }
    if (
      input.action !== 'create' &&
      input.action !== 'suggest' &&
      input.action !== 'timerStart' &&
      input.action !== 'update'
    )
      return Either.success(input)
    let connectionInstanceId = input.payload.connectionInstanceId
    if (connectionInstanceId === undefined && before !== null)
      connectionInstanceId = before.connectionInstanceId
    if (connectionInstanceId === undefined || connectionInstanceId === '') {
      if (input.payload.dataSourceId)
        return Either.failure(
          AppError.ValidationError('DATASOURCE_WITHOUT_CONNECTION'),
        )
      if (input.action === 'update') return Either.success(input)
      if (input.action === 'timerStart')
        return Either.success({
          ...input,
          payload: {
            ...input.payload,
            connectionInstanceId: '',
            dataSourceId: '',
            userId: '',
          },
        })
      return Either.success({
        ...input,
        payload: {
          ...input.payload,
          connectionInstanceId: '',
          dataSourceId: '',
          userId: '',
        },
      })
    }
    const response = await this.bridge.workspaces.getById({
      body: { workspaceId: input.workspaceId },
    })
    if (!response.isSuccess || response.data === undefined)
      return Either.failure(AppError.NotFound('WORKSPACE_NOT_FOUND'))
    const connection = response.data.dataSourceConnections.find(
      (item) => item.id === connectionInstanceId,
    )
    if (connection === undefined)
      return Either.failure(
        AppError.ValidationError('CONNECTION_NOT_IN_WORKSPACE'),
      )
    if (
      input.payload.dataSourceId !== undefined &&
      input.payload.dataSourceId !== connection.dataSourceId
    )
      return Either.failure(
        AppError.ValidationError('DATASOURCE_CONTEXT_MISMATCH'),
      )
    if (input.action === 'update')
      return Either.success({
        ...input,
        payload: { ...input.payload, dataSourceId: connection.dataSourceId },
      })
    let userId = input.payload.userId
    let userName = input.payload.userName
    if (userId === undefined) {
      if (connection.member === undefined)
        return Either.failure(AppError.ValidationError('USER_CONTEXT_REQUIRED'))
      userId = connection.member.id
      userName = connection.member.name
    }
    if (input.action === 'timerStart')
      return Either.success({
        ...input,
        payload: {
          ...input.payload,
          dataSourceId: connection.dataSourceId,
          userId,
          userName,
        },
      })
    return Either.success({
      ...input,
      payload: {
        ...input.payload,
        dataSourceId: connection.dataSourceId,
        userId,
        userName,
      },
    })
  }
  private async initialize(
    workspaceId: string,
  ): Promise<Either<AppError, BrowserWorkspaceExecutor>> {
    let store: ReturnType<typeof createSyncStore> | null = null
    let executor: BrowserWorkspaceExecutor | null = null
    let receipts: BrowserCommandReceipts | null = null
    let published = false
    try {
      const response = await this.bridge.workspaces.getById({
        body: { workspaceId },
      })
      if (!response.isSuccess) {
        if (response.error !== undefined)
          return Either.failure(
            AppError.Http(response.statusCode, response.error),
          )
        return Either.failure(AppError.NotFound('WORKSPACE_NOT_FOUND'))
      }
      if (response.data === undefined)
        return Either.failure(AppError.NotFound('WORKSPACE_NOT_FOUND'))
      store = createSyncStore(
        workspaceId,
        this.bridge,
        this.options.isDevelopment,
        this.options.useMemoryStorage,
        this.options.retryTime,
      )
      await store.getState().init()
      if (!store.getState().isInitialized || store.getState().db === null)
        return Either.failure(
          AppError.Http(503, 'WORKSPACE_DATABASE_UNAVAILABLE'),
        )
      receipts = new BrowserCommandReceipts(workspaceId)
      executor = new BrowserWorkspaceExecutor(
        workspaceId,
        store,
        receipts,
        (input, before) => this.authorize(input, before),
      )
      const recovered = await executor.recover()
      if (recovered.isFailure()) return recovered.forwardFailure()
      for (const connection of response.data.dataSourceConnections) {
        if (connection.status !== 'connected') continue
        await store.getState().connectDataSource({
          connectionInstanceId: connection.id,
          dataSourceId: connection.dataSourceId,
        })
      }
      if (this.stopping)
        return Either.failure(AppError.Http(503, 'RUNTIME_STOPPING'))
      this.workspaces.set(workspaceId, executor)
      this.receipts.set(workspaceId, receipts)
      const unsubscribe = store.subscribe((state) => {
        this.safeEmit('local-runtime:sync-status', {
          workspaceId,
          statuses: serializeSyncStatuses(state.statuses),
        })
      })
      this.statusSubscriptions.set(workspaceId, unsubscribe)
      published = true
      await this.publishTimerProjection(workspaceId, 'restore')
      return Either.success(executor)
    } catch (error) {
      if (error instanceof Error) return runtimeFailure(error)
      return Either.failure(AppError.Internal('LOCAL_RUNTIME_FAILURE'))
    } finally {
      if (!published) {
        if (executor !== null)
          await executor.close().catch((error: Error) => {
            console.error(
              '[LocalRuntime] Failed executor cleanup:',
              error.message,
            )
          })
        if (executor === null && store !== null)
          await store
            .getState()
            .destroy()
            .catch((error: Error) => {
              console.error(
                '[LocalRuntime] Failed storage cleanup:',
                error.message,
              )
            })
        if (receipts !== null)
          await receipts.close().catch((error: Error) => {
            console.error(
              '[LocalRuntime] Failed initialization cleanup:',
              error.message,
            )
          })
      }
    }
  }
}

export function createBrowserLocalRuntime(
  bridge: BrowserRuntimeBridge,
  options: BrowserRuntimeOptions,
  events: ILocalRuntimeEvents,
) {
  const registry = new BrowserWorkspaceRegistry(bridge, options)
  const runtime = new LocalRuntime(registry, {
    committed: (command, result) => {
      try {
        events.committed(command, result)
      } catch (error) {
        console.error('[LocalRuntime] Commit observer failed:', error)
      }
      void registry.publishTimerProjection(
        command.workspaceId,
        command.action,
        command.entryId,
      )
    },
  })
  return {
    runtime,
    start: () => registry.start(),
    requestInternal: (command: LocalPersistenceCommand) =>
      registry.requestInternal(command),
    requestSync: (request: LocalSyncRequest) =>
      registry.requestSync(request, (workspaceId, dispose) =>
        runtime.forgetWorkspace(workspaceId, dispose),
      ),
    close: async () => {
      await Promise.all([runtime.quiesce(), registry.quiesce()])
      const logical = await runtime.close()
      const physical = await registry.close()
      if (logical.isFailure()) return logical
      return physical
    },
  }
}

function runtimeFailure(error: Error): Either<AppError, never> {
  return Either.failure(AppError.Internal(error.message))
}
function syncFailure(error: AppError): LocalSyncResponse {
  return {
    ok: false,
    error: { messageKey: error.messageKey, statusCode: error.statusCode },
  }
}
function validateSyncRequest(input: LocalSyncRequest): Either<AppError, void> {
  if (!isRecord(input) || !isNonEmptyString(input.workspaceId))
    return Either.failure(AppError.ValidationError('WORKSPACE_REQUIRED'))
  const actions: string[] = [
    'status',
    'connect',
    'disconnect',
    'forceSync',
    'reconcile',
    'drop',
    'reset',
  ]
  if (!isNonEmptyString(input.action) || !actions.includes(input.action))
    return Either.failure(AppError.ValidationError('SYNC_ACTION_INVALID'))
  if (
    input.connectionInstanceId !== undefined &&
    !isNonEmptyString(input.connectionInstanceId)
  )
    return Either.failure(AppError.ValidationError('CONNECTION_REQUIRED'))
  if (input.dataSourceId !== undefined && !isNonEmptyString(input.dataSourceId))
    return Either.failure(AppError.ValidationError('DATASOURCE_REQUIRED'))
  if (
    input.direction !== undefined &&
    input.direction !== 'pull' &&
    input.direction !== 'push' &&
    input.direction !== 'both'
  )
    return Either.failure(AppError.ValidationError('SYNC_DIRECTION_INVALID'))
  if (
    input.windowDays !== undefined &&
    (typeof input.windowDays !== 'number' ||
      !Number.isFinite(input.windowDays) ||
      input.windowDays <= 0)
  )
    return Either.failure(AppError.ValidationError('SYNC_WINDOW_INVALID'))
  return Either.success()
}
function serializeSyncStatuses(
  statuses: import('@/stores/sync-store/types').SyncStore['statuses'],
): LocalRuntimeSyncStatus[] {
  return Object.entries(statuses).map(([key, status]) => {
    const failures = status.error ? getReplicationFailures(status.error) : []
    return {
      key,
      isActive: status.isActive,
      isPulling: status.isPulling,
      isPushing: status.isPushing,
      isReconciling: status.isReconciling,
      lastPulledAt: serializeDate(status.lastPulledAt),
      lastPushedAt: serializeDate(status.lastPushedAt),
      lastReconciledAt: serializeDate(status.lastReconciledAt),
      lastReplication: serializeDate(status.lastReplication),
      lastPushResult: status.lastPushResult,
      lastPullResult: status.lastPullResult,
      error:
        status.error === null || status.error === undefined
          ? null
          : status.error.message,
      failures: failures.length > 0 ? failures : undefined,
    }
  })
}
function serializeDate(value: Date | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.toISOString()
}

function projectionAction(
  before: LocalTimeEntrySnapshot | null,
  after: LocalTimeEntrySnapshot | null,
): string {
  if (after === null || after._deleted) {
    if (before?.timeStatus === 'running' || before?.timeStatus === 'paused')
      return 'timerStop'
    return 'update'
  }
  if (after.timeStatus === before?.timeStatus) return 'update'
  if (after.timeStatus === 'paused') return 'timerPause'
  if (after.timeStatus === 'running' && before?.timeStatus === 'paused')
    return 'timerResume'
  if (after.timeStatus === 'running') return 'timerStart'
  if (
    after.timeStatus === 'finished' &&
    (before?.timeStatus === 'running' || before?.timeStatus === 'paused')
  )
    return 'timerStop'
  return 'update'
}
