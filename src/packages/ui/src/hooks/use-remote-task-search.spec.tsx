import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  listTasks: vi.fn(() => new Promise(() => {})),
  cancelSearch: vi.fn(async () => {}),
}))

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({ tasks: bridge }),
}))

import { useRemoteTaskSearch } from './use-remote-task-search'

describe('Remote task search intent', () => {
  it('cancels a pending consumer when its search is cleared without closing the popover', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity } },
    })
    const origins = [{ id: 'connection', label: 'Provider' }]
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    }
    const { rerender, unmount } = renderHook(
      ({ text }) => useRemoteTaskSearch('workspace', origins, text, true),
      { initialProps: { text: 'QUEUED-123' }, wrapper: Wrapper },
    )
    expect(bridge.listTasks).toHaveBeenCalledTimes(1)
    bridge.cancelSearch.mockClear()

    rerender({ text: '' })

    expect(bridge.cancelSearch).toHaveBeenCalledWith({
      body: {
        workspaceId: 'workspace',
        connectionInstanceId: 'connection',
        consumerId: expect.any(String),
      },
    })
    expect(bridge.listTasks).toHaveBeenCalledTimes(1)
    unmount()
    client.clear()
  })
})
