import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Sincronização e Resiliência Offline (SYNC-02)', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.context().setOffline(false)
    } catch {
      // Silencia se o contexto já estiver fechado
    }
  })

  test('deve criar apontamento offline com pending_push e sincronizar ao restaurar rede (SYNC-02)', async ({
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
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Obtém contagem inicial de apontamentos
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const initialCount = await actionTriggers.count()
    expect(initialCount).toBeGreaterThan(0)

    // 4. Simula queda de rede (Offline Mode)
    await page.context().setOffline(true)

    // 5. Realiza duplicação de um apontamento existente enquanto offline
    const duplicateBtn = page.locator(
      '[data-testid="time-entry-duplicate-btn"]',
    )
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(duplicateBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await duplicateBtn.click()

    // 6. Salva o rascunho localmente no RxDB/IndexedDB
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // 7. Confirma que a nova linha foi gravada localmente
    await expect(actionTriggers).toHaveCount(initialCount + 1, {
      timeout: 10000,
    })

    // 8. Valida presença do indicador de pendência de envio
    const pendingPushStatus = page.locator(
      '[data-testid="sync-status-pending-push"]',
    )
    await expect(pendingPushStatus.first()).toBeVisible({ timeout: 10000 })

    // 9. Restaura a conexão de rede (Online Mode)
    await page.context().setOffline(false)

    // 10. Dispara a sincronização manual para propagar pendências locais
    await syncIndicator.click()
    const syncAllBtn = page.locator('[data-testid="sync-all-button"]')
    await expect(syncAllBtn).toBeVisible({ timeout: 5000 })
    await syncAllBtn.click()
    await page.keyboard.press('Escape')

    // 11. Valida que o motor de sincronização finalizou com sucesso
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 12. Valida persistência e integridade plena após reload da aplicação
    await page.reload()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // A contagem deve permanecer exatamente com o novo apontamento preservado
    await expect(actionTriggers).toHaveCount(initialCount + 1, {
      timeout: 15000,
    })
  })
})
