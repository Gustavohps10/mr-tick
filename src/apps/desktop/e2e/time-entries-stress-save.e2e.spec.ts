import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Cenários Extremos (Concorrência e Duplo Clique no Salvar)', () => {
  test('deve suportar cliques repetidos no botão salvar sem duplicar rascunho nem quebrar integridade', async ({
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

    // 3. Aguarda a estabilização completa dos apontamentos carregados
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })

    const initialCount = await actionTriggers.count()
    expect(initialCount).toBeGreaterThan(0)

    // 4. Duplica o primeiro apontamento para entrar em Ghost Mode
    await actionTriggers.first().click()

    const duplicateBtn = page.locator(
      '[data-testid="time-entry-duplicate-btn"]',
    )
    await expect(duplicateBtn).toBeVisible()
    await duplicateBtn.click()

    // 5. Localiza o botão Salvar da linha rascunho
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()

    // 6. Simula duplo clique rápido no botão salvar (teste de concorrência / idempotência)
    await saveBtn.dblclick()

    // 7. Garante que o modo de edição encerrou
    await expect(saveBtn).not.toBeVisible()

    // 8. Garante que foi criado estritamente 1 novo apontamento (sem duplicatas extras pelo duplo clique)
    await expect(actionTriggers).toHaveCount(initialCount + 1)

    // 9. Recarrega a página para validar persistência no banco local
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    await expect(syncIndicator).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers).toHaveCount(initialCount + 1)
  })
})
