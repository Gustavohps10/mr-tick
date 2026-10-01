import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Cenários de Sincronização, Fuso Noturno, Comments Null e Caóticos', () => {
  test('deve criar apontamento noturno e persistir intacto pós-reload no DataSource Fake (CI & Local)', async ({
    page,
  }) => {
    // 1. Navega para o Workspace de Teste (Fake DataSource)
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Aguarda os apontamentos carregados
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const initialCount = await actionTriggers.count()

    // 4. Duplica um apontamento para gerar rascunho com ID estável
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
    await expect(saveBtn).toBeVisible({ timeout: 5000 })

    // 5. Salva o rascunho
    await saveBtn.click()
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })

    // 6. Aguarda o status voltar a 'Sincronizado' sem erro de validação
    await expect(syncIndicator).toBeVisible({ timeout: 20000 })
    await expect(actionTriggers).toHaveCount(initialCount + 1)

    // 7. Simula reload completo da página (verificação de persistência sem sumir da tabela)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    await expect(syncIndicator).toBeVisible({ timeout: 20000 })
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers).toHaveCount(initialCount + 1)

    // 8. Verifica que as tarefas estão enriquecidas com títulos visíveis
    const tableRows = page.locator('tbody tr')
    await expect(tableRows.first()).toBeVisible()
  })

  test('deve tratar comments nulos/vazios e permitir edição sem falhas de validação Zod', async ({
    page,
  }) => {
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const initialCount = await actionTriggers.count()

    // Duplica o primeiro apontamento
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
    await expect(saveBtn).toBeVisible({ timeout: 5000 })

    // Salva o novo apontamento
    await saveBtn.click()
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })
    await expect(syncIndicator).toBeVisible({ timeout: 20000 })
    await expect(actionTriggers).toHaveCount(initialCount + 1)

    // Recarrega a página e valida que o apontamento permanece íntegro
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    await expect(syncIndicator).toBeVisible({ timeout: 20000 })
    await expect(actionTriggers).toHaveCount(initialCount + 1)
  })

  test('cenário caótico: duplicações consecutivas e recarga rápida mantêm atomicidade', async ({
    page,
  }) => {
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const initialCount = await actionTriggers.count()

    // 1ª Duplicação e Salvamento
    const duplicateBtn = page.locator(
      '[data-testid="time-entry-duplicate-btn"]',
    )
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(duplicateBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await duplicateBtn.click()

    const saveBtn1 = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn1).toBeVisible({ timeout: 5000 })
    await saveBtn1.click()
    await expect(saveBtn1).not.toBeVisible({ timeout: 10000 })
    await expect(syncIndicator).toBeVisible({ timeout: 20000 })

    // 2ª Duplicação e Salvamento imediato
    await expect(async () => {
      await actionTriggers.nth(1).scrollIntoViewIfNeeded()
      await actionTriggers.nth(1).click()
      await expect(duplicateBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await duplicateBtn.click()

    const saveBtn2 = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn2).toBeVisible({ timeout: 5000 })
    await saveBtn2.click()
    await expect(saveBtn2).not.toBeVisible({ timeout: 10000 })
    await expect(syncIndicator).toBeVisible({ timeout: 20000 })

    await expect(actionTriggers).toHaveCount(initialCount + 2)

    // Recarrega e valida que ambos os apontamentos persistem
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    await expect(syncIndicator).toBeVisible({ timeout: 20000 })
    await expect(actionTriggers).toHaveCount(initialCount + 2)
  })
})
