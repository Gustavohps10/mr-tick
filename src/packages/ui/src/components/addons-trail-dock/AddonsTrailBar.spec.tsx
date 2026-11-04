import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AddonsTrailBar } from './AddonsTrailBar'

let installedAddonsData = [
  {
    id: 'addon-1',
    name: 'Jira Addon',
    logo: '',
    version: '1.0.0',
    creator: 'Dev',
    description: '',
    path: '',
    downloads: 0,
    stars: 0,
    installed: true,
    capabilities: [],
  },
  {
    id: 'addon-2',
    name: 'Redmine Addon',
    logo: '',
    version: '1.0.0',
    creator: 'Dev',
    description: '',
    path: '',
    downloads: 0,
    stars: 0,
    installed: true,
    capabilities: [],
  },
]

type EventHandler = (data?: unknown) => void
const eventListeners = new Map<string, EventHandler>()

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({
    addons: {
      listInstalled: vi.fn().mockImplementation(() =>
        Promise.resolve({
          isSuccess: true,
          data: installedAddonsData,
        }),
      ),
    },
    events: {
      on: (channel: string, handler: EventHandler) => {
        eventListeners.set(channel, handler)
        return () => {
          eventListeners.delete(channel)
        }
      },
    },
  }),
}))

vi.mock('@/stores/syncStore', () => ({
  useSyncInitializationError: () => null,
  useSyncStore: vi.fn((selector) => {
    const state = {
      database: null,
      isInitialized: true,
      isSyncing: false,
      isResetting: false,
      syncAll: vi.fn(),
      syncDirection: vi.fn(),
      resetDatabase: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
  useConnectionsWithSync: () => [
    {
      connectionId: 'c1',
      dataSourceId: 'jira',
      status: 'connected',
      addon: { id: 'addon-1', name: 'Jira Addon' },
      identity: { displayName: 'Jira Corp' },
      sync: {
        metadata: {},
        tasks: {},
        timeEntries: {},
      },
    },
  ],
}))

vi.mock('@/hooks/use-workspace-connections-filter', () => ({
  useWorkspaceConnectionsFilter: () => ({
    scope: { kind: 'all' },
    toggleConnection: vi.fn(),
    selectAll: vi.fn(),
    selectNone: vi.fn(),
    selectedIds: undefined,
  }),
}))

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function renderWithClient(
  ui: React.ReactElement,
  client: QueryClient = createTestQueryClient(),
) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('AddonsTrailBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventListeners.clear()
    installedAddonsData = [
      {
        id: 'addon-1',
        name: 'Jira Addon',
        logo: '',
        version: '1.0.0',
        creator: 'Dev',
        description: '',
        path: '',
        downloads: 0,
        stars: 0,
        installed: true,
        capabilities: [],
      },
      {
        id: 'addon-2',
        name: 'Redmine Addon',
        logo: '',
        version: '1.0.0',
        creator: 'Dev',
        description: '',
        path: '',
        downloads: 0,
        stars: 0,
        installed: true,
        capabilities: [],
      },
    ]

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('renders dock with 48px width class (w-12)', () => {
    renderWithClient(<AddonsTrailBar failures={[]} />)
    const aside = screen.getByTestId('addons-trail-dock')
    expect(aside).toHaveClass('w-12')
  })

  it('renders installed addons from query cache', async () => {
    renderWithClient(<AddonsTrailBar failures={[]} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Jira Addon')).toBeInTheDocument()
      expect(screen.getByLabelText('Redmine Addon')).toBeInTheDocument()
    })
  })

  it('dynamically updates installed addons when addons:installed-changed event fires', async () => {
    renderWithClient(<AddonsTrailBar failures={[]} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Jira Addon')).toBeInTheDocument()
    })

    // Simulate an addon being installed
    installedAddonsData = [
      ...installedAddonsData,
      {
        id: 'addon-3',
        name: 'Discord Addon',
        logo: '',
        version: '1.0.0',
        creator: 'Dev',
        description: '',
        path: '',
        downloads: 0,
        stars: 0,
        installed: true,
        capabilities: [],
      },
    ]

    // Trigger event
    const handler = eventListeners.get('addons:installed-changed')
    expect(handler).toBeDefined()
    handler?.()

    await waitFor(() => {
      expect(screen.getByLabelText('Discord Addon')).toBeInTheDocument()
    })

    // Simulate an addon being uninstalled
    installedAddonsData = installedAddonsData.filter(
      (addon) => addon.id !== 'addon-2',
    )

    handler?.()

    await waitFor(() => {
      expect(screen.queryByLabelText('Redmine Addon')).not.toBeInTheDocument()
    })
  })

  it('renders load failure badge if addon has failure', async () => {
    const failures = [
      {
        addonId: 'failed-addon',
        addonName: 'Broken Addon',
        folderPath: '/path',
        stage: 'import' as const,
        reason: 'IMPORT_FAILED' as const,
        technicalMessage: 'Syntax error in addon bundle',
        timestamp: Date.now(),
      },
    ]

    renderWithClient(<AddonsTrailBar failures={failures} />)

    const dot = screen.getByTestId('status-dot')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveTextContent('!')
  })

  it('handles click on diagnostic button to open drawer', () => {
    renderWithClient(<AddonsTrailBar failures={[]} />)
    const diagBtn = screen.getByTestId('sync-status-indicator')
    fireEvent.click(diagBtn)
    expect(screen.getByTestId('addons-diagnostics-drawer')).toBeInTheDocument()
  })

  it('renders service error indicator when failure service fails', () => {
    renderWithClient(
      <AddonsTrailBar
        failures={[]}
        isFailureServiceError={true}
        failureServiceErrorMessage="IPC timeout"
      />,
    )
    const errDot = screen.getByTestId('service-error-dot')
    expect(errDot).toBeInTheDocument()
    expect(errDot).toHaveTextContent('!')

    const diagBtn = screen.getByTestId('sync-status-indicator')
    fireEvent.click(diagBtn)
    expect(
      screen.getByTestId('addons-diagnostics-service-error'),
    ).toBeInTheDocument()
    expect(screen.getByText('IPC timeout')).toBeInTheDocument()
  })
})
