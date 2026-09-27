import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Configuração de Mapeamento Pós-Autenticação em Instâncias Ativas', () => {
  test('deve exibir botão de mapeamento apenas na instância conectada e carregar campos remotos via IDataSourceResolver', async ({
    page,
  }) => {
    // 1. Navega para o workspace TESTE (que já possui uma instância conectada)
    const testWorkspaceLink = page
      .locator('nav a[href*="/workspaces/"][title*="TESTE"]')
      .or(
        page.locator('nav a[href*="ws-15c9d402-b6da-48ac-9a75-1b948cd0ec92"]'),
      )
      .first()

    await expect(testWorkspaceLink).toBeVisible({ timeout: 15000 })
    await testWorkspaceLink.click()
    await expect(page).toHaveURL(/\/workspaces\/[^/]+/, { timeout: 15000 })

    // 2. Abre o modal de gerenciamento de addons
    const addonsButton = page.locator('button[aria-label="Gerenciar Addons"]')
    await expect(addonsButton.first()).toBeVisible({ timeout: 10000 })
    await addonsButton.first().click()

    // 3. Clica na categoria "Fontes De Dados" no menu de configurações
    const dataSourcesCategoryBtn = page.locator(
      '[data-testid="addons-manager-category-DataSources"]',
    )
    await expect(dataSourcesCategoryBtn).toBeVisible({ timeout: 10000 })
    await dataSourcesCategoryBtn.click()

    // 4. Seleciona o addon fake instalado na lista
    const fakeAddonItem = page.locator(
      '[data-testid="addon-settings-item-mr-tick-datasource-fake"]',
    )
    await expect(fakeAddonItem).toBeVisible({ timeout: 10000 })
    await fakeAddonItem.click()

    // 5. Valida que a conexão semeada está presente e exibe status "Conectado"
    const connectedMemberLogin = page
      .locator('[data-testid="connection-member-login"]')
      .first()
    await expect(connectedMemberLogin).toBeVisible({ timeout: 15000 })
    await expect(connectedMemberLogin).toContainText('Alex Silva')

    // 6. Valida que o botão "Configurar Mapeamento" por instância conectada está visível
    const perInstanceMappingBtn = page.locator(
      '[data-testid="configure-mapping-instance-btn-mr-tick-datasource-fake-c3f15587"]',
    )
    await expect(perInstanceMappingBtn).toBeVisible({ timeout: 10000 })

    // 7. Clica no botão "Configurar Mapeamento" da instância conectada
    await perInstanceMappingBtn.click()

    // 8. Valida abertura do Modal de Mapeamento com os campos resolvidos via IDataSourceResolver
    const mappingDialog = page.locator('[data-testid="mapping-config-dialog"]')
    await expect(mappingDialog).toBeVisible({ timeout: 10000 })

    // Valida que os campos de status retornados pelo provider da instância foram renderizados
    const backlogField = page.locator(
      '[data-testid="mapping-field-item-backlog"]',
    )
    await expect(backlogField).toBeVisible({ timeout: 5000 })

    const inProgressField = page.locator(
      '[data-testid="mapping-field-item-in_progress"]',
    )
    await expect(inProgressField).toBeVisible({ timeout: 5000 })

    const doneField = page.locator('[data-testid="mapping-field-item-done"]')
    await expect(doneField).toBeVisible({ timeout: 5000 })

    // 9. Interage com o mapeamento selecionando uma cor para o status "backlog"
    const redColorBtn = page.locator(
      '[data-testid="color-btn-backlog-#ef4444"]',
    )
    await expect(redColorBtn).toBeVisible({ timeout: 5000 })
    await redColorBtn.click()

    // 10. Salva o mapeamento configurado
    const saveMappingBtn = page.locator(
      '[data-testid="modal-save-mapping-btn"]',
    )
    await expect(saveMappingBtn).toBeVisible({ timeout: 5000 })
    await saveMappingBtn.click()

    // 11. Valida que o modal de mapeamento fecha após salvar com sucesso
    await expect(mappingDialog).not.toBeVisible({ timeout: 5000 })
  })
})
