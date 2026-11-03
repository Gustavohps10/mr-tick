import type {
  AddonSettingsTaskReferenceField,
  AddonTaskReferenceValue,
  CoreConnection,
  CoreMetadata,
  CoreTask,
  CoreTaskPage,
  IHostBridge,
  LocalRuntimeSyncStatus,
} from '@mr-tick/application'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WorkspaceContext,
  type WorkspaceContextType,
} from '@/contexts/WorkspaceContext'
import { useHostBridge } from '@/hooks/use-host-bridge'

import { AddonTaskDestinationControl } from './addon-task-destination-control'

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: vi.fn(),
}))

vi.mock('@/contexts/DataSourceConnectionsContext', () => ({
  useDataSourceConnections: () => ({
    isLoading: false,
    workspaceId: 'ws-1',
    connections: [],
    dataSourceConnections: [],
    workspaceConnections: [],
    installedPlugins: [],
    link: vi.fn(),
    unlink: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    getConnection: vi.fn(),
    isConnected: vi.fn(),
  }),
  useOptionalDataSourceConnections: () => undefined,
}))

const mockWorkspaceValue: WorkspaceContextType = {
  workspace: {
    id: 'ws-1',
    name: 'Default',
    status: 'configured',
    connections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  workspaces: [],
  isLoading: false,
  isLoadingWorkspaces: false,
  create: async () => undefined,
  updateIdentity: async () => undefined,
  remove: async () => undefined,
  isCreating: false,
  isUpdatingIdentity: false,
  isRemoving: false,
}

describe('AddonTaskDestinationControl', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  const renderControl = (ui: React.ReactElement) => {
    const res = render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceContext.Provider value={mockWorkspaceValue}>
          {ui}
        </WorkspaceContext.Provider>
      </QueryClientProvider>,
    )
    return {
      ...res,
      rerender: (newUi: React.ReactElement) =>
        res.rerender(
          <QueryClientProvider client={queryClient}>
            <WorkspaceContext.Provider value={mockWorkspaceValue}>
              {newUi}
            </WorkspaceContext.Provider>
          </QueryClientProvider>,
        ),
    }
  }
  const field: AddonSettingsTaskReferenceField = {
    id: 'targetTask',
    type: 'task-reference',
    label: 'Tarefa de Destino',
    includeMetadata: true,
  }

  const sampleConnections: CoreConnection[] = [
    {
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      addonId: 'addon-redmine',
      connectionProfileId: 'profile-redmine',
      cardinality: 'single',
      status: 'connected',
      identity: {
        kind: 'installation',
        displayName: 'Redmine Produção',
        avatarUrl: null,
      },
    },
    {
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-2',
      addonId: 'addon-redmine',
      connectionProfileId: 'profile-redmine',
      cardinality: 'single',
      status: 'connected',
      identity: {
        kind: 'installation',
        displayName: 'Redmine Homolog',
        avatarUrl: null,
      },
    },
  ]

  const sampleTask: CoreTask = {
    workspaceId: 'ws-1',
    connectionInstanceId: 'conn-1',
    taskId: '1001',
    dataSourceId: 'redmine',
    title: 'Implementar Observer Discord',
    status: { id: 's1', name: 'Em Andamento' },
    projectName: 'Mr. Tick Core',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  const sampleMetadata: CoreMetadata = {
    workspaceId: 'ws-1',
    connectionInstanceId: 'conn-1',
    dataSourceId: 'redmine',
    lastPulledAt: '2026-01-01T00:00:00.000Z',
    values: {
      activities: [
        {
          id: 'act-1',
          name: 'Desenvolvimento',
          icon: 'code',
          colors: { badge: '', background: '', text: '' },
        },
        {
          id: 'act-2',
          name: 'Design',
          icon: 'brush',
          colors: { badge: '', background: '', text: '' },
        },
      ],
      taskStatuses: [],
      taskPriorities: [],
      trackStatuses: [],
      participantRoles: [],
      estimationTypes: [],
    },
  }

  it('never auto-selects connection or task, requiring explicit choice', async () => {
    const listConnections = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: sampleConnections,
    })

    vi.mocked(useHostBridge).mockReturnValue({
      events: { on: vi.fn(() => vi.fn()) },
      core: {
        listConnections,
        listTasks: vi.fn(),
        getTask: vi.fn(),
        getMetadata: vi.fn(),
      },
    } as unknown as IHostBridge)

    const onChange = vi.fn()

    renderControl(
      <AddonTaskDestinationControl
        field={field}
        workspaceId="ws-1"
        value={null}
        onChange={onChange}
      />,
    )

    await waitFor(() => {
      expect(listConnections).toHaveBeenCalledWith({
        body: { workspaceId: 'ws-1', capability: 'dataSource' },
      })
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(
      screen.getByTestId('addon-task-destination-trigger-targetTask'),
    ).toBeEnabled()
    expect(
      screen.queryByTestId('task-dest-connection-select-targetTask'),
    ).toBeNull()
  })

  it('queries tasks on-demand via canonical bridge.core when popover opens and selects task', async () => {
    const listConnections = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: sampleConnections,
    })

    const listTasks = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        tasks: [sampleTask],
        hasMore: false,
      } as CoreTaskPage,
    })

    const getMetadata = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: sampleMetadata,
    })

    vi.mocked(useHostBridge).mockReturnValue({
      events: { on: vi.fn(() => vi.fn()) },
      core: {
        listConnections,
        listTasks,
        getTask: vi.fn(),
        getMetadata,
      },
    } as unknown as IHostBridge)

    let currentValue: AddonTaskReferenceValue | null = null
    const onChange = vi.fn((val) => {
      currentValue = val
    })

    const { rerender } = renderControl(
      <AddonTaskDestinationControl
        field={field}
        workspaceId="ws-1"
        connectionInstanceId="conn-1"
        value={currentValue}
        onChange={onChange}
      />,
    )

    const trigger = screen.getByTestId(
      'addon-task-destination-trigger-targetTask',
    )
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(listTasks).toHaveBeenCalledWith({
        body: {
          workspaceId: 'ws-1',
          connectionInstanceId: 'conn-1',
          limit: 30,
          search: undefined,
          cursor: undefined,
        },
      })
    })

    const taskOption = await screen.findByTestId('addon-task-option-1001')
    fireEvent.click(taskOption)

    expect(onChange).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      taskId: '1001',
      metadataValues: undefined,
    })

    rerender(
      <AddonTaskDestinationControl
        field={field}
        workspaceId="ws-1"
        connectionInstanceId="conn-1"
        value={currentValue}
        onChange={onChange}
      />,
    )

    expect(
      screen.getByTestId('addon-task-selected-card-targetTask'),
    ).toBeInTheDocument()
    expect(screen.getByText('ID: 1001')).toBeInTheDocument()
    expect(screen.getByText('Implementar Observer Discord')).toBeInTheDocument()

    const clearBtn = screen.getByTestId('addon-task-clear-btn-targetTask')
    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('paginates tasks with nextCursor when hasMore is true', async () => {
    const page1: CoreTaskPage = {
      tasks: [sampleTask],
      hasMore: true,
      nextCursor: '1001',
    }
    const page2: CoreTaskPage = {
      tasks: [
        {
          ...sampleTask,
          taskId: '1002',
          title: 'Segunda Tarefa',
        },
      ],
      hasMore: false,
    }

    const listTasks = vi
      .fn()
      .mockResolvedValueOnce({ isSuccess: true, data: page1 })
      .mockResolvedValueOnce({ isSuccess: true, data: page2 })

    vi.mocked(useHostBridge).mockReturnValue({
      events: { on: vi.fn(() => vi.fn()) },
      core: {
        listConnections: vi
          .fn()
          .mockResolvedValue({ isSuccess: true, data: sampleConnections }),
        listTasks,
        getTask: vi.fn().mockResolvedValue({ isSuccess: false }),
        getMetadata: vi
          .fn()
          .mockResolvedValue({ isSuccess: true, data: sampleMetadata }),
      },
    } as unknown as IHostBridge)

    renderControl(
      <AddonTaskDestinationControl
        field={field}
        workspaceId="ws-1"
        connectionInstanceId="conn-1"
        value={null}
        onChange={vi.fn()}
      />,
    )

    const trigger = screen.getByTestId(
      'addon-task-destination-trigger-targetTask',
    )
    fireEvent.click(trigger)

    const loadMoreBtn = await screen.findByTestId(
      'addon-task-load-more-targetTask',
    )
    fireEvent.click(loadMoreBtn)

    await waitFor(() => {
      expect(listTasks).toHaveBeenLastCalledWith({
        body: {
          workspaceId: 'ws-1',
          connectionInstanceId: 'conn-1',
          limit: 30,
          search: undefined,
          cursor: '1001',
        },
      })
    })

    expect(await screen.findByText('Segunda Tarefa')).toBeInTheDocument()
  })

  it('refreshes task and activities after the selected connection finishes repopulating its cache', async () => {
    interface SyncEvent {
      workspaceId: string
      statuses: LocalRuntimeSyncStatus[]
    }

    const listeners = new Set<(event: SyncEvent) => void>()
    const on = vi.fn(
      (channel: string, listener: (event: SyncEvent) => void) => {
        if (channel === 'local-runtime:sync-status') listeners.add(listener)
        return () => listeners.delete(listener)
      },
    )
    const getTask = vi
      .fn()
      .mockResolvedValueOnce({ isSuccess: true })
      .mockResolvedValue({ isSuccess: true, data: sampleTask })
    const getMetadata = vi
      .fn()
      .mockResolvedValueOnce({
        isSuccess: true,
        data: {
          ...sampleMetadata,
          values: { ...sampleMetadata.values, activities: [] },
        },
      })
      .mockResolvedValue({ isSuccess: true, data: sampleMetadata })

    vi.mocked(useHostBridge).mockReturnValue({
      core: {
        listConnections: vi.fn(),
        listTasks: vi.fn(),
        getTask,
        getMetadata,
      },
      events: { on },
    } as unknown as IHostBridge)

    renderControl(
      <AddonTaskDestinationControl
        field={field}
        workspaceId="ws-1"
        connectionInstanceId="conn-1"
        value={{
          workspaceId: 'ws-1',
          connectionInstanceId: 'conn-1',
          taskId: '1001',
        }}
        onChange={vi.fn()}
      />,
    )

    expect(await screen.findByText('Tarefa #1001')).toBeInTheDocument()
    await waitFor(() => expect(getMetadata).toHaveBeenCalledTimes(1))
    const emit = (event: SyncEvent) => {
      for (const listener of listeners) listener(event)
    }
    const pull: LocalRuntimeSyncStatus = {
      key: 'tasks_conn-1',
      isActive: false,
      isPulling: false,
      isPushing: false,
      isReconciling: false,
      lastPulledAt: '2026-11-03T12:00:00.000Z',
      lastPushedAt: null,
      lastReconciledAt: null,
      lastReplication: '2026-11-03T12:00:00.000Z',
      lastPushResult: null,
      lastPullResult: 'success',
      error: null,
    }
    const event: SyncEvent = {
      workspaceId: 'ws-1',
      statuses: [pull, { ...pull, key: 'metadata_conn-1' }],
    }
    await act(async () =>
      emit({
        ...event,
        statuses: event.statuses.map((status) => ({
          ...status,
          isActive: true,
        })),
      }),
    )
    expect(getTask).toHaveBeenCalledTimes(1)
    expect(getMetadata).toHaveBeenCalledTimes(1)
    await act(async () => emit(event))

    expect(await screen.findByText(sampleTask.title)).toBeInTheDocument()
    await fireEvent.click(
      screen.getByTestId('addon-task-activity-select-targetTask'),
    )
    expect(await screen.findByText('Desenvolvimento')).toBeInTheDocument()
    await act(async () => {
      emit(event)
      emit({ ...event, workspaceId: 'other-workspace' })
      emit({ ...event, statuses: [{ ...pull, key: 'tasks_other-connection' }] })
    })
    expect(getTask).toHaveBeenCalledTimes(2)
    expect(getMetadata).toHaveBeenCalledTimes(2)

    getTask.mockResolvedValue({
      isSuccess: true,
      data: { ...sampleTask, title: 'Título atualizado no provedor' },
    })
    await act(async () =>
      emit({
        ...event,
        statuses: [{ ...pull, lastPulledAt: '2026-11-03T12:01:00.000Z' }],
      }),
    )
    expect(
      await screen.findByText('Título atualizado no provedor'),
    ).toBeInTheDocument()
  })

  it('preserves other metadata fields when selecting activity (B8)', async () => {
    const getMetadata = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: sampleMetadata,
    })

    vi.mocked(useHostBridge).mockReturnValue({
      events: { on: vi.fn(() => vi.fn()) },
      core: {
        listConnections: vi.fn(),
        listTasks: vi.fn(),
        getTask: vi
          .fn()
          .mockResolvedValue({ isSuccess: true, data: sampleTask }),
        getMetadata,
      },
    } as unknown as IHostBridge)

    const onChange = vi.fn()
    const currentValue: AddonTaskReferenceValue = {
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      taskId: '1001',
      metadataValues: {
        customPriorityId: 'prio-high',
        categoryTag: 'security',
      },
    }

    renderControl(
      <AddonTaskDestinationControl
        field={field}
        workspaceId="ws-1"
        connectionInstanceId="conn-1"
        value={currentValue}
        onChange={onChange}
      />,
    )

    await waitFor(() => {
      expect(getMetadata).toHaveBeenCalled()
    })

    const activityTrigger = await screen.findByTestId(
      'addon-task-activity-select-targetTask',
    )
    fireEvent.click(activityTrigger)

    const act1Option = await screen.findByText('Desenvolvimento')
    fireEvent.click(act1Option)

    expect(onChange).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      taskId: '1001',
      metadataValues: {
        customPriorityId: 'prio-high',
        categoryTag: 'security',
        activityId: 'act-1',
      },
    })
  })

  it('protects against deferred stale search responses (searchA after searchB)', async () => {
    let resolveSearchA: (val: any) => void = () => {}
    let resolveSearchB: (val: any) => void = () => {}

    const searchAPromise = new Promise((resolve) => {
      resolveSearchA = resolve
    })
    const searchBPromise = new Promise((resolve) => {
      resolveSearchB = resolve
    })

    const listTasks = vi.fn().mockImplementation(({ body }) => {
      if (body.search === 'searchA') return searchAPromise
      if (body.search === 'searchB') return searchBPromise
      return Promise.resolve({
        isSuccess: true,
        data: { tasks: [], hasMore: false },
      })
    })

    vi.mocked(useHostBridge).mockReturnValue({
      events: { on: vi.fn(() => vi.fn()) },
      core: {
        listConnections: vi.fn(),
        listTasks,
        getTask: vi.fn(),
        getMetadata: vi.fn(),
      },
    } as unknown as IHostBridge)

    renderControl(
      <AddonTaskDestinationControl
        field={field}
        workspaceId="ws-1"
        connectionInstanceId="conn-1"
        value={null}
        onChange={vi.fn()}
      />,
    )

    const trigger = screen.getByTestId(
      'addon-task-destination-trigger-targetTask',
    )
    fireEvent.click(trigger)

    const searchInput = screen.getByTestId('addon-task-search-input-targetTask')

    // Trigger searchA
    fireEvent.change(searchInput, { target: { value: 'searchA' } })
    // Quickly trigger searchB
    fireEvent.change(searchInput, { target: { value: 'searchB' } })

    // Resolve searchB first with task B
    resolveSearchB({
      isSuccess: true,
      data: {
        tasks: [
          {
            ...sampleTask,
            taskId: 'TASK-B',
            title: 'Task Result B',
          },
        ],
        hasMore: false,
      },
    })

    expect(await screen.findByText('Task Result B')).toBeInTheDocument()

    // Now resolve slower searchA with task A
    resolveSearchA({
      isSuccess: true,
      data: {
        tasks: [
          {
            ...sampleTask,
            taskId: 'TASK-A',
            title: 'Task Result A',
          },
        ],
        hasMore: false,
      },
    })

    // Slower searchA must NOT overwrite searchB
    expect(screen.queryByText('Task Result A')).not.toBeInTheDocument()
    expect(screen.getByText('Task Result B')).toBeInTheDocument()
  })

  it('isolates cache by composite key (same taskId across 2 different connections does not collide)', async () => {
    const taskConn1: CoreTask = {
      ...sampleTask,
      connectionInstanceId: 'conn-1',
      taskId: '999',
      title: 'Task on Connection 1',
    }
    const taskConn2: CoreTask = {
      ...sampleTask,
      connectionInstanceId: 'conn-2',
      taskId: '999',
      title: 'Task on Connection 2',
    }

    const getTask = vi.fn().mockImplementation(({ body }) => {
      if (body.connectionInstanceId === 'conn-1') {
        return Promise.resolve({ isSuccess: true, data: taskConn1 })
      }
      return Promise.resolve({ isSuccess: true, data: taskConn2 })
    })

    vi.mocked(useHostBridge).mockReturnValue({
      events: { on: vi.fn(() => vi.fn()) },
      core: {
        listConnections: vi.fn(),
        listTasks: vi.fn(),
        getTask,
        getMetadata: vi.fn(),
      },
    } as unknown as IHostBridge)

    const valueConn1: AddonTaskReferenceValue = {
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      taskId: '999',
    }
    const valueConn2: AddonTaskReferenceValue = {
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-2',
      taskId: '999',
    }

    const { rerender } = renderControl(
      <AddonTaskDestinationControl
        field={field}
        workspaceId="ws-1"
        connectionInstanceId="conn-1"
        value={valueConn1}
        onChange={vi.fn()}
      />,
    )

    expect(await screen.findByText('Task on Connection 1')).toBeInTheDocument()

    rerender(
      <AddonTaskDestinationControl
        field={field}
        workspaceId="ws-1"
        connectionInstanceId="conn-2"
        value={valueConn2}
        onChange={vi.fn()}
      />,
    )

    expect(await screen.findByText('Task on Connection 2')).toBeInTheDocument()
    expect(screen.queryByText('Task on Connection 1')).not.toBeInTheDocument()
  })
})
