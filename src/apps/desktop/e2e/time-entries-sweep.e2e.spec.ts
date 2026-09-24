import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Sweep Reconcile Local-First (SYNC-06)', () => {
  test('deve purgar localmente registros que sofreram hard-delete no servidor', async ({
    page,
  }) => {
    // 1. Navegar para o workspace
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 2.1 Reseta o banco fake para garantir estado limpo
    const addonsBtn = page.locator('button[title="Addons do Sistema"]')
    await expect(addonsBtn).toBeVisible()
    await addonsBtn.click()

    const resetSeedBtn = page.locator('button:has-text("Resetar banco fake")')
    await expect(resetSeedBtn).toBeVisible()
    await resetSeedBtn.click()

    await expect(page.locator('text=Fake DB: Reset Seed').first()).toBeVisible({
      timeout: 5000,
    })

    // Fecha o popover de Addons
    await page.keyboard.press('Escape')

    const syncIndicatorPopover = page
      .locator('[data-testid="sync-status-indicator"]')
      .first()
    await expect(syncIndicatorPopover).toBeVisible()
    await syncIndicatorPopover.click({ force: true })

    const forceSyncBtn = page
      .getByRole('button', { name: 'Sincronizar tudo' })
      .first()
    await expect(forceSyncBtn).toBeVisible()
    await forceSyncBtn.click({ force: true })
    await page.keyboard.press('Escape')

    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // Conta quantos registros temos atualmente
    const rows = page.locator('[data-testid="time-entry-actions-trigger"]')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })
    const initialCount = await rows.count()

    // 3. Executa a exclusão remota (hard delete) do registro mais recente
    const deleteRandomBtn = page.locator('button:has-text("Excluir último")')
    if (!(await deleteRandomBtn.isVisible())) {
      await expect(addonsBtn).toBeVisible()
      await addonsBtn.click({ force: true })
    }

    await expect(deleteRandomBtn).toBeVisible({ timeout: 10000 })
    await deleteRandomBtn.click({ force: true })

    // Aguarda sincronizar a deleção no backend
    await expect(
      page.locator('text=Fake DB: Registro Removido').first(),
    ).toBeVisible({ timeout: 5000 })

    // Fecha o popover de Addons
    await page.keyboard.press('Escape')

    // 4. Força a sincronização
    await expect(syncIndicatorPopover).toBeVisible()
    await syncIndicatorPopover.click({ force: true })

    await expect(forceSyncBtn).toBeVisible()
    await forceSyncBtn.click({ force: true })
    await page.keyboard.press('Escape')

    // 5. Aguarda conclusão do sync
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 6. Confirma que o apontamento foi varrido localmente
    await expect(async () => {
      const newCount = await page
        .locator('[data-testid="time-entry-actions-trigger"]')
        .count()
      expect(newCount).toBe(initialCount - 1)
    }).toPass({ timeout: 15000 })
  })
})
