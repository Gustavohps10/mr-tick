import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/syncStore', () => ({
  useConnectionsWithSync: () => [],
}))

import { AddonConnection, ConnectionCard } from './connection-card'

describe('ConnectionCard', () => {
  const baseConnection: AddonConnection = {
    id: 'test-instance-123',
    name: 'Minha Instância',
    url: 'https://exemplo.servidor.com/',
    status: 'connected',
    addonId: 'custom-addon',
    connectionProfileId: 'custom-profile',
    identity: {
      kind: 'human',
      providerId: 'custom-provider',
      tenantId: 'https://exemplo.servidor.com/',
      providerSubjectId: '42',
      displayName: 'João Silva',
    },
    member: {
      id: '42',
      name: 'João Silva',
      login: 'joaosilva',
    },
    config: {
      serverUrl: 'https://exemplo.servidor.com/',
      serverVersion: 'v2.5',
      enableSync: true,
      apiToken: 'super-secret-token',
      userPassword: 'secret-password',
    },
    lastAuthenticatedAt: '2026-11-04T19:01:12.516Z',
  }

  it('renders connection details, tenant url, and identity user', () => {
    render(
      <ConnectionCard
        connection={baseConnection}
        onOpenSettings={vi.fn()}
        onDisconnect={vi.fn()}
        onUninstall={vi.fn()}
      />,
    )

    expect(screen.getByText('Minha Instância')).toBeInTheDocument()
    expect(screen.getByText('custom-profile')).toBeInTheDocument()
    expect(
      screen.getByText('https://exemplo.servidor.com/'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('connection-member-login')).toHaveTextContent(
      'João Silva',
    )
    expect(screen.getByText('#42')).toBeInTheDocument()
    expect(screen.getByText('Conectado')).toBeInTheDocument()
  })

  it('renders displayable non-secret config badges and omits sensitive keys', () => {
    render(
      <ConnectionCard
        connection={baseConnection}
        onOpenSettings={vi.fn()}
        onDisconnect={vi.fn()}
        onUninstall={vi.fn()}
      />,
    )

    expect(screen.getByText(/Server Version:/i)).toBeInTheDocument()
    expect(screen.getByText('v2.5')).toBeInTheDocument()
    expect(screen.getByText(/Enable Sync:/i)).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()

    expect(screen.queryByText(/super-secret-token/i)).toBeNull()
    expect(screen.queryByText(/secret-password/i)).toBeNull()
    expect(screen.queryByText(/apiToken/i)).toBeNull()
  })

  it('renders formatted last authentication date and time', () => {
    render(
      <ConnectionCard
        connection={baseConnection}
        onOpenSettings={vi.fn()}
        onDisconnect={vi.fn()}
        onUninstall={vi.fn()}
      />,
    )

    expect(screen.getByText(/Autenticado em/i)).toBeInTheDocument()
    expect(screen.getByText(/04\/11\/2026/i)).toBeInTheDocument()
  })

  it('calls onDisconnect when disconnect button is clicked for connected instance', () => {
    const onDisconnect = vi.fn()
    render(
      <ConnectionCard
        connection={baseConnection}
        onOpenSettings={vi.fn()}
        onDisconnect={onDisconnect}
        onUninstall={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByTestId('disconnect-connection-btn-test-instance-123'),
    )
    expect(onDisconnect).toHaveBeenCalledWith(baseConnection)
  })

  it('calls onOpenSettings when configure button is clicked for disconnected instance', () => {
    const onOpenSettings = vi.fn()
    const disconnectedConn: AddonConnection = {
      ...baseConnection,
      status: 'disconnected',
    }

    render(
      <ConnectionCard
        connection={disconnectedConn}
        onOpenSettings={onOpenSettings}
        onDisconnect={vi.fn()}
        onUninstall={vi.fn()}
      />,
    )

    expect(screen.getByText('Desconectado')).toBeInTheDocument()

    fireEvent.click(
      screen.getByTestId('configure-connection-btn-test-instance-123'),
    )
    expect(onOpenSettings).toHaveBeenCalledWith(disconnectedConn)
  })

  it('calls onUninstall when delete button is clicked', () => {
    const onUninstall = vi.fn()
    render(
      <ConnectionCard
        connection={baseConnection}
        onOpenSettings={vi.fn()}
        onDisconnect={vi.fn()}
        onUninstall={onUninstall}
      />,
    )

    fireEvent.click(
      screen.getByTestId('delete-connection-btn-test-instance-123'),
    )
    expect(onUninstall).toHaveBeenCalledWith(baseConnection)
  })
})
