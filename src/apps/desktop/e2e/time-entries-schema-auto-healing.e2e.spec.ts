import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Auto-Healing de Schema do Banco Local / Reset (STR-05)', () => {
  test('deve purgar a base local corrompida/antiga e auto-reconstituir com integridade sem crash (STR-05)', async ({
    page,
  }) => {
    // 1. Navega para o workspace inicial
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda sincronização inicial
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][data-status="synced"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Valida e contabiliza os apontamentos iniciais carregados
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const initialCount = await actionTriggers.count()
    expect(initialCount).toBeGreaterThan(0)

    // 4. Abre o popover de status de sincronização
    const statusBtn = page.locator('[data-testid="sync-status-indicator"]')
    await statusBtn.click({ force: true })

    // 5. Aciona o botão de reset manual / auto-healing da base de dados
    const resetTrigger = page.locator('[data-testid="reset-database-trigger"]')
    await expect(resetTrigger).toBeVisible({ timeout: 5000 })
    await resetTrigger.click({ force: true })

    // 6. Confirma o reset da base local no AlertDialog de segurança
    const confirmResetBtn = page.locator(
      '[data-testid="confirm-reset-database-btn"]',
    )
    await expect(confirmResetBtn).toBeVisible({ timeout: 5000 })
    await confirmResetBtn.click({ force: true })

    // 7. Valida que o aplicativo recria o banco do zero e retorna com sucesso para "synced"
    await expect(syncIndicator).toBeVisible({ timeout: 35000 })

    // 8. Valida que todos os apontamentos foram completamente reconstituídos do servidor
    await expect(actionTriggers).toHaveCount(initialCount, {
      timeout: 15000,
    })
    await expect(page.locator('text=#DEV-27').first()).toBeVisible({
      timeout: 15000,
    })
  })
})
