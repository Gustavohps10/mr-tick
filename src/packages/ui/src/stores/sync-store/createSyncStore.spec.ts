import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSyncStore } from './createSyncStore'
import { ReplicationBridge } from './types'

const mockModuleStart = vi.fn().mockResolvedValue(undefined)
const mockModuleDestroy = vi.fn().mockResolvedValue(undefined)
const mockModuleForceSync = vi.fn().mockResolvedValue(undefined)

vi.mock('./module', () => {
  return {
    COLLECTION_CONFIGS: [
      {
        name: 'metadata',
        interval: 60,
        batch: 10,
        hasPush: false,
        strategyFactory: vi.fn(),
      },
      {
        name: 'tasks',
        interval: 60,
        batch: 10,
        hasPush: false,
        strategyFactory: vi.fn(),
      },
      {
        name: 'timeEntries',
        interval: 60,
        batch: 10,
        hasPush: true,
        strategyFactory: vi.fn(),
      },
    ],
    ReplicationModule: class MockReplicationModule {
      start = mockModuleStart
      destroy = mockModuleDestroy
      forceSync = mockModuleForceSync
    },
  }
})

let reconcileGate: { promise: Promise<void>; resolve: () => void } | null = null

const mockReconcileTimeEntries = vi.fn().mockImplementation(async () => {
  if (reconcileGate) {
    await reconcileGate.promise
  }
  return {
    isSuccess: () => true,
    isFailure: () => false,
  }
})

vi.mock('./reconcileTimeEntries', () => ({
  reconcileTimeEntries: (...args: unknown[]) =>
    mockReconcileTimeEntries(...args),
}))

const {
  mockRemoveTask,
  mockRemoveEntry,
  mockRemoveMetadata,
  mockTasksFind,
  mockTimeEntriesFind,
  mockMetadataFind,
} = vi.hoisted(() => {
  const mockRemoveTask = vi.fn().mockResolvedValue(undefined)
  const mockRemoveEntry = vi.fn().mockResolvedValue(undefined)
  const mockRemoveMetadata = vi.fn().mockResolvedValue(undefined)

  const mockTasksFind = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue([{ id: 'task-1', remove: mockRemoveTask }]),
  })
  const mockTimeEntriesFind = vi.fn().mockReturnValue({
    exec: vi
      .fn()
      .mockResolvedValue([{ id: 'entry-1', remove: mockRemoveEntry }]),
  })
  const mockMetadataFind = vi.fn().mockReturnValue({
    exec: vi
      .fn()
      .mockResolvedValue([{ id: 'meta-1', remove: mockRemoveMetadata }]),
  })

  return {
    mockRemoveTask,
    mockRemoveEntry,
    mockRemoveMetadata,
    mockTasksFind,
    mockTimeEntriesFind,
    mockMetadataFind,
  }
})

vi.mock('./storage', () => ({
  ensurePlugins: vi.fn().mockResolvedValue(undefined),
  getOrCreateDatabase: vi.fn().mockResolvedValue({
    timeEntries: { name: 'timeEntries', find: mockTimeEntriesFind },
    tasks: { name: 'tasks', find: mockTasksFind },
    metadata: { name: 'metadata', find: mockMetadataFind },
    closed: false,
    remove: vi.fn().mockResolvedValue(undefined),
  }),
  releaseDatabase: vi.fn().mockResolvedValue(undefined),
  removeDatabaseFromCache: vi.fn(),
  getDatabaseName: vi.fn().mockReturnValue('mock-db'),
  dropAppStorage: vi.fn().mockResolvedValue(undefined),
}))

describe('createSyncStore deduplication and idempotency', () => {
  const fakeBridge = {
    timeEntries: {
      listTimeEntries: vi.fn(),
    },
  } as unknown as ReplicationBridge

  beforeEach(() => {
    vi.clearAllMocks()
    reconcileGate = null
  })

  afterEach(() => {
    if (reconcileGate) {
      reconcileGate.resolve()
    }
  })

  it('connectDataSource starts modules and triggers reconcile', async () => {
    const store = createSyncStore('ws-1', fakeBridge, false, true)
    await store.getState().init()

    await store.getState().connectDataSource({
      connectionInstanceId: 'conn-1',
      dataSourceId: 'redmine',
    })

    // 3 collections: metadata, tasks, timeEntries
    expect(mockModuleStart).toHaveBeenCalledTimes(3)
    expect(mockReconcileTimeEntries).toHaveBeenCalledTimes(1)
  })

  it('connectDataSource is idempotent when called with identical parameters', async () => {
    const store = createSyncStore('ws-1', fakeBridge, false, true)
    await store.getState().init()

    await store.getState().connectDataSource({
      connectionInstanceId: 'conn-1',
      dataSourceId: 'redmine',
    })

    expect(mockModuleStart).toHaveBeenCalledTimes(3)
    expect(mockModuleDestroy).toHaveBeenCalledTimes(0)

    // Call connectDataSource again with the exact same connection & addon
    await store.getState().connectDataSource({
      connectionInstanceId: 'conn-1',
      dataSourceId: 'redmine',
    })

    // Should NOT destroy and should NOT restart modules
    expect(mockModuleStart).toHaveBeenCalledTimes(3)
    expect(mockModuleDestroy).toHaveBeenCalledTimes(0)
    expect(mockReconcileTimeEntries).toHaveBeenCalledTimes(1)
  })

  it('concurrent connectDataSource calls for the same connection do not duplicate module starts', async () => {
    const store = createSyncStore('ws-1', fakeBridge, false, true)
    await store.getState().init()

    // Trigger two connect calls concurrently (like two windows opening simultaneously)
    await Promise.all([
      store.getState().connectDataSource({
        connectionInstanceId: 'conn-1',
        dataSourceId: 'redmine',
      }),
      store.getState().connectDataSource({
        connectionInstanceId: 'conn-1',
        dataSourceId: 'redmine',
      }),
    ])

    expect(mockModuleStart).toHaveBeenCalledTimes(3)
    expect(mockModuleDestroy).toHaveBeenCalledTimes(0)
  })

  it('connectDataSource destroys and recreates modules if dataSourceId changes', async () => {
    const store = createSyncStore('ws-1', fakeBridge, false, true)
    await store.getState().init()

    await store.getState().connectDataSource({
      connectionInstanceId: 'conn-1',
      dataSourceId: 'redmine',
    })
    expect(mockModuleStart).toHaveBeenCalledTimes(3)

    // Change data source id for the same connection
    await store.getState().connectDataSource({
      connectionInstanceId: 'conn-1',
      dataSourceId: 'jira',
    })

    // Previous 3 modules destroyed, 3 new modules started
    expect(mockModuleDestroy).toHaveBeenCalledTimes(3)
    expect(mockModuleStart).toHaveBeenCalledTimes(6)
  })

  it('reconcile prevents concurrent executions for the same connection', async () => {
    let resolveFn: () => void = () => undefined
    const promise = new Promise<void>((res) => {
      resolveFn = res
    })
    reconcileGate = { promise, resolve: resolveFn }

    const store = createSyncStore('ws-1', fakeBridge, false, true)
    await store.getState().init()

    // Start first reconcile (will hold at gate)
    const firstReconcile = store.getState().reconcile('conn-1')

    // Second reconcile while first is reconciling
    const secondReconcile = store.getState().reconcile('conn-1')

    // Release the gate
    reconcileGate.resolve()
    await Promise.all([firstReconcile, secondReconcile])

    // Should only have called reconcileTimeEntries once!
    expect(mockReconcileTimeEntries).toHaveBeenCalledTimes(1)
  })

  it('purgeConnectionData disconnects modules and removes tasks, timeEntries and metadata', async () => {
    const store = createSyncStore('ws-1', fakeBridge, false, true)
    await store.getState().init()

    await store.getState().connectDataSource({
      connectionInstanceId: 'conn-1',
      dataSourceId: 'generic-provider',
    })

    expect(mockModuleStart).toHaveBeenCalledTimes(3)

    await store.getState().purgeConnectionData('conn-1')

    expect(mockModuleDestroy).toHaveBeenCalledTimes(3)
    expect(mockRemoveTask).toHaveBeenCalled()
    expect(mockRemoveEntry).toHaveBeenCalled()
    expect(mockRemoveMetadata).toHaveBeenCalled()
  })
})
