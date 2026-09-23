import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'

vi.mock('@/hooks/use-open-api', () => ({
  useOpenAPI: () => ({
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
import { setupRxDBQueryCacheSync } from '@/local-db/rxdb-query-cache-sync'
import { SyncMetadataItem } from '@/local-db/schemas/metadata-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { TimeEntriesDayCard } from '@/pages/time-entries/components/time-entries-day-card'
import { createTimeEntriesColumns } from '@/pages/time-entries/components/time-entries-table-columns'
import { SuggestionRow } from '@/pages/time-entries/lib/time-entries-utils'
import { AppDatabase } from '@/stores/sync-store/types'
import { TimeEntryContext, TimeEntryStore } from '@/stores/timeEntryStore'

const mockActivities: SyncMetadataItem[] = [
  {
    id: 'act-dev',
    name: 'Desenvolvimento',
    icon: 'Code',
    colors: {
      badge: '#eee',
      background: '#fff',
      text: '#000',
    },
  },
]

describe('TimeEntries Row Observability & Flicker Tests', () => {
  it('renders without crashing and mounts table with initial rows', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const testDay = new Date('2026-09-23T12:00:00.000Z')
    const initialEntry: SyncTimeEntryRxDBDTO = {
      id: 'entry-1',
      dataSourceId: 'fake',
      connectionInstanceId: 'conn-1',
      syncStatus: 'synced',
      syncError: null,
      remoteId: 'remote-1',
      lastPulledAt: null,
      lastPushedAt: null,
      task: { id: 'T-100' },
      activity: { id: 'act-dev', name: 'Desenvolvimento' },
      user: { id: 'user-1', name: 'User 1' },
      startDate: '2026-09-23T09:00:00.000Z',
      endDate: '2026-09-23T10:00:00.000Z',
      timeSpent: 1,
      comments: 'Implementando feature',
      timeStatus: 'finished',
      type: 'manual',
      createdAt: '2026-09-23T09:00:00.000Z',
      updatedAt: '2026-09-23T09:00:00.000Z',
      _deleted: false,
    }

    function TestHarness() {
      const [entries, setEntries] = useState<SyncTimeEntryRxDBDTO[]>([
        initialEntry,
      ])
      const [draftEntries, setDraftEntries] = useState<SuggestionRow[]>([])
      const [editingRows, setEditingRows] = useState<Record<string, boolean>>(
        {},
      )
      const [tempData, setTempData] = useState<
        Record<string, Partial<SyncTimeEntryRxDBDTO>>
      >({})
      const [collapsedRows, setCollapsedRows] = useState<
        Record<string, boolean>
      >({})

      const columns = createTimeEntriesColumns({
        activities: mockActivities,
        tasksById: {},
        editingRows,
        getRowData: (id) => tempData[id],
        setEditingRows,
        setTempData,
        tempData,
        setRowBeingEdited: () => {},
        setTaskLookupOpen: () => {},
        onSaveRow: (id) => {},
        onDirectUpdateRow: (id, updates) => {},
        onCancelEdit: (id) => {},
        onDeleteRow: (id) => {},
        onDuplicateRow: (row) => {},
        onAcceptSuggestion: (row) => {},
        onDismissSuggestion: (id) => {},
      })

      const mockConnectionsValue: DataSourceConnectionsContextType = {
        isLoading: false,
        connections: [],
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

      return (
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <WorkspaceContext.Provider value={mockWorkspaceValue}>
              <TimeEntryContext.Provider value={mockTimeEntryStore}>
                <DataSourceConnectionsContext.Provider
                  value={mockConnectionsValue}
                >
                  <TimeEntriesDayCard
                    day={testDay}
                    entries={entries}
                    draftEntries={draftEntries}
                    tempData={tempData}
                    columns={columns}
                    expandedRows={{}}
                    onExpandedChange={() => {}}
                    isGrouped={true}
                  />
                </DataSourceConnectionsContext.Provider>
              </TimeEntryContext.Provider>
            </WorkspaceContext.Provider>
          </QueryClientProvider>
        </TooltipProvider>
      )
    }

    render(<TestHarness />)
    expect(screen.getByText('Implementando feature')).toBeTruthy()
  })

  it('observes DOM mutations when editing an existing row and creating a new draft', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const testDay = new Date('2026-09-23T12:00:00.000Z')
    const initialEntry: SyncTimeEntryRxDBDTO = {
      id: 'entry-1',
      dataSourceId: 'fake',
      connectionInstanceId: 'conn-1',
      syncStatus: 'synced',
      syncError: null,
      remoteId: 'remote-1',
      lastPulledAt: null,
      lastPushedAt: null,
      task: { id: 'T-100' },
      activity: { id: 'act-dev', name: 'Desenvolvimento' },
      user: { id: 'user-1', name: 'User 1' },
      startDate: '2026-09-23T09:00:00.000Z',
      endDate: '2026-09-23T10:00:00.000Z',
      timeSpent: 1,
      comments: 'Implementando feature',
      timeStatus: 'finished',
      type: 'manual',
      createdAt: '2026-09-23T09:00:00.000Z',
      updatedAt: '2026-09-23T09:00:00.000Z',
      _deleted: false,
    }

    function InteractiveHarness() {
      const [entries, setEntries] = useState<SyncTimeEntryRxDBDTO[]>([
        initialEntry,
      ])
      const [draftEntries, setDraftEntries] = useState<SuggestionRow[]>([])
      const [editingRows, setEditingRows] = useState<Record<string, boolean>>(
        {},
      )
      const [tempData, setTempData] = useState<
        Record<string, Partial<SyncTimeEntryRxDBDTO>>
      >({})
      const [collapsedRows, setCollapsedRows] = useState<
        Record<string, boolean>
      >({})

      const handleSaveRow = (id: string) => {
        const draft = draftEntries.find((d) => d.id === id)
        if (draft) {
          const newEntry: SyncTimeEntryRxDBDTO = {
            ...draft,
            ...(tempData[id] || {}),
            id: draft.id,
            timeSpent: tempData[id]?.timeSpent ?? draft.timeSpent ?? 1,
            timeStatus: 'finished',
          }
          setEntries((prev) => [...prev, newEntry])
          setDraftEntries((prev) => prev.filter((d) => d.id !== id))
          setEditingRows((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
          setTempData((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
          return
        }

        const changes = tempData[id] || {}
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, ...changes } : e)),
        )
        setEditingRows((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        setTempData((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }

      const handleAddNewEntry = (day: Date) => {
        const draftId = 'draft-uuid-1'
        const startOfDayIso = day.toISOString()
        const draftRow: SuggestionRow = {
          id: draftId,
          _deleted: false,
          connectionInstanceId: 'conn-1',
          dataSourceId: 'fake',
          syncStatus: 'local_only',
          lastPulledAt: null,
          lastPushedAt: null,
          task: { id: '' },
          activity: { id: 'act-dev' },
          user: { id: 'user-1' },
          startDate: startOfDayIso,
          endDate: startOfDayIso,
          timeSpent: 0,
          timeStatus: 'finished',
          comments: '',
          type: 'manual',
          isDraft: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          subRows: [],
        }

        setDraftEntries((prev) => [...prev, draftRow])
        setEditingRows((prev) => ({ ...prev, [draftId]: true }))
        setTempData((prev) => ({
          ...prev,
          [draftId]: {
            task: { id: '' },
            activity: { id: 'act-dev' },
            comments: '',
            timeSpent: 0,
            startDate: startOfDayIso,
            endDate: startOfDayIso,
          },
        }))
      }

      const columns = createTimeEntriesColumns({
        activities: mockActivities,
        tasksById: {},
        editingRows,
        getRowData: (id) => tempData[id],
        setEditingRows,
        setTempData,
        tempData,
        setRowBeingEdited: () => {},
        setTaskLookupOpen: () => {},
        onSaveRow: handleSaveRow,
        onDirectUpdateRow: (id, updates) => {
          setTempData((p) => ({
            ...p,
            [id]: { ...p[id], ...updates },
          }))
        },
        onCancelEdit: (id) => {
          setDraftEntries((prev) => prev.filter((d) => d.id !== id))
          setEditingRows((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
        },
        onDeleteRow: (id) => {},
        onDuplicateRow: (row) => {},
        onAcceptSuggestion: (row) => {},
        onDismissSuggestion: (id) => {},
      })

      const mockConnectionsValue: DataSourceConnectionsContextType = {
        isLoading: false,
        connections: [],
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

      return (
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <WorkspaceContext.Provider value={mockWorkspaceValue}>
              <TimeEntryContext.Provider value={mockTimeEntryStore}>
                <DataSourceConnectionsContext.Provider
                  value={mockConnectionsValue}
                >
                  <TimeEntriesDayCard
                    day={testDay}
                    entries={entries}
                    draftEntries={draftEntries}
                    tempData={tempData}
                    columns={columns}
                    expandedRows={{}}
                    onExpandedChange={() => {}}
                    isGrouped={true}
                    onAddNewEntry={handleAddNewEntry}
                    onRowDoubleClick={(row) => {
                      setEditingRows((prev) => ({ ...prev, [row.id]: true }))
                    }}
                  />
                </DataSourceConnectionsContext.Provider>
              </TimeEntryContext.Provider>
            </WorkspaceContext.Provider>
          </QueryClientProvider>
        </TooltipProvider>
      )
    }

    const { container } = render(<InteractiveHarness />)
    const tbody = container.querySelector('tbody')
    expect(tbody).not.toBeNull()

    // 1. Initial row check
    const initialRows = container.querySelectorAll(
      'tr[data-testid="time-entry-row"]',
    )
    expect(initialRows.length).toBe(1)
    const initialRowEl = initialRows[0]

    // Track removals and additions with MutationObserver
    const removedNodes: Node[] = []
    const addedNodes: Node[] = []
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.removedNodes.forEach((node) => {
          if (node.nodeName === 'TR') removedNodes.push(node)
        })
        m.addedNodes.forEach((node) => {
          if (node.nodeName === 'TR') addedNodes.push(node)
        })
      }
    })
    if (tbody) {
      observer.observe(tbody, { childList: true })
    }

    // 2. Action: Double click to edit existing row
    act(() => {
      fireEvent.doubleClick(initialRowEl)
    })

    // Assert that the initial row was NOT unmounted/removed from tbody
    const wasInitialRowRemoved = removedNodes.includes(initialRowEl)
    expect(wasInitialRowRemoved).toBe(false)

    // 3. Action: Click "Adicionar" to add a new draft
    const addBtn = screen.getByTitle('Adicionar novo apontamento')
    act(() => {
      fireEvent.click(addBtn)
    })

    const rowsAfterAdd = container.querySelectorAll(
      'tr[data-testid="time-entry-row"]',
    )
    // There should now be 2 rows: the initial row and the new draft row
    expect(rowsAfterAdd.length).toBe(2)

    // Assert the initial row was NOT removed when adding draft
    expect(removedNodes.includes(initialRowEl)).toBe(false)

    // 4. Action: Type in comments input of the draft row
    const commentInputs = screen.getAllByTestId('time-entry-comment-input')
    expect(commentInputs.length).toBeGreaterThan(0)
    const activeCommentInput = commentInputs[commentInputs.length - 1]
    if (activeCommentInput) {
      act(() => {
        fireEvent.focus(activeCommentInput)
        fireEvent.change(activeCommentInput, {
          target: { value: 'Comentário de teste' },
        })
        fireEvent.blur(activeCommentInput)
      })
    }

    // Assert that typing/blur did not cause any row to unmount
    expect(removedNodes.includes(initialRowEl)).toBe(false)

    // 5. Action: Click Save on the draft
    const saveButtons = screen.getAllByTitle('Salvar apontamento')
    expect(saveButtons.length).toBeGreaterThan(0)
    const draftSaveBtn = saveButtons[saveButtons.length - 1]
    if (draftSaveBtn) {
      act(() => {
        fireEvent.click(draftSaveBtn)
      })
    }

    // Both rows must still be present in the table
    const rowsAfterSave = container.querySelectorAll(
      'tr[data-testid="time-entry-row"]',
    )
    expect(rowsAfterSave.length).toBe(2)

    observer.disconnect()
  })

  it('proves that setupRxDBQueryCacheSync correctly preserves entries with 4-part queryKey [time-entries-range, dbName, fromIso, toIso]', () => {
    const queryClient = new QueryClient()
    const dbName = 'db-workspace-1'
    const fromIso = '2026-09-20T00:00:00.000Z'
    const toIso = '2026-09-26T23:59:59.999Z'
    const realQueryKey = ['time-entries-range', dbName, fromIso, toIso]

    const initialEntry: SyncTimeEntryRxDBDTO = {
      id: 'entry-1',
      dataSourceId: 'fake',
      connectionInstanceId: 'conn-1',
      syncStatus: 'synced',
      syncError: null,
      remoteId: 'remote-1',
      lastPulledAt: null,
      lastPushedAt: null,
      task: { id: 'T-100' },
      activity: { id: 'act-dev', name: 'Desenvolvimento' },
      user: { id: 'user-1', name: 'User 1' },
      startDate: '2026-09-23T09:00:00.000Z',
      endDate: '2026-09-23T10:00:00.000Z',
      timeSpent: 1,
      comments: 'Implementando feature',
      timeStatus: 'finished',
      type: 'manual',
      createdAt: '2026-09-23T09:00:00.000Z',
      updatedAt: '2026-09-23T09:00:00.000Z',
      _deleted: false,
    }

    queryClient.setQueryData(realQueryKey, [initialEntry])

    // Subject for RxDB change events
    const timeEntriesSubject = {
      subscribers: [] as ((event: unknown) => void)[],
      subscribe(fn: (event: unknown) => void) {
        this.subscribers.push(fn)
        return {
          unsubscribe: () => {
            this.subscribers = this.subscribers.filter((s) => s !== fn)
          },
        }
      },
      next(event: unknown) {
        this.subscribers.forEach((s) => s(event))
      },
    }

    const mockDb = {
      name: dbName,
      timeEntries: {
        $: timeEntriesSubject,
      },
      tasks: {
        $: {
          subscribe: () => ({ unsubscribe: () => {} }),
        },
      },
    }

    // Call setupRxDBQueryCacheSync
    const handle = setupRxDBQueryCacheSync(
      mockDb as unknown as AppDatabase,
      queryClient,
    )

    // Simulate an UPDATE changeEvent when user edits or saves entry-1
    timeEntriesSubject.next({
      operation: 'UPDATE',
      documentId: 'entry-1',
      documentData: {
        ...initialEntry,
        comments: 'Comentário atualizado',
      },
    })

    const cachedData =
      queryClient.getQueryData<SyncTimeEntryRxDBDTO[]>(realQueryKey)

    // With the bug, cachedData is [] (entry-1 is WRONGLY removed from cache!)
    expect(cachedData).toBeDefined()
    expect(cachedData?.length).toBe(1)
    expect(cachedData?.[0]?.comments).toBe('Comentário atualizado')

    handle.unsubscribe()
  })
})
