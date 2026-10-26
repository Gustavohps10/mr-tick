import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

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

vi.mock('@/components/task-popover', () => ({
  TaskPopover: ({
    onSelectTask,
    onTaskIdChange,
    trigger,
  }: {
    onSelectTask?: (task: SyncTaskRxDBDTO) => void
    onTaskIdChange?: (id: string) => void
    trigger?: React.ReactNode
  }) => (
    <div data-testid="mock-task-popover">
      {trigger}
      <button
        data-testid="trigger-select-jira"
        type="button"
        onClick={() => onSelectTask?.(mockTasksById['10006'])}
      >
        Select Jira
      </button>
      <button
        data-testid="trigger-clear-task"
        type="button"
        onClick={() => onTaskIdChange?.('')}
      >
        Clear Task
      </button>
    </div>
  ),
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
import { TimeEntriesColumnsProvider } from '@/pages/time-entries/components/time-entries-columns-context'
import {
  CreateColumnsOptions,
  createTimeEntriesColumns,
} from '@/pages/time-entries/components/time-entries-table-columns'
import { SuggestionRow } from '@/pages/time-entries/lib/time-entries-utils'

const redmineActivities: SyncMetadataItem[] = [
  {
    id: 'redmine-dev',
    name: 'Desenvolvimento Redmine',
    icon: 'Code',
    colors: { badge: '#eee', background: '#fff', text: '#000' },
  },
  {
    id: 'redmine-design',
    name: 'Design Redmine',
    icon: 'PenTool',
    colors: { badge: '#eee', background: '#fff', text: '#000' },
  },
]

const jiraActivities: SyncMetadataItem[] = [
  {
    id: 'jira-worklog',
    name: 'Worklog Jira',
    icon: 'Clock',
    colors: { badge: '#eee', background: '#fff', text: '#000' },
  },
]

const mockTasksById: Record<string, SyncTaskRxDBDTO> = {
  '10006': {
    id: 'task-jira-10006',
    sourceId: '10006',
    title: 'SCRUM-7 - Jira Task',
    connectionInstanceId: 'conn-jira-id',
    dataSourceId: 'jira-addon',
    _deleted: false,
    syncStatus: 'synced',
    lastPulledAt: null,
    lastPushedAt: null,
    lastReconciledAt: null,
    status: { id: 'open', name: 'Open' },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    timeEntryIds: [],
  },
  '76316': {
    id: 'task-redmine-76316',
    sourceId: '76316',
    title: 'Tarefa Redmine',
    connectionInstanceId: 'conn-redmine-id',
    dataSourceId: 'redmine-plugin',
    _deleted: false,
    syncStatus: 'synced',
    lastPulledAt: null,
    lastPushedAt: null,
    lastReconciledAt: null,
    status: { id: 'open', name: 'Open' },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    timeEntryIds: [],
  },
}

function TestTableHarness({
  initialRow,
  activitiesByConnection,
  onTempDataChange,
}: {
  initialRow: SuggestionRow
  activitiesByConnection: Record<string, SyncMetadataItem[]>
  onTempDataChange?: (
    data: Record<string, Partial<SyncTimeEntryRxDBDTO>>,
  ) => void
}) {
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({
    [initialRow.id]: true,
  })
  const [tempData, setTempData] = useState<
    Record<string, Partial<SyncTimeEntryRxDBDTO>>
  >({})

  const handleSetTempData: React.Dispatch<
    React.SetStateAction<Record<string, Partial<SyncTimeEntryRxDBDTO>>>
  > = (action) => {
    setTempData((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      if (onTempDataChange) {
        onTempDataChange(next)
      }
      return next
    })
  }

  const allActivities = [
    ...(activitiesByConnection['conn-redmine-id'] ?? []),
    ...(activitiesByConnection['conn-jira-id'] ?? []),
  ]

  const columnOptions: CreateColumnsOptions = {
    activities: allActivities,
    activitiesByConnection,
    tasksById: mockTasksById,
    editingRows,
    setEditingRows,
    tempData,
    setTempData: handleSetTempData,
    getRowData: (id) => tempData[id],
    setRowBeingEdited: () => {},
    setTaskLookupOpen: () => {},
    onSaveRow: () => {},
    onCancelEdit: () => {},
    onDeleteRow: () => {},
    onDuplicateRow: () => {},
    onAcceptSuggestion: () => {},
    onDismissSuggestion: () => {},
  }

  const columns = createTimeEntriesColumns(columnOptions)

  const fakeRow = {
    original: initialRow,
    id: initialRow.id,
    getParentRow: () => undefined,
  }

  const taskColumn = columns.find((c) => c.id === 'issue_id')
  const activityColumn = columns.find((c) => c.id === 'activity')

  const TaskCellComponent = taskColumn?.cell as React.ComponentType<{
    row: unknown
  }>
  const ActivityCellComponent = activityColumn?.cell as React.ComponentType<{
    row: unknown
  }>

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const mockDataSourceConnectionsValue: DataSourceConnectionsContextType = {
    workspaceId: 'ws-1',
    connections: [],
    dataSourceConnections: [
      {
        connectionId: 'conn-jira-id',
        dataSourceId: 'jira-addon',
        status: 'connected',
        addon: {
          id: 'jira-addon',
          name: 'Jira Cloud',
          description: '',
          version: '1.0.0',
          creator: 'Atlassian',
          path: '',
          logo: '',
          downloads: 0,
          stars: 0,
          installed: true,
          capabilities: [],
        },
      },
      {
        connectionId: 'conn-redmine-id',
        dataSourceId: 'redmine-plugin',
        status: 'connected',
        addon: {
          id: 'redmine-plugin',
          name: 'Redmine',
          description: '',
          version: '1.0.0',
          creator: 'Redmine',
          path: '',
          logo: '',
          downloads: 0,
          stars: 0,
          installed: true,
          capabilities: [],
        },
      },
    ],
    workspaceConnections: [],
    installedPlugins: [],
    isLoading: false,
    link: async () => undefined,
    unlink: async () => undefined,
    connect: async () => undefined,
    disconnect: async () => undefined,
    getConnection: () => undefined,
    isConnected: () => true,
  }

  const mockWorkspaceValue: WorkspaceContextType = {
    workspace: {
      id: 'ws-1',
      name: 'Default Workspace',
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

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceContext.Provider value={mockWorkspaceValue}>
        <DataSourceConnectionsContext.Provider
          value={mockDataSourceConnectionsValue}
        >
          <TooltipProvider>
            <TimeEntriesColumnsProvider value={columnOptions}>
              <div data-testid="table-harness">
                <div data-testid="task-cell">
                  {TaskCellComponent && <TaskCellComponent row={fakeRow} />}
                </div>
                <div data-testid="activity-cell">
                  {ActivityCellComponent && (
                    <ActivityCellComponent row={fakeRow} />
                  )}
                </div>
              </div>
            </TimeEntriesColumnsProvider>
          </TooltipProvider>
        </DataSourceConnectionsContext.Provider>
      </WorkspaceContext.Provider>
    </QueryClientProvider>
  )
}

function createTestRow(overrides: Partial<SuggestionRow> = {}): SuggestionRow {
  return {
    id: overrides.id ?? 'entry-1',
    connectionInstanceId: overrides.connectionInstanceId ?? '',
    dataSourceId: overrides.dataSourceId ?? '',
    _deleted: overrides._deleted ?? false,
    syncStatus: overrides.syncStatus ?? 'local_only',
    task: overrides.task ?? { id: '' },
    activity: overrides.activity ?? { id: '', name: '' },
    user: overrides.user ?? { id: 'user-1', name: 'Test User' },
    startDate: overrides.startDate ?? new Date().toISOString(),
    timeSpent: overrides.timeSpent ?? 1,
    timeStatus: overrides.timeStatus ?? 'finished',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    ...overrides,
  }
}

describe('TimeEntries - Regras de Negócio de Atividade e Isolamento de Provedor', () => {
  const activitiesByConnection = {
    'conn-redmine-id': redmineActivities,
    'conn-jira-id': jiraActivities,
  }

  it('Regra 1 e 2: Quando nenhuma tarefa estiver selecionada, o seletor de atividade fica desabilitado com placeholder indicativo', () => {
    const emptyRow: SuggestionRow = createTestRow({
      id: 'entry-no-task',
      task: { id: '' },
      connectionInstanceId: '',
      dataSourceId: '',
      syncStatus: 'local_only',
      timeStatus: 'finished',
      timeSpent: 1,
    })

    render(
      <TestTableHarness
        initialRow={emptyRow}
        activitiesByConnection={activitiesByConnection}
      />,
    )

    const activityTrigger = screen.getByRole('combobox')
    expect(activityTrigger).toBeDisabled()
    expect(screen.getByText('Selecione uma tarefa')).toBeInTheDocument()
  })

  it('Regra 2: Quando uma tarefa do Jira for selecionada, exibe apenas os metadados do Jira e jamais os do Redmine', async () => {
    const jiraRow: SuggestionRow = createTestRow({
      id: 'entry-jira',
      task: { id: '10006' },
      taskData: mockTasksById['10006'],
      connectionInstanceId: 'conn-jira-id',
      dataSourceId: 'jira-addon',
      syncStatus: 'synced',
      timeStatus: 'finished',
      timeSpent: 1,
    })

    render(
      <TestTableHarness
        initialRow={jiraRow}
        activitiesByConnection={activitiesByConnection}
      />,
    )

    const activityTrigger = screen.getByRole('combobox')
    expect(activityTrigger).not.toBeDisabled()

    // Abre o select
    activityTrigger.click()

    await waitFor(() => {
      // Metadados do Jira DEVEM estar presentes
      expect(screen.getByText('Worklog Jira')).toBeInTheDocument()

      // Metadados do Redmine NUNCA podem aparecer numa tarefa do Jira
      expect(
        screen.queryByText('Desenvolvimento Redmine'),
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Design Redmine')).not.toBeInTheDocument()
    })
  })

  it('Regra 2: Quando uma tarefa do Redmine for selecionada, exibe apenas os metadados do Redmine e jamais os do Jira', async () => {
    const redmineRow: SuggestionRow = createTestRow({
      id: 'entry-redmine',
      task: { id: '76316' },
      taskData: mockTasksById['76316'],
      connectionInstanceId: 'conn-redmine-id',
      dataSourceId: 'redmine-plugin',
      syncStatus: 'synced',
      timeStatus: 'finished',
      timeSpent: 1,
    })

    render(
      <TestTableHarness
        initialRow={redmineRow}
        activitiesByConnection={activitiesByConnection}
      />,
    )

    const activityTrigger = screen.getByRole('combobox')
    expect(activityTrigger).not.toBeDisabled()

    activityTrigger.click()

    await waitFor(() => {
      // Metadados do Redmine DEVEM estar presentes
      expect(screen.getByText('Desenvolvimento Redmine')).toBeInTheDocument()
      expect(screen.getByText('Design Redmine')).toBeInTheDocument()

      // Metadados do Jira NUNCA podem aparecer numa tarefa do Redmine
      expect(screen.queryByText('Worklog Jira')).not.toBeInTheDocument()
    })
  })

  it('Regra 3: Se a linha possui atividade de outra fonte e o provedor/tarefa muda, a atividade anterior não é aceita como válida', () => {
    // Linha com tarefa do Jira, mas com id de atividade 'redmine-dev' (Redmine)
    const mismatchedRow: SuggestionRow = createTestRow({
      id: 'entry-mismatched',
      task: { id: '10006' },
      taskData: mockTasksById['10006'],
      activity: { id: 'redmine-dev', name: 'Desenvolvimento Redmine' },
      connectionInstanceId: 'conn-jira-id',
      dataSourceId: 'jira-addon',
      syncStatus: 'synced',
      timeStatus: 'finished',
      timeSpent: 1,
    })

    render(
      <TestTableHarness
        initialRow={mismatchedRow}
        activitiesByConnection={activitiesByConnection}
      />,
    )

    // O valor selecionado não pode exibir a atividade alienígena do Redmine
    expect(
      screen.queryByText('Desenvolvimento Redmine'),
    ).not.toBeInTheDocument()
  })

  it('Regra 3: Quando a tarefa é alterada para outra conexão via onSelectTask, reseta a atividade para vazio', () => {
    let latestTempData: Record<string, Partial<SyncTimeEntryRxDBDTO>> = {}

    const redmineRow: SuggestionRow = createTestRow({
      id: 'entry-switch',
      task: { id: '76316' },
      taskData: mockTasksById['76316'],
      activity: { id: 'redmine-dev', name: 'Desenvolvimento Redmine' },
      connectionInstanceId: 'conn-redmine-id',
      dataSourceId: 'redmine-plugin',
      syncStatus: 'local_only',
      timeStatus: 'finished',
      timeSpent: 1,
    })

    render(
      <TestTableHarness
        initialRow={redmineRow}
        activitiesByConnection={activitiesByConnection}
        onTempDataChange={(data) => {
          latestTempData = data
        }}
      />,
    )

    // Aciona a troca para a tarefa do Jira
    const selectJiraBtn = screen.getByTestId('trigger-select-jira')
    selectJiraBtn.click()

    // Verifica que a atividade foi imediatamente resetada para vazio e a nova conexão foi definida
    expect(latestTempData['entry-switch']?.activity).toEqual({
      id: '',
      name: '',
    })
    expect(latestTempData['entry-switch']?.connectionInstanceId).toBe(
      'conn-jira-id',
    )
    expect(latestTempData['entry-switch']?.task?.id).toBe('10006')
  })

  it('Regra 1 e 2: Quando a tarefa é limpa via onTaskIdChange, a atividade também é resetada para vazio', () => {
    let latestTempData: Record<string, Partial<SyncTimeEntryRxDBDTO>> = {}

    const redmineRow: SuggestionRow = createTestRow({
      id: 'entry-clear',
      task: { id: '76316' },
      taskData: mockTasksById['76316'],
      activity: { id: 'redmine-dev', name: 'Desenvolvimento Redmine' },
      connectionInstanceId: 'conn-redmine-id',
      dataSourceId: 'redmine-plugin',
      syncStatus: 'local_only',
      timeStatus: 'finished',
      timeSpent: 1,
    })

    render(
      <TestTableHarness
        initialRow={redmineRow}
        activitiesByConnection={activitiesByConnection}
        onTempDataChange={(data) => {
          latestTempData = data
        }}
      />,
    )

    // Aciona a limpeza da tarefa
    const clearTaskBtn = screen.getByTestId('trigger-clear-task')
    clearTaskBtn.click()

    // Ao limpar a tarefa em registro local, a atividade também é resetada
    expect(latestTempData['entry-clear']?.activity).toEqual({
      id: '',
      name: '',
    })
    expect(latestTempData['entry-clear']?.task?.id).toBe('')
  })
})
