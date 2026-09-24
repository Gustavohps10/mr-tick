import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Sincronização Manual (Force Sync Pull & Push)', () => {
  test('deve disparar sincronização manual e retornar ao estado sincronizado', async ({
    page,
  }) => {
    // 1. Navega para o primeiro workspace configurado
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial assentar ("Sincronizado")
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })

    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const initialCount = await actionTriggers.count()

    // 3. Abre o popover de detalhes de sincronização no cabeçalho
    await syncIndicator.click()

    // 4. Localiza o botão "Sincronizar tudo" no popover e dispara o clique
    const syncAllBtn = page.locator('[data-testid="sync-all-button"]')
    await expect(syncAllBtn).toBeVisible({ timeout: 5000 })
    await syncAllBtn.click()

    // 5. Fecha o popover pressionando Escape
    await page.keyboard.press('Escape')

    // 6. Garante que o motor de sincronização finaliza com sucesso ("Sincronizado")
    await expect(syncIndicator).toBeVisible({ timeout: 20000 })

    // 7. Garante que todos os registros locais permanecem íntegros
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers).toHaveCount(initialCount)
  })
})
