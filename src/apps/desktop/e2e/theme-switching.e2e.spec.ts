import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Seleção e Alternância de Temas Visuais (Mr. Tick Core & Addons)', () => {
  test('deve alternar entre tema nativo e tema de addon com aplicação imediata de CSS no DOM e persistência pós-reload', async ({
    page,
  }) => {
    // 1. Aguarda a inicialização da janela principal
    await expect(
      page.locator('[data-testid="app-rail-settings-btn"]'),
    ).toBeVisible({
      timeout: 15000,
    })

    // 2. Abre o diálogo global de configurações
    await page.locator('[data-testid="app-rail-settings-btn"]').click()
    const settingsDialog = page.locator(
      '[data-testid="global-settings-dialog"]',
    )
    await expect(settingsDialog).toBeVisible({ timeout: 10000 })

    // 3. Navega para a aba "Aparência"
    const appearanceTabBtn = page.locator(
      '[data-testid="settings-nav-tab-appearance"]',
    )
    await expect(appearanceTabBtn).toBeVisible({ timeout: 5000 })
    await appearanceTabBtn.click()

    // 4. Valida seletor de temas e estado inicial (tema nativo / padrão)
    const themeSelectBtn = page.locator('[data-testid="theme-package-select"]')
    await expect(themeSelectBtn).toBeVisible({ timeout: 5000 })
    await expect(themeSelectBtn).toContainText('Default')

    // Certifica que não há tag de tema customizado injetada inicialmente
    const initialThemeStyle = await page.$('#mr-tick-addon-active-theme')
    expect(initialThemeStyle).toBeNull()

    // 5. Clica no seletor para abrir o popover com a lista de temas
    await themeSelectBtn.click()

    // Valida que o popover abre exibindo temas nativos e de addons
    await expect(page.getByText('Built-in Themes')).toBeVisible({
      timeout: 5000,
    })

    // Localiza a opção do tema Matrix Neon fornecido pelo addon fake
    const matrixOption = page
      .locator('[data-testid*="fake-matrix-theme"]')
      .first()
    await expect(matrixOption).toBeVisible({ timeout: 5000 })
    await matrixOption.click()

    // 6. Valida aplicação imediata do CSS no DOM via AddonThemeBridge
    const injectedStyle = page.locator('#mr-tick-addon-active-theme')
    await expect(injectedStyle).toBeAttached({ timeout: 10000 })
    const styleContent = await injectedStyle.textContent()
    expect(styleContent).toContain('--primary:')

    // 7. Valida que o botão "Restaurar Nativo" aparece
    const restoreBtn = page.getByRole('button', { name: 'Restaurar Nativo' })
    await expect(restoreBtn).toBeVisible({ timeout: 5000 })

    // 8. Clica em "Restaurar Nativo" e valida remoção do estilo customizado
    await restoreBtn.click()
    await expect(page.locator('#mr-tick-addon-active-theme')).not.toBeAttached({
      timeout: 10000,
    })
    await expect(restoreBtn).not.toBeVisible()

    // 9. Aplica novamente o tema Matrix Neon para testar persistência
    await themeSelectBtn.click()
    await matrixOption.click()
    await expect(page.locator('#mr-tick-addon-active-theme')).toBeAttached({
      timeout: 10000,
    })

    // 10. Recarrega a aplicação e valida persistência da configuração de tema ativo
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Após recarga, AddonThemeBridge deve restaurar a tag de estilo com o tema persistido
    const reloadedStyle = page.locator('#mr-tick-addon-active-theme')
    await expect(reloadedStyle).toBeAttached({ timeout: 15000 })

    // 11. Limpa o estado voltando ao tema nativo
    await page.locator('[data-testid="app-rail-settings-btn"]').click()
    await page.locator('[data-testid="settings-nav-tab-appearance"]').click()
    const finalRestoreBtn = page.getByRole('button', {
      name: 'Restaurar Nativo',
    })
    await expect(finalRestoreBtn).toBeVisible({ timeout: 10000 })
    await finalRestoreBtn.click()
    await expect(page.locator('#mr-tick-addon-active-theme')).not.toBeAttached({
      timeout: 10000,
    })
  })
})
