import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Alternância de Visões (TE-07)', () => {
  test('deve alternar entre Modo Lista, Grade Mensal e Grade Semanal mantendo consistência dos dados', async ({
    page,
  }) => {
    // 1. Navega para o primeiro workspace configurado
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })

    // 3. Valida que inicia no Modo Lista com a tabela de apontamentos renderizada
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })

    // 4. Alterna para a Grade Mensal (Calendário)
    const calendarLink = page.locator('a:has-text("Grade Mensal")').first()
    await expect(calendarLink).toBeVisible({ timeout: 10000 })
    await calendarLink.click()

    // 5. Valida a rota e elementos da Grade Mensal
    await expect(page).toHaveURL(/.*\/calendar/, { timeout: 10000 })
    const segHeader = page.locator('text=Seg').first()
    await expect(segHeader).toBeVisible({ timeout: 10000 })

    // 6. Alterna para a Grade Semanal (Timesheet)
    const timesheetLink = page.locator('a:has-text("Grade Semanal")').first()
    await expect(timesheetLink).toBeVisible({ timeout: 10000 })
    await timesheetLink.click()

    // 7. Valida a rota e elementos da Grade Semanal
    await expect(page).toHaveURL(/.*\/timesheet/, { timeout: 10000 })
    const totalColumnHeader = page.locator('th:has-text("Total")').first()
    await expect(totalColumnHeader).toBeVisible({ timeout: 10000 })

    // 8. Retorna para o Modo Lista
    const listLink = page.locator('a:has-text("Modo Lista")').first()
    await expect(listLink).toBeVisible({ timeout: 10000 })
    await listLink.click()

    // 9. Valida que retornou ao Modo Lista e os apontamentos continuam visíveis
    await expect(page).not.toHaveURL(/.*\/timesheet/)
    await expect(page).not.toHaveURL(/.*\/calendar/)
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
  })
})
