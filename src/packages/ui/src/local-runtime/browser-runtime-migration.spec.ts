import 'fake-indexeddb/auto'

import type {
  LocalTimeEntrySnapshot,
  TimeEntryRemoteState,
} from '@mr-tick/application'
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import { afterEach, describe, expect, it } from 'vitest'

import {
  legacyTimeEntriesSyncSchema,
  timeEntriesSyncSchema,
} from '@/local-db/schemas/time-entries-sync-schema'
import { ensurePlugins } from '@/stores/sync-store/storage'

type MigrationDatabase = RxDatabase<{
  timeEntries: RxCollection<LocalTimeEntrySnapshot>
}>
const opened: MigrationDatabase[] = []
const now = '2026-10-08T10:00:00.000Z'

function snapshot(id: string): LocalTimeEntrySnapshot {
  return {
    id,
    connectionInstanceId: 'migration-connection',
    dataSourceId: 'migration-provider',
    _deleted: false,
    syncStatus: 'pending_push',
    remoteId: null,
    task: { id: 'task' },
    activity: { id: 'activity' },
    user: { id: 'member' },
    startDate: now,
    endDate: '2026-10-08T11:00:00.000Z',
    timeSpent: 1,
    comments: 'must survive schema migration',
    createdAt: now,
    updatedAt: now,
    timeStatus: 'paused',
    type: 'increasing',
    source: 'timer',
    timerConfig: { mode: 'countup', manualInitialSeconds: 60 },
    journal: [
      {
        id: 'start-event',
        action: 'start',
        timestamp: now,
        secondsAtMoment: 0,
        event: 'started',
        at: now,
        secondsAtEvent: 0,
      },
      {
        id: 'pause-event',
        action: 'pause',
        timestamp: '2026-10-08T11:00:00.000Z',
        secondsAtMoment: 3600,
        event: 'paused',
        at: '2026-10-08T11:00:00.000Z',
        secondsAtEvent: 3600,
      },
    ],
  }
}

async function openDatabase(name: string): Promise<MigrationDatabase> {
  const db = await createRxDatabase<{
    timeEntries: RxCollection<LocalTimeEntrySnapshot>
  }>({
    name,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageDexie() }),
    multiInstance: false,
  })
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened) {
    if (!db.closed) await db.close()
  }
  opened.length = 0
})

describe('Renderer profile migration to local command markers', () => {
  it('preserves pending entries, ambiguous confirmation, timer journal and tombstones across schema 0 to 1', async () => {
    await ensurePlugins(false)
    const name = `runtime-migration-${crypto.randomUUID()}`
    const legacy = await openDatabase(name)
    await legacy.addCollections({
      timeEntries: { schema: legacyTimeEntriesSyncSchema },
    })
    const pending = snapshot('pending-local-id')
    const remote: TimeEntryRemoteState = {
      id: 'remote-confirmed-id',
      task: pending.task,
      activity: pending.activity,
      user: pending.user,
      timeSpent: pending.timeSpent,
      startDate: pending.startDate,
      endDate: '2026-10-08T11:00:00.000Z',
      createdAt: now,
      updatedAt: now,
      comments: pending.comments,
    }
    const uncertain: LocalTimeEntrySnapshot = {
      ...snapshot('uncertain-local-id'),
      syncStatus: 'ambiguous',
      remoteId: remote.id,
      creationAttemptId: 'creation-attempt',
      creationState: remote,
      confirmationState: remote,
      remoteState: remote,
      remoteUpdatedAt: now,
    }
    const deleted: LocalTimeEntrySnapshot = {
      ...snapshot('pending-delete-id'),
      remoteId: 'remote-delete-id',
    }
    await legacy.timeEntries.insert(pending)
    await legacy.timeEntries.insert(uncertain)
    const document = await legacy.timeEntries.insert(deleted)
    await document.remove()
    await legacy.close()

    const migrated = await openDatabase(name)
    await migrated.addCollections({
      timeEntries: {
        schema: timeEntriesSyncSchema,
        migrationStrategies: { 1: (record) => record },
      },
    })
    expect(await migrated.timeEntries.migrationNeeded()).toBe(false)
    const pendingDocument = await migrated.timeEntries
      .findOne(pending.id)
      .exec()
    const uncertainDocument = await migrated.timeEntries
      .findOne(uncertain.id)
      .exec()
    expect(pendingDocument?.toMutableJSON(true)).toMatchObject(pending)
    expect(uncertainDocument?.toMutableJSON(true)).toMatchObject(uncertain)
    const tombstones =
      await migrated.timeEntries.storageInstance.findDocumentsById(
        [deleted.id],
        true,
      )
    expect(tombstones).toHaveLength(1)
    for (const tombstone of tombstones) {
      expect(tombstone.id).toBe(deleted.id)
      expect(tombstone._deleted).toBe(true)
      expect(tombstone.syncStatus).toBe('pending_push')
      expect(tombstone.remoteId).toBe(deleted.remoteId)
      expect(tombstone.journal).toEqual(deleted.journal)
    }
    expect(await migrated.timeEntries.find().exec()).toHaveLength(2)
    await migrated.close()

    const reopened = await openDatabase(name)
    await reopened.addCollections({
      timeEntries: {
        schema: timeEntriesSyncSchema,
        migrationStrategies: { 1: (record) => record },
      },
    })
    const restored = await reopened.timeEntries.findOne(pending.id).exec()
    expect(restored?.toMutableJSON().journal).toEqual(pending.journal)
    await reopened.remove()
  })
})
