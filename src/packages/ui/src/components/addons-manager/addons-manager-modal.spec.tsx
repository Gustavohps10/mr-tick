import type { AddonManifestViewModel } from '@mr-tick/sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const hostBridgeMocks = vi.hoisted(() => ({
  getSdkVersion: vi.fn(),
  listAvailable: vi.fn(),
  listInstalled: vi.fn(),
  install: vi.fn(),
  uninstall: vi.fn(),
  on: vi.fn().mockReturnValue(vi.fn()),
}))

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({
    system: { getSdkVersion: hostBridgeMocks.getSdkVersion },
    addons: {
      listAvailable: hostBridgeMocks.listAvailable,
      listInstalled: hostBridgeMocks.listInstalled,
      install: hostBridgeMocks.install,
      uninstall: hostBridgeMocks.uninstall,
    },
    events: { on: hostBridgeMocks.on },
  }),
}))

import { AddonsManagerModal } from '@/components/addons-manager/addons-manager-modal'

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {}
})

const availableAddon: AddonManifestViewModel = {
  id: 'redmine',
  version: '0.6.0',
  name: 'Redmine',
  creator: 'Mr Tick',
  description: 'Integração com Redmine.',
  path: '/addons/redmine',
  logo: '',
  downloads: 0,
  stars: 0,
  installed: false,
  packages: [
    {
      version: '0.6.0',
      downloadUrl: 'https://example.com/redmine-0.6.0.zip',
      requiredApiVersion: '>=0.6.0',
    },
    {
      version: '0.5.0',
      downloadUrl: 'https://example.com/redmine-0.5.0.zip',
      requiredApiVersion: '>=0.5.0',
    },
  ],
}

function renderManager() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AddonsManagerModal open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('AddonsManagerModal version selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hostBridgeMocks.getSdkVersion.mockResolvedValue('0.5.0')
    hostBridgeMocks.listAvailable.mockResolvedValue({
      isSuccess: true,
      data: [availableAddon],
    })
    hostBridgeMocks.listInstalled.mockResolvedValue({
      isSuccess: true,
      data: [],
    })
    hostBridgeMocks.install.mockResolvedValue({
      isSuccess: true,
      data: { jobId: 'install-redmine' },
    })
  })

  it('selects a compatible version inline and installs its package', async () => {
    renderManager()

    const versionLabel = await screen.findByTestId(
      'addon-details-version-label',
    )
    expect(versionLabel.textContent).toBe('Mais recente: 0.6.0')

    const versionTrigger = await screen.findByTestId(
      'addon-details-version-select',
    )
    fireEvent.keyDown(versionTrigger, { key: 'ArrowDown' })

    const incompatibleOption = await screen.findByRole('option', {
      name: 'v0.6.0',
    })
    expect(incompatibleOption.getAttribute('data-disabled')).toBe('')

    const compatibleOption = screen.getByRole('option', { name: 'v0.5.0' })
    fireEvent.click(compatibleOption)

    const installButton = screen.getByTestId('addon-details-install-btn')
    expect(installButton).toBeTruthy()
    fireEvent.click(installButton)

    await waitFor(() => {
      expect(hostBridgeMocks.install).toHaveBeenCalledWith({
        body: { downloadUrl: 'https://example.com/redmine-0.5.0.zip' },
      })
    })
    expect(await screen.findByText('Console de Instalação')).toBeTruthy()
  })

  it('shows latest catalog version in browse and installed version in installed list', async () => {
    hostBridgeMocks.listInstalled.mockResolvedValueOnce({
      isSuccess: true,
      data: [
        {
          ...availableAddon,
          categories: ['DataSources'],
          version: '0.5.0',
          installed: true,
        },
      ],
    })

    renderManager()

    const browseCard = await screen.findByTestId('addon-browse-card-redmine')
    expect(browseCard.textContent).toContain('v0.6.0')
    expect(browseCard.textContent).toContain('Mais Recente')
    expect(browseCard.textContent).toContain('Instalado · v0.5.0')

    const versionLabel = await screen.findByTestId(
      'addon-details-version-label',
    )
    expect(versionLabel.textContent).toBe('Mais recente: 0.6.0')

    fireEvent.click(screen.getByTestId('addons-manager-tab-installed'))

    expect(await screen.findByText('v0.5.0')).toBeTruthy()
    expect(screen.queryByText('v0.6.0')).toBeNull()
  })
})
