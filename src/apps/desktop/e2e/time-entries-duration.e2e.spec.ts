import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Edição de Duração e Horários (TE-05)', () => {
  test('deve alterar início e fim de um apontamento, recalcular duração automaticamente e persistir pós-reload', async ({
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

    // 3. Aguarda os apontamentos carregarem
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })

    // 4. Abre o menu de contexto do primeiro apontamento e clica em "Editar"
    await actionTriggers.first().click()

    const editBtn = page.locator('[data-testid="time-entry-edit-btn"]')
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    // 5. Localiza a linha em modo de edição e seus inputs de horário
    const editingRow = page
      .locator('tr:has([data-testid="time-entry-save-btn"])')
      .first()
    await expect(editingRow).toBeVisible()

    const startInput = editingRow.locator(
      '[data-testid="time-entry-start-time-input"]',
    )
    const endInput = editingRow.locator(
      '[data-testid="time-entry-end-time-input"]',
    )
    const durationInput = editingRow.locator(
      '[data-testid="time-entry-duration-input"]',
    )

    await expect(startInput).toBeVisible()
    await expect(endInput).toBeVisible()
    await expect(durationInput).toBeVisible()

    // 6. Preenche horário de início: 09:00
    await startInput.fill('09:00')
    await startInput.press('Enter')

    // 7. Preenche horário de fim: 11:30
    await endInput.fill('11:30')
    await endInput.press('Enter')

    // 8. Valida que a duração foi recalculada automaticamente para 02:30 (2 horas e 30 minutos)
    await expect(async () => {
      const durationValue = await durationInput.inputValue()
      expect(durationValue).toMatch(/0?2:30/)
    }).toPass({ timeout: 5000 })

    // 9. Salva a linha em edição
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // 10. Aguarda o modo edição fechar
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })

    // 11. Valida que o novo horário ou duração aparece na linha persistida
    await expect(async () => {
      const allDurations = await page
        .locator('[data-testid="time-entry-duration-input"]')
        .evaluateAll((inputs: HTMLInputElement[]) =>
          inputs.map((input) => input.value),
        )
      expect(allDurations).toContain('02:30:00')
    }).toPass({ timeout: 10000 })

    // 12. Executa reload completo da janela
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // 13. Garante que após o reload a sincronização finaliza e a duração permanece intacta
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })
    await expect(async () => {
      const allDurationsAfterReload = await page
        .locator('[data-testid="time-entry-duration-input"]')
        .evaluateAll((inputs: HTMLInputElement[]) =>
          inputs.map((input) => input.value),
        )
      expect(allDurationsAfterReload).toContain('02:30:00')
    }).toPass({ timeout: 15000 })
  })
})
