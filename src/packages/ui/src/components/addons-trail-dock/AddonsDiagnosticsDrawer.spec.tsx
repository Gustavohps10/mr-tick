import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AddonsDiagnosticsDrawer } from './AddonsDiagnosticsDrawer'

const mockToggleConnection = vi.fn()
const mockSelectAll = vi.fn()
const mockSelectNone = vi.fn()

vi.mock('@/stores/syncStore', () => ({
  useSyncInitializationError: () => null,
  useSyncStore: vi.fn((selector) => {
    const state = {
      database: { name: 'workspace-db' },
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
      connectionId: 'conn-redmine-1',
      dataSourceId: 'gustavohps10-redmine',
      status: 'connected',
      addon: {
        id: 'gustavohps10-redmine',
        name: 'Redmine',
        logo: 'redmine-logo.svg',
        capabilities: ['dataSource', 'auth'],
      },
      identity: { displayName: 'Gustavo Henrique' },
      member: { login: 'gustavohenrique' },
      sync: {
        metadata: {},
        tasks: {},
        timeEntries: { lastPulledAt: 1730560000000 },
      },
    },
    {
      connectionId: 'conn-jira-1',
      dataSourceId: 'mistertick-jira',
      status: 'connected',
      addon: {
        id: 'mistertick-jira',
        name: 'Jira',
        logo: 'jira-logo.svg',
        capabilities: ['dataSource'],
      },
      identity: { displayName: 'Gustavo Henrique' },
      member: { login: 'gustavohenrique' },
      sync: {
        metadata: {},
        tasks: {},
        timeEntries: { lastPulledAt: 1730560001000 },
      },
    },
  ],
}))

vi.mock('@/hooks/use-workspace-connections-filter', () => ({
  useWorkspaceConnectionsFilter: () => ({
    scope: { kind: 'all' },
    toggleConnection: mockToggleConnection,
    selectAll: mockSelectAll,
    selectNone: mockSelectNone,
    selectedIds: undefined,
  }),
}))

describe('AddonsDiagnosticsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('renders "Nome Do Source @user" format in cards and checkboxes', () => {
    render(
      <AddonsDiagnosticsDrawer
        open={true}
        onOpenChange={vi.fn()}
        failures={[]}
      />,
    )

    // Verifica que o formato "Redmine @gustavohenrique" e "Jira @gustavohenrique" é exibido
    const redmineLabels = screen.getAllByText('Redmine @gustavohenrique')
    expect(redmineLabels.length).toBeGreaterThanOrEqual(2) // Card + Checkbox

    const jiraLabels = screen.getAllByText('Jira @gustavohenrique')
    expect(jiraLabels.length).toBeGreaterThanOrEqual(2) // Card + Checkbox
  })

  it('never displays technical datasource ids as badges or in checkbox labels', () => {
    render(
      <AddonsDiagnosticsDrawer
        open={true}
        onOpenChange={vi.fn()}
        failures={[]}
      />,
    )

    // Não deve exibir "gustavohps10-redmine" ou "mistertick-jira" como texto visível
    expect(screen.queryByText('gustavohps10-redmine')).toBeNull()
    expect(screen.queryByText('mistertick-jira')).toBeNull()
  })

  it('renders source logos for both connections in cards and checkboxes', () => {
    render(
      <AddonsDiagnosticsDrawer
        open={true}
        onOpenChange={vi.fn()}
        failures={[]}
      />,
    )

    const redmineLogos = screen.getAllByAltText('Redmine')
    expect(redmineLogos.length).toBe(2) // 1 no card, 1 no checkbox
    expect(redmineLogos[0]).toHaveAttribute('src', 'redmine-logo.svg')

    const jiraLogos = screen.getAllByAltText('Jira')
    expect(jiraLogos.length).toBe(2) // 1 no card, 1 no checkbox
    expect(jiraLogos[0]).toHaveAttribute('src', 'jira-logo.svg')
  })

  it('triggers toggleConnection when clicking a checkbox', () => {
    render(
      <AddonsDiagnosticsDrawer
        open={true}
        onOpenChange={vi.fn()}
        failures={[]}
      />,
    )

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBe(2)

    fireEvent.click(checkboxes[0])
    expect(mockToggleConnection).toHaveBeenCalledWith('conn-redmine-1')
  })
})
