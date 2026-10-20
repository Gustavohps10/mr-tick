import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockBridge, mockToastError } = vi.hoisted(() => ({
  mockBridge: {
    addons: {
      getConnectionProfiles: vi.fn(),
    },
    workspaces: {
      listAll: vi.fn(),
      linkDataSource: vi.fn(),
      submitCredentials: vi.fn(),
      disconnectDataSource: vi.fn(),
      unlinkDataSource: vi.fn(),
    },
  },
  mockToastError: vi.fn(),
}))

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => mockBridge,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: vi.fn(),
    info: vi.fn(),
  },
}))

import { WorkspaceGroupedDataSourceManager } from './workspace-grouped-datasource-manager'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('WorkspaceGroupedDataSourceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBridge.addons.getConnectionProfiles.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          connectionProfileId: 'primary',
          cardinality: 'single',
          default: true,
        },
      ],
    })
    mockBridge.workspaces.listAll.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: [
        {
          id: 'workspace-a',
          name: 'Workspace A',
          status: 'configured',
          connections: [],
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    })
    mockBridge.workspaces.linkDataSource.mockResolvedValue({
      isSuccess: false,
      statusCode: 409,
      error: 'CONNECTION_CARDINALITY_REACHED',
    })
  })

  it('shows the link error and keeps the connect dialog closed', async () => {
    renderWithClient(<WorkspaceGroupedDataSourceManager addonId="addon-a" />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Conectar agora' }),
    )

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'CONNECTION_CARDINALITY_REACHED',
      )
    })
    expect(mockBridge.workspaces.linkDataSource).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockBridge.workspaces.submitCredentials).not.toHaveBeenCalled()
  })
})
