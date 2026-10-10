import 'fake-indexeddb/auto'

import type {
  ILocalRuntimeAPI,
  LocalRuntimeResponse,
  LocalTimeEntrySnapshot,
} from '@mr-tick/application'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerDatabaseScope } from '@/local-runtime/persistence-client'
import {
  ensurePlugins,
  getOrCreateDatabase,
  removeDatabaseFromCache,
} from '@/stores/sync-store/storage'
import type { AppDatabase } from '@/stores/sync-store/types'

import { createTimeEntryStore } from './timeEntryStore'

function deferred<T>() {
  let resolve: (value: T) => void = () => expect.fail('Promise not initialized')
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function runningEntry(): LocalTimeEntrySnapshot {
  return {
    id: 'running-entry',
    connectionInstanceId: 'connection',
    dataSourceId: 'source',
    _deleted: false,
    syncStatus: 'local_only',
    task: { id: '' },
    activity: { id: '' },
    user: { id: '' },
    startDate: '2026-10-10T10:00:00.000Z',
    endDate: null,
    timeSpent: 0,
    timeStatus: 'running',
    source: 'timer',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  }
}

const runtime: ILocalRuntimeAPI = {
  request: async () => ({
    ok: false,
    error: { statusCode: 503, messageKey: 'UNUSED_RUNTIME' },
  }),
}

describe('Timer projection ordering', () => {
  let database: AppDatabase
  let workspaceId: string

  beforeEach(async () => {
    workspaceId = crypto.randomUUID()
    await ensurePlugins(false)
    database = await getOrCreateDatabase(workspaceId, false, true)
    registerDatabaseScope(database, workspaceId)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await database.close()
    removeDatabaseFromCache(workspaceId, true)
  })

  it('preserves an observed running timer when an earlier reader resolves empty', async () => {
    const query = database.timeEntries.find({
      selector: { timeStatus: { $in: ['running', 'paused'] } },
    })
    const stale = deferred<Awaited<ReturnType<typeof query.exec>>>()
    vi.spyOn(query, 'exec').mockImplementationOnce(() => stale.promise)
    const store = createTimeEntryStore({ localRuntime: runtime })
    store.getState().observeProjection(null)
    const refresh = store.getState().recoverRunningEntry(database)
    const observed = runningEntry()
    store.getState().setActive(observed)
    stale.resolve([])
    await refresh
    expect(store.getState().active).toEqual(observed)
  })

  it.each(['stop', 'teardown'])(
    'does not restore a timer after a newer %s',
    async (transition) => {
      await database.timeEntries.insert(runningEntry())
      const query = database.timeEntries.find({
        selector: { timeStatus: { $in: ['running', 'paused'] } },
      })
      const documents = await query.exec()
      const stale = deferred<Awaited<ReturnType<typeof query.exec>>>()
      vi.spyOn(query, 'exec').mockImplementationOnce(() => stale.promise)
      const store = createTimeEntryStore({ localRuntime: runtime })
      store.getState().observeProjection(null)
      store.getState().setActive(runningEntry())
      const refresh = store.getState().recoverRunningEntry(database)
      if (transition === 'stop') store.getState().clear()
      if (transition === 'teardown') store.getState().endProjection()
      stale.resolve(documents)
      await refresh
      expect(store.getState().active).toBeNull()
      expect(store.getState().isReady).toBe(transition === 'stop')
    },
  )

  it('keeps the result of a newer refresh when two readers complete out of order', async () => {
    await database.timeEntries.insert(runningEntry())
    const query = database.timeEntries.find({
      selector: { timeStatus: { $in: ['running', 'paused'] } },
    })
    const documents = await query.exec()
    const earlier = deferred<Awaited<ReturnType<typeof query.exec>>>()
    const later = deferred<Awaited<ReturnType<typeof query.exec>>>()
    vi.spyOn(query, 'exec')
      .mockImplementationOnce(() => earlier.promise)
      .mockImplementationOnce(() => later.promise)
    const store = createTimeEntryStore({ localRuntime: runtime })
    store.getState().observeProjection(null)
    const first = store.getState().recoverRunningEntry(database)
    const second = store.getState().recoverRunningEntry(database)
    later.resolve([])
    await second
    earlier.resolve(documents)
    await first
    expect(store.getState().active).toBeNull()
  })

  it('recovers the active timer when no newer observation supersedes the reader', async () => {
    await database.timeEntries.insert(runningEntry())
    const store = createTimeEntryStore({ localRuntime: runtime })
    store.getState().observeProjection(null)
    await store.getState().recoverRunningEntry(database)
    expect(store.getState().active).toEqual(
      expect.objectContaining({ id: 'running-entry', timeStatus: 'running' }),
    )
  })

  it('preserves an observation received before the command acknowledgement', async () => {
    const acknowledgement = deferred<LocalRuntimeResponse>()
    const store = createTimeEntryStore({
      localRuntime: { request: () => acknowledgement.promise },
    })
    store.getState().observeProjection(null)
    const start = store.getState().createNewTimeEntry(database, {
      taskId: '',
      activityId: '',
      dataSourceId: '',
      connectionInstanceId: '',
      type: 'increasing',
    })
    const observed = runningEntry()
    store.getState().setActive(observed)
    acknowledgement.resolve({
      ok: true,
      value: { entry: null, entries: [], timer: null, deleted: false },
    })
    await start
    expect(store.getState().active).toEqual(observed)
  })

  it.each(['pause', 'resume'])(
    'preserves a newer observation while %s awaits acknowledgement',
    async (action) => {
      const acknowledgement = deferred<LocalRuntimeResponse>()
      const store = createTimeEntryStore({
        localRuntime: { request: () => acknowledgement.promise },
      })
      store.getState().observeProjection(null)
      store.getState().setActive(runningEntry())
      const operation =
        action === 'pause'
          ? store.getState().pauseCurrentTimeEntry(database)
          : store.getState().playCurrentTimeEntry(database)
      const observed: LocalTimeEntrySnapshot = {
        ...runningEntry(),
        timeStatus: action === 'pause' ? 'paused' : 'running',
      }
      store.getState().setActive(observed)
      acknowledgement.resolve({
        ok: true,
        value: { entry: null, entries: [], timer: null, deleted: false },
      })
      await operation
      expect(store.getState().active).toEqual(observed)
    },
  )

  it('does not let a late stop acknowledgement clear a newer active timer', async () => {
    const acknowledgement = deferred<LocalRuntimeResponse>()
    const store = createTimeEntryStore({
      localRuntime: { request: () => acknowledgement.promise },
    })
    store.getState().observeProjection(null)
    store.getState().setActive(runningEntry())
    const stop = store.getState().stopCurrentTimeEntry(database)
    const newer = { ...runningEntry(), id: 'newer-entry' }
    store.getState().setActive(newer)
    acknowledgement.resolve({
      ok: true,
      value: { entry: null, entries: [], timer: null, deleted: false },
    })
    await stop
    expect(store.getState().active).toEqual(newer)
  })

  it('starts a new timer after successfully stopping the previous one', async () => {
    const previous = await database.timeEntries.insert(runningEntry())
    const request = vi.fn<ILocalRuntimeAPI['request']>(async (input) => {
      if (input.action === 'timerStop') {
        await previous.incrementalPatch({
          timeStatus: 'finished',
          endDate: '2026-10-10T11:00:00.000Z',
        })
        return {
          ok: true,
          value: { entry: null, entries: [], timer: null, deleted: false },
        }
      }
      if (input.action === 'timerStart') {
        await database.timeEntries.insert({
          ...runningEntry(),
          id: input.entryId,
        })
        return {
          ok: true,
          value: { entry: null, entries: [], timer: null, deleted: false },
        }
      }
      return {
        ok: false,
        error: { statusCode: 422, messageKey: 'UNEXPECTED_COMMAND' },
      }
    })
    const store = createTimeEntryStore({ localRuntime: { request } })
    store.getState().observeProjection(null)
    store.getState().setActive(runningEntry())
    await store.getState().createNewTimeEntry(database, {
      taskId: '',
      activityId: '',
      dataSourceId: '',
      connectionInstanceId: '',
      type: 'increasing',
    })
    expect(request.mock.calls.map(([input]) => input.action)).toEqual([
      'timerStop',
      'timerStart',
    ])
    const active = store.getState().active
    expect(active?.timeStatus).toBe('running')
    expect(active?.id).not.toBe('running-entry')
    expect(active).not.toBeNull()
  })

  it('does not start another timer when stopping the current one fails', async () => {
    const request = vi.fn<ILocalRuntimeAPI['request']>(runtime.request)
    const store = createTimeEntryStore({ localRuntime: { request } })
    store.getState().observeProjection(null)
    const observed = runningEntry()
    store.getState().setActive(observed)
    await store.getState().createNewTimeEntry(database, {
      taskId: '',
      activityId: '',
      dataSourceId: '',
      connectionInstanceId: '',
      type: 'increasing',
    })
    expect(request.mock.calls.map(([input]) => input.action)).toEqual([
      'timerStop',
    ])
    expect(store.getState().active).toEqual(observed)
  })

  it.each(['start', 'pause', 'resume', 'stop'])(
    'refuses %s until the initial projection is available',
    async (action) => {
      const request = vi.fn<ILocalRuntimeAPI['request']>(runtime.request)
      const store = createTimeEntryStore({ localRuntime: { request } })
      store.getState().setActive(runningEntry())
      expect(store.getState().isReady).toBe(false)
      switch (action) {
        case 'start':
          await store.getState().createNewTimeEntry(database, {
            taskId: '',
            activityId: '',
            dataSourceId: '',
            connectionInstanceId: '',
            type: 'increasing',
          })
          break
        case 'pause':
          await store.getState().pauseCurrentTimeEntry(database)
          break
        case 'resume':
          await store.getState().playCurrentTimeEntry(database)
          break
        case 'stop':
          await store.getState().stopCurrentTimeEntry(database)
          break
      }
      expect(request).not.toHaveBeenCalled()
      expect(store.getState().active?.id).toBe('running-entry')
    },
  )

  it.each(['loading', 'reopened'])(
    'does not continue Start after Stop when the reader is %s',
    async (state) => {
      const acknowledgement = deferred<LocalRuntimeResponse>()
      const request = vi.fn<ILocalRuntimeAPI['request']>(
        () => acknowledgement.promise,
      )
      const store = createTimeEntryStore({ localRuntime: { request } })
      store.getState().observeProjection(runningEntry())
      const start = store.getState().createNewTimeEntry(database, {
        taskId: '',
        activityId: '',
        dataSourceId: '',
        connectionInstanceId: '',
        type: 'increasing',
      })
      store.getState().endProjection()
      if (state === 'reopened') {
        store.getState().beginProjection()
        store.getState().observeProjection(null)
      }
      acknowledgement.resolve({
        ok: true,
        value: { entry: null, entries: [], timer: null, deleted: false },
      })
      await start
      expect(request.mock.calls.map(([input]) => input.action)).toEqual([
        'timerStop',
      ])
      expect(store.getState().active).toBeNull()
    },
  )
})
