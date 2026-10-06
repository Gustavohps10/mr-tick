import type { IWorkspacesAPI } from '@mr-tick/application'
import type { WorkspaceViewModel } from '@mr-tick/shared/view-models'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTimerSettings } from '@/hooks/use-timer-settings'
import { WidgetLayout } from '@/layouts/widgets-layout'

type EventCallback = (payload: { workspaceId: string }) => void
let registeredEventCallback: EventCallback | null = null
const getById = vi.fn<IWorkspacesAPI['getById']>()
const listAll = vi.fn<IWorkspacesAPI['listAll']>()
const mockHostBridge = {
  workspaces: { getById, listAll },
  events: {
    on: vi.fn((event: string, callback: EventCallback) => {
      if (event === 'workspace:switched') registeredEventCallback = callback
      return () => {
        registeredEventCallback = null
      }
    }),
    emit: vi.fn(),
  },
}
vi.mock('@/hooks', () => ({ useHostBridge: () => mockHostBridge }))
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
}))
vi.mock('@/contexts/DataSourceConnectionsContext', () => ({
  DataSourceConnectionsProvider: ({
    children,
  }: {
    children: React.ReactNode
  }) => <>{children}</>,
}))
vi.mock('@/stores/syncStore', () => ({
  SyncProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/stores/timeEntryStore', () => ({
  TimeEntryProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

function workspace(id: string): WorkspaceViewModel {
  return {
    id,
    name: id,
    status: 'configured',
    dataSourceConnections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
function renderWidget(initialEntry = '/widgets/timer') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<WidgetLayout />}>
            <Route path="widgets/timer" element={<div>Timer</div>} />
            <Route
              path="workspaces/:workspaceId/widgets/timer"
              element={<div>Timer</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TB-003: explicit workspace resolution before opening the widget database', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registeredEventCallback = null
    useTimerSettings.setState({ selectedWorkspaceId: null })
    getById.mockImplementation(async ({ body }) => {
      if (!body) return { isSuccess: false, statusCode: 400 }
      return {
        isSuccess: true,
        statusCode: 200,
        data: workspace(body.workspaceId),
      }
    })
    listAll.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [workspace('ws-A'), workspace('ws-B')],
      totalItems: 2,
      totalPages: 1,
      currentPage: 1,
    })
  })

  it('does not mount providers while the persisted identity is still being validated', async () => {
    useTimerSettings.setState({ selectedWorkspaceId: 'ws-B' })
    let release: (
      value: Awaited<ReturnType<IWorkspacesAPI['getById']>>,
    ) => void = () => {}
    getById.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    renderWidget()
    expect(screen.queryByTestId('workspace-provider')).toBeNull()
    await act(async () => {
      release({ isSuccess: true, statusCode: 200, data: workspace('ws-B') })
    })
    expect(
      (await screen.findByTestId('workspace-provider')).getAttribute(
        'data-workspace-id',
      ),
    ).toBe('ws-B')
  })

  it('resolves the persisted identity directly even when it is outside the first catalog page', async () => {
    useTimerSettings.setState({ selectedWorkspaceId: 'ws-eleventh' })
    renderWidget('/workspaces/ws-A/widgets/timer')
    expect(
      (await screen.findByTestId('workspace-provider')).getAttribute(
        'data-workspace-id',
      ),
    ).toBe('ws-eleventh')
    expect(getById).toHaveBeenCalledWith({
      body: { workspaceId: 'ws-eleventh' },
    })
    expect(listAll).not.toHaveBeenCalled()
  })

  it('does not automatically choose the first configured workspace without a selection', async () => {
    renderWidget()
    expect(await screen.findByRole('button', { name: 'ws-B' })).toBeTruthy()
    expect(screen.queryByTestId('workspace-provider')).toBeNull()
    expect(useTimerSettings.getState().selectedWorkspaceId).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'ws-B' }))
    expect(
      (await screen.findByTestId('workspace-provider')).getAttribute(
        'data-workspace-id',
      ),
    ).toBe('ws-B')
  })

  it('rejects a deleted persisted workspace without mounting its providers', async () => {
    useTimerSettings.setState({ selectedWorkspaceId: 'deleted-workspace' })
    getById.mockResolvedValue({
      isSuccess: false,
      statusCode: 404,
      error: 'WORKSPACE_NOT_FOUND',
    })
    renderWidget()
    expect(await screen.findByRole('button', { name: 'ws-A' })).toBeTruthy()
    expect(screen.queryByTestId('workspace-provider')).toBeNull()
    expect(useTimerSettings.getState().selectedWorkspaceId).toBeNull()
  })

  it('rejects an unconfigured persisted workspace without mounting its providers and clears preference', async () => {
    useTimerSettings.setState({ selectedWorkspaceId: 'unconfigured-workspace' })
    getById.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: { ...workspace('unconfigured-workspace'), status: 'draft' },
    })
    renderWidget()
    expect(await screen.findByRole('button', { name: 'ws-A' })).toBeTruthy()
    expect(screen.queryByTestId('workspace-provider')).toBeNull()
    expect(useTimerSettings.getState().selectedWorkspaceId).toBeNull()
  })

  it('preserves the explicit choice on a transient lookup failure and exposes retry', async () => {
    useTimerSettings.setState({ selectedWorkspaceId: 'ws-B' })
    getById.mockResolvedValueOnce({
      isSuccess: false,
      statusCode: 503,
      error: 'WORKSPACE_UNAVAILABLE',
    })
    renderWidget()
    expect(await screen.findByText('WORKSPACE_UNAVAILABLE')).toBeTruthy()
    expect(useTimerSettings.getState().selectedWorkspaceId).toBe('ws-B')
    expect(screen.queryByTestId('workspace-provider')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(
      (await screen.findByTestId('workspace-provider')).getAttribute(
        'data-workspace-id',
      ),
    ).toBe('ws-B')
  })

  it('honors an explicitly addressed workspace without a stored preference', async () => {
    renderWidget('/workspaces/ws-current/widgets/timer')
    expect(
      (await screen.findByTestId('workspace-provider')).getAttribute(
        'data-workspace-id',
      ),
    ).toBe('ws-current')
  })

  it('validates a workspace switch before exposing the new provider', async () => {
    renderWidget('/workspaces/ws-current/widgets/timer')
    await screen.findByTestId('workspace-provider')
    await act(async () => {
      if (registeredEventCallback)
        registeredEventCallback({ workspaceId: 'ws-target' })
    })
    await waitFor(() =>
      expect(
        screen
          .getByTestId('workspace-provider')
          .getAttribute('data-workspace-id'),
      ).toBe('ws-target'),
    )
    expect(useTimerSettings.getState().selectedWorkspaceId).toBe('ws-target')
  })
})
