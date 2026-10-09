import type { IHostBridge } from '@mr-tick/application'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest'
import { createStore, StoreApi } from 'zustand'

import type { AddonConnectionView } from '@/contexts/DataSourceConnectionsContext'

import type { SyncStore } from './types'

interface TestContext {
  workspaceId: string | null
  connections: AddonConnectionView[]
  bridge: Pick<IHostBridge, 'events'> & {
    localSync: { request: Mock<IHostBridge['localSync']['request']> }
  }
  create: Mock<(workspaceId: string) => StoreApi<SyncStore>>
}
const context = vi.hoisted<TestContext>(() => ({
  workspaceId: null,
  connections: [],
  bridge: {
    events: { on: () => () => undefined, emit: () => undefined },
    localSync: { request: vi.fn<IHostBridge['localSync']['request']>() },
  },
  create: vi.fn<(workspaceId: string) => StoreApi<SyncStore>>(),
}))
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspace: context.workspaceId ? { id: context.workspaceId } : null,
  }),
}))
vi.mock('@/contexts/DataSourceConnectionsContext', () => ({
  useDataSourceConnections: () => ({ connections: context.connections }),
}))
vi.mock('@/hooks', () => ({
  useEnvironment: () => ({ isDevelopment: false, isTest: false }),
}))
vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => context.bridge,
}))
vi.mock('./createSyncStore', () => ({ createSyncStore: context.create }))

import { SyncProvider, useSyncStore } from './SyncProvider'

const gates: Array<{ release: () => void }> = []
function gate() {
  let resolveGate: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolveGate = resolve
  })
  const result = {
    promise,
    release: () => {
      if (resolveGate) resolveGate()
    },
  }
  gates.push(result)
  return result
}

function fixture(
  id: string,
  initGate?: Promise<void>,
  destroyGate?: Promise<void>,
  connectionGate?: Promise<void>,
) {
  const initStarted = gate()
  const destroyStarted = gate()
  const connectionStarted = gate()
  const destroy = vi.fn(async () => {
    destroyStarted.release()
    if (destroyGate) await destroyGate
    store.setState({ isInitialized: false })
  })
  const connect = vi.fn<SyncStore['connectDataSource']>(async () => {
    connectionStarted.release()
    if (connectionGate) await connectionGate
  })
  const store = createStore<SyncStore>(() => ({
    db: null,
    statuses: {},
    isInitialized: false,
    init: async () => {
      initStarted.release()
      if (initGate) await initGate
      store.setState({
        isInitialized: true,
        statuses: {
          [id]: {
            isActive: false,
            isPulling: false,
            isPushing: false,
            isReconciling: false,
            lastPulledAt: null,
            lastPushedAt: null,
            lastReconciledAt: null,
            lastReplication: null,
            lastPushResult: null,
            lastPullResult: null,
            error: null,
          },
        },
      })
    },
    destroy,
    connectDataSource: connect,
    disconnectDataSource: vi.fn(),
    drop: vi.fn(),
    resetDatabase: vi.fn(),
    forceSync: vi.fn(),
    reconcile: vi.fn(),
  }))
  return {
    store,
    destroy,
    connect,
    initStarted,
    destroyStarted,
    connectionStarted,
  }
}
function Probe() {
  const id = useSyncStore((state) => Object.keys(state.statuses).join(','))
  return <div data-testid="active-workspace">{id ? id : 'initializing'}</div>
}
function container(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <SyncProvider>
        <Probe />
      </SyncProvider>
    </QueryClientProvider>
  )
}

describe('SyncProvider workspace lifecycle ownership', () => {
  beforeEach(() => {
    context.workspaceId = 'A'
    context.connections = []
    context.create.mockReset()
    context.bridge.localSync.request.mockReset()
    context.bridge.localSync.request.mockImplementation(async () => ({
      ok: true,
      statuses: [],
    }))
  })
  afterEach(async () => {
    await act(async () => {
      cleanup()
      for (const pending of gates) pending.release()
    })
    gates.length = 0
  })

  it('an old null-workspace teardown cannot invalidate a newer return to A', async () => {
    const closing = gate()
    const oldA = fixture('A', undefined, closing.promise)
    const newA = fixture('A')
    context.create
      .mockReturnValueOnce(oldA.store)
      .mockReturnValueOnce(newA.store)
    const queryClient = new QueryClient()
    const view = render(container(queryClient))
    await waitFor(() =>
      expect(screen.getByTestId('active-workspace').textContent).toBe('A'),
    )
    context.workspaceId = null
    view.rerender(container(queryClient))
    await oldA.destroyStarted.promise
    context.workspaceId = 'B'
    view.rerender(container(queryClient))
    context.workspaceId = 'A'
    view.rerender(container(queryClient))
    expect(context.create).toHaveBeenCalledTimes(1)
    await act(async () => {
      closing.release()
    })
    await waitFor(() =>
      expect(screen.getByTestId('active-workspace').textContent).toBe('A'),
    )
    expect(context.create.mock.calls.map(([id]) => id)).toEqual(['A', 'A'])
    expect(oldA.destroy).toHaveBeenCalledTimes(1)
    expect(newA.destroy).not.toHaveBeenCalled()
  })

  it('finishes and closes a cancelled initialization before opening the latest workspace', async () => {
    const opening = gate()
    const oldA = fixture('A', opening.promise)
    const newB = fixture('B')
    context.create
      .mockReturnValueOnce(oldA.store)
      .mockReturnValueOnce(newB.store)
    const queryClient = new QueryClient()
    const view = render(container(queryClient))
    await oldA.initStarted.promise
    context.workspaceId = 'B'
    view.rerender(container(queryClient))
    expect(context.create).toHaveBeenCalledTimes(1)
    await act(async () => {
      opening.release()
    })
    await waitFor(() =>
      expect(screen.getByTestId('active-workspace').textContent).toBe('B'),
    )
    expect(oldA.destroy).toHaveBeenCalledTimes(1)
    expect(newB.destroy).not.toHaveBeenCalled()
  })

  it('waits for owner connection setup before closing its reader store', async () => {
    const connecting = gate()
    const oldA = fixture('A', undefined, undefined, connecting.promise)
    const newB = fixture('B')
    context.bridge.localSync.request.mockImplementation(async (request) => {
      if (request.action === 'connect') {
        oldA.connectionStarted.release()
        await connecting.promise
      }
      return { ok: true, statuses: [] }
    })
    context.connections = [
      {
        connectionId: 'connection-A',
        dataSourceId: 'fake',
        status: 'connected',
      },
    ]
    context.create
      .mockReturnValueOnce(oldA.store)
      .mockReturnValueOnce(newB.store)
    const queryClient = new QueryClient()
    const view = render(container(queryClient))
    await oldA.connectionStarted.promise
    context.workspaceId = 'B'
    context.connections = []
    view.rerender(container(queryClient))
    expect(oldA.destroy).not.toHaveBeenCalled()
    expect(context.create).toHaveBeenCalledTimes(1)
    await act(async () => {
      connecting.release()
    })
    await waitFor(() =>
      expect(screen.getByTestId('active-workspace').textContent).toBe('B'),
    )
    expect(oldA.destroy).toHaveBeenCalledTimes(1)
    expect(oldA.connect).not.toHaveBeenCalled()
    expect(newB.connect).not.toHaveBeenCalled()
  })

  it('preserves owner replication timestamp and pull/push results in the reader projection', async () => {
    const reader = fixture('A')
    context.create.mockReturnValueOnce(reader.store)
    context.bridge.localSync.request.mockImplementation(async () => ({
      ok: true,
      statuses: [
        {
          key: 'A',
          isActive: true,
          isPulling: false,
          isPushing: false,
          isReconciling: false,
          lastPulledAt: '2026-10-08T10:00:00.000Z',
          lastPushedAt: '2026-10-08T10:01:00.000Z',
          lastReconciledAt: null,
          lastReplication: '2026-10-08T10:01:00.000Z',
          lastPushResult: 'error',
          lastPullResult: 'success',
          error: 'REMOTE_VALIDATION_KEY',
        },
      ],
    }))
    render(container(new QueryClient()))
    await waitFor(() =>
      expect(
        reader.store.getState().statuses['A'].lastReplication?.toISOString(),
      ).toBe('2026-10-08T10:01:00.000Z'),
    )
    expect(reader.store.getState().statuses['A'].lastPullResult).toBe('success')
    expect(reader.store.getState().statuses['A'].lastPushResult).toBe('error')
    expect(reader.store.getState().statuses['A'].error?.message).toBe(
      'REMOTE_VALIDATION_KEY',
    )
  })
  it('closes the active store exactly once when the provider unmounts', async () => {
    const oldA = fixture('A')
    context.create.mockReturnValueOnce(oldA.store)
    const view = render(container(new QueryClient()))
    await waitFor(() =>
      expect(screen.getByTestId('active-workspace').textContent).toBe('A'),
    )
    view.unmount()
    await waitFor(() => expect(oldA.destroy).toHaveBeenCalledTimes(1))
  })
})
