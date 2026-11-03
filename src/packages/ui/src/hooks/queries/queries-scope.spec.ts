import type { IHostBridge } from '@mr-tick/application'
import type { AddonLoadFailuresSnapshot } from '@mr-tick/shared/view-models'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { createRxDatabase, type RxDatabase } from 'rxdb'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAddonLoadFailures } from '@/hooks/use-addon-load-failures'
import type { ConnectionScope } from '@/lib/connection-scope'
import {
  getAllPriorities,
  getAllstatus,
  getEstimatedHoursRange,
  getTaskPriorityCounts,
  getTasks,
  getTaskStatusCounts,
} from '@/pages/activities/lib/queries'
import type { AppDatabase } from '@/stores/syncStore'

const state = vi.hoisted(() => ({
  db: undefined as AppDatabase | undefined,
  statuses: {},
}))
const bridge = vi.hoisted(() => ({
  addons: {
    getLoadFailures: vi.fn<IHostBridge['addons']['getLoadFailures']>(),
  },
  events: { on: vi.fn().mockReturnValue(() => {}) },
}))
vi.mock('@/hooks/use-host-bridge', () => ({ useHostBridge: () => bridge }))
vi.mock('@/stores/syncStore', () => ({
  useSyncStore: (selector: (value: typeof state) => unknown) => selector(state),
}))

import { useActivitiesQuery } from './use-activities-query'
import { useTasksQuery } from './use-tasks-query'
import { useTimeEntriesQuery } from './use-time-entries-query'

let db: RxDatabase
let client: QueryClient
let sequence = 0
const day = new Date('2026-11-02T12:00:00.000Z')
const all: ConnectionScope = { kind: 'all' }
const none: ConnectionScope = { kind: 'none' }
const onlyA: ConnectionScope = { kind: 'subset', ids: ['conn-a'] }

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children)
}

// Real memory storage executes production selectors. Minimal schemas exercise the
// query contract, not validation/ingestion of complete provider DTOs.
beforeEach(async () => {
  bridge.addons.getLoadFailures.mockReset()
  db = await createRxDatabase({
    name: `qadockhooks${++sequence}`,
    storage: getRxStorageMemory(),
    multiInstance: false,
  })
  const properties = {
    id: { type: 'string', maxLength: 200 },
    connectionInstanceId: { type: 'string', maxLength: 100 },
    updatedAt: { type: 'string', maxLength: 40 },
    startDate: { type: 'string', maxLength: 40 },
    sourceId: { type: 'string' },
    title: { type: 'string' },
    timeSpent: { type: 'number' },
    activities: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  }
  const schema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    additionalProperties: true,
    properties,
    required: ['id', 'updatedAt', 'startDate'],
  }
  await db.addCollections({
    timeEntries: { schema },
    tasks: { schema },
    metadata: { schema },
  })

  for (const [suffix, hours] of [
    ['a', 1],
    ['b', 2],
    ['c', 4],
  ] as const) {
    const common = {
      id: `conn-${suffix}::shared`,
      connectionInstanceId: `conn-${suffix}`,
      sourceId: 'shared',
      updatedAt: day.toISOString(),
      startDate: day.toISOString(),
    }
    await db.timeEntries.insert({ ...common, timeSpent: hours })
    await db.tasks.insert({
      ...common,
      title: `Task ${suffix}`,
      author: { id: 'shared-member' },
      status: { id: `status-${suffix}`, name: `Status ${suffix}` },
      priority: { id: `priority-${suffix}`, name: `Priority ${suffix}` },
      estimatedTimes: [{ hours }],
    })
    await db.metadata.insert({
      ...common,
      activities: [{ id: `activity-${suffix}`, name: `Activity ${suffix}` }],
      taskStatuses: [
        { id: 'common-status', name: 'Shared status' },
        { id: `status-${suffix}`, name: `Status ${suffix}` },
      ],
      taskPriorities: [
        { id: 'common-priority', name: 'Shared priority' },
        { id: `priority-${suffix}`, name: `Priority ${suffix}` },
      ],
    })
  }

  state.db = db as unknown as AppDatabase
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
})

afterEach(async () => {
  cleanup()
  client?.clear()
  state.db = undefined
  vi.restoreAllMocks()
  await db?.remove()
})

describe('Production hooks + QueryClient + real RxDB memory', () => {
  it('executes the six real backlog queries, merging A+B metadata and preserving member AND connection scope', async () => {
    const database = db as unknown as AppDatabase
    const scope: ConnectionScope = { kind: 'subset', ids: ['conn-a', 'conn-b'] }
    const input = {
      page: 1,
      perPage: 10,
      sort: [],
      status: [],
      priority: [],
      createdAt: [],
      estimatedHours: [],
    }
    const [page, statuses, priorities, hours, statusCatalog, priorityCatalog] =
      await Promise.all([
        getTasks(database, ['shared-member'], input, scope),
        getTaskStatusCounts(database, ['shared-member'], scope),
        getTaskPriorityCounts(database, ['shared-member'], scope),
        getEstimatedHoursRange(database, ['shared-member'], scope),
        getAllstatus(database, scope),
        getAllPriorities(database, scope),
      ])
    expect(page.data.map((task) => task.id).sort()).toEqual([
      'conn-a::shared',
      'conn-b::shared',
    ])
    expect(page.pageCount).toBe(1)
    expect(statuses).toEqual({
      'Shared status': 0,
      'Status a': 1,
      'Status b': 1,
    })
    expect(priorities).toEqual({
      'Shared priority': 0,
      'Priority a': 1,
      'Priority b': 1,
    })
    expect(hours).toEqual({ min: 1, max: 2 })
    expect(statusCatalog.map((item) => item.id)).toEqual([
      'common-status',
      'status-a',
      'status-b',
    ])
    expect(priorityCatalog.map((item) => item.id)).toEqual([
      'common-priority',
      'priority-a',
      'priority-b',
    ])
    const wrongMember = await getTasks(database, ['other-member'], input, scope)
    expect(wrongMember).toEqual({ data: [], pageCount: 0 })

    const finds = [vi.spyOn(db.tasks, 'find'), vi.spyOn(db.metadata, 'find')]
    expect(
      await Promise.all([
        getTasks(database, ['shared-member'], input, none),
        getTaskStatusCounts(database, ['shared-member'], none),
        getTaskPriorityCounts(database, ['shared-member'], none),
        getEstimatedHoursRange(database, ['shared-member'], none),
        getAllstatus(database, none),
        getAllPriorities(database, none),
      ]),
    ).toEqual([{ data: [], pageCount: 0 }, {}, {}, { min: 0, max: 0 }, [], []])
    for (const find of finds) expect(find).not.toHaveBeenCalled()
  })
  for (const scenario of [
    {
      scope: all,
      ids: ['conn-a::shared', 'conn-b::shared', 'conn-c::shared'],
      hours: 7,
    },
    { scope: onlyA, ids: ['conn-a::shared'], hours: 1 },
    {
      scope: { kind: 'subset', ids: ['conn-a', 'conn-b'] } as ConnectionScope,
      ids: ['conn-a::shared', 'conn-b::shared'],
      hours: 3,
    },
    { scope: none, ids: [], hours: 0 },
  ]) {
    it(`executes ${JSON.stringify(scenario.scope)} in queryFn and subscription`, async () => {
      const finds = [
        vi.spyOn(db.timeEntries, 'find'),
        vi.spyOn(db.tasks, 'find'),
        vi.spyOn(db.metadata, 'find'),
      ]
      const { result } = renderHook(
        () => ({
          entries: useTimeEntriesQuery({
            from: day,
            to: day,
            scope: scenario.scope,
          }),
          tasks: useTasksQuery({ scope: scenario.scope }),
          activities: useActivitiesQuery({ scope: scenario.scope }),
        }),
        { wrapper },
      )

      await waitFor(() =>
        expect(
          result.current.entries.isLoading ||
            result.current.tasks.isLoading ||
            result.current.activities.isLoading,
        ).toBe(false),
      )
      await waitFor(() =>
        expect(
          result.current.entries.data.map((entry) => entry.id).sort(),
        ).toEqual(scenario.ids),
      )
      expect(
        result.current.entries.data.reduce(
          (sum, entry) => sum + entry.timeSpent,
          0,
        ),
      ).toBe(scenario.hours)
      expect(result.current.tasks.data.map((task) => task.id).sort()).toEqual(
        scenario.ids,
      )
      expect(
        Object.keys(result.current.activities.activitiesByConnection).sort(),
      ).toEqual(scenario.ids.map((id) => id.split('::').at(0)))

      for (const find of finds) {
        if (scenario.scope.kind === 'none') {
          expect(find).not.toHaveBeenCalled()
          continue
        }

        expect(find.mock.calls.length).toBeGreaterThanOrEqual(2)
        for (const [query] of find.mock.calls) {
          if (scenario.scope.kind === 'subset')
            expect(query?.selector).toMatchObject({
              connectionInstanceId: { $in: scenario.scope.ids },
            })
          if (scenario.scope.kind === 'all')
            expect(query?.selector ?? {}).not.toHaveProperty(
              'connectionInstanceId',
            )
        }
      }
    })
  }

  it('isolates caches, applies real live writes and stops cache updates on unmount', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ scope }: { scope: ConnectionScope }) => ({
        entries: useTimeEntriesQuery({ from: day, to: day, scope }),
        tasks: useTasksQuery({ scope }),
        activities: useActivitiesQuery({ scope }),
      }),
      { wrapper, initialProps: { scope: all } },
    )
    await waitFor(() => expect(result.current.entries.data).toHaveLength(3))
    rerender({ scope: onlyA })
    await waitFor(() =>
      expect(result.current.entries.data.map((entry) => entry.id)).toEqual([
        'conn-a::shared',
      ]),
    )

    await act(async () => {
      const entry = await db.timeEntries.findOne('conn-a::shared').exec()
      await entry?.incrementalPatch({ timeSpent: 5 })
      const task = await db.tasks.findOne('conn-a::shared').exec()
      await task?.incrementalPatch({ title: 'Updated A' })
      const metadata = await db.metadata.findOne('conn-a::shared').exec()
      await metadata?.incrementalPatch({
        activities: [{ id: 'activity-updated', name: 'Updated A' }],
      })
    })
    await waitFor(() =>
      expect(
        result.current.entries.data.map((entry) => entry.timeSpent),
      ).toEqual([5]),
    )
    await waitFor(() =>
      expect(result.current.tasks.data.map((task) => task.title)).toEqual([
        'Updated A',
      ]),
    )
    await waitFor(() =>
      expect(
        result.current.activities.data.map((activity) => activity.id),
      ).toEqual(['activity-updated']),
    )
    rerender({ scope: none })
    await waitFor(() => expect(result.current.entries.data).toEqual([]))
    expect(result.current.tasks.data).toEqual([])
    expect(result.current.activities.data).toEqual([])
    const cacheWrite = vi.spyOn(client, 'setQueryData')
    unmount()
    cacheWrite.mockClear()
    await act(async () => {
      const entry = await db.timeEntries.findOne('conn-a::shared').exec()
      await entry?.incrementalPatch({ timeSpent: 9 })
      await db.timeEntries.find().exec()
    })
    expect(cacheWrite).not.toHaveBeenCalled()
  })
})

describe('Production IPC state hook with mocked transport boundary (not Electron E2E)', () => {
  it('ignores a late failed ViewModel from a pull started before a valid push', async () => {
    let resolvePull: (
      value: Awaited<ReturnType<IHostBridge['addons']['getLoadFailures']>>,
    ) => void = () => {}
    bridge.addons.getLoadFailures.mockReturnValue(
      new Promise((resolve) => {
        resolvePull = resolve
      }),
    )
    let push: (snapshot: AddonLoadFailuresSnapshot) => void = () => {}
    bridge.events.on.mockImplementation((channel, callback) => {
      expect(channel).toBe('addons:load-failures-changed')
      push = callback
      return () => {}
    })
    const { result } = renderHook(() => useAddonLoadFailures())
    await act(async () => {
      push({ revision: 7, failures: [] })
    })
    await act(async () => {
      resolvePull({
        isSuccess: false,
        statusCode: 503,
        error: 'QA_OLD_PULL_FAILURE',
      })
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.errorMessage).toBeNull()
  })
  it('exposes a failed ViewModel as unavailable and preserves its original error', async () => {
    bridge.addons.getLoadFailures.mockResolvedValue({
      isSuccess: false,
      statusCode: 503,
      error: 'QA_FAILURE_SNAPSHOT_UNAVAILABLE',
    })
    const { result } = renderHook(() => useAddonLoadFailures())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(true)
    expect(result.current.errorMessage).toBe('QA_FAILURE_SNAPSHOT_UNAVAILABLE')
  })

  it('exposes a rejected transport promise and unregisters the real hook subscription', async () => {
    const unsubscribe = vi.fn()
    bridge.events.on.mockReturnValue(unsubscribe)
    bridge.addons.getLoadFailures.mockRejectedValue(
      new Error('QA_TRANSPORT_REJECTED'),
    )
    const { result, unmount } = renderHook(() => useAddonLoadFailures())
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorMessage).toBe('QA_TRANSPORT_REJECTED')
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('keeps a successful newer push when an older pending pull subsequently fails', async () => {
    let rejectPull: (reason: Error) => void = () => {}
    bridge.addons.getLoadFailures.mockReturnValue(
      new Promise((resolve, reject) => {
        void resolve
        rejectPull = reject
      }),
    )
    let push: (snapshot: AddonLoadFailuresSnapshot) => void = () => {}
    bridge.events.on.mockImplementation((channel, callback) => {
      expect(channel).toBe('addons:load-failures-changed')
      push = callback
      return () => {}
    })
    const { result } = renderHook(() => useAddonLoadFailures())
    await act(async () => {
      push({ revision: 7, failures: [] })
    })
    expect(result.current.isError).toBe(false)
    await act(async () => {
      rejectPull(new Error('QA_OLD_PULL_REJECTED'))
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.errorMessage).toBeNull()
  })
})
