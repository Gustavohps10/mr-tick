import 'fake-indexeddb/auto'

import type {
  LocalPersistenceCommand,
  LocalTimeEntrySnapshot,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand'

import {
  ensurePlugins,
  getOrCreateDatabase,
  removeDatabaseFromCache,
} from '@/stores/sync-store/storage'
import type { AppDatabase, SyncStore } from '@/stores/sync-store/types'

import { BrowserWorkspaceExecutor } from './browser-workspace-executor'
import { BrowserCommandReceipts } from './command-receipts'

function entry(id: string): LocalTimeEntrySnapshot {
  return {
    id,
    connectionInstanceId: 'connection',
    dataSourceId: 'source',
    _deleted: false,
    syncStatus: 'pending_push',
    task: { id: 'task' },
    activity: { id: 'activity' },
    user: { id: 'member' },
    startDate: '2026-10-08T10:00:00.000Z',
    endDate: '2026-10-08T11:00:00.000Z',
    timeSpent: 1,
    timeStatus: 'finished',
    source: 'manual',
    createdAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-08T11:00:00.000Z',
  }
}

function makeStore(database: AppDatabase) {
  return createStore<SyncStore>(() => ({
    db: database,
    statuses: {},
    isInitialized: true,
    init: async () => undefined,
    destroy: async () => undefined,
    drop: async () => undefined,
    resetDatabase: async () => undefined,
    forceSync: async () => undefined,
    reconcile: async () => undefined,
    connectDataSource: async () => undefined,
    disconnectDataSource: async () => undefined,
  }))
}

describe('Durable local command receipts with a real RxDB collection', () => {
  let database: AppDatabase
  let workspaceId: string
  let receipts: BrowserCommandReceipts
  let executor: BrowserWorkspaceExecutor

  beforeEach(async () => {
    workspaceId = crypto.randomUUID()
    await ensurePlugins(false)
    database = await getOrCreateDatabase(workspaceId, false, true)
    receipts = new BrowserCommandReceipts(workspaceId)
    executor = new BrowserWorkspaceExecutor(
      workspaceId,
      makeStore(database),
      receipts,
      async (input) => Either.success(input),
    )
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await receipts.delete()
    await database.close()
    removeDatabaseFromCache(workspaceId, true)
  })

  it('reads bounded local tasks with pure source IDs, deterministic ordering and literal search', async () => {
    const common = {
      dataSourceId: 'source',
      _deleted: false,
      syncStatus: 'synced',
      lastPulledAt: null,
      lastPushedAt: null,
      lastReconciledAt: null,
      status: { id: 'open', name: 'Open' },
      createdAt: '2026-10-08T10:00:00.000Z',
      updatedAt: '2026-10-08T10:00:00.000Z',
      timeEntryIds: [],
    }
    const tasks: import('@/local-db/schemas/tasks-sync-schema').SyncTaskRxDBDTO[] =
      [
        {
          ...common,
          id: 'connection::b',
          sourceId: 'b',
          connectionInstanceId: 'connection',
          title: 'Document [SDK].',
        },
        {
          ...common,
          id: 'connection::a',
          sourceId: 'a',
          connectionInstanceId: 'connection',
          title: 'Another task',
        },
        {
          ...common,
          id: 'other::a',
          sourceId: 'a',
          connectionInstanceId: 'other',
          title: 'Other connection',
        },
      ]
    await database.tasks.bulkInsert(tasks)
    const result = await executor.queryCore(
      {
        action: 'tasks',
        workspaceId,
        connectionInstanceId: 'connection',
        limit: 1,
      },
      'source',
    )
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure() || result.success.kind !== 'tasks')
      return expect.fail('Expected task page')
    expect(result.success.tasks.map((task) => task.taskId)).toEqual(['a'])
    expect(result.success.hasMore).toBe(true)
    expect(result.success.tasks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'connection::a' }),
      ]),
    )
    const searched = await executor.queryCore(
      {
        action: 'tasks',
        workspaceId,
        connectionInstanceId: 'connection',
        limit: 10,
        search: '[sdk].',
      },
      'source',
    )
    expect(searched.isSuccess()).toBe(true)
    if (searched.isFailure() || searched.success.kind !== 'tasks')
      return expect.fail('Expected searched page')
    expect(searched.success.tasks.map((task) => task.taskId)).toEqual(['b'])
    const one = await executor.queryCore(
      {
        action: 'task',
        workspaceId,
        connectionInstanceId: 'other',
        taskId: 'a',
      },
      'source',
    )
    expect(one.isSuccess()).toBe(true)
    if (one.isFailure() || one.success.kind !== 'task')
      return expect.fail('Expected task')
    expect(one.success.task.title).toBe('Other connection')
    const removed = await database.tasks.findOne('connection::a').exec()
    if (removed === null) return expect.fail('Expected seeded record')
    await removed.remove()
    const missing = await executor.queryCore(
      {
        action: 'task',
        workspaceId,
        connectionInstanceId: 'connection',
        taskId: 'a',
      },
      'source',
    )
    expect(missing.isFailure()).toBe(true)
    if (missing.isSuccess()) return expect.fail('Expected missing task')
    expect(missing.failure.messageKey).toBe('TASK_NOT_FOUND')
  })

  it('distinguishes absent metadata from an available empty snapshot and hides storage fields', async () => {
    const input: import('@mr-tick/application').CoreCacheQuery = {
      action: 'metadata',
      workspaceId,
      connectionInstanceId: 'connection',
    }
    const missing = await executor.queryCore(input, 'source')
    expect(missing.isFailure()).toBe(true)
    if (missing.isSuccess()) return expect.fail('Expected metadata unavailable')
    expect(missing.failure.messageKey).toBe('CORE_METADATA_UNAVAILABLE')
    await database.metadata.insert({
      id: 'connection::metadata',
      sourceId: 'metadata',
      connectionInstanceId: 'connection',
      dataSourceId: 'source',
      _deleted: false,
      syncStatus: 'synced',
      lastPulledAt: '2026-10-08T10:00:00.000Z',
      activities: [],
      taskStatuses: [],
      taskPriorities: [],
      trackStatuses: [],
      participantRoles: [],
      estimationTypes: [],
    })
    const result = await executor.queryCore(input, 'source')
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure() || result.success.kind !== 'metadata')
      return expect.fail('Expected metadata')
    expect(result.success.metadata.values.activities).toEqual([])
    expect(result.success.metadata).not.toHaveProperty('id')
    expect(result.success.metadata).not.toHaveProperty('syncStatus')
  })

  it('does not acknowledge deletion when the document changes before the compare-and-set', async () => {
    const record = entry(crypto.randomUUID())
    const document = await database.timeEntries.insert(record)
    const modify = document.incrementalModify.bind(document)
    vi.spyOn(document, 'incrementalModify').mockImplementationOnce(
      async (mutation) => {
        await modify((latest) => ({
          ...latest,
          comments: 'Concurrent edit',
          updatedAt: '2026-10-08T11:01:00.000Z',
        }))
        return modify(mutation)
      },
    )
    const result = await executor.requestInternal({
      action: 'deleteRecord',
      workspaceId,
      commandId: crypto.randomUUID(),
      entryId: record.id,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.statusCode).toBe(409)
    expect(await database.timeEntries.findOne(record.id).exec()).not.toBeNull()
    expect((await executor.recover()).isSuccess()).toBe(true)
  })

  it('recovers a committed local effect after the remote acknowledgement changes sync metadata', async () => {
    const record = entry(crypto.randomUUID())
    const command: LocalPersistenceCommand = {
      action: 'insertRecord',
      workspaceId,
      commandId: crypto.randomUUID(),
      entryId: record.id,
      record,
    }
    const save = receipts.save.bind(receipts)
    vi.spyOn(receipts, 'save').mockImplementation(async (receipt) => {
      if (receipt.status === 'committed')
        return Either.failure(
          AppError.Internal('SIMULATED_RECEIPT_COMMIT_FAILURE'),
        )
      return save(receipt)
    })
    const initial = await executor.requestInternal(command)
    expect(initial.ok).toBe(false)
    const document = await database.timeEntries.findOne(record.id).exec()
    expect(document).not.toBeNull()
    if (!document) return
    await document.incrementalPatch({
      remoteId: 'confirmed-remote-id',
      syncStatus: 'synced',
      lastPushedAt: '2026-10-08T11:02:00.000Z',
    })
    vi.restoreAllMocks()
    const recovery = await executor.recover()
    expect(recovery.isSuccess()).toBe(true)
    const replay = await executor.requestInternal(command)
    expect(replay.ok).toBe(true)
    expect(await database.timeEntries.count().exec()).toBe(1)
    const persisted = await database.timeEntries.findOne(record.id).exec()
    expect(persisted?.remoteId).toBe('confirmed-remote-id')
  })

  it('rejects a pre-commit divergence without leaving a prepared command blocking the workspace', async () => {
    const record = entry(crypto.randomUUID())
    const document = await database.timeEntries.insert(record)
    const save = receipts.save.bind(receipts)
    vi.spyOn(receipts, 'save').mockImplementationOnce(async (receipt) => {
      const saved = await save(receipt)
      await document.incrementalPatch({
        remoteId: 'remote-acknowledgement',
        syncStatus: 'synced',
      })
      return saved
    })
    const rejected = await executor.requestInternal({
      action: 'editRecord',
      workspaceId,
      commandId: crypto.randomUUID(),
      entryId: record.id,
      changes: { comments: 'Requested local change' },
    })
    expect(rejected.ok).toBe(false)
    vi.restoreAllMocks()
    expect((await executor.recover()).isSuccess()).toBe(true)
    const next = await executor.requestInternal({
      action: 'editRecord',
      workspaceId,
      commandId: crypto.randomUUID(),
      entryId: record.id,
      changes: { comments: 'Another operation' },
    })
    expect(next.ok).toBe(true)
  })
})
