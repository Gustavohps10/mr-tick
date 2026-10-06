import { act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTimerSettings } from '@/hooks/use-timer-settings'
import { WidgetLayout } from '@/layouts/widgets-layout'

type EventCallback = (payload: { workspaceId: string }) => void

let registeredEventCallback: EventCallback | null = null

const mockHostBridge = {
  events: {
    on: vi.fn((event: string, callback: EventCallback) => {
      if (event === 'workspace:switched') {
        registeredEventCallback = callback
      }
      return () => {
        registeredEventCallback = null
      }
    }),
    emit: vi.fn(),
  },
}

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => mockHostBridge,
}))

vi.mock('@/hooks', () => ({
  useHostBridge: () => mockHostBridge,
  useDataSourceConnections: () => ({ connections: [] }),
}))

vi.mock('@/contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({
    children,
    workspaceId,
  }: {
    children: React.ReactNode
    workspaceId?: string
  }) => (
    <div data-testid="workspace-provider" data-workspace-id={workspaceId}>
      {children}
    </div>
  ),
  useWorkspace: () => ({ workspace: { id: 'ws-1' }, workspaces: [] }),
}))

vi.mock('@/contexts/DataSourceConnectionsContext', () => ({
  DataSourceConnectionsProvider: ({
    children,
  }: {
    children: React.ReactNode
  }) => <div data-testid="connections-provider">{children}</div>,
}))

vi.mock('@/stores/syncStore', () => ({
  SyncProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sync-provider">{children}</div>
  ),
}))

vi.mock('@/stores/timeEntryStore', () => ({
  TimeEntryProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="time-entry-provider">{children}</div>
  ),
}))

function TestApp({ initialEntry }: { initialEntry: string }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/workspaces/:workspaceId/widgets/timer"
          element={<WidgetLayout />}
        >
          <Route
            index
            element={<div data-testid="widget-content">Widget Content</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('TB-003: WidgetLayout Workspace Navigation and Sync Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registeredEventCallback = null
    useTimerSettings.setState({ selectedWorkspaceId: null })
  })

  it('deve redirecionar imediatamente da rota órfã default para o workspace persistido em selectedWorkspaceId', async () => {
    useTimerSettings.setState({ selectedWorkspaceId: 'ws-persisted-123' })

    render(<TestApp initialEntry="/workspaces/default/widgets/timer" />)

    await waitFor(() => {
      const provider = screen.getByTestId('workspace-provider')
      expect(provider.getAttribute('data-workspace-id')).toBe(
        'ws-persisted-123',
      )
    })
  })

  it('deve priorizar o selectedWorkspaceId quando houver divergência com a rota inicial em ambiente multi-workspace', async () => {
    useTimerSettings.setState({ selectedWorkspaceId: 'ws-B' })

    render(<TestApp initialEntry="/workspaces/ws-A/widgets/timer" />)

    await waitFor(() => {
      const provider = screen.getByTestId('workspace-provider')
      expect(provider.getAttribute('data-workspace-id')).toBe('ws-B')
    })
  })

  it('deve reagir ao evento workspace:switched e navegar para o novo workspace', async () => {
    render(<TestApp initialEntry="/workspaces/ws-current/widgets/timer" />)

    const provider = screen.getByTestId('workspace-provider')
    expect(provider.getAttribute('data-workspace-id')).toBe('ws-current')

    await act(async () => {
      if (registeredEventCallback)
        registeredEventCallback({ workspaceId: 'ws-target-456' })
    })

    await waitFor(() => {
      expect(provider.getAttribute('data-workspace-id')).toBe('ws-target-456')
    })
    expect(useTimerSettings.getState().selectedWorkspaceId).toBe(
      'ws-target-456',
    )
  })
})
