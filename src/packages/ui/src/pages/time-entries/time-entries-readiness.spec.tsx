import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DataSourceConnectionsContext,
  DataSourceConnectionsContextType,
} from '@/contexts/DataSourceConnectionsContext'
import {
  WorkspaceContext,
  WorkspaceContextType,
} from '@/contexts/WorkspaceContext'
import {
  useTimeEntriesQuery,
  UseTimeEntriesQueryResult,
} from '@/hooks/queries/use-time-entries-query'
import { TimeEntries } from '@/pages/time-entries/time-entries-page'
import {
  ensurePlugins,
  getOrCreateDatabase,
  removeDatabaseFromCache,
} from '@/stores/sync-store/storage'
import type { ReplicationStatus, SyncState } from '@/stores/syncStore'
import { TimeEntryContext, TimeEntryStore } from '@/stores/timeEntryStore'

let currentSyncState: SyncState = {
  isInitialized: false,
  db: null,
  statuses: {},
}

vi.mock('@/stores/syncStore', () => ({
  useSyncStore: <T,>(selector: (state: SyncState) => T): T => {
    return selector(currentSyncState)
  },
  useConnectionsWithSync: () => [],
}))

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({
    timer: {
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
    workspaces: {
      getById: () => Promise.resolve({ isSuccess: true, data: null }),
      listAll: () => Promise.resolve({ isSuccess: true, data: [] }),
    },
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

function createMockTimeEntryStore(): StoreApi<TimeEntryStore> {
  return createStore<TimeEntryStore>(() => ({
    active: null,
    history: [],
    setActive: vi.fn(),
    createNewTimeEntry: vi.fn(),
    pauseCurrentTimeEntry: vi.fn(),
    playCurrentTimeEntry: vi.fn(),
    stopCurrentTimeEntry: vi.fn(),
    recoverRunningEntry: vi.fn(),
    clear: vi.fn(),
  }))
}

function renderTimeEntriesWithState(
  connections: DataSourceConnectionsContextType['connections'] = [],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const timeEntryStore = createMockTimeEntryStore()

  const workspaceContextValue: WorkspaceContextType = {
    workspace: {
      id: 'ws-1',
      name: 'Workspace 1',
      status: 'configured',
      dataSourceConnections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    workspaces: [],
    isLoading: false,
    isLoadingWorkspaces: false,
    create: vi.fn(),
    updateIdentity: vi.fn(),
    remove: vi.fn(),
    isCreating: false,
    isUpdatingIdentity: false,
    isRemoving: false,
  }

  const connectionsContextValue: DataSourceConnectionsContextType = {
    connections,
    isLoading: false,
    workspaceId: 'ws-1',
    workspaceConnections: [],
    installedPlugins: [],
    link: vi.fn(),
    unlink: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    getConnection: vi.fn(),
    isConnected: vi.fn(),
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceContext.Provider value={workspaceContextValue}>
        <DataSourceConnectionsContext.Provider value={connectionsContextValue}>
          <TimeEntryContext.Provider value={timeEntryStore}>
            <TooltipProvider>
              <TimeEntries />
            </TooltipProvider>
          </TimeEntryContext.Provider>
        </DataSourceConnectionsContext.Provider>
      </WorkspaceContext.Provider>
    </QueryClientProvider>,
  )
}

describe('TB-001 & TB-002: TimeEntries & Popover Readiness & Sync Blocking', () => {
  beforeEach(() => {
    currentSyncState = {
      isInitialized: false,
      db: null,
      statuses: {},
    }
  })

  it('TB-001: useTimeEntriesQuery deve retornar isLoading: true quando db.timeEntries não está pronto', () => {
    currentSyncState = {
      isInitialized: false,
      db: null,
      statuses: {},
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    let hookResult: UseTimeEntriesQueryResult | undefined

    function HookTestComponent() {
      hookResult = useTimeEntriesQuery({
        from: new Date('2026-10-01'),
        to: new Date('2026-10-05'),
      })
      return null
    }

    render(
      <QueryClientProvider client={queryClient}>
        <HookTestComponent />
      </QueryClientProvider>,
    )

    // O banco NÃO está pronto; o hook DEVE reportar isLoading: true para evitar falso vazio
    if (!hookResult) {
      throw new Error('Hook não foi executado')
    }
    expect(hookResult.isLoading).toBe(true)
  })

  it('TB-001: TimeEntries NÃO deve renderizar tabelas vazias prematuramente quando db não está inicializado', () => {
    // Quando o banco ainda está inicializando (db: null), não podemos renderizar tabelas vazias (falso vazio)
    currentSyncState = {
      isInitialized: false,
      db: null,
      statuses: {},
    }

    renderTimeEntriesWithState()

    // NÃO deve exibir tabelas com falso vazio enquanto o banco inicializa
    expect(screen.queryAllByText(/Nenhum registro para exibir/i).length).toBe(0)
    expect(screen.queryAllByRole('table').length).toBe(0)
  })

  it('TB-002: TimeEntries com período localmente vazio NÃO deve bloquear as tabelas com skeleton quando isPulling estiver ativo', async () => {
    const workspaceId = `ws-readiness-${Date.now()}`
    await ensurePlugins(false)
    const testDb = await getOrCreateDatabase(workspaceId, false, true)

    const pullingStatus: ReplicationStatus = {
      isActive: true,
      isPulling: true,
      isPushing: false,
      isReconciling: false,
      lastPulledAt: null,
      lastPushedAt: null,
      lastReconciledAt: null,
      lastReplication: null,
      lastPushResult: null,
      lastPullResult: null,
      error: null,
    }

    currentSyncState = {
      db: testDb,
      isInitialized: true,
      statuses: {
        timeEntries_conn_1: pullingStatus,
      },
    }

    try {
      renderTimeEntriesWithState()

      // O skeleton bloqueante NÃO deve ocultar as tabelas de dias após a consulta local resolver
      // O usuário deve poder visualizar a estrutura dos dias e adicionar apontamentos
      const tables = await screen.findAllByRole('table')
      expect(tables.length).toBeGreaterThan(0)
      expect(
        screen.queryAllByText(/Nenhum registro para exibir/i).length,
      ).toBeGreaterThan(0)

      // E o banner informativo de sincronização deve estar visível
      expect(
        screen.getByText(
          /Sincronizando apontamentos do período com as fontes remotas.../i,
        ),
      ).toBeTruthy()
    } finally {
      await testDb.close()
      removeDatabaseFromCache(workspaceId, true)
    }
  })
})
