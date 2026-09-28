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

    // Garante que o armazenamento local esteja limpo para o teste partir do zero
    await page.evaluate(() => {
      window.localStorage.clear()
    })

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

    // Valida que campos reais de atividades e status retornados pelo provider foram renderizados
    const codingField = page.locator(
      '[data-testid="mapping-field-item-act-coding"]',
    )
    await expect(codingField).toBeVisible({ timeout: 5000 })

    const backlogField = page.locator(
      '[data-testid="mapping-field-item-backlog"]',
    )
    await expect(backlogField).toBeVisible({ timeout: 5000 })

    // 9. Valida estado inicial neutro ("Selecione") e seleciona ícone e cor
    const iconBtn = page.locator('[data-testid="mapping-icon-picker-backlog"]')
    await expect(iconBtn).toContainText('Selecione')

    await iconBtn.click()
    const popoverContent = page.locator(
      '[data-testid="mapping-icon-popover-backlog"]',
    )
    await expect(popoverContent).toBeVisible({ timeout: 5000 })

    // Valida que os botões do grid de ícones possuem SVGs renderizados (sem buracos/botões em branco)
    const iconButtons = popoverContent.locator(
      'button[data-testid^="icon-option-"]',
    )
    const iconCount = await iconButtons.count()
    expect(iconCount).toBeGreaterThan(10)
    for (let i = 0; i < Math.min(iconCount, 20); i += 1) {
      await expect(iconButtons.nth(i).locator('svg')).toBeVisible()
    }

    const flameIconOption = page.locator(
      '[data-testid="icon-option-backlog-Flame"]',
    )
    await expect(flameIconOption).toBeVisible({ timeout: 5000 })
    await flameIconOption.click()

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

    // 12. Valida que o mapeamento foi persistido no localStorage da aplicação
    const allStorage = await page.evaluate(() => {
      const res: Record<string, string> = {}
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i)
        if (k) res[k] = window.localStorage.getItem(k) || ''
      }
      return res
    })
    const mappingKey = Object.keys(allStorage).find((k) =>
      k.startsWith('metric_mappings_'),
    )
    expect(mappingKey).toBeTruthy()
    const storedMapping = mappingKey ? allStorage[mappingKey] : ''
    expect(storedMapping).toContain('#ef4444')
    expect(storedMapping).toContain('Flame')
  })

  test('deve exportar preset exibindo botão Copiar JSON inicial e importar preset com ícones e cores vazias sem erro', async ({
    page,
  }) => {
    // 1. Navega para o workspace TESTE
    const testWorkspaceLink = page
      .locator('nav a[href*="/workspaces/"][title*="TESTE"]')
      .or(
        page.locator('nav a[href*="ws-15c9d402-b6da-48ac-9a75-1b948cd0ec92"]'),
      )
      .first()

    await expect(testWorkspaceLink).toBeVisible({ timeout: 15000 })
    await testWorkspaceLink.click()
    await expect(page).toHaveURL(/\/workspaces\/[^/]+/, { timeout: 15000 })

    await page.evaluate(() => {
      window.localStorage.clear()
    })

    // 2. Abre Gerenciar Addons -> Fontes De Dados -> mr-tick-datasource-fake
    const addonsButton = page.locator('button[aria-label="Gerenciar Addons"]')
    await expect(addonsButton.first()).toBeVisible({ timeout: 10000 })
    await addonsButton.first().click()

    const dataSourcesCategoryBtn = page.locator(
      '[data-testid="addons-manager-category-DataSources"]',
    )
    await expect(dataSourcesCategoryBtn).toBeVisible({ timeout: 10000 })
    await dataSourcesCategoryBtn.click()

    const fakeAddonItem = page.locator(
      '[data-testid="addon-settings-item-mr-tick-datasource-fake"]',
    )
    await expect(fakeAddonItem).toBeVisible({ timeout: 10000 })
    await fakeAddonItem.click()

    // 3. Abre o modal de mapeamento
    const perInstanceMappingBtn = page.locator(
      '[data-testid="configure-mapping-instance-btn-mr-tick-datasource-fake-c3f15587"]',
    )
    await expect(perInstanceMappingBtn).toBeVisible({ timeout: 10000 })
    await perInstanceMappingBtn.click()

    const mappingDialog = page.locator('[data-testid="mapping-config-dialog"]')
    await expect(mappingDialog).toBeVisible({ timeout: 10000 })

    // 4. Clica em Exportar Preset
    const exportBtn = page.locator('[data-testid="modal-export-preset-btn"]')
    await expect(exportBtn).toBeVisible({ timeout: 5000 })
    await exportBtn.click()

    const exportDialog = page.locator(
      '[data-testid="modal-export-preset-dialog"]',
    )
    await expect(exportDialog).toBeVisible({ timeout: 5000 })

    // Valida que o botão inicia como "Copiar JSON" e NÃO como "Copiado!"
    const copyBtn = page.locator('[data-testid="modal-copy-preset-btn"]')
    await expect(copyBtn).toBeVisible({ timeout: 5000 })
    await expect(copyBtn).toContainText('Copiar JSON')
    await expect(copyBtn).not.toContainText('Copiado!')

    // Ao clicar, muda para "Copiado!"
    await copyBtn.click()
    await expect(copyBtn).toContainText('Copiado!')

    // Fecha o modal de exportar
    const closeExportBtn = exportDialog.locator('button', {
      hasText: 'Concluir',
    })
    await closeExportBtn.click()
    await expect(exportDialog).not.toBeVisible({ timeout: 5000 })

    // 5. Clica em Importar Preset
    const importBtn = page.locator('[data-testid="modal-import-preset-btn"]')
    await expect(importBtn).toBeVisible({ timeout: 5000 })
    await importBtn.click()

    const importDialog = page.locator(
      '[data-testid="modal-import-preset-dialog"]',
    )
    await expect(importDialog).toBeVisible({ timeout: 5000 })

    // Preenche com o JSON exato reportado pelo usuário
    const userPresetJson = JSON.stringify({
      mapping: {
        story: { icon: '', color: '' },
        bug: { icon: '', color: '' },
        spike: { icon: '', color: '' },
        task: { icon: '', color: '' },
        'act-coding': { icon: 'Code', color: '' },
        'act-review': { icon: 'SearchCode', color: '' },
        'act-qa': { icon: 'TestTube', color: '' },
        'act-meeting': { icon: 'UsersRound', color: '' },
        'act-docs': { icon: 'Newspaper', color: '' },
        'act-design': { icon: 'Palette', color: '' },
        backlog: { icon: 'Gem', color: '' },
        progress: { icon: 'Layers', color: '' },
        review: { icon: 'Package', color: '' },
        done: { icon: '', color: '' },
        blocked: { icon: '', color: '' },
        critical: { icon: 'Bug', color: '' },
        high: { icon: 'AirVent', color: '' },
        medium: { icon: 'AirVent', color: '' },
        low: { icon: 'Wrench', color: '' },
        deferred: { icon: 'AlarmClock', color: '' },
      },
    })

    const importTextarea = page.locator(
      '[data-testid="modal-import-preset-textarea"]',
    )
    await importTextarea.fill(userPresetJson)

    const applyPresetBtn = page.locator(
      '[data-testid="modal-apply-preset-btn"]',
    )
    await applyPresetBtn.click()

    // Valida que nenhum erro foi exibido e o modal de importação fechou com sucesso
    const importErrorMsg = page.locator(
      '[data-testid="modal-import-preset-error"]',
    )
    await expect(importErrorMsg).not.toBeVisible()
    await expect(importDialog).not.toBeVisible({ timeout: 5000 })

    // Valida que os campos no modal refletem os ícones importados do preset
    const codingIconBtn = page.locator(
      '[data-testid="mapping-icon-picker-act-coding"]',
    )
    await expect(codingIconBtn).toContainText('Code')

    const reviewIconBtn = page.locator(
      '[data-testid="mapping-icon-picker-act-review"]',
    )
    await expect(reviewIconBtn).toContainText('SearchCode')

    // Salva o mapeamento
    const saveMappingBtn = page.locator(
      '[data-testid="modal-save-mapping-btn"]',
    )
    await saveMappingBtn.click()
    await expect(mappingDialog).not.toBeVisible({ timeout: 5000 })

    // Valida que o localStorage salvou as chaves com sucesso
    const allStorage = await page.evaluate(() => {
      const res: Record<string, string> = {}
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i)
        if (k) res[k] = window.localStorage.getItem(k) || ''
      }
      return res
    })
    const mappingKey = Object.keys(allStorage).find((k) =>
      k.startsWith('metric_mappings_'),
    )
    expect(mappingKey).toBeTruthy()
    const stored = mappingKey ? allStorage[mappingKey] : ''
    expect(stored).toContain('SearchCode')
    expect(stored).toContain('Code')
  })
})
