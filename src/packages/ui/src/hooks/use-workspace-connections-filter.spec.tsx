import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { useWorkspaceConnectionsFilter } from './use-workspace-connections-filter'

// Mock useDataSourceConnections
vi.mock('@/hooks/use-data-source-connections', () => ({
  useDataSourceConnections: () => ({
    dataSourceConnections: [
      { connectionId: 'conn-a', name: 'Connection A' },
      { connectionId: 'conn-b', name: 'Connection B' },
    ],
    isLoading: false,
  }),
}))

describe('useWorkspaceConnectionsFilter', () => {
  it('defaults to all when no search param is present', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={['/workspaces/ws-1/time-entries']}>
        {children}
      </MemoryRouter>
    )

    const { result } = renderHook(() => useWorkspaceConnectionsFilter(), {
      wrapper,
    })

    expect(result.current.selection).toEqual({ kind: 'all' })
    expect(result.current.scope).toEqual({ kind: 'all' })
    expect(result.current.selectedIds).toBeUndefined()
  })

  it('handles ?connections=none properly with none scope', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter
        initialEntries={['/workspaces/ws-1/time-entries?connections=none']}
      >
        {children}
      </MemoryRouter>
    )

    const { result } = renderHook(() => useWorkspaceConnectionsFilter(), {
      wrapper,
    })

    expect(result.current.selection).toEqual({ kind: 'none' })
    expect(result.current.scope).toEqual({ kind: 'none' })
    expect(result.current.selectedIds).toEqual([])
  })

  it('handles ?connections=conn-a with subset scope', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter
        initialEntries={['/workspaces/ws-1/time-entries?connections=conn-a']}
      >
        {children}
      </MemoryRouter>
    )

    const { result } = renderHook(() => useWorkspaceConnectionsFilter(), {
      wrapper,
    })

    expect(result.current.selection).toEqual({ kind: 'ids', ids: ['conn-a'] })
    expect(result.current.scope).toEqual({ kind: 'subset', ids: ['conn-a'] })
    expect(result.current.selectedIds).toEqual(['conn-a'])
  })

  it('toggles connection from all to remaining subset', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={['/workspaces/ws-1/time-entries']}>
        {children}
      </MemoryRouter>
    )

    const { result } = renderHook(() => useWorkspaceConnectionsFilter(), {
      wrapper,
    })

    act(() => {
      result.current.toggleConnection('conn-a')
    })

    expect(result.current.scope).toEqual({ kind: 'subset', ids: ['conn-b'] })
  })
})
