import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hostBridgeMocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  eventsOn: vi.fn().mockReturnValue(vi.fn()),
}))

const mockHostBridge = {
  diagnostics: {
    getSnapshot: hostBridgeMocks.getSnapshot,
    runChecks: vi.fn(),
    generateReport: vi.fn(),
    openDataDirectory: vi.fn(),
  },
  events: {
    on: hostBridgeMocks.eventsOn,
  },
}

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => mockHostBridge,
}))

import { RuntimeStatusIndicator } from '@/components/settings/system-diagnostics/runtime-status-indicator'
import { useSettingsModalStore } from '@/stores/settingsModalStore'

function renderIndicator() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RuntimeStatusIndicator />
    </QueryClientProvider>,
  )
}

describe('RuntimeStatusIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsModalStore.getState().closeModal()
  })

  it('renders nothing when the runtime is ready and operational', async () => {
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: {
        formatVersion: '1.0',
        sessionId: 'sess-1',
        revision: 1,
        emittedAt: new Date().toISOString(),
        observedGeneration: 'gen-1',
        dispatcher: {
          state: 'ready',
          generation: 'gen-1',
          startupStage: 'ready',
          pendingRequestsByChannel: {},
        },
        checks: [],
        storages: [],
        workspaces: [],
        recentEvents: [],
        discardedEventsCount: 0,
      },
    })

    const { container } = renderIndicator()

    await waitFor(() => {
      expect(screen.queryByTestId('runtime-status-indicator-btn')).toBeNull()
    })
    expect(container.firstChild).toBeNull()
  })

  it('does NOT render warning indicator when runtime recovered to ready, even if historical lastStartupFailure exists', async () => {
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: {
        formatVersion: '1.0',
        sessionId: 'sess-recovered',
        revision: 4,
        emittedAt: new Date().toISOString(),
        observedGeneration: 'gen-recovered-2',
        dispatcher: {
          state: 'ready', // Motor recuperou com sucesso!
          generation: 'gen-recovered-2',
          startupStage: 'ready',
          lastStartupFailure: {
            kind: 'deadline_exceeded',
            stage: 'previous_startup',
            messageKey: 'OLD_DEADLINE_ERROR',
            timestamp: '2026-10-27T17:50:00.000Z',
          },
          pendingRequestsByChannel: {},
        },
        checks: [],
        storages: [],
        workspaces: [],
        recentEvents: [],
        discardedEventsCount: 0,
      },
    })

    const { container } = renderIndicator()

    await waitFor(() => {
      expect(screen.queryByTestId('runtime-status-indicator-btn')).toBeNull()
    })
    expect(container.firstChild).toBeNull()
  })

  it('renders warning indicator when runtime is closed or in error state and opens modal on click', async () => {
    hostBridgeMocks.getSnapshot.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: {
        formatVersion: '1.0',
        sessionId: 'sess-fail',
        revision: 2,
        emittedAt: new Date().toISOString(),
        observedGeneration: 'gen-fail',
        dispatcher: {
          state: 'closed',
          generation: 'gen-fail',
          startupStage: 'whenReady_timeout',
          lastStartupFailure: {
            kind: 'deadline_exceeded',
            stage: 'startup',
            messageKey: 'DEADLINE_30S',
            timestamp: new Date().toISOString(),
          },
          pendingRequestsByChannel: {},
        },
        checks: [],
        storages: [],
        workspaces: [],
        recentEvents: [],
        discardedEventsCount: 0,
      },
    })

    renderIndicator()

    await waitFor(() => {
      expect(screen.getByTestId('runtime-status-indicator-btn')).toBeTruthy()
    })

    // Clicar no botão abre o modal na aba 'system-data'
    fireEvent.click(screen.getByTestId('runtime-status-indicator-btn'))

    expect(useSettingsModalStore.getState().isOpen).toBe(true)
    expect(useSettingsModalStore.getState().activeTab).toBe('system-data')
  })
})
