import {
  IHostBridge,
  PullTimeEntriesInput,
  PushTimeEntriesInput,
} from '@mr-tick/application'
import { IRequest } from '@mr-tick/shared/transport'
import {
  SyncDocumentViewModel,
  TimeEntryViewModel,
  ViewModel,
} from '@mr-tick/shared/view-models'
import { replicateRxCollection } from 'rxdb/plugins/replication'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { applyTimeEntryEdit } from '@/pages/time-entries/lib/time-entry-identity'
import {
  ensurePlugins,
  getOrCreateDatabase,
  removeDatabaseFromCache,
} from '@/stores/sync-store/storage'
import { AppDatabase } from '@/stores/sync-store/types'

import { ReplicationError } from '../ReplicationError'
import { ReplicationCheckpoint } from '../types'
import { TimeEntriesReplication } from './TimeEntriesReplication'
import {
  snapshotDocument,
  toRemoteState,
  toTimeEntryDTO,
} from './timeEntrySyncState'

const docId = 'local-correlation-uuid'
const connectionId = 'connection-A'
const now = '2026-09-24T11:00:00.000Z'
const local: SyncTimeEntryRxDBDTO = {
  id: docId,
  connectionInstanceId: connectionId,
  dataSourceId: 'redmine',
  _deleted: false,
  syncStatus: 'pending_push',
  task: { id: '101' },
  activity: { id: '9' },
  user: { id: '1' },
  startDate: new Date(2026, 8, 24, 8).toISOString(),
  endDate: new Date(2026, 8, 24, 9, 20).toISOString(),
  timeSpent: 1.3333,
  comments: 'typed',
  createdAt: now,
  updatedAt: now,
}
const canonical: TimeEntryViewModel = {
  id: '500',
  correlationId: docId,
  task: { id: '101' },
  activity: { id: '9', name: 'Development' },
  user: { id: '1' },
  startDate: new Date(2026, 8, 24, 12),
  endDate: new Date(new Date(2026, 8, 24, 12).getTime() + 1.33 * 3600000),
  timeSpent: 1.33,
  comments: 'typed',
  createdAt: new Date(now),
  updatedAt: new Date('2026-09-24T11:00:05Z'),
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

describe('TimeEntriesReplication durable creation and canonical state', () => {
  let db: AppDatabase
  let workspaceId: string
  let strategy: TimeEntriesReplication
  const pull =
    vi.fn<
      (
        request: IRequest<PullTimeEntriesInput>,
      ) => Promise<ViewModel<TimeEntryViewModel[]>>
    >()
  const push = vi.fn<IHostBridge['timeEntries']['push']>()
  const client: Pick<IHostBridge, 'timeEntries'> = {
    timeEntries: {
      pull: async (request) => {
        const response = await pull(request)
        if (!response.isSuccess)
          return {
            isSuccess: false,
            statusCode: response.statusCode,
            error: response.error,
          }
        const items = response.data ? response.data : []
        const last = items.at(-1)
        const checkpoint = last
          ? { id: last.id ? last.id : '', updatedAt: last.updatedAt }
          : request.body.checkpoint
        return {
          ...response,
          data: {
            items,
            checkpoint,
            hasMore: false,
            snapshotId: 'controlled-test-snapshot',
          },
        }
      },
      push,
      listTimeEntries: vi.fn(),
    },
  }

  beforeEach(async () => {
    vi.resetAllMocks()
    await ensurePlugins(false)
    workspaceId = `replication-${crypto.randomUUID()}`
    db = await getOrCreateDatabase(workspaceId, false, true)
    strategy = new TimeEntriesReplication(
      client,
      workspaceId,
      connectionId,
      'redmine',
      db.timeEntries,
    )
    pull.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [canonical],
    })
    push.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [{ ...canonical, originalId: docId }],
    })
  })
  afterEach(async () => {
    await db.close()
    removeDatabaseFromCache(workspaceId, true)
  })

  const send = (document: SyncTimeEntryRxDBDTO) =>
    strategy.push([{ newDocumentState: document }])

  it('writes the complete stored state back to the local document and keeps the local identity', async () => {
    await db.timeEntries.insert(local)
    await send(local)
    const stored = await db.timeEntries.findOne(docId).exec()
    expect(stored?.id).toBe(docId)
    expect(stored?.remoteId).toBe('500')
    expect(stored?.timeSpent).toBe(1.33)
    expect(stored?.startDate).toBe(canonical.startDate?.toISOString())
    expect(stored?.endDate).toBe(canonical.endDate?.toISOString())
    expect(stored?.remoteState?.timeSpent).toBe(1.33)
    expect(stored?.remoteState?.startDate).toBe(
      canonical.startDate?.toISOString(),
    )
    expect(stored?.remoteUpdatedAt).toBe(canonical.updatedAt.toISOString())
    expect(stored?.syncStatus).toBe('synced')
    expect(stored?.creationState).toBeNull()
  })

  it('persists the initial payload before POST and sends it on recovery after restart', async () => {
    await db.timeEntries.insert({
      ...local,
      syncStatus: 'creating',
      creationAttemptId: 'attempt',
      creationState: snapshotDocument(local),
      comments: 'edited later',
    })
    const restarted = new TimeEntriesReplication(
      client,
      workspaceId,
      connectionId,
      'redmine',
      db.timeEntries,
    )
    const doc = await db.timeEntries.findOne(docId).exec()
    if (!doc) return
    await restarted.push([{ newDocumentState: doc.toMutableJSON() }])
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          entries: [
            expect.objectContaining({
              creationAttempted: true,
              comments: 'edited later',
              creationState: expect.objectContaining({
                comments: 'typed',
                task: { id: '101' },
              }),
            }),
          ],
        }),
      }),
    )
    expect((await db.timeEntries.findOne(docId).exec())?.syncStatus).toBe(
      'pending_push',
    )
    expect((await db.timeEntries.findOne(docId).exec())?.comments).toBe(
      'edited later',
    )
  })

  it('preserves an edit made during POST and sends it as an update using the confirmed baseline', async () => {
    const started = gate()
    const release = gate()
    push.mockImplementationOnce(async () => {
      started.release()
      await release.promise
      return {
        isSuccess: true,
        statusCode: 200,
        data: [{ ...canonical, originalId: docId }],
      }
    })
    const doc = await db.timeEntries.insert(local)
    const request = send(local)
    await started.promise
    await doc.incrementalPatch({ comments: 'new edit', updatedAt: now })
    release.release()
    await request
    const stored = await db.timeEntries.findOne(docId).exec()
    expect(stored?.comments).toBe('new edit')
    expect(stored?.syncStatus).toBe('pending_push')
    expect(stored?.remoteState?.comments).toBe('typed')
    if (!stored) return
    await send(stored.toMutableJSON())
    const second: PushTimeEntriesInput | undefined = push.mock.calls
      .at(1)
      ?.at(0)?.body
    expect(second?.entries.at(0)?.remoteId).toBe('500')
    expect(second?.entries.at(0)?.comments).toBe('new edit')
    expect(second?.entries.at(0)?.assumedMasterState).toEqual(
      toTimeEntryDTO(toRemoteState(canonical, '500')),
    )
  })

  it('links a pull arriving before the acknowledgement without losing an in-flight edit', async () => {
    const state = snapshotDocument(local)
    await db.timeEntries.insert({
      ...local,
      syncStatus: 'creating',
      creationAttemptId: 'attempt',
      creationState: state,
      comments: 'local change',
    })
    const result = await strategy.pull(undefined, 50)
    expect(result.documents).toHaveLength(0)
    const stored = await db.timeEntries.findOne(docId).exec()
    expect(stored?.remoteId).toBe('500')
    expect(stored?.comments).toBe('local change')
    expect(stored?.syncStatus).toBe('pending_push')
    expect(stored?.remoteState?.comments).toBe('typed')
    expect(await db.timeEntries.count().exec()).toBe(1)
  })

  it('links a pull to the creation document and adopts the canonical state when there is no edit', async () => {
    await db.timeEntries.insert({
      ...local,
      syncStatus: 'creating',
      creationAttemptId: 'attempt',
      creationState: snapshotDocument(local),
    })
    const result = await strategy.pull(undefined, 50)
    expect(result.documents.at(0)?.id).toBe(docId)
    expect((await db.timeEntries.findOne(docId).exec())?.timeSpent).toBe(1.33)
    expect((await db.timeEntries.findOne(docId).exec())?.syncStatus).toBe(
      'synced',
    )
  })

  it('does not acknowledge unsent business fields as a remote baseline during a pending edit', async () => {
    const remoteState = toRemoteState(canonical, '500')
    await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState,
      comments: 'pending edit',
    })
    expect((await strategy.pull(undefined, 50)).documents).toHaveLength(0)
    expect((await db.timeEntries.findOne(docId).exec())?.comments).toBe(
      'pending edit',
    )
  })

  it('recovers an ambiguous document by pull while preserving edits made after the failed request', async () => {
    await db.timeEntries.insert({
      ...local,
      syncStatus: 'ambiguous',
      creationState: snapshotDocument(local),
      comments: 'later edit',
    })
    await strategy.pull(undefined, 50)
    expect((await db.timeEntries.findOne(docId).exec())?.syncStatus).toBe(
      'pending_push',
    )
    expect((await db.timeEntries.findOne(docId).exec())?.comments).toBe(
      'later edit',
    )
  })

  it('keeps transient failures creating and rejects for the normal RxDB retry mechanism', async () => {
    await db.timeEntries.insert(local)
    const failure: SyncDocumentViewModel<TimeEntryViewModel> = {
      ...toTimeEntryDTO(snapshotDocument(local)),
      originalId: docId,
      creationPending: true,
      validationError: { messageKey: 'RATE_LIMITED', statusCode: 429 },
    }
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [failure],
    })
    await expect(send(local)).rejects.toThrow('RATE_LIMITED')
    const stored = await db.timeEntries.findOne(docId).exec()
    expect(stored?.syncStatus).toBe('creating')
    expect(stored?.creationState?.comments).toBe('typed')
    if (!stored) return
    await send(stored.toMutableJSON())
    expect(
      push.mock.calls.at(1)?.at(0)?.body.entries.at(0)?.creationAttempted,
    ).toBe(true)
    expect((await db.timeEntries.findOne(docId).exec())?.syncStatus).toBe(
      'synced',
    )
  })

  it('blocks an uncertain outcome without retrying POST automatically', async () => {
    await db.timeEntries.insert(local)
    push.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          ...canonical,
          id: docId,
          originalId: docId,
          creationAmbiguous: true,
          validationError: {
            messageKey: 'NOT_FOUND_AFTER_RECONCILIATION',
            statusCode: 422,
          },
        },
      ],
    })
    await send(local)
    const stored = await db.timeEntries.findOne(docId).exec()
    expect(stored?.syncStatus).toBe('ambiguous')
    if (!stored) return
    await send(stored.toMutableJSON())
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('persists a remote ID in a tombstone when deletion happens during POST', async () => {
    const started = gate()
    const release = gate()
    push.mockImplementationOnce(async () => {
      started.release()
      await release.promise
      return {
        isSuccess: true,
        statusCode: 200,
        data: [{ ...canonical, originalId: docId }],
      }
    })
    const doc = await db.timeEntries.insert(local)
    const request = send(local)
    await started.promise
    await doc.getLatest().remove()
    release.release()
    await request
    const deleted = await db.timeEntries.storageInstance.findDocumentsById(
      [docId],
      true,
    )
    const tombstone = deleted.find((item) => item.id === docId)
    expect(tombstone?._deleted).toBe(true)
    expect(tombstone?.remoteId).toBe('500')
    expect(tombstone?.syncStatus).toBe('pending_push')
    if (!tombstone) return
    await send(tombstone)
    expect(push.mock.calls.at(1)?.at(0)?.body.entries.at(0)).toMatchObject({
      _deleted: true,
      id: '500',
      remoteId: '500',
    })
  })

  it('does not resurrect a tombstone when pull arrives first', async () => {
    const doc = await db.timeEntries.insert({
      ...local,
      syncStatus: 'creating',
      creationState: snapshotDocument(local),
    })
    await doc.remove()
    expect((await strategy.pull(undefined, 50)).documents).toHaveLength(0)
    const stored = await db.timeEntries.storageInstance.findDocumentsById(
      [docId],
      true,
    )
    expect(stored.find((item) => item.id === docId)).toMatchObject({
      _deleted: true,
      remoteId: '500',
      syncStatus: 'pending_push',
    })
    expect(await db.timeEntries.count().exec()).toBe(0)
  })

  it('never merges unrelated same-task same-day entries without correlation', async () => {
    await db.timeEntries.insert(local)
    pull.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [{ ...canonical, correlationId: undefined }],
    })
    const result = await strategy.pull(undefined, 50)
    expect(result.documents.at(0)?.id).not.toBe(docId)
  })

  it('isolates correlation lookup by connection', async () => {
    await db.timeEntries.insert({
      ...local,
      connectionInstanceId: 'other-connection',
    })
    const result = await strategy.pull(undefined, 50)
    expect(result.documents.at(0)?.id).not.toBe(docId)
    expect(
      (await db.timeEntries.findOne(docId).exec())?.remoteId,
    ).toBeUndefined()
  })

  it('does not mix a new timestamp with old business fields from assumedMasterState', async () => {
    const remoteState = toRemoteState(canonical, '500')
    await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState,
      remoteUpdatedAt: remoteState.updatedAt,
    })
    await strategy.push([
      {
        newDocumentState: { ...local, remoteId: '500' },
        assumedMasterState: { ...local, syncStatus: 'synced' },
      },
    ])
    expect(
      push.mock.calls.at(0)?.at(0)?.body.entries.at(0)?.assumedMasterState,
    ).toEqual(toTimeEntryDTO(toRemoteState(canonical, '500')))
  })
  it('reports duplicate remote correlations without choosing a remote identity', async () => {
    await db.timeEntries.insert({
      ...local,
      syncStatus: 'creating',
      creationState: snapshotDocument(local),
    })
    pull.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [canonical, { ...canonical, id: '501' }],
    })
    const result = await strategy.pull(undefined, 25)
    expect(result.documents).toEqual([])
    const stored = await db.timeEntries.findOne(docId).exec()
    expect(stored?.remoteId).toBeUndefined()
    expect(stored?.syncStatus).toBe('ambiguous')
    expect(stored?.syncError).toBe(
      'MULTIPLE_REMOTE_TIME_ENTRIES_FOR_CORRELATION',
    )
  })

  it('the live RxDB cycle deletes by recovered remote ID after a deletion during POST', async () => {
    const entered = gate()
    const released = gate()
    let calls = 0
    push.mockImplementation(async () => {
      calls += 1
      if (calls === 1) {
        entered.release()
        await released.promise
      }
      return {
        isSuccess: true,
        statusCode: 200,
        data: [{ ...canonical, originalId: docId }],
      }
    })
    const document = await db.timeEntries.insert(local)
    const replication = replicateRxCollection<
      SyncTimeEntryRxDBDTO,
      ReplicationCheckpoint
    >({
      collection: db.timeEntries,
      replicationIdentifier: 'live-delete-test',
      live: true,
      waitForLeadership: false,
      push: { handler: (rows) => strategy.push(rows) },
    })
    try {
      await entered.promise
      await document.incrementalRemove()
      released.release()
      await replication.awaitInSync()
      expect(push).toHaveBeenCalledTimes(2)
      const deletion =
        push.mock.calls[push.mock.calls.length - 1]?.[0].body.entries[0]
      expect(deletion?._deleted).toBe(true)
      expect(deletion?.remoteId).toBe('500')
      expect(deletion?.id).toBe('500')
    } finally {
      released.release()
      await replication.cancel()
    }
  })

  it('never pushes a tombstone produced by remote reconciliation', async () => {
    const document = await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      syncStatus: 'synced',
    })
    const cleaned = await document.incrementalModify((draft) => ({
      ...draft,
      _deleted: true,
      remoteDeleted: true,
    }))
    await send(cleaned.toMutableJSON(true))
    expect(push).not.toHaveBeenCalled()
  })

  it('continues pushing a user deletion of a synced entry', async () => {
    const document = await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      syncStatus: 'synced',
    })
    await document.incrementalRemove()
    const documents = await db.timeEntries.storageInstance.findDocumentsById(
      [docId],
      true,
    )
    const deleted = documents.find((item) => item.id === docId)
    expect(deleted).toBeDefined()
    if (!deleted) return
    await send(deleted)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls.at(0)?.at(0)?.body.entries.at(0)).toMatchObject({
      _deleted: true,
      id: '500',
      remoteId: '500',
    })
  })

  it('restores a remotely cleaned entry if the remote later returns its correlation, without deleting it', async () => {
    const document = await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      syncStatus: 'synced',
    })
    await document.incrementalModify((draft) => ({
      ...draft,
      _deleted: true,
      remoteDeleted: true,
    }))
    const result = await strategy.pull(undefined, 50)
    expect(result.documents).toHaveLength(1)
    expect(result.documents.at(0)).toMatchObject({
      id: docId,
      _deleted: false,
      remoteDeleted: false,
      syncStatus: 'synced',
    })
    const restored = await db.timeEntries.findOne(docId).exec()
    expect(restored).not.toBeNull()
    if (restored) await send(restored.toMutableJSON(true))
    expect(push).not.toHaveBeenCalled()
  })

  it('the live RxDB cycle acknowledges remote cleanup without any provider push', async () => {
    const document = await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      syncStatus: 'synced',
    })
    const replication = replicateRxCollection<
      SyncTimeEntryRxDBDTO,
      ReplicationCheckpoint
    >({
      collection: db.timeEntries,
      replicationIdentifier: 'live-remote-cleanup',
      live: true,
      waitForLeadership: false,
      push: { handler: (rows) => strategy.push(rows) },
    })
    try {
      await replication.awaitInSync()
      await document.incrementalModify((draft) => ({
        ...draft,
        _deleted: true,
        remoteDeleted: true,
      }))
      await replication.awaitInSync()
      expect(push).not.toHaveBeenCalled()
      expect(await db.timeEntries.count().exec()).toBe(0)
    } finally {
      await replication.cancel()
    }
  })

  it('keeps the approved remote baseline when a failed update is followed by an external edit', async () => {
    const baseline = toRemoteState(canonical, '500')
    await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: baseline,
      syncStatus: 'error',
      syncError: 'UPDATE_UNAVAILABLE',
      comments: 'local edit',
    })
    pull.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          ...canonical,
          comments: 'external edit',
          updatedAt: new Date('2026-09-24T11:01:00Z'),
        },
      ],
    })
    const result = await strategy.pull(undefined, 50)
    expect(result.documents).toHaveLength(0)
    const stored = await db.timeEntries.findOne(docId).exec()
    expect(stored?.remoteState).toEqual(baseline)
    expect(stored?.comments).toBe('local edit')
    expect(stored?.syncStatus).toBe('error')
  })

  it('finds an imported tombstone by connection and remote identity without a correlation marker', async () => {
    const document = await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: toRemoteState(canonical, '500'),
      syncStatus: 'synced',
    })
    await document.remove()
    pull.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [{ ...canonical, correlationId: undefined }],
    })
    const result = await strategy.pull(undefined, 50)
    expect(result.documents).toHaveLength(0)
    expect(await db.timeEntries.count().exec()).toBe(0)
    const tombstones = await db.timeEntries.storageInstance.findDocumentsById(
      [docId],
      true,
    )
    expect(tombstones.at(0)).toMatchObject({ _deleted: true, remoteId: '500' })
  })

  it('rejects a recoverable update batch while preserving the local edit and remote baseline', async () => {
    const baseline = toRemoteState(canonical, '500')
    const document = await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: baseline,
      comments: 'local edit',
    })
    push.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          ...canonical,
          originalId: docId,
          syncRetryable: true,
          validationError: {
            statusCode: 503,
            messageKey: 'UPDATE_UNAVAILABLE',
          },
        },
      ],
    })
    await expect(send(document.toMutableJSON(true))).rejects.toThrow(
      'UPDATE_UNAVAILABLE',
    )
    const stored = await db.timeEntries.findOne(docId).exec()
    expect(stored?.remoteState).toEqual(baseline)
    expect(stored?.syncStatus).toBe('pending_push')
    expect(stored?.comments).toBe('local edit')
    expect(stored?.syncError).toBe('UPDATE_UNAVAILABLE')
  })

  it.each(['synced', 'local_only'])(
    'a delayed 503 cannot reactivate another window state: %s',
    async (status) => {
      if (status !== 'synced' && status !== 'local_only') return
      const baseline = toRemoteState(canonical, '500')
      const document = await db.timeEntries.insert({
        ...local,
        remoteId: '500',
        remoteState: baseline,
      })
      const entered = gate()
      const released = gate()
      push.mockImplementation(async () => {
        entered.release()
        await released.promise
        return {
          isSuccess: true,
          statusCode: 200,
          data: [
            {
              ...canonical,
              originalId: docId,
              syncRetryable: true,
              validationError: {
                statusCode: 503,
                messageKey: 'OLD_UPDATE_FAILURE',
              },
            },
          ],
        }
      })
      const request = send(document.toMutableJSON(true))
      await entered.promise
      const newer = {
        ...baseline,
        comments: 'confirmed elsewhere',
        updatedAt: '2026-10-03T12:00:00.000Z',
      }
      await document.incrementalModify((draft) => ({
        ...draft,
        comments: newer.comments,
        remoteState: newer,
        remoteUpdatedAt: newer.updatedAt,
        syncStatus: status,
      }))
      released.release()
      await expect(request).resolves.toEqual([])
      const stored = await db.timeEntries.findOne(docId).exec()
      expect(stored?.syncStatus).toBe(status)
      expect(stored?.remoteState).toEqual(newer)
      expect(stored?.syncError).not.toBe('OLD_UPDATE_FAILURE')
    },
  )

  it('applies a newer remote snapshot to an already synced document with a complete baseline', async () => {
    await db.timeEntries.insert({
      ...local,
      syncStatus: 'synced',
      remoteId: '500',
      remoteState: toRemoteState(canonical, '500'),
    })
    const changed = {
      ...canonical,
      comments: 'new external value',
      updatedAt: new Date('2026-10-03T12:00:00Z'),
    }
    pull.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [changed],
    })
    const result = await strategy.pull(undefined, 50)
    expect(result.documents).toHaveLength(1)
    expect((await db.timeEntries.findOne(docId).exec())?.comments).toBe(
      'new external value',
    )
  })
  it.each([false, true])(
    'keeps the confirmed-write ledger across a new strategy and preserves later edits: %s',
    async (edited) => {
      const approved = toRemoteState(
        { ...canonical, comments: 'before' },
        '500',
      )
      const initial: SyncTimeEntryRxDBDTO = {
        ...local,
        remoteId: '500',
        remoteState: approved,
      }
      await db.timeEntries.insert(initial)
      push.mockResolvedValueOnce({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            ...canonical,
            remoteId: '500',
            originalId: docId,
            confirmationPending: true,
            syncRetryable: true,
            validationError: {
              statusCode: 503,
              messageKey: 'CANONICAL_READ_UNAVAILABLE',
            },
          },
        ],
      })
      await expect(send(initial)).rejects.toThrow('CANONICAL_READ_UNAVAILABLE')
      const stored = await db.timeEntries.findOne(docId).exec()
      expect(stored?.confirmationState?.comments).toBe('typed')
      expect(stored?.remoteState).toEqual(approved)
      if (!stored) return
      if (edited)
        await stored.incrementalPatch({ comments: 'edited after confirmation' })
      const restarted = new TimeEntriesReplication(
        client,
        workspaceId,
        connectionId,
        'redmine',
        db.timeEntries,
      )
      await restarted.push([{ newDocumentState: stored.toMutableJSON(true) }])
      expect(push).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            entries: [
              expect.objectContaining({
                confirmationPending: true,
                remoteId: '500',
              }),
            ],
          }),
        }),
      )
      const confirmed = await db.timeEntries.findOne(docId).exec()
      expect(confirmed?.confirmationState).toBeNull()
      expect(confirmed?.remoteState?.timeSpent).toBe(1.33)
      expect(confirmed?.syncStatus).toBe(edited ? 'pending_push' : 'synced')
      expect(confirmed?.comments).toBe(
        edited ? 'edited after confirmation' : 'typed',
      )
      expect(confirmed?.startDate).toBe(
        edited ? local.startDate : canonical.startDate?.toISOString(),
      )
    },
  )

  it('projects terminal tombstone errors durably and isolates other connections', async () => {
    await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      syncStatus: 'synced',
      _deleted: true,
    })
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          ...canonical,
          originalId: docId,
          validationError: {
            statusCode: 422,
            messageKey: 'REMOTE_DELETE_REJECTED',
          },
        },
      ],
    })
    await send({
      ...local,
      remoteId: '500',
      syncStatus: 'synced',
      _deleted: true,
    })
    expect((await strategy.getDocumentError())?.message).toBe(
      'REMOTE_DELETE_REJECTED',
    )
    const restarted = new TimeEntriesReplication(
      client,
      workspaceId,
      connectionId,
      'redmine',
      db.timeEntries,
    )
    await restarted.pull(undefined, 30)
    expect((await restarted.getDocumentError())?.message).toBe(
      'REMOTE_DELETE_REJECTED',
    )
    const other = new TimeEntriesReplication(
      client,
      workspaceId,
      'other-connection',
      'redmine',
      db.timeEntries,
    )
    expect(await other.getDocumentError()).toBeNull()
    const tombstones = await db.timeEntries.storageInstance.findDocumentsById(
      [docId],
      true,
    )
    const tombstone = tombstones.find((document) => document.id === docId)
    expect(tombstone?.syncStatus).toBe('error')
    if (!tombstone) return
    const stored = db.timeEntries._docCache.getCachedRxDocument(tombstone)
    await stored.incrementalPatch({ syncStatus: 'pending_push' })
    await send(stored.toMutableJSON(true))
    expect(await restarted.getDocumentError()).toBeNull()
  })
  it('retains arbitrary authentication failures across RxDB retry and durable projection', async () => {
    const initial = { ...local, remoteId: '500' }
    await db.timeEntries.insert(initial)
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          ...canonical,
          originalId: docId,
          syncRetryable: true,
          validationError: {
            statusCode: 401,
            messageKey: 'SESSION_REQUIRES_LOGIN',
            details: { session: ['original detail'] },
          },
        },
      ],
    })
    await expect(send(initial)).rejects.toMatchObject({
      failures: [
        {
          statusCode: 401,
          messageKey: 'SESSION_REQUIRES_LOGIN',
          details: { session: ['original detail'] },
        },
      ],
      requiresAuthentication: true,
    })
    const projected = await strategy.getDocumentError()
    expect(projected).toBeInstanceOf(ReplicationError)
    if (!(projected instanceof ReplicationError)) return
    expect(projected.requiresAuthentication).toBe(true)
    expect(projected.failures).toEqual([
      {
        statusCode: 401,
        messageKey: 'SESSION_REQUIRES_LOGIN',
        details: { session: ['original detail'] },
      },
    ])
    await send(initial)
    expect(await strategy.getDocumentError()).toBeNull()
  })

  it('retains HTTP status in pull errors without inferring it from the message', async () => {
    pull.mockResolvedValueOnce({
      isSuccess: false,
      statusCode: 403,
      error: 'ACCESS_REQUIRES_LOGIN',
    })
    await expect(strategy.pull(undefined, 30)).rejects.toMatchObject({
      failures: [{ statusCode: 403, messageKey: 'ACCESS_REQUIRES_LOGIN' }],
      requiresAuthentication: true,
    })
  })
  it('clears the confirmed-write ledger when its pending tombstone is acknowledged', async () => {
    const document = {
      ...local,
      remoteId: '500',
      confirmationState: snapshotDocument(local),
      _deleted: true,
      syncStatus: local.syncStatus,
    }
    await db.timeEntries.insert(document)
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          ...canonical,
          originalId: docId,
          remoteId: '500',
          _deleted: true,
          confirmationPending: false,
        },
      ],
    })
    await send(document)
    const stored = await db.timeEntries.storageInstance.findDocumentsById(
      [docId],
      true,
    )
    const deleted = stored.find((entry) => entry.id === docId)
    expect(deleted?.syncStatus).toBe('synced')
    expect(deleted?.confirmationState).toBeNull()
    expect(deleted?.syncFailure).toBeNull()
    expect(await strategy.getDocumentError()).toBeNull()
  })
  it('acknowledges the current tombstone once when RxDB retries an older live batch', async () => {
    const initial = {
      ...local,
      remoteId: '500',
      confirmationState: snapshotDocument(local),
    }
    const document = await db.timeEntries.insert(initial)
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          ...canonical,
          originalId: docId,
          remoteId: '500',
          confirmationPending: true,
          syncRetryable: true,
          validationError: {
            statusCode: 503,
            messageKey: 'CANONICAL_READ_UNAVAILABLE',
          },
        },
      ],
    })
    await expect(send(initial)).rejects.toThrow('CANONICAL_READ_UNAVAILABLE')
    await document.getLatest().remove()
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          ...canonical,
          originalId: docId,
          remoteId: '500',
          _deleted: true,
          confirmationPending: false,
        },
      ],
    })
    await send(initial)
    const stored = await db.timeEntries.storageInstance.findDocumentsById(
      [docId],
      true,
    )
    const tombstone = stored.find((entry) => entry.id === docId)
    expect(tombstone).toMatchObject({
      _deleted: true,
      deletionConfirmed: true,
      syncStatus: 'synced',
      confirmationState: null,
      syncFailure: null,
    })
    if (!tombstone) return
    await strategy.push([
      { newDocumentState: tombstone, assumedMasterState: initial },
    ])
    const restarted = new TimeEntriesReplication(
      client,
      workspaceId,
      connectionId,
      'redmine',
      db.timeEntries,
    )
    await restarted.push([
      { newDocumentState: tombstone, assumedMasterState: initial },
    ])
    expect(push).toHaveBeenCalledTimes(2)
    expect(push.mock.calls.at(-1)?.[0].body.entries).toMatchObject([
      { _deleted: true },
    ])
    expect(await restarted.getDocumentError()).toBeNull()
  })

  it('ignores a pre-DELETE snapshot that arrives after explicit deletion acknowledgement', async () => {
    const initial = {
      ...local,
      remoteId: '500',
      confirmationState: snapshotDocument(local),
      comments: 'edited while awaiting canonical read',
      _deleted: true,
    }
    await db.timeEntries.insert(initial)
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [
        { ...canonical, originalId: docId, remoteId: '500', _deleted: true },
      ],
    })
    await send(initial)
    const result = await strategy.pull(undefined, 50)
    expect(result.documents).toEqual([])
    expect(await db.timeEntries.findOne(docId).exec()).toBeNull()
    const stored = await db.timeEntries.storageInstance.findDocumentsById(
      [docId],
      true,
    )
    expect(stored.find((entry) => entry.id === docId)).toMatchObject({
      deletionConfirmed: true,
      syncStatus: 'synced',
      confirmationState: null,
    })
    expect(push).toHaveBeenCalledTimes(1)
  })

  it.each([503, 422])(
    'never acknowledges a rejected DELETE (%s)',
    async (statusCode) => {
      const initial = { ...local, remoteId: '500', _deleted: true }
      await db.timeEntries.insert(initial)
      push.mockResolvedValueOnce({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            ...canonical,
            originalId: docId,
            _deleted: true,
            syncRetryable: statusCode === 503,
            validationError: {
              statusCode,
              messageKey: 'ORIGINAL_DELETE_FAILURE',
            },
          },
        ],
      })
      if (statusCode === 503)
        await expect(send(initial)).rejects.toThrow('ORIGINAL_DELETE_FAILURE')
      if (statusCode === 422) await send(initial)
      const stored = await db.timeEntries.storageInstance.findDocumentsById(
        [docId],
        true,
      )
      expect(
        stored.find((entry) => entry.id === docId)?.deletionConfirmed,
      ).not.toBe(true)
    },
  )
  it('binds a recovered creation ID on DELETE acknowledgement before a correlation-free snapshot arrives', async () => {
    const initial: SyncTimeEntryRxDBDTO = {
      ...local,
      syncStatus: 'creating',
      creationAttemptId: 'uncertain-attempt',
      creationState: snapshotDocument(local),
      _deleted: true,
    }
    await db.timeEntries.insert(initial)
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [
        { ...canonical, originalId: docId, remoteId: '500', _deleted: true },
      ],
    })
    await send(initial)
    pull.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [{ ...canonical, correlationId: undefined }],
    })
    expect((await strategy.pull(undefined, 50)).documents).toEqual([])
    const stored = await db.timeEntries.storageInstance.findDocumentsById(
      [docId],
      true,
    )
    expect(stored.find((entry) => entry.id === docId)).toMatchObject({
      remoteId: '500',
      deletionConfirmed: true,
      _deleted: true,
    })
    expect(push).toHaveBeenCalledTimes(1)
  })
  it.each([
    'canonical-read',
    'retryable',
    'creation',
    'ambiguous',
    'conflict',
    'validation',
    'success',
  ])(
    'ignores a delayed %s response after its document changes connection',
    async (outcome) => {
      const initial = { ...local, remoteId: '500' }
      const document = await db.timeEntries.insert(initial)
      let response: SyncDocumentViewModel<TimeEntryViewModel> = {
        ...canonical,
        originalId: docId,
        remoteId: '500',
      }
      const failure = {
        statusCode: 422,
        messageKey: 'ORIGINAL_OLD_CONNECTION_FAILURE',
      }
      switch (outcome) {
        case 'canonical-read':
          response = {
            ...response,
            confirmationPending: true,
            syncRetryable: true,
            validationError: failure,
          }
          break
        case 'retryable':
          response = {
            ...response,
            syncRetryable: true,
            validationError: failure,
          }
          break
        case 'creation':
          response = {
            ...response,
            creationPending: true,
            validationError: failure,
          }
          break
        case 'ambiguous':
          response = {
            ...response,
            creationAmbiguous: true,
            validationError: failure,
          }
          break
        case 'conflict':
          response = {
            ...response,
            conflicted: true,
            conflictData: {
              server: toTimeEntryDTO(toRemoteState(canonical, '500')),
              local: toTimeEntryDTO(toRemoteState(canonical, '500')),
            },
            validationError: failure,
          }
          break
        case 'validation':
          response = { ...response, validationError: failure }
          break
      }
      const started = gate()
      const release = gate()
      push.mockImplementationOnce(async () => {
        started.release()
        await release.promise
        return { isSuccess: true, statusCode: 200, data: [response] }
      })
      const request = send(initial)
      await started.promise
      const next = await document.incrementalPatch({
        connectionInstanceId: 'connection-B',
        remoteId: 'new-remote-B',
        syncStatus: 'synced',
      })
      release.release()
      await expect(request).resolves.toEqual([])
      expect(
        (await db.timeEntries.findOne(docId).exec())?.toMutableJSON(),
      ).toEqual(next.toMutableJSON())
      expect(await strategy.getDocumentError()).toBeNull()
    },
  )
  it('retains RxDB backoff when a failed preflight lookup deliberately releases its creation claim', async () => {
    await db.timeEntries.insert(local)
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          ...canonical,
          id: docId,
          originalId: docId,
          remoteId: null,
          creationPending: true,
          creationAttempted: false,
          validationError: {
            statusCode: 503,
            messageKey: 'CORRELATION_LOOKUP_UNAVAILABLE',
          },
        },
      ],
    })
    await expect(send(local)).rejects.toThrow('CORRELATION_LOOKUP_UNAVAILABLE')
    const stored = await db.timeEntries.findOne(docId).exec()
    expect(stored?.toMutableJSON()).toMatchObject({
      syncStatus: 'pending_push',
      creationAttemptId: null,
      creationState: null,
      syncError: 'CORRELATION_LOOKUP_UNAVAILABLE',
    })
    expect(push).toHaveBeenCalledTimes(1)
  })
  it('imports one remote identity when both strategies finish absence lookups before persistence', async () => {
    pull.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [{ ...canonical, correlationId: undefined }],
    })
    const second = new TimeEntriesReplication(
      client,
      workspaceId,
      connectionId,
      'provider',
      db.timeEntries,
    )
    const batches = await Promise.all([
      strategy.pull(undefined, 25),
      second.pull(undefined, 25),
    ])
    expect(await db.timeEntries.count().exec()).toBe(0)
    for (const batch of batches)
      await db.timeEntries.bulkInsert(batch.documents)
    const imported = await db.timeEntries
      .find({
        selector: {
          connectionInstanceId: connectionId,
          remoteId: canonical.id,
        },
      })
      .exec()
    expect(imported).toHaveLength(1)
    expect(
      new Set(
        batches.flatMap((batch) => batch.documents.map((item) => item.id)),
      ).size,
    ).toBe(1)
  })

  it.each(['older', 'equal'])(
    'does not apply a retained pull after a newer confirmation with %s timestamps',
    async (timestamps) => {
      const approved = toRemoteState(canonical, '500')
      const document = await db.timeEntries.insert({
        ...local,
        remoteId: '500',
        remoteState: approved,
        syncStatus: 'synced',
      })
      const entered = gate()
      const release = gate()
      pull.mockImplementationOnce(async () => {
        entered.release()
        await release.promise
        return { isSuccess: true, statusCode: 200, data: [canonical] }
      })
      const request = strategy.pull(undefined, 25)
      await entered.promise
      const newer = {
        ...approved,
        comments: 'confirmed R2',
        updatedAt:
          timestamps === 'equal'
            ? approved.updatedAt
            : '2026-10-04T12:00:00.000Z',
      }
      const confirmed = await document.incrementalModify((draft) => ({
        ...draft,
        comments: newer.comments,
        remoteState: newer,
        remoteUpdatedAt: newer.updatedAt,
        updatedAt: newer.updatedAt,
        syncStatus: 'synced',
      }))
      release.release()
      const result = await request
      expect(
        (await db.timeEntries.findOne(docId).exec())?.toMutableJSON(),
      ).toEqual(confirmed.toMutableJSON())
      expect(result.documents).toEqual([])
    },
  )

  it('applies an external change with an equal timestamp when the observed local state stayed unchanged', async () => {
    const approved = toRemoteState(canonical, '500')
    await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: approved,
      syncStatus: 'synced',
    })
    pull.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [{ ...canonical, comments: 'external same timestamp' }],
    })
    await strategy.pull(undefined, 25)
    expect((await db.timeEntries.findOne(docId).exec())?.comments).toBe(
      'external same timestamp',
    )
  })
  it('keeps the same remote ID in separate connections as separate local identities', async () => {
    pull.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [{ ...canonical, correlationId: undefined }],
    })
    const second = new TimeEntriesReplication(
      client,
      workspaceId,
      'connection-B',
      'provider',
      db.timeEntries,
    )
    const batches = await Promise.all([
      strategy.pull(undefined, 25),
      second.pull(undefined, 25),
    ])
    for (const batch of batches)
      await db.timeEntries.bulkInsert(batch.documents)
    expect(await db.timeEntries.count().exec()).toBe(2)
    expect(
      new Set(
        batches.flatMap((batch) =>
          batch.documents.map((document) => document.id),
        ),
      ).size,
    ).toBe(2)
  })

  it('discards a pull when identity changes inside the atomic mutation', async () => {
    const baseline = toRemoteState(canonical, '500')
    const document = await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: baseline,
      syncStatus: 'synced',
    })
    const original = document.incrementalModify.bind(document)
    const next = { ...baseline, id: 'remote-B', comments: 'confirmed B' }
    const mutation = vi
      .spyOn(document, 'incrementalModify')
      .mockImplementationOnce(async (modify) => {
        await original((draft) => ({
          ...draft,
          connectionInstanceId: 'connection-B',
          remoteId: next.id,
          remoteState: next,
          comments: next.comments,
        }))
        return original(modify)
      })
    const result = await strategy.pull(undefined, 25)
    expect(mutation).toHaveBeenCalled()
    expect(result.documents).toEqual([])
    expect(
      (await db.timeEntries.findOne(docId).exec())?.toMutableJSON(),
    ).toMatchObject({
      connectionInstanceId: 'connection-B',
      remoteId: next.id,
      comments: next.comments,
      remoteState: next,
    })
  })

  it('does not overwrite a document that was confirmed while the pull HTTP request was in flight', async () => {
    const entered = gate()
    const release = gate()
    pull.mockImplementationOnce(async () => {
      entered.release()
      await release.promise
      return { isSuccess: true, statusCode: 200, data: [canonical] }
    })
    const request = strategy.pull(undefined, 25)
    await entered.promise
    const newer = {
      ...toRemoteState(canonical, '500'),
      comments: 'confirmed during HTTP',
    }
    const document = await db.timeEntries.insert({
      ...local,
      comments: newer.comments,
      remoteId: newer.id,
      remoteState: newer,
      syncStatus: 'synced',
    })
    release.release()
    expect((await request).documents).toEqual([])
    expect(
      (await db.timeEntries.findOne(docId).exec())?.toMutableJSON(),
    ).toEqual(document.toMutableJSON())
  })
  it('marks a bound correlation ambiguous when another remote ID is observed', async () => {
    const baseline = toRemoteState(canonical, '500')
    await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: baseline,
      syncStatus: 'synced',
    })
    pull.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [{ ...canonical, id: '501' }],
    })
    expect((await strategy.pull(undefined, 25)).documents).toEqual([])
    expect(
      (await db.timeEntries.findOne(docId).exec())?.toMutableJSON(),
    ).toMatchObject({
      remoteId: '500',
      syncStatus: 'ambiguous',
      syncError: 'MULTIPLE_REMOTE_TIME_ENTRIES_FOR_CORRELATION',
      remoteState: baseline,
    })
  })
  it('converges two live RxDB downstreams after both absence lookups finish', async () => {
    const release = gate()
    const ready = gate()
    let arrivals = 0
    pull.mockImplementation(async ({ body }) => ({
      isSuccess: true,
      statusCode: 200,
      data: body.checkpoint.id
        ? []
        : [{ ...canonical, correlationId: undefined }],
    }))
    const second = new TimeEntriesReplication(
      client,
      workspaceId,
      connectionId,
      'provider',
      db.timeEntries,
    )
    const errors: string[] = []
    const replications = [strategy, second].map((replicationStrategy, index) =>
      replicateRxCollection<SyncTimeEntryRxDBDTO, ReplicationCheckpoint>({
        collection: db.timeEntries,
        replicationIdentifier: 'concurrent-import-' + index,
        live: false,
        waitForLeadership: false,
        pull: {
          batchSize: 25,
          handler: async (checkpoint, batchSize) => {
            const result = await replicationStrategy.pull(checkpoint, batchSize)
            if (!checkpoint) {
              arrivals++
              if (arrivals === 2) ready.release()
              await release.promise
            }
            return result
          },
        },
      }),
    )
    const subscriptions = replications.map((replication) =>
      replication.error$.subscribe((error) => errors.push(error.message)),
    )
    try {
      await ready.promise
      expect(await db.timeEntries.count().exec()).toBe(0)
      release.release()
      await Promise.all(
        replications.map((replication) =>
          replication.awaitInitialReplication(),
        ),
      )
      expect(errors).toEqual([])
      expect(await db.timeEntries.count().exec()).toBe(1)
    } finally {
      release.release()
      for (const subscription of subscriptions) subscription.unsubscribe()
      await Promise.all(replications.map((replication) => replication.cancel()))
    }
  })
  it.each([
    'unobserved-newer',
    'unobserved-equal',
    'changed-newer',
    'changed-equal',
  ])(
    'revisits a concurrent document instead of losing a discarded %s version at the checkpoint',
    async (version) => {
      const checkpoint = { id: '400', updatedAt: now }
      const entered = gate()
      const release = gate()
      const next = {
        ...canonical,
        comments: 'R2 from HTTP',
        updatedAt: version.endsWith('equal')
          ? canonical.updatedAt
          : new Date('2026-10-04T12:00:00Z'),
      }
      const initial = {
        ...local,
        remoteId: '500',
        remoteState: toRemoteState(canonical, '500'),
        syncStatus: local.syncStatus,
      }
      initial.syncStatus = 'synced'
      if (version.startsWith('changed')) await db.timeEntries.insert(initial)
      pull.mockImplementationOnce(async () => {
        entered.release()
        await release.promise
        return { isSuccess: true, statusCode: 200, data: [next] }
      })
      const request = strategy.pull(checkpoint, 25)
      await entered.promise
      if (version.startsWith('unobserved')) await db.timeEntries.insert(initial)
      const current = await db.timeEntries.findOne(docId).exec()
      await current?.incrementalModify((draft) => ({
        ...draft,
        lastPushedAt: '2026-10-04T12:01:00.000Z',
      }))
      release.release()
      const discarded = await request
      expect(discarded.documents).toEqual([])
      expect(discarded.checkpoint).toEqual(checkpoint)
      pull.mockResolvedValueOnce({
        isSuccess: true,
        statusCode: 200,
        data: [next],
      })
      const revisited = await strategy.pull(discarded.checkpoint, 25)
      expect((await db.timeEntries.findOne(docId).exec())?.comments).toBe(
        next.comments,
      )
      expect(revisited.checkpoint).toEqual({
        id: '500',
        updatedAt: next.updatedAt.toISOString(),
      })
    },
  )
  it.each(['older', 'acknowledged', 'dirty'])(
    'advances the checkpoint after a discarded %s observation that requires no retry',
    async (scenario) => {
      const entered = gate()
      const release = gate()
      pull.mockImplementationOnce(async () => {
        entered.release()
        await release.promise
        return { isSuccess: true, statusCode: 200, data: [canonical] }
      })
      const request = strategy.pull(undefined, 25)
      await entered.promise
      const approved = toRemoteState(canonical, '500')
      const currentState =
        scenario === 'older'
          ? {
              ...approved,
              updatedAt: '2026-10-04T12:00:00.000Z',
              comments: 'R3 already confirmed',
            }
          : approved
      await db.timeEntries.insert({
        ...local,
        remoteId: '500',
        remoteState: currentState,
        comments:
          scenario === 'dirty' ? 'pending local edit' : currentState.comments,
        syncStatus: scenario === 'dirty' ? 'pending_push' : 'synced',
      })
      release.release()
      const result = await request
      expect(result.documents).toEqual([])
      expect(result.checkpoint).toEqual({
        id: '500',
        updatedAt: canonical.updatedAt.toISOString(),
      })
      expect((await db.timeEntries.findOne(docId).exec())?.comments).toBe(
        scenario === 'dirty' ? 'pending local edit' : currentState.comments,
      )
    },
  )
  it.each(['unobserved', 'changed'])(
    'revisits a concurrent %s reconciliation tombstone before acknowledging remote presence',
    async (scenario) => {
      const checkpoint = { id: '400', updatedAt: now }
      const entered = gate()
      const release = gate()
      const initial: SyncTimeEntryRxDBDTO = {
        ...local,
        remoteId: '500',
        remoteState: toRemoteState(canonical, '500'),
        syncStatus: 'synced',
      }
      if (scenario === 'changed') await db.timeEntries.insert(initial)
      pull.mockImplementationOnce(async () => {
        entered.release()
        await release.promise
        return { isSuccess: true, statusCode: 200, data: [canonical] }
      })
      const request = strategy.pull(checkpoint, 25)
      await entered.promise
      if (scenario === 'unobserved') await db.timeEntries.insert(initial)
      const document = await db.timeEntries.findOne(docId).exec()
      await document?.incrementalModify((draft) => ({
        ...draft,
        _deleted: true,
        remoteDeleted: true,
      }))
      release.release()
      const discarded = await request
      expect(discarded.documents).toEqual([])
      expect(discarded.checkpoint).toEqual(checkpoint)
      expect(await db.timeEntries.findOne(docId).exec()).toBeNull()
      pull.mockResolvedValueOnce({
        isSuccess: true,
        statusCode: 200,
        data: [canonical],
      })
      const restored = await strategy.pull(discarded.checkpoint, 25)
      expect((await db.timeEntries.findOne(docId).exec())?.remoteDeleted).toBe(
        false,
      )
      expect(restored.documents).toHaveLength(1)
      expect(restored.documents[0]._deleted).toBe(false)
      expect(restored.checkpoint).toEqual({
        id: '500',
        updatedAt: canonical.updatedAt.toISOString(),
      })
    },
  )
  it('does not claim or send a draft whose connection changes inside the atomic claim', async () => {
    const document = await db.timeEntries.insert(local)
    const original = document.incrementalModify.bind(document)
    vi.spyOn(document, 'incrementalModify').mockImplementationOnce(
      async (modify) => {
        await original((draft) => ({
          ...draft,
          connectionInstanceId: 'connection-B',
        }))
        return original(modify)
      },
    )
    const replication = replicateRxCollection<
      SyncTimeEntryRxDBDTO,
      ReplicationCheckpoint
    >({
      replicationIdentifier: 'claim-connection-' + crypto.randomUUID(),
      collection: db.timeEntries,
      live: false,
      waitForLeadership: false,
      push: { handler: (rows) => strategy.push(rows) },
    })
    try {
      await replication.awaitInitialReplication()
      expect(push).not.toHaveBeenCalled()
      expect(
        (await db.timeEntries.findOne(docId).exec())?.toMutableJSON(),
      ).toMatchObject({
        connectionInstanceId: 'connection-B',
        syncStatus: 'pending_push',
      })
    } finally {
      await replication.cancel()
    }
  })
  it.each(['validation', 'conflict', 'success'])(
    'ignores a delayed %s result after a second strategy confirms the same remote identity',
    async (outcome) => {
      const initial: SyncTimeEntryRxDBDTO = {
        ...local,
        remoteId: '500',
        remoteState: toRemoteState(canonical, '500'),
        comments: 'R1 pending',
      }
      const document = await db.timeEntries.insert(initial)
      const entered = gate()
      const release = gate()
      const failure = { statusCode: 422, messageKey: 'OLD_BATCH_FAILURE' }
      const response: SyncDocumentViewModel<TimeEntryViewModel> = {
        ...canonical,
        originalId: docId,
        remoteId: '500',
      }
      if (outcome !== 'success') response.validationError = failure
      if (outcome === 'conflict') {
        response.conflicted = true
        response.conflictData = { server: canonical, local: canonical }
      }
      push.mockImplementationOnce(async () => {
        entered.release()
        await release.promise
        return { isSuccess: true, statusCode: 200, data: [response] }
      })
      const replication = replicateRxCollection<
        SyncTimeEntryRxDBDTO,
        ReplicationCheckpoint
      >({
        replicationIdentifier: 'stale-batch-' + crypto.randomUUID(),
        collection: db.timeEntries,
        live: false,
        waitForLeadership: false,
        push: { handler: (rows) => strategy.push(rows) },
      })
      const stale = replication.awaitInitialReplication()
      await entered.promise
      const edited = await document.incrementalModify((draft) => ({
        ...draft,
        comments: 'R2 confirmed',
        syncStatus: 'pending_push',
      }))
      const second = new TimeEntriesReplication(
        client,
        workspaceId,
        connectionId,
        'redmine',
        db.timeEntries,
      )
      push.mockResolvedValueOnce({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            ...canonical,
            originalId: docId,
            comments: 'R2 confirmed',
            updatedAt:
              outcome === 'success'
                ? canonical.updatedAt
                : new Date('2026-10-04T12:00:00Z'),
          },
        ],
      })
      await second.push([{ newDocumentState: edited.toMutableJSON() }])
      const confirmed = (
        await db.timeEntries.findOne(docId).exec()
      )?.toMutableJSON()
      expect(confirmed?.syncStatus).toBe('synced')
      release.release()
      await stale
      await replication.cancel()
      expect(
        (await db.timeEntries.findOne(docId).exec())?.toMutableJSON(),
      ).toEqual(confirmed)
      expect(await strategy.getDocumentError()).toBeNull()
    },
  )
  it('replicates edits to an imported remote entry without inventing a task', async () => {
    const remote = {
      ...canonical,
      task: { id: '' },
      comments: 'project notes edited',
    }
    const baseline = toRemoteState({ ...canonical, task: { id: '' } }, '500')
    const document = await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: baseline,
      task: { id: '' },
      syncStatus: 'synced',
    })
    await document.incrementalModify((draft) =>
      applyTimeEntryEdit(draft, { comments: remote.comments }, now),
    )
    push.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: [{ ...remote, originalId: docId }],
    })
    const replication = replicateRxCollection<
      SyncTimeEntryRxDBDTO,
      ReplicationCheckpoint
    >({
      replicationIdentifier: 'project-only-' + crypto.randomUUID(),
      collection: db.timeEntries,
      live: false,
      waitForLeadership: false,
      push: { handler: (rows) => strategy.push(rows) },
    })
    try {
      await replication.awaitInitialReplication()
      expect(push).toHaveBeenCalledTimes(1)
      expect((await db.timeEntries.findOne(docId).exec())?.syncStatus).toBe(
        'synced',
      )
      expect(
        (await db.timeEntries.findOne(docId).exec())?.remoteState?.task.id,
      ).toBe('')
    } finally {
      await replication.cancel()
    }
  })
  it('rejects a page without progress even when checkpoint keys are reordered, before importing it', async () => {
    const checkpoint = {
      id: '500',
      updatedAt: canonical.updatedAt.toISOString(),
      cursor: 'opaque-position',
    }
    const bridgePull = vi.spyOn(client.timeEntries, 'pull')
    bridgePull.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: {
        items: [canonical],
        hasMore: true,
        snapshotId: 'snapshot',
        checkpoint: {
          cursor: checkpoint.cursor,
          updatedAt: canonical.updatedAt,
          id: checkpoint.id,
        },
      },
    })
    bridgePull.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: {
        items: [],
        hasMore: false,
        snapshotId: 'snapshot',
        checkpoint: { ...checkpoint, updatedAt: canonical.updatedAt },
      },
    })
    await expect(strategy.pull(checkpoint, 10)).rejects.toMatchObject({
      message: 'TIME_ENTRY_PULL_PAGE_INVALID',
    })
    expect(await db.timeEntries.find().exec()).toHaveLength(0)
    expect(bridgePull).toHaveBeenCalledTimes(1)
    bridgePull.mockRestore()
  })

  it('keeps the provider cursor and drains a filtered page before returning imported documents', async () => {
    const baseline = toRemoteState(canonical, '500')
    await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: baseline,
      remoteUpdatedAt: baseline.updatedAt,
      comments: 'local unsent edit',
    })
    const bridgePull = vi.spyOn(client.timeEntries, 'pull')
    bridgePull.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: {
        items: [canonical],
        hasMore: true,
        snapshotId: 'snapshot',
        checkpoint: {
          id: 'provider-position-1',
          updatedAt: canonical.updatedAt,
          cursor: 'opaque-1',
        },
      },
    })
    bridgePull.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: {
        items: [{ ...canonical, id: '501', correlationId: undefined }],
        hasMore: false,
        snapshotId: 'snapshot',
        checkpoint: {
          id: 'provider-position-2',
          updatedAt: canonical.updatedAt,
          cursor: 'opaque-2',
        },
      },
    })
    const result = await strategy.pull(undefined, 10)
    expect(result.documents).toHaveLength(1)
    expect(result.documents.at(0)?.remoteId).toBe('501')
    expect(result.checkpoint).toEqual({
      id: 'provider-position-2',
      updatedAt: canonical.updatedAt.toISOString(),
      cursor: 'opaque-2',
    })
    expect(bridgePull.mock.calls.at(1)?.at(0)?.body.checkpoint.cursor).toBe(
      'opaque-1',
    )
    expect((await db.timeEntries.findOne(docId).exec())?.comments).toBe(
      'local unsent edit',
    )
    bridgePull.mockRestore()
  })

  it('rejects a changed snapshot between filtered pages before importing the second page', async () => {
    const baseline = toRemoteState(canonical, '500')
    await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: baseline,
      remoteUpdatedAt: baseline.updatedAt,
    })
    const bridgePull = vi.spyOn(client.timeEntries, 'pull')
    bridgePull.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: {
        items: [canonical],
        hasMore: true,
        snapshotId: 'snapshot-A',
        checkpoint: {
          id: '500',
          updatedAt: canonical.updatedAt,
          cursor: 'opaque-A',
        },
      },
    })
    bridgePull.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: {
        items: [{ ...canonical, id: '501', correlationId: undefined }],
        hasMore: false,
        snapshotId: 'snapshot-B',
        checkpoint: {
          id: '501',
          updatedAt: canonical.updatedAt,
          cursor: 'opaque-B',
        },
      },
    })
    await expect(strategy.pull(undefined, 10)).rejects.toMatchObject({
      message: 'TIME_ENTRY_PULL_SNAPSHOT_CHANGED',
    })
    expect(
      await db.timeEntries.find({ selector: { remoteId: '501' } }).exec(),
    ).toHaveLength(0)
    bridgePull.mockRestore()
  })

  it('retains a genuinely newer canonical response after another window confirmed an earlier state', async () => {
    const baseline = toRemoteState(canonical, '500')
    const document = await db.timeEntries.insert({
      ...local,
      remoteId: '500',
      remoteState: baseline,
    })
    const entered = gate()
    const release = gate()
    const latest = {
      ...canonical,
      originalId: docId,
      comments: 'newer canonical',
      updatedAt: new Date('2026-10-04T12:00:00Z'),
    }
    push.mockImplementationOnce(async () => {
      entered.release()
      await release.promise
      return { isSuccess: true, statusCode: 200, data: [latest] }
    })
    const request = send(document.toMutableJSON())
    await entered.promise
    const secondState = toRemoteState(
      { ...canonical, comments: 'other window confirmed' },
      '500',
    )
    await document.incrementalModify((draft) => ({
      ...draft,
      remoteState: secondState,
      remoteUpdatedAt: secondState.updatedAt,
      syncStatus: 'synced',
      lastPushedAt: '2026-10-04T11:00:00Z',
    }))
    release.release()
    await request
    expect((await db.timeEntries.findOne(docId).exec())?.comments).toBe(
      latest.comments,
    )
    expect(
      (await db.timeEntries.findOne(docId).exec())?.remoteState?.updatedAt,
    ).toBe(latest.updatedAt.toISOString())
  })

  it('rejects a malformed checkpoint date as a protocol failure', async () => {
    const bridgePull = vi
      .spyOn(client.timeEntries, 'pull')
      .mockResolvedValueOnce({
        isSuccess: true,
        statusCode: 200,
        data: {
          items: [canonical],
          hasMore: true,
          snapshotId: 'snapshot',
          checkpoint: {
            id: '500',
            updatedAt: new Date('invalid'),
            cursor: 'opaque',
          },
        },
      })
    await expect(strategy.pull(undefined, 10)).rejects.toMatchObject({
      message: 'TIME_ENTRY_PULL_PAGE_INVALID',
    })
    expect(await db.timeEntries.find().exec()).toHaveLength(0)
    bridgePull.mockRestore()
  })

  it('does not rewrite acknowledged documents when a changed snapshot revisits them before a new version', async () => {
    const first = { ...canonical, id: '500', correlationId: undefined }
    const second = { ...canonical, id: '501', correlationId: undefined }
    let changed = false
    const entered = gate()
    const bridgePull = vi
      .spyOn(client.timeEntries, 'pull')
      .mockImplementation(async (request) => {
        if (changed) entered.release()
        const snapshotId = changed ? 'snapshot-B' : 'snapshot-A'
        if (request.body.checkpoint.cursor === snapshotId + '-2')
          return {
            isSuccess: true,
            statusCode: 200,
            data: {
              items: [],
              snapshotId,
              hasMore: false,
              checkpoint: request.body.checkpoint,
            },
          }
        const alreadyFirst =
          request.body.checkpoint.cursor === snapshotId + '-1'
        const items = alreadyFirst
          ? [
              {
                ...second,
                comments: changed ? 'new external version' : second.comments,
              },
            ]
          : [first]
        return {
          isSuccess: true,
          statusCode: 200,
          data: {
            items,
            snapshotId,
            hasMore: !alreadyFirst,
            checkpoint: {
              id: alreadyFirst ? '501' : '500',
              updatedAt: canonical.updatedAt,
              cursor: snapshotId + (alreadyFirst ? '-2' : '-1'),
            },
          },
        }
      })
    const replication = replicateRxCollection<
      SyncTimeEntryRxDBDTO,
      ReplicationCheckpoint
    >({
      replicationIdentifier: 'snapshot-noop-' + crypto.randomUUID(),
      collection: db.timeEntries,
      live: true,
      waitForLeadership: false,
      pull: {
        batchSize: 1,
        handler: (checkpoint, batch) => strategy.pull(checkpoint, batch),
      },
      push: { handler: (rows) => strategy.push(rows) },
    })
    try {
      await replication.awaitInitialReplication()
      const document = (
        await db.timeEntries.find({ selector: { remoteId: '500' } }).exec()
      ).find((entry) => entry.remoteId === '500')
      expect(document).toBeDefined()
      if (!document) return
      const before = document.toMutableJSON(true)
      changed = true
      replication.reSync()
      await entered.promise
      await replication.awaitInSync()
      expect(
        (await db.timeEntries.findOne(document.id).exec())?.toMutableJSON(true),
      ).toEqual(before)
      const updated = (
        await db.timeEntries.find({ selector: { remoteId: '501' } }).exec()
      ).find((entry) => entry.remoteId === '501')
      expect(updated?.comments).toBe('new external version')
      expect(push).not.toHaveBeenCalled()
    } finally {
      await replication.cancel()
      bridgePull.mockRestore()
    }
  })
})
