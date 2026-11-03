import type { AddonManifestViewModel } from '@mr-tick/sdk'
import { fireEvent, render, screen } from '@testing-library/react'
import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  AddonSettingsErrorBoundary,
  resolveAddonCapabilities,
} from './addon-settings-dialog'

const addon: AddonManifestViewModel = {
  id: 'theme',
  name: 'Theme',
  version: '1.0.0',
  creator: 'Tests',
  description: '',
  path: '',
  logo: '',
  downloads: 0,
  stars: 0,
  installed: true,
  capabilities: ['theme'],
}

function BrokenComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Cannot read properties of undefined (reading 'kind')")
  }

  return <div>Configurações carregadas com sucesso!</div>
}

function TestContainer() {
  const [hasError, setHasError] = useState(true)

  return (
    <div>
      <button type="button" onClick={() => setHasError(false)}>
        Consertar
      </button>
      <AddonSettingsErrorBoundary addonName="Redmine">
        <BrokenComponent shouldThrow={hasError} />
      </AddonSettingsErrorBoundary>
    </div>
  )
}

describe('Settings capabilities', () => {
  it('shows only theme settings for a theme without auth', () => {
    expect(resolveAddonCapabilities(addon).map((item) => item.id)).toEqual([
      'theme',
    ])
  })

  it('shows authentication only when declared', () => {
    expect(
      resolveAddonCapabilities({
        ...addon,
        capabilities: ['auth', 'watcher'],
      }).map((item) => item.id),
    ).toEqual(['auth', 'watcher'])
    expect(
      resolveAddonCapabilities({ ...addon, capabilities: ['dataSource'] }).map(
        (item) => item.id,
      ),
    ).toEqual(['dataSource'])
  })
})

describe('AddonSettingsErrorBoundary', () => {
  it('renderiza o conteudo filho normalmente quando nao ha erros', () => {
    render(
      <AddonSettingsErrorBoundary addonName="Redmine">
        <div>Conteudo normal</div>
      </AddonSettingsErrorBoundary>,
    )

    expect(screen.getByText('Conteudo normal')).toBeInTheDocument()
  })

  it('captura excecoes de renderizacao do addon e exibe painel de erro resiliente sem quebrar o app', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    render(<TestContainer />)

    expect(
      screen.getByText('Falha ao carregar configurações do addon'),
    ).toBeInTheDocument()
    expect(screen.getByText('Redmine')).toBeInTheDocument()
    expect(
      screen.getByText("Cannot read properties of undefined (reading 'kind')"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Tentar novamente/i }),
    ).toBeInTheDocument()

    // Conserta o componente e clica em Tentar novamente
    fireEvent.click(screen.getByRole('button', { name: 'Consertar' }))
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }))

    expect(
      screen.getByText('Configurações carregadas com sucesso!'),
    ).toBeInTheDocument()

    consoleErrorSpy.mockRestore()
  })
})
