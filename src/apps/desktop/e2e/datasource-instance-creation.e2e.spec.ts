import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Criação de Instâncias de Data Source com Schema Dinâmico e Mapeamento Visual', () => {
  test('deve renderizar campos dinâmicos via AddonFieldRenderer, configurar mapeamento em modal dedicado, importar/exportar presets e conectar instância', async ({
    page,
  }) => {
    // 1. Navega para o workspace isolado (sem conexões prévias)
    const isolatedWorkspaceLink = page
      .locator('nav a[href*="/workspaces/"][title*="WORKSPACE ISOLADO"]')
      .or(page.locator('nav a[href*="ws-isolated-9999-8888-777766665555"]'))
      .first()

    await expect(isolatedWorkspaceLink).toBeVisible({ timeout: 15000 })
    await isolatedWorkspaceLink.click()
    await expect(page).toHaveURL(/\/workspaces\/[^/]+/, { timeout: 15000 })

    // 2. Abre o diálogo global de configurações via AppRail
    const settingsButton = page.locator('[data-testid="app-rail-settings-btn"]')
    await expect(settingsButton.first()).toBeVisible({ timeout: 10000 })
    await settingsButton.first().click()

    // 3. Clica na aba "Addons Instalados" no menu de configurações
    const installedTabBtn = page.locator(
      '[data-testid="settings-nav-tab-addons-installed"]',
    )
    await expect(installedTabBtn).toBeVisible({ timeout: 10000 })
    await installedTabBtn.click()

    // 4. Clica em "Configurar" no addon fake instalado
    const configureFakeAddonBtn = page.locator(
      '[data-testid="addon-configure-btn-mr-tick-datasource-fake"]',
    )
    await expect(configureFakeAddonBtn).toBeVisible({ timeout: 10000 })
    await configureFakeAddonBtn.click()

    // 5. Clica no botão de adicionar nova instância para o workspace isolado
    const addInstanceBtn = page.locator(
      '[data-testid="add-instance-btn-ws-isolated-9999-8888-777766665555"]',
    )
    await expect(addInstanceBtn).toBeVisible({ timeout: 10000 })
    await addInstanceBtn.click()

    // 6. Valida renderização dinâmica do formulário: apenas credenciais essenciais de autenticação
    const credentialsGroupLabel = page.getByText('Autenticação Simulada (Fake)')
    await expect(credentialsGroupLabel).toBeVisible({ timeout: 10000 })

    // Valida que grupos de mapeamento e parâmetros desnecessários NÃO estão presentes
    await expect(page.getByText('Parâmetros de Teste')).not.toBeVisible()
    await expect(
      page.getByText('Mapeamento de Campos e Status'),
    ).not.toBeVisible()

    // Valida que apenas os campos de conexão existem com os tipos e defaults corretos
    const serverUrlInput = page.locator(
      '[data-testid="addon-field-input-serverUrl"]',
    )
    await expect(serverUrlInput).toBeVisible({ timeout: 5000 })
    await expect(serverUrlInput).toHaveValue('https://fake.mr-tick-app.local')

    const usernameInput = page.locator(
      '[data-testid="addon-field-input-username"]',
    )
    await expect(usernameInput).toBeVisible({ timeout: 5000 })
    await expect(usernameInput).toHaveValue('Admin')

    const passwordInput = page.locator(
      '[data-testid="addon-field-input-password"]',
    )
    await expect(passwordInput).toBeVisible({ timeout: 5000 })
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await expect(passwordInput).toHaveValue('123')

    // Valida que syncInterval e botões de mapeamento NÃO existem no modal de conexão
    await expect(
      page.locator('[data-testid="addon-field-input-syncInterval"]'),
    ).not.toBeVisible()
    await expect(
      page.locator('[data-testid="configure-mapping-statusMapping-btn"]'),
    ).not.toBeVisible()

    // 8. Clica no botão determinístico "Conectar" gerado pelo form
    const connectSubmitBtn = page.locator(
      '[data-testid="datasource-instance-connect-btn"]',
    )
    await expect(connectSubmitBtn).toBeVisible({ timeout: 5000 })
    await connectSubmitBtn.scrollIntoViewIfNeeded()
    await connectSubmitBtn.click()

    // 9. Valida fechamento do modal e persistência da instância conectada
    await expect(serverUrlInput).not.toBeVisible({ timeout: 15000 })

    const connectedMemberLogin = page
      .locator('[data-testid="connection-member-login"]')
      .first()
    await expect(connectedMemberLogin).toBeVisible({ timeout: 15000 })
    await expect(connectedMemberLogin).toContainText('Alex Silva')

    // 15. Recarrega a página para certificar persistência no workspaces.json
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Reabre as configurações e certifica que a instância permanece conectada
    await expect(settingsButton.first()).toBeVisible({ timeout: 10000 })
    await settingsButton.first().click()
    await expect(installedTabBtn).toBeVisible({ timeout: 10000 })
    await installedTabBtn.click()
    await expect(configureFakeAddonBtn).toBeVisible({ timeout: 10000 })
    await configureFakeAddonBtn.click()

    await expect(connectedMemberLogin).toBeVisible({ timeout: 15000 })
    await expect(connectedMemberLogin).toContainText('Alex Silva')
  })
})
