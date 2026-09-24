import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Exclusão de Apontamentos (Remoção Local e Persistência)', () => {
  test('deve excluir apontamento existente e garantir persistência pós-reload', async ({
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

    // 4. Abre o menu de contexto do primeiro apontamento e clica em "Excluir"
    const deleteBtn = page.locator('[data-testid="time-entry-delete-btn"]')
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(deleteBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await deleteBtn.click()

    // 5. Valida que a quantidade total de apontamentos diminuiu em exatamente 1
    await expect(actionTriggers).toHaveCount(initialCount - 1)

    // 6. Executa reload completo da janela (simulando F5 do usuário)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // 7. Garante que após o reload a exclusão permanece persistida no RxDB
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers).toHaveCount(initialCount - 1)
  })

  test('deve tolerar exclusões sucessivas rápidas sem inconsistência de estado (STR-02)', async ({
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

    // 3. Aguarda os apontamentos carregarem
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })

    const initialCount = await actionTriggers.count()
    expect(initialCount).toBeGreaterThanOrEqual(2)

    // 4. Executa a primeira exclusão
    const deleteBtn = page.locator('[data-testid="time-entry-delete-btn"]')
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(deleteBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await deleteBtn.click()

    await expect(actionTriggers).toHaveCount(initialCount - 1, {
      timeout: 10000,
    })

    // 5. Imediatamente executa a segunda exclusão no novo primeiro elemento
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(deleteBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await deleteBtn.click()

    await expect(actionTriggers).toHaveCount(initialCount - 2, {
      timeout: 10000,
    })

    // 6. Recarrega a página para certificar integridade
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })
    await expect(actionTriggers).toHaveCount(initialCount - 2, {
      timeout: 15000,
    })
  })
})
