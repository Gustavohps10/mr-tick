import { IHostBridge } from '@mr-tick/application'
import { TimeEntryViewModel } from '@mr-tick/shared/view-models'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'

import {
  reconcileTimeEntries,
  TimeEntriesReconciliationWindow,
} from './reconcileTimeEntries'
import {
  ensurePlugins,
  getOrCreateDatabase,
  removeDatabaseFromCache,
} from './storage'
import { AppDatabase } from './types'

const entry: SyncTimeEntryRxDBDTO = {
  id: 'local-entry',
  remoteId: 'remote-entry',
  connectionInstanceId: 'connection',
  dataSourceId: 'source',
  _deleted: false,
  syncStatus: 'synced',
  task: { id: 'task' },
  activity: { id: 'activity' },
  user: { id: 'user' },
  timeSpent: 1,
  startDate: '2026-10-03T12:00:00.000Z',
  createdAt: '2026-10-03T12:00:00.000Z',
  updatedAt: '2026-10-03T13:00:00.000Z',
}
const remote: TimeEntryViewModel = {
  ...entry,
  id: 'remote-entry',
  startDate: new Date(entry.startDate),
  createdAt: new Date(entry.createdAt),
  updatedAt: new Date(entry.updatedAt),
}
function gate() {
  let release: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    promise,
    release() {
      if (release) release()
    },
  }
}

describe('Reconciliation requires a complete snapshot and never requests a remote deletion', () => {
  let db: AppDatabase
  let window: TimeEntriesReconciliationWindow
  const listTimeEntries = vi.fn<IHostBridge['timeEntries']['listTimeEntries']>()
  const client: Pick<IHostBridge, 'timeEntries'> = {
    timeEntries: {
      listTimeEntries,
      pull: vi.fn<IHostBridge['timeEntries']['pull']>(),
      push: vi.fn<IHostBridge['timeEntries']['push']>(),
    },
  }
  beforeEach(async () => {
    vi.resetAllMocks()
    await ensurePlugins(false)
    window = {
      workspaceId: crypto.randomUUID(),
      connectionInstanceId: 'connection',
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2026-10-04T23:59:59Z'),
    }
    db = await getOrCreateDatabase(window.workspaceId, false, true)
    await db.timeEntries.insert(entry)
    listTimeEntries.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [remote],
      totalItems: 1,
      currentPage: 1,
      totalPages: 1,
    })
  })
  afterEach(async () => {
    await db.close()
    removeDatabaseFromCache(window.workspaceId, true)
  })

  it.each([401, 403, 429, 503])(
    'preserves all documents after HTTP %s and forwards the original error',
    async (statusCode) => {
      listTimeEntries.mockResolvedValue({
        isSuccess: false,
        statusCode,
        error: 'ORIGINAL_SERVER_ERROR',
        totalItems: 0,
        currentPage: 1,
        totalPages: 0,
      })
      const result = await reconcileTimeEntries(db.timeEntries, client, window)
      expect(result.isFailure()).toBe(true)
      expect(result.failure.statusCode).toBe(statusCode)
      expect(result.failure.messageKey).toBe('ORIGINAL_SERVER_ERROR')
      expect(await db.timeEntries.count().exec()).toBe(1)
    },
  )

  it('rejects partial pagination before changing any document', async () => {
    listTimeEntries.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [],
      totalItems: 100,
      currentPage: 1,
      totalPages: 2,
    })
    expect(
      (await reconcileTimeEntries(db.timeEntries, client, window)).isFailure(),
    ).toBe(true)
    expect(await db.timeEntries.count().exec()).toBe(1)
  })

  it('rejects a successful response with missing data', async () => {
    listTimeEntries.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      totalItems: 0,
      currentPage: 1,
      totalPages: 0,
    })
    expect(
      (await reconcileTimeEntries(db.timeEntries, client, window)).isFailure(),
    ).toBe(true)
    expect(await db.timeEntries.count().exec()).toBe(1)
  })

  it('rejects duplicate remote identifiers instead of mistaking them for a complete snapshot', async () => {
    listTimeEntries.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [remote, remote],
      totalItems: 2,
      currentPage: 1,
      totalPages: 1,
    })
    expect(
      (await reconcileTimeEntries(db.timeEntries, client, window)).isFailure(),
    ).toBe(true)
    expect(await db.timeEntries.count().exec()).toBe(1)
  })

  it('preserves rows in a successful complete snapshot', async () => {
    expect(
      (await reconcileTimeEntries(db.timeEntries, client, window)).isSuccess(),
    ).toBe(true)
    expect(await db.timeEntries.count().exec()).toBe(1)
  })

  it('marks confirmed remote absence atomically as local cleanup', async () => {
    listTimeEntries.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [],
      totalItems: 0,
      currentPage: 1,
      totalPages: 0,
    })
    expect(
      (await reconcileTimeEntries(db.timeEntries, client, window)).isSuccess(),
    ).toBe(true)
    expect(await db.timeEntries.count().exec()).toBe(0)
    const stored = await db.timeEntries.storageInstance.findDocumentsById(
      [entry.id],
      true,
    )
    expect(stored.find((document) => document.id === entry.id)).toMatchObject({
      _deleted: true,
      remoteDeleted: true,
      syncStatus: 'synced',
      remoteId: entry.remoteId,
    })
  })

  it('keeps future dates, old dates, other connections and pending edits outside cleanup', async () => {
    await db.timeEntries.bulkInsert([
      { ...entry, id: 'future', startDate: '2026-10-10T12:00:00Z' },
      { ...entry, id: 'old', startDate: '2026-09-01T12:00:00Z' },
      { ...entry, id: 'other', connectionInstanceId: 'other' },
      { ...entry, id: 'edit', syncStatus: 'pending_push' },
    ])
    listTimeEntries.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [],
      totalItems: 0,
      currentPage: 1,
      totalPages: 0,
    })
    await reconcileTimeEntries(db.timeEntries, client, window)
    expect(
      (await db.timeEntries.find().exec())
        .map((document) => document.id)
        .sort(),
    ).toEqual(['edit', 'future', 'old', 'other'])
  })

  it('does not delete a row edited while the snapshot was in flight', async () => {
    const entered = gate()
    const released = gate()
    listTimeEntries.mockImplementationOnce(async () => {
      entered.release()
      await released.promise
      return {
        isSuccess: true,
        statusCode: 200,
        data: [],
        totalItems: 0,
        currentPage: 1,
        totalPages: 0,
      }
    })
    const reconciliation = reconcileTimeEntries(db.timeEntries, client, window)
    await entered.promise
    const document = await db.timeEntries.findOne(entry.id).exec()
    expect(document).not.toBeNull()
    if (document)
      await document.incrementalPatch({
        syncStatus: 'pending_push',
        comments: 'user edit',
      })
    released.release()
    await reconciliation
    expect((await db.timeEntries.findOne(entry.id).exec())?.comments).toBe(
      'user edit',
    )
  })

  it('keeps a newer canonical remote state that arrived while the older snapshot was in flight', async () => {
    const entered = gate()
    const released = gate()
    listTimeEntries.mockImplementationOnce(async () => {
      entered.release()
      await released.promise
      return {
        isSuccess: true,
        statusCode: 200,
        data: [],
        totalItems: 0,
        currentPage: 1,
        totalPages: 0,
      }
    })
    const reconciliation = reconcileTimeEntries(db.timeEntries, client, window)
    await entered.promise
    const document = await db.timeEntries.findOne(entry.id).exec()
    expect(document).not.toBeNull()
    if (document)
      await document.incrementalPatch({
        syncStatus: 'synced',
        comments: 'new canonical state',
        remoteUpdatedAt: '2026-10-03T14:00:00Z',
      })
    released.release()
    await reconciliation
    expect((await db.timeEntries.findOne(entry.id).exec())?.comments).toBe(
      'new canonical state',
    )
  })
})
