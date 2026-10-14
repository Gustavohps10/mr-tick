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
  connectDataSource: vi.fn(),
  disconnectDataSource: vi.fn(),
  getActiveTheme: vi.fn().mockResolvedValue({ isSuccess: true, data: null }),
  listThemes: vi.fn().mockResolvedValue({ isSuccess: true, data: [] }),
  setActiveTheme: vi.fn().mockResolvedValue({ isSuccess: true }),
  eventsOn: vi.fn().mockReturnValue(vi.fn()),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({
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
    },
    workspaces: {
      listAll: hostBridgeMocks.workspacesListAll,
      linkDataSource: hostBridgeMocks.linkDataSource,
      unlinkDataSource: hostBridgeMocks.unlinkDataSource,
      connectDataSource: hostBridgeMocks.connectDataSource,
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
  }),
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
    hostBridgeMocks.listAvailable.mockResolvedValue({
      isSuccess: true,
      data: [],
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
          dataSourceConnections: [],
        },
      ],
    })
  })

  it('renders side menu with navigation groups and search input', () => {
    renderDialog()

    expect(
      screen.getByPlaceholderText('Localizar configurações...'),
    ).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-about')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-general')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-appearance')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-updates')).toBeTruthy()
    expect(screen.getByTestId('settings-nav-tab-license')).toBeTruthy()
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

  it('navigates to addons tabs smoothly inside the unified settings dialog', () => {
    renderDialog()

    const browseAddonsBtn = screen.getByTestId('settings-nav-tab-addons-browse')
    fireEvent.click(browseAddonsBtn)

    expect(screen.getByPlaceholderText('Buscar Addons...')).toBeTruthy()
  })

  it('opens dedicated AddonSettingsDialog when clicking configure on an installed addon', async () => {
    hostBridgeMocks.listInstalled.mockResolvedValue({
      isSuccess: true,
      data: [
        {
          id: 'addon-redmine',
          name: 'Redmine Sync',
          version: '1.2.0',
          creator: 'Gustavohps10',
          description: 'Sincronização com o Redmine',
          category: 'DataSources',
          categories: ['DataSources', 'Themes'],
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

    // Aba Fonte De Dados ativa por padrão
    expect(
      await screen.findByTestId('addon-capability-tab-datasources'),
    ).toBeTruthy()
    expect(screen.getByTestId('addon-capability-tab-themes')).toBeTruthy()

    // Na capacidade de Fonte De Dados, deve agrupar por Workspace
    expect(
      await screen.findByTestId('workspace-datasource-group-ws-1'),
    ).toBeTruthy()
    expect(screen.getByTestId('add-instance-btn-ws-1')).toBeTruthy()

    // Ao alternar para Tema Visual: NUNCA deve exibir instâncias de DataSource
    const themesTabBtn = screen.getByTestId('addon-capability-tab-themes')
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
          categories: ['themes'],
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
})
