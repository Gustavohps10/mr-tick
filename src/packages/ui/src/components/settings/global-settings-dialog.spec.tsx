import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hostBridgeMocks = vi.hoisted(() => ({
  getSdkVersion: vi.fn(),
  listAvailable: vi.fn(),
  listInstalled: vi.fn(),
  install: vi.fn(),
  uninstall: vi.fn(),
  update: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  checkForUpdates: vi.fn(),
  licensingGetState: vi.fn(),
  workspacesListAll: vi.fn(),
  linkDataSource: vi.fn(),
  unlinkDataSource: vi.fn(),
  submitCredentials: vi.fn(),
  getConnectionProfiles: vi.fn(),
  disconnectDataSource: vi.fn(),
  getActiveTheme: vi.fn().mockResolvedValue({ isSuccess: true, data: null }),
  listThemes: vi.fn().mockResolvedValue({ isSuccess: true, data: [] }),
  setActiveTheme: vi.fn().mockResolvedValue({ isSuccess: true }),
  eventsOn: vi.fn().mockReturnValue(vi.fn()),
  diagnosticsGetSnapshot: vi.fn(),
  diagnosticsRunChecks: vi.fn(),
  diagnosticsGenerateReport: vi.fn(),
  diagnosticsOpenDataDirectory: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

const mockHostBridgeInstance = {
  diagnostics: {
    getSnapshot: hostBridgeMocks.diagnosticsGetSnapshot,
    runChecks: hostBridgeMocks.diagnosticsRunChecks,
    generateReport: hostBridgeMocks.diagnosticsGenerateReport,
    openDataDirectory: hostBridgeMocks.diagnosticsOpenDataDirectory,
  },
  system: {
    getSdkVersion: hostBridgeMocks.getSdkVersion,
    getSettings: hostBridgeMocks.getSettings,
    saveSettings: hostBridgeMocks.saveSettings,
    toggleTheme: vi.fn(),
  },
  addons: {
    listAvailable: hostBridgeMocks.listAvailable,
    listInstalled: hostBridgeMocks.listInstalled,
    install: hostBridgeMocks.install,
    uninstall: hostBridgeMocks.uninstall,
    update: hostBridgeMocks.update,
    getActiveTheme: hostBridgeMocks.getActiveTheme,
    listThemes: hostBridgeMocks.listThemes,
    setActiveTheme: hostBridgeMocks.setActiveTheme,
    getSchema: vi.fn().mockResolvedValue({ isSuccess: true, data: [] }),
    getSettings: vi.fn().mockResolvedValue({ isSuccess: true, data: {} }),
    getConnectionSchema: vi
      .fn()
      .mockResolvedValue({ isSuccess: true, data: [] }),
    getConnectionProfiles: hostBridgeMocks.getConnectionProfiles,
  },
  workspaces: {
    listAll: hostBridgeMocks.workspacesListAll,
    linkDataSource: hostBridgeMocks.linkDataSource,
    unlinkDataSource: hostBridgeMocks.unlinkDataSource,
    submitCredentials: hostBridgeMocks.submitCredentials,
    disconnectDataSource: hostBridgeMocks.disconnectDataSource,
  },
  updater: {
    checkForUpdates: hostBridgeMocks.checkForUpdates,
  },
  licensing: {
    refresh: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
  },
  events: { on: hostBridgeMocks.eventsOn },
}

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => mockHostBridgeInstance,
}))

vi.mock('@/components/addons-manager/license-settings-card', () => ({
  useLicensingState: () => ({
    data: {
      state: 'inactive',
      tier: 'free',
      isPlusActive: false,
      entitlements: [],
    },
    isLoading: false,
  }),
}))

import { GlobalSettingsDialog } from '@/components/settings/global-settings-dialog'
import { useSettingsModalStore } from '@/stores/settingsModalStore'

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalSettingsDialog isOpen={true} />
    </QueryClientProvider>,
  )
}

describe('GlobalSettingsDialog (Obsidian Style)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    useSettingsModalStore.getState().openModal('about')
    hostBridgeMocks.getSdkVersion.mockResolvedValue('0.6.0')
    hostBridgeMocks.diagnosticsGetSnapshot.mockResolvedValue({
      isSuccess: true,
      data: {
        formatVersion: '1.0',
        sessionId: 'test-session',
        revision: 1,
        emittedAt: new Date().toISOString(),
        observedGeneration: 'gen-test-1',
        dispatcher: {
          state: 'ready',
          generation: 'gen-test-1',
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
    hostBridgeMocks.diagnosticsRunChecks.mockResolvedValue({
      isSuccess: true,
      data: [],
    })
    hostBridgeMocks.diagnosticsGenerateReport.mockResolvedValue({
      isSuccess: true,
      data: {
        formatVersion: '1.0',
        generatedAt: new Date().toISOString(),
        sessionId: 'test-session',
        appVersion: '1.0.0',
        platform: 'win32',
        snapshot: {},
        bootJournal: [],
      },
    })
    hostBridgeMocks.diagnosticsOpenDataDirectory.mockResolvedValue({
      isSuccess: true,
    })
    hostBridgeMocks.listAvailable.mockResolvedValue({
      isSuccess: true,
      data: [],
    })
    hostBridgeMocks.getConnectionProfiles.mockResolvedValue({
      isSuccess: true,
      data: [
        {
          connectionProfileId: 'redmine-account',
          cardinality: 'multi',
          default: true,
        },
      ],
    })
    hostBridgeMocks.listInstalled.mockResolvedValue({
      isSuccess: true,
      data: [],
    })
    hostBridgeMocks.workspacesListAll.mockResolvedValue({
      isSuccess: true,
      data: [
        {
          id: 'ws-1',
          name: 'Workspace Alpha',
          connections: [],
        },
      ],
    })
  })

  it('renders side menu with navigation groups and search input', () => {
    renderDialog()

    expect(
      screen.getByPlaceholderText('Localizar configurações...'),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: /configurações/i })).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: /extensões & addons/i }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: /sistema/i })).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-about')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-general')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-appearance')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-updates')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-license')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-system-data')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-addons-browse')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-addons-installed')).toBeTruthy()
  })

  it('filters navigation items based on search input', () => {
    renderDialog()

    const searchInput = screen.getByPlaceholderText(
      'Localizar configurações...',
    )
    fireEvent.change(searchInput, { target: { value: 'Aparência' } })

    expect(screen.getByTestId('settings-nav-tab-appearance')).toBeTruthy()
    expect(screen.queryByTestId('settings-nav-tab-updates')).toBeNull()
  })

  it('switches between tabs and updates the active title', () => {
    renderDialog()

    const appearanceBtn = screen.getByTestId('settings-nav-tab-appearance')
    fireEvent.click(appearanceBtn)

    expect(screen.getByText('Pacote de Tema Visual')).toBeTruthy()
    expect(screen.getByText('Modo de Luminosidade')).toBeTruthy()
    expect(screen.getByText('Densidade da Interface')).toBeTruthy()
    expect(screen.getByTestId('theme-package-select')).toBeTruthy()
  })

  it('navigates to general tab and renders general settings rows', () => {
    renderDialog()

    const generalBtn = screen.getByTestId('settings-nav-tab-general')
    fireEvent.click(generalBtn)

    expect(screen.getByText('Inicialização Automática')).toBeTruthy()
    expect(screen.getByText('Minimizar para a Bandeja')).toBeTruthy()
  })

  it('navigates to system-data tab and renders diagnostics content', async () => {
    renderDialog()

    const systemDataBtn = screen.getByTestId('settings-nav-tab-system-data')
    fireEvent.click(systemDataBtn)

    expect(
      await screen.findByText('Saúde do Sistema e Diagnóstico'),
    ).toBeTruthy()
    expect(screen.getByTestId('system-data-settings-tab')).toBeTruthy()
    expect(screen.getByTestId('system-lifecycle-card')).toBeTruthy()
  })

  it('navigates to addons tabs smoothly inside the unified settings dialog', () => {
    renderDialog()

    const browseAddonsBtn = screen.getByTestId('settings-nav-tab-addons-browse')
    fireEvent.click(browseAddonsBtn)

    expect(screen.getByPlaceholderText('Buscar Addons...')).toBeTruthy()
  })

  it('opens dedicated AddonSettingsDialog with Dual Sidebar (Autenticação + Capacidades + Workspaces) when clicking configure on an installed addon', async () => {
    hostBridgeMocks.listInstalled.mockResolvedValue({
      isSuccess: true,
      data: [
        {
          id: 'addon-redmine',
          name: 'Redmine Sync',
          version: '1.2.0',
          creator: 'Gustavohps10',
          description: 'Sincronização com o Redmine',
          capabilities: ['auth', 'dataSource', 'theme'],
        },
      ],
    })

    renderDialog()

    const installedTabBtn = screen.getByTestId(
      'settings-nav-tab-addons-installed',
    )
    fireEvent.click(installedTabBtn)

    const configureBtn = await screen.findByTestId(
      'addon-configure-btn-addon-redmine',
    )
    expect(configureBtn).toBeTruthy()
    fireEvent.click(configureBtn)

    // Aba Autenticação no topo + Fonte De Dados e Tema Visual nas Capacidades
    expect(await screen.findByTestId('addon-capability-tab-auth')).toBeTruthy()
    expect(screen.getByTestId('addon-capability-tab-dataSource')).toBeTruthy()
    expect(screen.getByTestId('addon-capability-tab-theme')).toBeTruthy()

    // Sub-sidebar de Workspaces presente e workspace selecionado no Outlet
    expect(await screen.findByTestId('addon-workspaces-sidebar')).toBeTruthy()
    expect(screen.getByTestId('addon-workspace-tab-ws-1')).toBeTruthy()
    expect(
      await screen.findByTestId('workspace-datasource-group-ws-1'),
    ).toBeTruthy()
    expect(screen.getByTestId('add-instance-btn-ws-1')).toBeTruthy()

    // Ao alternar para Fonte De Dados: exibe configuração de mapeamento sem botão de adicionar instância de credencial
    const dataSourceTabBtn = screen.getByTestId(
      'addon-capability-tab-dataSource',
    )
    fireEvent.click(dataSourceTabBtn)
    expect(await screen.findByTestId('addon-workspaces-sidebar')).toBeTruthy()
    expect(screen.queryByTestId('add-instance-btn-ws-1')).toBeNull()

    // Ao alternar para Tema Visual: NUNCA deve exibir instâncias de DataSource
    const themesTabBtn = screen.getByTestId('addon-capability-tab-theme')
    fireEvent.click(themesTabBtn)

    expect(await screen.findByText('Paleta de Cores do Tema')).toBeTruthy()
    expect(screen.queryByTestId('workspace-datasource-group-ws-1')).toBeNull()
    expect(screen.queryByTestId('add-instance-btn-ws-1')).toBeNull()
  })

  it('allows switching and restoring themes via Appearance tab', async () => {
    hostBridgeMocks.listThemes.mockResolvedValue({
      isSuccess: true,
      data: [
        {
          id: 'fake-addon:fake-matrix-theme',
          name: 'Matrix Neon',
          description: 'Tema Matrix',
          css: ':root { --primary: #00ff66; }',
        },
      ],
    })
    hostBridgeMocks.listInstalled.mockResolvedValue({
      isSuccess: true,
      data: [
        {
          id: 'fake-addon',
          name: 'Fake Addon',
          version: '1.0.0',
          capabilities: ['theme'],
        },
      ],
    })

    renderDialog()

    const appearanceBtn = screen.getByTestId('settings-nav-tab-appearance')
    fireEvent.click(appearanceBtn)

    const selectBtn = screen.getByTestId('theme-package-select')
    expect(selectBtn).toBeTruthy()
    fireEvent.click(selectBtn)

    // Option for Matrix Neon should be visible in the popover
    const matrixOption = await screen.findByTestId(
      'theme-option-fake-addon:fake-matrix-theme',
    )
    expect(matrixOption).toBeTruthy()
    fireEvent.click(matrixOption)

    expect(hostBridgeMocks.setActiveTheme).toHaveBeenCalledWith({
      body: { themeId: 'fake-addon:fake-matrix-theme' },
    })
  })

  it('separates Autenticação (cardinality: single) and Observador in Dual Sidebar without duplicating auth inside watcher tab', async () => {
    hostBridgeMocks.listInstalled.mockResolvedValue({
      isSuccess: true,
      data: [
        {
          id: 'mistertick-discord',
          name: 'Discord Presence',
          version: '0.2.0',
          creator: 'Mister Tick',
          description: 'Captura automática de chamadas de voz.',
          capabilities: ['auth', 'watcher'],
        },
      ],
    })

    renderDialog()

    fireEvent.click(screen.getByTestId('settings-nav-tab-addons-installed'))

    const configureBtn = await screen.findByTestId(
      'addon-configure-btn-mistertick-discord',
    )
    fireEvent.click(configureBtn)

    const authCapBtn = await screen.findByTestId('addon-capability-tab-auth')
    const watcherCapBtn = screen.getByTestId('addon-capability-tab-watcher')
    expect(authCapBtn).toBeTruthy()
    expect(watcherCapBtn).toBeTruthy()
    expect(await screen.findByTestId('addon-workspaces-sidebar')).toBeTruthy()

    // alternar para Observador
    fireEvent.click(watcherCapBtn)
    expect(
      screen.queryByTestId('addon-workspace-auth-section-mistertick-discord'),
    ).toBeNull()
  })
})
