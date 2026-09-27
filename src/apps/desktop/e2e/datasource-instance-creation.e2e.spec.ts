import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Criação de Instâncias de Data Source com Schema Dinâmico (SDK)', () => {
  test('deve renderizar campos dinâmicos via AddonFieldRenderer, preencher defaults e conectar instância', async ({
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

    // 2. Abre o modal/página de gerenciamento de addons
    const addonsButton = page.locator('button[aria-label="Gerenciar Addons"]')
    await expect(addonsButton.first()).toBeVisible({ timeout: 10000 })
    await addonsButton.first().click()

    // 3. Localiza o card do addon fake instalado
    const fakeAddonTrigger = page
      .locator('[data-state]')
      .filter({ hasText: /FakeDataSource|mr-tick-datasource-fake/i })
      .first()

    await expect(fakeAddonTrigger).toBeVisible({ timeout: 10000 })

    // Se estiver fechado no accordion, clica para expandir
    const isExpanded =
      (await fakeAddonTrigger.getAttribute('data-state')) === 'open'
    if (!isExpanded) {
      await fakeAddonTrigger.click()
    }

    // 4. Clica no botão de adicionar instância
    const addInstanceBtn = page
      .locator('button:has-text("Adicionar instância")')
      .or(page.locator('button:has-text("Nova instância")'))
      .first()

    await expect(addInstanceBtn).toBeVisible({ timeout: 10000 })
    await addInstanceBtn.click()

    // 5. Valida renderização dinâmica do formulário baseada no schema do SDK
    const credentialsGroupLabel = page.getByText('Autenticação Simulada (Fake)')
    await expect(credentialsGroupLabel).toBeVisible({ timeout: 10000 })

    const configGroupLabel = page.getByText('Parâmetros de Teste')
    await expect(configGroupLabel).toBeVisible({ timeout: 10000 })

    // Valida que os campos gerados pelo AddonFieldRenderer existem com os tipos e defaults corretos
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

    const syncIntervalInput = page.locator(
      '[data-testid="addon-field-input-syncInterval"]',
    )
    await expect(syncIntervalInput).toBeVisible({ timeout: 5000 })
    await expect(syncIntervalInput).toHaveAttribute('type', 'number')
    await expect(syncIntervalInput).toHaveValue('5')

    // 6. Altera o parâmetro de configuração/mapeamento no formulário
    await syncIntervalInput.fill('15')
    await expect(syncIntervalInput).toHaveValue('15')

    // 7. Clica em "Conectar" para autenticar e persistir a nova instância
    const connectSubmitBtn = page
      .locator('button:has-text("Conectar")')
      .filter({ hasNotText: /Redmine|Fake/ })
      .last()

    await expect(connectSubmitBtn).toBeVisible({ timeout: 5000 })
    await connectSubmitBtn.click()

    // 8. Valida fechamento do modal e aparecimento da instância conectada
    await expect(serverUrlInput).not.toBeVisible({ timeout: 15000 })

    const connectedMemberBadge = page.getByText('dev.fake')
    await expect(connectedMemberBadge.first()).toBeVisible({ timeout: 15000 })

    // 9. Recarrega a página para certificar persistência no workspaces.json
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Reabre o gerenciador de addons e certifica que a instância permanece configurada
    await expect(addonsButton.first()).toBeVisible({ timeout: 10000 })
    await addonsButton.first().click()

    await expect(page.getByText('dev.fake').first()).toBeVisible({
      timeout: 15000,
    })
  })
})
