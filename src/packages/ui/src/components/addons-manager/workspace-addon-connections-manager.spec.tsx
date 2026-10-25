import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockBridge, mockToastError } = vi.hoisted(() => ({
  mockBridge: {
    addons: {
      getConnectionProfiles: vi.fn(),
      getConnectionSchema: vi.fn(),
      getSchema: vi.fn(),
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      listInstalled: vi.fn(),
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

import { AddonSettingsRenderer } from './addon-settings-renderer'
import { WorkspaceAddonConnectionsManager } from './workspace-addon-connections-manager'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('WorkspaceAddonConnectionsManager', () => {
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
    renderWithClient(<WorkspaceAddonConnectionsManager addonId="addon-a" />)

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

  it('shows a profile loading failure instead of claiming that profiles were not declared', async () => {
    mockBridge.addons.getConnectionProfiles.mockResolvedValue({
      isSuccess: false,
      statusCode: 404,
      error: 'ADDON_CONNECTION_PROFILES_NOT_FOUND',
    })

    renderWithClient(<WorkspaceAddonConnectionsManager addonId="addon-a" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ADDON_CONNECTION_PROFILES_NOT_FOUND',
    )
    expect(
      screen.queryByText('O addon não declarou perfis de conexão.'),
    ).toBeNull()
  })
  it.each(['profile', 'role'])(
    'connects an auth-only watcher using its declared %s authenticator and schema',
    async (authLocation) => {
      let authorizationRole = 'primary'
      let roles:
        | Array<{
            authorizationRole: string
            allowedAuthProfileIds: string[]
            defaultAuthProfileId: string
          }>
        | undefined
      if (authLocation === 'role') {
        authorizationRole = 'observer'
        roles = [
          {
            authorizationRole,
            allowedAuthProfileIds: ['token-auth'],
            defaultAuthProfileId: 'token-auth',
          },
        ]
      }
      mockBridge.addons.listInstalled.mockResolvedValue({
        isSuccess: true,
        data: [{ id: 'watcher', capabilities: ['auth', 'watcher'] }],
      })
      mockBridge.addons.getSchema.mockResolvedValue({
        isSuccess: true,
        data: [],
      })
      mockBridge.addons.getSettings.mockResolvedValue({
        isSuccess: true,
        data: {
          schemaVersion: 1,
          revision: 0,
          values: {},
          credentialStates: {},
        },
      })
      mockBridge.addons.getConnectionProfiles.mockResolvedValue({
        isSuccess: true,
        data: [
          {
            connectionProfileId: 'account',
            cardinality: 'single',
            default: true,
            allowedAuthProfileIds: ['token-auth'],
            defaultAuthProfileId: 'token-auth',
            roles,
          },
        ],
      })
      mockBridge.addons.getConnectionSchema.mockResolvedValue({
        isSuccess: true,
        data: [
          {
            id: 'apiToken',
            label: 'Token',
            type: 'password',
            scope: 'credential',
          },
          {
            id: 'apiUrl',
            label: 'Server',
            type: 'text',
            scope: 'configuration',
            defaultValue: 'https://watcher.example',
          },
        ],
      })
      mockBridge.workspaces.linkDataSource.mockResolvedValue({
        isSuccess: true,
        data: {},
      })
      mockBridge.workspaces.submitCredentials.mockResolvedValue({
        isSuccess: true,
        data: { identity: { displayName: 'Watcher account' } },
      })
      renderWithClient(
        <AddonSettingsRenderer addonId="watcher" activeCapability="auth" />,
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'Conectar agora' }),
      )
      const token = await screen.findByTestId('addon-field-input-apiToken')
      expect(mockBridge.addons.getConnectionSchema).toHaveBeenCalledWith({
        body: { addonId: 'watcher', connectionProfileId: 'account' },
      })
      fireEvent.change(token, { target: { value: 'user-token' } })
      fireEvent.click(screen.getByTestId('datasource-instance-connect-btn'))
      await waitFor(() =>
        expect(mockBridge.workspaces.submitCredentials).toHaveBeenCalledWith({
          body: {
            workspaceId: 'workspace-a',
            connectionInstanceId: expect.any(String),
            authenticationInput: {
              kind: 'credentials',
              authorizationRole,
              authProfileId: 'token-auth',
              credentials: { apiToken: 'user-token' },
              configuration: { apiUrl: 'https://watcher.example' },
            },
          },
        }),
      )
      expect(
        screen.queryByText(
          'Esta extensão não requer credenciais manuais neste workspace.',
        ),
      ).toBeNull()
    },
  )

  it.each([
    { capability: 'watcher', view: 'auth' },
    { capability: 'dataSource', view: 'auth' },
    { capability: 'dataSource', view: undefined },
  ])(
    'preserves an explicit OAuth settings action for $capability / $view',
    async ({ capability, view }) => {
      mockBridge.addons.listInstalled.mockResolvedValue({
        isSuccess: true,
        data: [{ id: 'watcher', capabilities: ['auth', capability] }],
      })
      mockBridge.addons.getSchema.mockResolvedValue({
        isSuccess: true,
        data: [
          {
            id: 'account-panel',
            kind: 'auth',
            label: 'Account',
            fields: [
              {
                id: 'sign-in',
                type: 'button',
                label: 'Sign in with OAuth',
                actionId: 'login',
              },
            ],
          },
        ],
      })
      mockBridge.addons.getSettings.mockResolvedValue({
        isSuccess: true,
        data: {
          schemaVersion: 1,
          revision: 0,
          values: {},
          credentialStates: {},
        },
      })
      renderWithClient(
        <AddonSettingsRenderer addonId="watcher" activeCapability={view} />,
      )
      expect(
        await screen.findByRole('button', { name: 'Sign in with OAuth' }),
      ).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Conectar agora' }),
      ).toBeNull()
      expect(mockBridge.addons.getConnectionSchema).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    },
  )

  it('keeps datasource mapping separate from authentication without offering a credentials connection', async () => {
    mockBridge.addons.listInstalled.mockResolvedValue({
      isSuccess: true,
      data: [{ id: 'jira', capabilities: ['auth', 'dataSource'] }],
    })
    mockBridge.workspaces.listAll.mockResolvedValue({
      isSuccess: true,
      data: [
        {
          id: 'workspace-a',
          name: 'Workspace A',
          status: 'configured',
          connections: [
            {
              id: 'jira-connection',
              addonId: 'jira',
              connectionProfileId: 'site',
              cardinality: 'multi',
              status: 'disconnected',
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    renderWithClient(
      <AddonSettingsRenderer addonId="jira" activeCapability="dataSource" />,
    )
    expect(await screen.findByText('Autenticação pendente')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Conectar agora' })).toBeNull()
    expect(screen.queryByTestId('datasource-instance-connect-btn')).toBeNull()
    expect(mockBridge.workspaces.submitCredentials).not.toHaveBeenCalled()
  })

  it('saves editable OAuth connection settings in the explicit workspace scope', async () => {
    mockBridge.addons.listInstalled.mockResolvedValue({
      isSuccess: true,
      data: [{ id: 'jira', capabilities: ['auth', 'dataSource'] }],
    })
    mockBridge.addons.getSchema.mockResolvedValue({
      isSuccess: true,
      data: [
        {
          id: 'jira-auth',
          kind: 'auth',
          label: 'Jira',
          fields: [
            { id: 'conn.projectKey', type: 'text', label: 'Project' },
            {
              id: 'login',
              type: 'button',
              label: 'Connect Jira',
              actionId: 'login',
            },
          ],
        },
      ],
    })
    mockBridge.addons.getSettings.mockResolvedValue({
      isSuccess: true,
      data: { schemaVersion: 1, revision: 0, values: {}, credentialStates: {} },
    })
    mockBridge.addons.saveSettings.mockResolvedValue({
      isSuccess: true,
      data: {
        schemaVersion: 1,
        revision: 1,
        values: { 'conn.projectKey': 'SCRUM' },
        credentialStates: {},
      },
    })
    renderWithClient(
      <AddonSettingsRenderer
        addonId="jira"
        activeCapability="auth"
        scope={{ kind: 'workspace', workspaceId: 'workspace-a' }}
      />,
    )
    fireEvent.change(
      await screen.findByTestId('addon-field-input-conn.projectKey'),
      { target: { value: 'SCRUM' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(mockBridge.addons.saveSettings).toHaveBeenCalledWith({
        body: {
          addonId: 'jira',
          scope: { kind: 'workspace', workspaceId: 'workspace-a' },
          expectedRevision: 0,
          patch: { 'conn.projectKey': 'SCRUM' },
          credentials: {},
        },
      }),
    )
  })
})
