import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Resiliência a Erro 401 / Token Expirado (SYNC-07)', () => {
  test('deve sinalizar autenticação necessária sem crash e manter integridade da fila local (SYNC-07)', async ({
    page,
  }) => {
    // 1. Navega para o workspace inicial
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda sincronização inicial ("synced")
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][data-status="synced"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Obtém contagem inicial de apontamentos
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const initialCount = await actionTriggers.count()
    expect(initialCount).toBeGreaterThan(0)

    // 4. Simula expiração de token / erro 401 via Addon Fake DB
    const addonsBtn = page.locator('button[title="Addons do Sistema"]')
    await expect(addonsBtn).toBeVisible()
    await addonsBtn.click({ force: true })

    const sim401Btn = page.locator('button:has-text("Simular erro 401 (Auth)")')
    await expect(sim401Btn).toBeVisible()
    await sim401Btn.click({ force: true })

    await expect(
      page.locator('text=Fake DB: 401 Simulado').first(),
    ).toBeVisible({ timeout: 5000 })

    // Fecha o menu de addons
    await page.keyboard.press('Escape')

    // 5. Dispara sincronização para provocar a falha de autenticação
    const statusBtn = page.locator('[data-testid="sync-status-indicator"]')
    await statusBtn.click({ force: true })
    const syncAllBtn = page.locator('[data-testid="sync-all-button"]')
    await expect(syncAllBtn).toBeVisible({ timeout: 5000 })
    await syncAllBtn.click({ force: true })
    await page.keyboard.press('Escape')

    // 6. Valida que o indicador global sinaliza status auth_error
    const authErrorIndicator = page.locator(
      '[data-testid="sync-status-indicator"][data-status="auth_error"]',
    )
    await expect(authErrorIndicator).toBeVisible({ timeout: 15000 })

    // 7. Cria um novo apontamento localmente enquanto a autenticação está rompida
    const duplicateBtn = page.locator(
      '[data-testid="time-entry-duplicate-btn"]',
    )
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(duplicateBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await duplicateBtn.click()

    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Confirma que a nova linha foi adicionada localmente
    await expect(actionTriggers).toHaveCount(initialCount + 1, {
      timeout: 10000,
    })

    // Valida que o apontamento permanece seguro com pending_push na fila local
    const pendingPushStatus = page.locator(
      '[data-testid="sync-status-pending-push"]',
    )
    await expect(pendingPushStatus.first()).toBeVisible({ timeout: 10000 })

    // 8. Restaura a autenticação no servidor fake
    const restoreAuthBtn = page.locator(
      'button:has-text("Restaurar autenticação")',
    )
    if (!(await restoreAuthBtn.isVisible())) {
      await expect(addonsBtn).toBeVisible()
      await addonsBtn.click({ force: true })
    }
    await expect(restoreAuthBtn).toBeVisible({ timeout: 10000 })
    await restoreAuthBtn.click({ force: true })

    await expect(
      page.locator('text=Fake DB: Auth Restaurada').first(),
    ).toBeVisible({ timeout: 5000 })

    await page.keyboard.press('Escape')

    // 9. Força sincronização após restauração
    await statusBtn.click({ force: true })
    await expect(syncAllBtn).toBeVisible({ timeout: 5000 })
    await syncAllBtn.click({ force: true })
    await page.keyboard.press('Escape')

    // 10. Valida que o sistema retorna ao estado normal "synced"
    await expect(syncIndicator).toBeVisible({ timeout: 45000 })

    // 11. Valida persistência íntegra de todos os apontamentos
    await expect(actionTriggers).toHaveCount(initialCount + 1, {
      timeout: 10000,
    })
  })
})
