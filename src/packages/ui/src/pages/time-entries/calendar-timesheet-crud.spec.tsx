import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'

import { TimeEntriesColumnsProvider } from '@/pages/time-entries/components/time-entries-columns-context'

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({
    timer: {
      start: () => Promise.resolve({ isSuccess: true, data: undefined }),
      pause: () => Promise.resolve({ isSuccess: true, data: undefined }),
      resume: () => Promise.resolve({ isSuccess: true, data: undefined }),
      stop: () => Promise.resolve({ isSuccess: true, data: undefined }),
      getStatus: () =>
        Promise.resolve({
          isSuccess: true,
          data: { status: 'stopped', currentSeconds: 0 },
        }),
      getHistory: () => Promise.resolve({ isSuccess: true, data: [] }),
    },
    events: {
      on: () => () => {},
      emit: () => {},
    },
  }),
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DataSourceConnectionsContext,
  DataSourceConnectionsContextType,
} from '@/contexts/DataSourceConnectionsContext'
import {
  WorkspaceContext,
  WorkspaceContextType,
} from '@/contexts/WorkspaceContext'
import { SyncMetadataItem } from '@/local-db/schemas/metadata-sync-schema'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { TimeEntriesCalendarView } from '@/pages/time-entries/components/calendar-view/time-entries-calendar-view'
import { TimeEntriesDayCard } from '@/pages/time-entries/components/time-entries-day-card'
import {
  type CreateColumnsOptions,
  createTimeEntriesColumns,
} from '@/pages/time-entries/components/time-entries-table-columns'
import { TimeEntriesTimesheetView } from '@/pages/time-entries/components/timesheet-view/time-entries-timesheet-view'
import { SuggestionRow } from '@/pages/time-entries/lib/time-entries-utils'
import { TimeEntryContext, TimeEntryStore } from '@/stores/timeEntryStore'

const mockActivities: SyncMetadataItem[] = [
  {
    id: 'act-dev',
    name: 'Desenvolvimento',
    icon: 'Code',
    colors: {
      badge: '#eee',
      background: '#3b82f6',
      text: '#000',
    },
  },
  {
    id: 'act-doc',
    name: 'Documentação',
    icon: 'FileText',
    colors: {
      badge: '#e0f2fe',
      background: '#0284c7',
      text: '#000',
    },
  },
]

const mockTasks: SyncTaskRxDBDTO[] = [
  {
    id: 'mr-tick-fake::API-415',
    sourceId: 'API-415',
    connectionInstanceId: 'conn-1',
    dataSourceId: 'jira',
    title: 'Autenticação OAuth2',
    tracker: { id: 'jira' },
    status: { id: 'in_progress', name: 'In Progress' },
    syncStatus: 'synced',
    lastPulledAt: null,
    lastPushedAt: null,
    lastReconciledAt: null,
    timeEntryIds: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    _deleted: false,
  },
  {
    id: 'mr-tick-fake::DOC-131',
    sourceId: 'DOC-131',
    connectionInstanceId: 'conn-1',
    dataSourceId: 'jira',
    title: 'Manual de Instalação',
    tracker: { id: 'jira' },
    status: { id: 'done', name: 'Done' },
    syncStatus: 'synced',
    lastPulledAt: null,
    lastPushedAt: null,
    lastReconciledAt: null,
    timeEntryIds: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    _deleted: false,
  },
]

const mockTasksById: Record<string, SyncTaskRxDBDTO> = {
  'API-415': mockTasks[0],
  'mr-tick-fake::API-415': mockTasks[0],
  'DOC-131': mockTasks[1],
  'mr-tick-fake::DOC-131': mockTasks[1],
}

const queryState = vi.hoisted(() => ({ isLoading: false }))
vi.mock('@/pages/time-entries/hooks/use-time-entries-data', () => ({
  useTimeEntriesData: () => {
    return {
      db: null,
      isLoading: queryState.isLoading,
      memberIdsByConnection: { 'conn-1': 'user-1' },
      timeEntries: [
        {
          id: 'entry-1',
          dataSourceId: 'jira',
          connectionInstanceId: 'conn-1',
          syncStatus: 'synced',
          syncError: null,
          remoteId: 'remote-1',
          lastPulledAt: null,
          lastPushedAt: null,
          task: { id: 'mr-tick-fake::API-415' },
          activity: { id: 'act-dev', name: 'Desenvolvimento' },
          user: { id: 'user-1', name: 'Dev User' },
          startDate: '2026-09-02T10:00:00.000Z',
          endDate: '2026-09-02T12:00:00.000Z',
          timeSpent: 2,
          comments: 'Ajuste de tokens',
          timeStatus: 'finished',
          type: 'manual',
          createdAt: '2026-09-02T10:00:00.000Z',
          updatedAt: '2026-09-02T12:00:00.000Z',
          _deleted: false,
        },
        {
          id: 'entry-2',
          dataSourceId: 'jira',
          connectionInstanceId: 'conn-1',
          syncStatus: 'synced',
          syncError: null,
          remoteId: 'remote-2',
          lastPulledAt: null,
          lastPushedAt: null,
          task: { id: 'mr-tick-fake::DOC-131' },
          activity: { id: 'act-doc', name: 'Documentação' },
          user: { id: 'user-1', name: 'Dev User' },
          startDate: '2026-09-29T14:00:00.000Z',
          endDate: '2026-09-29T15:30:00.000Z',
          timeSpent: 1.5,
          comments: 'Escrevendo guia',
          timeStatus: 'finished',
          type: 'manual',
          createdAt: '2026-09-29T14:00:00.000Z',
          updatedAt: '2026-09-29T15:30:00.000Z',
          _deleted: false,
        },
      ],
      activities: mockActivities,
      tasks: mockTasks,
      tasksById: mockTasksById,
      activeTimeEntry: null,
      setActive: () => {},
      createNewTimeEntry: async () => {},
      pauseCurrentTimeEntry: async () => {},
      playCurrentTimeEntry: async () => {},
      stopCurrentTimeEntry: async () => {},
    }
  },
}))

describe('Calendar and Timesheet Decoupling & Reactive CRUD Tests', () => {
  beforeEach(() => {
    queryState.isLoading = false
  })
  const mockConnectionsValue: DataSourceConnectionsContextType = {
    isLoading: false,
    workspaceId: undefined,
    connections: [
      {
        connectionId: 'conn-1',
        dataSourceId: 'jira',
        status: 'connected',
        addon: {
          id: 'jira',
          version: '1.0.0',
          name: 'Jira Software',
          creator: 'Atlassian',
          description: 'Jira integration',
          path: '/plugins/jira',
          logo: 'http://example.com/jira-logo.png',
          downloads: 10,
          stars: 5,
          installed: true,
        },
      },
    ],
    workspaceConnections: [],
    installedPlugins: [],
    link: async () => undefined,
    unlink: async () => undefined,
    connect: async () => undefined,
    disconnect: async () => undefined,
    getConnection: () => undefined,
    isConnected: () => false,
  }

  const mockWorkspaceValue: WorkspaceContextType = {
    workspace: {
      id: 'ws-1',
      name: 'Default',
      status: 'configured',
      dataSourceConnections: [],
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

  const mockTimeEntryStore = createStore<TimeEntryStore>(() => ({
    active: null,
    setActive: () => {},
    clear: () => {},
    createNewTimeEntry: async () => {},
    pauseCurrentTimeEntry: async () => {},
    playCurrentTimeEntry: async () => {},
    stopCurrentTimeEntry: async () => {},
    recoverRunningEntry: async () => {},
  }))

  const testReferenceDate = new Date('2026-09-29T12:00:00.000Z')
  for (const View of [TimeEntriesCalendarView, TimeEntriesTimesheetView]) {
    it(`${View.name} distinguishes pending data from loaded totals`, () => {
      queryState.isLoading = true
      const queryClient = new QueryClient()
      const renderView = () => (
        <QueryClientProvider client={queryClient}>
          <WorkspaceContext.Provider value={mockWorkspaceValue}>
            <TimeEntryContext.Provider value={mockTimeEntryStore}>
              <DataSourceConnectionsContext.Provider
                value={mockConnectionsValue}
              >
                <View compact initialDate={testReferenceDate} />
              </DataSourceConnectionsContext.Provider>
            </TimeEntryContext.Provider>
          </WorkspaceContext.Provider>
        </QueryClientProvider>
      )
      const { rerender } = render(renderView())
      expect(
        screen.getByRole('status', { name: 'Carregando apontamentos' }),
      ).toBeTruthy()
      expect(screen.queryByText('Total:')).toBeNull()
      expect(screen.queryByText('Tarefa / Atividade')).toBeNull()
      queryState.isLoading = false
      rerender(renderView())
      expect(screen.queryByRole('status')).toBeNull()
      expect(screen.getAllByText('1h 30m').length).toBeGreaterThan(0)
    })
  }

  it('renders TimeEntriesCalendarView compact mode with clean task IDs and full month data', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <WorkspaceContext.Provider value={mockWorkspaceValue}>
            <TimeEntryContext.Provider value={mockTimeEntryStore}>
              <DataSourceConnectionsContext.Provider
                value={mockConnectionsValue}
              >
                <TimeEntriesCalendarView
                  compact
                  initialDate={testReferenceDate}
                />
              </DataSourceConnectionsContext.Provider>
            </TimeEntryContext.Provider>
          </WorkspaceContext.Provider>
        </QueryClientProvider>
      </TooltipProvider>,
    )

    // Should display DataSourceLogo icon in monthly entry chips
    expect(
      screen.getAllByRole('img', { name: /Jira Software/i }).length,
    ).toBeGreaterThan(0)
    // Should display sanitized clean task IDs without compound keys
    expect(screen.queryByText(/mr-tick-fake/)).toBeNull()
    // Should display formatted hour totals
    expect(screen.getByText('3h 30m')).toBeTruthy()
  })

  it('renders TimeEntriesTimesheetView with weekly columns and sanitized task titles', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <WorkspaceContext.Provider value={mockWorkspaceValue}>
            <TimeEntryContext.Provider value={mockTimeEntryStore}>
              <DataSourceConnectionsContext.Provider
                value={mockConnectionsValue}
              >
                <TimeEntriesTimesheetView
                  compact
                  initialDate={testReferenceDate}
                />
              </DataSourceConnectionsContext.Provider>
            </TimeEntryContext.Provider>
          </WorkspaceContext.Provider>
        </QueryClientProvider>
      </TooltipProvider>,
    )

    // Should contain Tarefa / Atividade column and total
    expect(screen.getByText('Tarefa / Atividade')).toBeTruthy()
    expect(screen.getByText('Total')).toBeTruthy()
    // Should display DataSourceLogo icon
    expect(screen.getByRole('img', { name: /Jira Software/i })).toBeTruthy()
    // Should NOT display raw datasource name
    expect(screen.queryByText(/• jira/i)).toBeNull()
    // Should display sanitized clean task ID and title
    expect(screen.getByText('#DOC-131')).toBeTruthy()
    expect(screen.getByText('Manual de Instalação')).toBeTruthy()
    expect(screen.queryByText(/mr-tick-fake/)).toBeNull()
  })

  it('handles draft addition, update, and deletion in TimeEntriesDayCard', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const testDay = new Date('2026-09-29T12:00:00.000Z')

    function TestCrudHarness() {
      const [entries, setEntries] = useState<SyncTimeEntryRxDBDTO[]>([
        {
          id: 'entry-item-1',
          dataSourceId: 'jira',
          connectionInstanceId: 'conn-1',
          syncStatus: 'synced',
          syncError: null,
          remoteId: 'remote-1',
          lastPulledAt: null,
          lastPushedAt: null,
          task: { id: 'DOC-131' },
          activity: { id: 'act-doc', name: 'Documentação' },
          user: { id: 'user-1', name: 'Dev User' },
          startDate: '2026-09-29T14:00:00.000Z',
          endDate: '2026-09-29T15:30:00.000Z',
          timeSpent: 1.5,
          comments: 'Documentando API',
          timeStatus: 'finished',
          type: 'manual',
          createdAt: '2026-09-29T14:00:00.000Z',
          updatedAt: '2026-09-29T15:30:00.000Z',
          _deleted: false,
        },
      ])

      const [draftEntries, setDraftEntries] = useState<SuggestionRow[]>([])
      const [tempData] = useState<
        Record<string, Partial<SyncTimeEntryRxDBDTO>>
      >({})

      const handleAddNew = (day: Date) => {
        const newDraft: SuggestionRow = {
          id: 'draft-99',
          _deleted: false,
          connectionInstanceId: 'conn-1',
          dataSourceId: 'jira',
          syncStatus: 'local_only',
          lastPulledAt: null,
          lastPushedAt: null,
          task: { id: 'API-415' },
          activity: { id: 'act-dev', name: 'Desenvolvimento' },
          user: { id: 'user-1', name: 'Dev User' },
          startDate: day.toISOString(),
          endDate: day.toISOString(),
          timeSpent: 2,
          comments: 'Novo rascunho de teste',
          timeStatus: 'finished',
          type: 'manual',
          isDraft: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          subRows: [],
        }
        setDraftEntries((prev) => [...prev, newDraft])
      }

      const columnOptions: CreateColumnsOptions = {
        activities: mockActivities,
        tasksById: mockTasksById,
        mappings: {},
        editingRows: {},
        getRowData: (id) => tempData[id],
        setEditingRows: () => {},
        setTempData: () => {},
        tempData,
        setRowBeingEdited: () => {},
        setTaskLookupOpen: () => {},
        onSaveRow: async (rowUid) => {
          const draft = draftEntries.find((d) => d.id === rowUid)
          if (!draft) return
          setEntries((prev) => [
            ...prev,
            {
              id: draft.id,
              dataSourceId: draft.dataSourceId || 'jira',
              connectionInstanceId: draft.connectionInstanceId || 'conn-1',
              syncStatus: 'synced',
              syncError: null,
              remoteId: null,
              lastPulledAt: null,
              lastPushedAt: null,
              task: draft.task,
              activity: draft.activity,
              user: draft.user,
              startDate: draft.startDate,
              endDate: draft.endDate,
              timeSpent: draft.timeSpent,
              comments: draft.comments,
              timeStatus: 'finished',
              type: 'manual',
              createdAt: draft.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              _deleted: false,
            },
          ])
          setDraftEntries((prev) => prev.filter((d) => d.id !== rowUid))
        },
        onDirectUpdateRow: async (rowId, updates) => {
          setEntries((prev) =>
            prev.map((e) => (e.id === rowId ? { ...e, ...updates } : e)),
          )
        },
        onCancelEdit: async (id) => {
          setDraftEntries((prev) => prev.filter((d) => d.id !== id))
        },
        onDeleteRow: async (id) => {
          setEntries((prev) => prev.filter((e) => e.id !== id))
        },
        onDuplicateRow: () => {},
        onAcceptSuggestion: async () => {},
        onDismissSuggestion: async () => {},
        onAddNewEntry: handleAddNew,
      }
      const columns = createTimeEntriesColumns(columnOptions)

      return (
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <WorkspaceContext.Provider value={mockWorkspaceValue}>
              <TimeEntryContext.Provider value={mockTimeEntryStore}>
                <DataSourceConnectionsContext.Provider
                  value={mockConnectionsValue}
                >
                  <div>
                    <button
                      type="button"
                      data-testid="test-add-btn"
                      onClick={() => handleAddNew(testDay)}
                    >
                      Adicionar
                    </button>
                    <button
                      type="button"
                      data-testid="test-delete-btn"
                      onClick={() =>
                        setEntries((prev) =>
                          prev.filter((e) => e.id !== 'entry-item-1'),
                        )
                      }
                    >
                      Excluir
                    </button>
                    <TimeEntriesColumnsProvider value={columnOptions}>
                      <TimeEntriesDayCard
                        day={testDay}
                        entries={entries}
                        draftEntries={draftEntries}
                        tempData={tempData}
                        columns={columns}
                        expandedRows={{}}
                        onExpandedChange={() => {}}
                        isGrouped={true}
                        onAddNewEntry={handleAddNew}
                      />
                    </TimeEntriesColumnsProvider>
                  </div>
                </DataSourceConnectionsContext.Provider>
              </TimeEntryContext.Provider>
            </WorkspaceContext.Provider>
          </QueryClientProvider>
        </TooltipProvider>
      )
    }

    render(<TestCrudHarness />)

    // Initial entry should be rendered
    expect(screen.getByText('Documentando API')).toBeTruthy()

    // Add draft entry
    act(() => {
      fireEvent.click(screen.getByTestId('test-add-btn'))
    })
    expect(screen.getByText('Novo rascunho de teste')).toBeTruthy()

    // Delete existing entry
    act(() => {
      fireEvent.click(screen.getByTestId('test-delete-btn'))
    })
    expect(screen.queryByText('Documentando API')).toBeNull()
  })
})
