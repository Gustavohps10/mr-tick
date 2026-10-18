import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Addons com Múltiplas Capacidades e Forms Dinâmicos Reativos', () => {
  test('deve navegar entre capacidades (DataSource, Tema, Watcher) e renderizar form dinâmico reativo pós-ação', async ({
    page,
  }) => {
    // 1. Abrir o diálogo global de configurações via AppRail
    const settingsButton = page.locator('[data-testid="app-rail-settings-btn"]')
    await expect(settingsButton.first()).toBeVisible({ timeout: 15000 })
    await settingsButton.first().click()

    // 2. Clicar na aba "Addons Instalados"
    const installedTabBtn = page.locator(
      '[data-testid="settings-nav-tab-addons-installed"]',
    )
    await expect(installedTabBtn).toBeVisible({ timeout: 10000 })
    await installedTabBtn.click()

    // 3. Clicar em "Configurar" no addon fake instalado (mr-tick-datasource-fake)
    const configureFakeAddonBtn = page.locator(
      '[data-testid="addon-configure-btn-mr-tick-datasource-fake"]',
    )
    await expect(configureFakeAddonBtn).toBeVisible({ timeout: 10000 })
    await configureFakeAddonBtn.click()

    // 4. Validar que as capacidades declaradas no manifesto aparecem na sidebar do modal
    const authTab = page.locator('[data-testid="addon-capability-tab-auth"]')
    const dsTab = page.locator(
      '[data-testid="addon-capability-tab-dataSource"]',
    )
    const themeTab = page.locator('[data-testid="addon-capability-tab-theme"]')
    const watcherTab = page.locator(
      '[data-testid="addon-capability-tab-watcher"]',
    )

    await expect(authTab).toBeVisible({ timeout: 10000 })
    await expect(dsTab).toBeVisible({ timeout: 10000 })
    await expect(themeTab).toBeVisible({ timeout: 10000 })
    await expect(watcherTab).toBeVisible({ timeout: 10000 })

    // 5. Testar a capacidade de Tema Visual
    await themeTab.click()
    await expect(
      page.locator('[data-testid="addon-theme-settings-panel"]'),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByText('DataSource Fake (Testes) Visual Theme'),
    ).toBeVisible()

    // 6. Testar a capacidade de Observador (Screen Builder Dinâmico com Dual Sidebar e Isolamento Multi-Workspace)
    await watcherTab.click()
    await expect(page.getByRole('heading', { name: 'Observador' })).toBeVisible(
      {
        timeout: 10000,
      },
    )

    // Na arquitetura Dual Sidebar, selecionamos o Workspace 1 via sub-sidebar
    const ws1Tab = page.locator(
      '[data-testid="addon-workspace-tab-ws-15c9d402-b6da-48ac-9a75-1b948cd0ec92"]',
    )
    const ws2Tab = page.locator(
      '[data-testid="addon-workspace-tab-ws-isolated-9999-8888-777766665555"]',
    )
    await expect(ws1Tab).toBeVisible({ timeout: 10000 })
    await expect(ws2Tab).toBeVisible({ timeout: 10000 })

    // Seleciona Workspace 1
    await ws1Tab.click()
    const ws1Group = page.locator(
      '[data-testid="workspace-addon-group-ws-15c9d402-b6da-48ac-9a75-1b948cd0ec92"]',
    )
    await expect(ws1Group).toBeVisible({ timeout: 10000 })

    // Validar botão inicial de conexão no Workspace 1
    const ws1ConnectBtn = ws1Group.locator(
      '[data-testid="addon-action-btn-connect_btn"]',
    )
    await expect(ws1ConnectBtn).toBeVisible({ timeout: 10000 })
    await expect(ws1ConnectBtn).toHaveText('Conectar Observador Fake')

    // Como é um form orientado apenas a ações/botões, o rodapé "Salvar" NÃO deve ser exibido
    await expect(page.getByRole('button', { name: 'Salvar' })).not.toBeVisible()

    // 7. Executar a ação de conectar APENAS no Workspace 1
    await ws1ConnectBtn.click()

    // 8. Validar a reatividade isolada no Workspace 1
    const ws1ConnectedCard = ws1Group.locator(
      '[data-testid="addon-info-card-connected_card"]',
    )
    await expect(ws1ConnectedCard).toBeVisible({ timeout: 15000 })
    await expect(
      ws1ConnectedCard.getByText('Observador Conectado com Sucesso!'),
    ).toBeVisible()
    await expect(
      ws1ConnectedCard.getByText('ws-15c9d402-b6da-48ac-9a75-1b948cd0ec92'),
    ).toBeVisible()

    // Workspace 2 DEVE PERMANECER DESCONECTADO (isolamento estrito de workspace na sub-sidebar)
    await ws2Tab.click()
    const ws2Group = page.locator(
      '[data-testid="workspace-addon-group-ws-isolated-9999-8888-777766665555"]',
    )
    await expect(ws2Group).toBeVisible({ timeout: 10000 })
    const ws2ConnectBtn = ws2Group.locator(
      '[data-testid="addon-action-btn-connect_btn"]',
    )
    await expect(ws2ConnectBtn).toBeVisible({ timeout: 10000 })
    await expect(
      ws2Group.locator('[data-testid="addon-info-card-connected_card"]'),
    ).not.toBeVisible()

    // Volta ao Workspace 1 para testar desconexão
    await ws1Tab.click()
    await expect(ws1Group).toBeVisible({ timeout: 10000 })

    // O botão de desconectar agora deve estar presente no Workspace 1
    const ws1DisconnectBtn = ws1Group.locator(
      '[data-testid="addon-action-btn-disconnect_btn"]',
    )
    await expect(ws1DisconnectBtn).toBeVisible({ timeout: 10000 })
    await expect(ws1DisconnectBtn).toHaveText('Desconectar Observador')

    // 9. Testar a ação reversa (desconectar) no Workspace 1
    await ws1DisconnectBtn.click()

    // O formulário do Workspace 1 deve reverter para o estado desconectado
    await expect(ws1ConnectBtn).toBeVisible({ timeout: 15000 })
    await expect(ws1ConnectedCard).not.toBeVisible()

    // 10. Retornar para a capacidade de Fonte De Dados e verificar integridade
    await dsTab.click()
    await expect(
      page.locator('[data-testid="addon-workspaces-sidebar"]'),
    ).toBeVisible({ timeout: 10000 })
  })
})
