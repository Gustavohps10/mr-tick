import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Duplicação de Apontamentos (Ghost Mode e Persistência)', () => {
  test('deve criar rascunho em Ghost Mode e descartar ao clicar em Cancelar', async ({
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

    // 4. Abre o menu de contexto do primeiro apontamento e clica em "Duplicar"
    const duplicateBtn = page.locator(
      '[data-testid="time-entry-duplicate-btn"]',
    )
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(duplicateBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await duplicateBtn.click()

    // 5. Valida que o Ghost Mode entrou em ação (linha rascunho com botão Salvar e Cancelar)
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    const cancelBtn = page
      .locator('[data-testid="time-entry-cancel-btn"]')
      .first()

    await expect(saveBtn).toBeVisible()
    await expect(cancelBtn).toBeVisible()

    // 6. Clica em Cancelar
    await cancelBtn.click()

    // 7. Valida que o rascunho foi descartado da memória e nada foi gravado
    await expect(saveBtn).not.toBeVisible()
    await expect(actionTriggers).toHaveCount(initialCount)
  })

  test('deve duplicar apontamento, salvar e garantir persistência intacta pós-reload', async ({
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

    // 4. Duplica o primeiro apontamento existente
    const duplicateBtn = page.locator(
      '[data-testid="time-entry-duplicate-btn"]',
    )
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(duplicateBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await duplicateBtn.click()

    // 5. Valida a presença dos botões de rascunho
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()

    // 6. Salva o rascunho
    await saveBtn.click()

    // 7. Valida que a linha salva deixou o modo de edição e entrou na listagem persistida
    await expect(saveBtn).not.toBeVisible()
    await expect(actionTriggers).toHaveCount(initialCount + 1)

    // 8. Executa reload completo da janela (simulando F5 do usuário)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // 9. Garante que após o reload a sincronização finaliza e a nova linha permanece intacta
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers).toHaveCount(initialCount + 1)
  })

  test('deve suportar múltiplos apontamentos simultâneos em Ghost Mode sem colisão de estado (STR-06)', async ({
    page,
  }) => {
    // 1. Navega para o primeiro workspace configurado
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial assentar
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Aguarda a listagem de apontamentos
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })

    const initialCount = await actionTriggers.count()
    expect(initialCount).toBeGreaterThanOrEqual(2)

    // 4. Duplica a primeira linha existente
    const duplicateBtn = page.locator(
      '[data-testid="time-entry-duplicate-btn"]',
    )
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(duplicateBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await duplicateBtn.click()

    // Valida que exatamente 1 rascunho ativo surgiu
    const saveButtons = page.locator('[data-testid="time-entry-save-btn"]')
    const cancelButtons = page.locator('[data-testid="time-entry-cancel-btn"]')
    await expect(saveButtons).toHaveCount(1)
    await expect(cancelButtons).toHaveCount(1)

    // 5. Duplica a segunda linha existente (disparando segundo Ghost Draft simultâneo)
    await actionTriggers.nth(1).click()
    await expect(duplicateBtn).toBeVisible()
    await duplicateBtn.click()

    // Valida que agora existem 2 rascunhos ativos simultâneos em memória
    await expect(saveButtons).toHaveCount(2)
    await expect(cancelButtons).toHaveCount(2)

    // 6. Descarta o primeiro rascunho clicando em Cancelar
    await cancelButtons.first().click()

    // Valida que sobrou exatamente 1 rascunho ativo
    await expect(saveButtons).toHaveCount(1)
    await expect(cancelButtons).toHaveCount(1)

    // 7. Salva o rascunho restante
    await saveButtons.first().click()

    // Valida que todos os rascunhos foram resolvidos e a nova linha foi incorporada
    await expect(saveButtons).toHaveCount(0)
    await expect(actionTriggers).toHaveCount(initialCount + 1)

    // 8. F5 Reload para confirmar que apenas o rascunho salvo persistiu no RxDB
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers).toHaveCount(initialCount + 1)
  })
})
