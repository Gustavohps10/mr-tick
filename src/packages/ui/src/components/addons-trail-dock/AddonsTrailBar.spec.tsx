import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AddonsTrailBar } from './AddonsTrailBar'

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({
    addons: {
      listInstalled: vi.fn().mockResolvedValue({
        isSuccess: true,
        data: [
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
        ],
      }),
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

describe('AddonsTrailBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('renders dock with 48px width class (w-12)', () => {
    render(<AddonsTrailBar failures={[]} />)
    const aside = screen.getByTestId('addons-trail-dock')
    expect(aside).toHaveClass('w-12')
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

    render(<AddonsTrailBar failures={failures} />)

    const dot = screen.getByTestId('status-dot')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveTextContent('!')
  })

  it('handles click on diagnostic button to open drawer', () => {
    render(<AddonsTrailBar failures={[]} />)
    const diagBtn = screen.getByTestId('sync-status-indicator')
    fireEvent.click(diagBtn)
    expect(screen.getByTestId('addons-diagnostics-drawer')).toBeInTheDocument()
  })

  it('renders service error indicator when failure service fails', () => {
    render(
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
