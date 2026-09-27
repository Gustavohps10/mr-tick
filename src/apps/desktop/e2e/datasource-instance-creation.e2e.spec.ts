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

    // 2. Abre o modal de gerenciamento de addons
    const addonsButton = page.locator('button[aria-label="Gerenciar Addons"]')
    await expect(addonsButton.first()).toBeVisible({ timeout: 10000 })
    await addonsButton.first().click()

    // 3. Clica na categoria "Fontes De Dados" no menu de configurações de extensões
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

    // 5. Clica no botão de adicionar nova instância do addon fake
    const addInstanceBtn = page.locator(
      '[data-testid="add-instance-btn-mr-tick-datasource-fake"]',
    )
    await expect(addInstanceBtn).toBeVisible({ timeout: 10000 })
    await addInstanceBtn.click()

    // 6. Valida renderização dinâmica do formulário baseada no schema do SDK
    const credentialsGroupLabel = page.getByText('Autenticação Simulada (Fake)')
    await expect(credentialsGroupLabel).toBeVisible({ timeout: 10000 })

    const configGroupLabel = page.getByText('Parâmetros de Teste')
    await expect(configGroupLabel).toBeVisible({ timeout: 10000 })

    const mappingGroupLabel = page.getByText('Mapeamento de Campos e Status')
    await expect(mappingGroupLabel).toBeVisible({ timeout: 10000 })

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

    // 7. Valida botão de configuração de mapeamento visual (field.type === 'mapping')
    const configureMappingBtn = page.locator(
      '[data-testid="configure-mapping-statusMapping-btn"]',
    )
    await expect(configureMappingBtn).toBeVisible({ timeout: 5000 })
    await configureMappingBtn.click()

    // 8. Valida abertura do Modal de Mapeamento com os campos do FakeMetadataProvider
    const mappingDialog = page.locator('[data-testid="mapping-config-dialog"]')
    await expect(mappingDialog).toBeVisible({ timeout: 5000 })

    const backlogField = page.locator(
      '[data-testid="mapping-field-item-backlog"]',
    )
    await expect(backlogField).toBeVisible({ timeout: 5000 })
    await expect(
      page.locator('[data-testid="mapping-field-item-in_progress"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.locator('[data-testid="mapping-field-item-done"]'),
    ).toBeVisible({ timeout: 5000 })

    // 9. Seleciona cor visualmente para o status "backlog" (vermelho #ef4444)
    const redColorBtn = page.locator(
      '[data-testid="color-btn-backlog-#ef4444"]',
    )
    await expect(redColorBtn).toBeVisible({ timeout: 5000 })
    await redColorBtn.click()

    // 10. Testa fluxo de Exportar Preset JSON de dentro do Modal de Mapeamento
    const modalExportBtn = page.locator(
      '[data-testid="modal-export-preset-btn"]',
    )
    await expect(modalExportBtn).toBeVisible({ timeout: 5000 })
    await modalExportBtn.click()

    const exportPresetDialog = page.locator(
      '[data-testid="modal-export-preset-dialog"]',
    )
    await expect(exportPresetDialog).toBeVisible({ timeout: 5000 })

    const exportTextarea = page.locator(
      '[data-testid="modal-export-preset-textarea"]',
    )
    await expect(exportTextarea).toBeVisible({ timeout: 5000 })
    const exportedJson = await exportTextarea.inputValue()
    expect(exportedJson).toContain('"backlog"')
    expect(exportedJson).toContain('"#ef4444"')
    // Credenciais sensíveis nunca devem estar presentes no preset
    expect(exportedJson).not.toContain('123')
    expect(exportedJson).not.toContain('Admin')

    await page.getByRole('button', { name: 'Concluir' }).click()
    await expect(exportPresetDialog).not.toBeVisible({ timeout: 5000 })

    // 11. Testa fluxo de Importar Preset JSON de dentro do Modal de Mapeamento
    const modalImportBtn = page.locator(
      '[data-testid="modal-import-preset-btn"]',
    )
    await expect(modalImportBtn).toBeVisible({ timeout: 5000 })
    await modalImportBtn.click()

    const importPresetDialog = page.locator(
      '[data-testid="modal-import-preset-dialog"]',
    )
    await expect(importPresetDialog).toBeVisible({ timeout: 5000 })

    const importTextarea = page.locator(
      '[data-testid="modal-import-preset-textarea"]',
    )
    await expect(importTextarea).toBeVisible({ timeout: 5000 })

    const teamSharedMapping = JSON.stringify({
      mapping: {
        backlog: { icon: 'Clock', color: '#ec4899' },
        in_progress: { icon: 'Zap', color: '#3b82f6' },
        done: { icon: 'CheckCircle2', color: '#22c55e' },
      },
    })

    await importTextarea.fill(teamSharedMapping)
    const applyPresetBtn = page.locator(
      '[data-testid="modal-apply-preset-btn"]',
    )
    await applyPresetBtn.click()
    await expect(importPresetDialog).not.toBeVisible({ timeout: 5000 })

    // 12. Salva o mapeamento configurado no modal
    const saveMappingBtn = page.locator(
      '[data-testid="modal-save-mapping-btn"]',
    )
    await expect(saveMappingBtn).toBeVisible({ timeout: 5000 })
    await saveMappingBtn.click()
    await expect(mappingDialog).not.toBeVisible({ timeout: 5000 })

    // Valida que o badge de campos mapeados aparece
    const mappingBadge = page.locator(
      '[data-testid="mapping-badge-statusMapping"]',
    )
    await expect(mappingBadge).toBeVisible({ timeout: 5000 })

    // 13. Clica no botão determinístico "Conectar" gerado pelo form
    const connectSubmitBtn = page.locator(
      '[data-testid="datasource-instance-connect-btn"]',
    )
    await expect(connectSubmitBtn).toBeVisible({ timeout: 5000 })
    await connectSubmitBtn.scrollIntoViewIfNeeded()
    await connectSubmitBtn.click()

    // 14. Valida fechamento do modal e persistência da instância conectada
    await expect(serverUrlInput).not.toBeVisible({ timeout: 15000 })

    const connectedMemberLogin = page
      .locator('[data-testid="connection-member-login"]')
      .first()
    await expect(connectedMemberLogin).toBeVisible({ timeout: 15000 })
    await expect(connectedMemberLogin).toContainText('Alex Silva')

    // 15. Recarrega a página para certificar persistência no workspaces.json
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Reabre o gerenciador de addons e certifica que a instância permanece conectada
    await expect(addonsButton.first()).toBeVisible({ timeout: 10000 })
    await addonsButton.first().click()
    await expect(dataSourcesCategoryBtn).toBeVisible({ timeout: 10000 })
    await dataSourcesCategoryBtn.click()
    await expect(fakeAddonItem).toBeVisible({ timeout: 10000 })
    await fakeAddonItem.click()

    await expect(connectedMemberLogin).toBeVisible({ timeout: 15000 })
    await expect(connectedMemberLogin).toContainText('Alex Silva')
  })
})
