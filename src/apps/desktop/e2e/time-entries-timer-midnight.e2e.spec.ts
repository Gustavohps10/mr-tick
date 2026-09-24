import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Horários e Timer Cruzando Meia-Noite (TMR-04)', () => {
  test('deve calcular duracao positiva ao cruzar meia-noite e persistir pos-reload (TMR-04)', async ({
    page,
  }) => {
    // 1. Navega para o primeiro workspace configurado
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][data-status="synced"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Abre o menu de ações do primeiro apontamento e entra em modo de edição
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const editBtn = page.locator('[data-testid="time-entry-edit-btn"]')
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(editBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await editBtn.click()

    // 4. Localiza os campos de início, fim e duração da linha em edição
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

    // 5. Informa início às 23:55 (dia D)
    await startInput.fill('23:55')
    await startInput.press('Enter')

    // 6. Informa término às 00:05 (dia D+1, cruzando a meia-noite)
    await endInput.fill('00:05')
    await endInput.press('Enter')

    // 7. Valida que a duração é calculada estritamente como 10 minutos (00:10:00) e não negativa
    await expect(async () => {
      const durationValue = await durationInput.inputValue()
      expect(durationValue).toMatch(/0?0:10/)
      expect(durationValue).not.toContain('-')
    }).toPass({ timeout: 5000 })

    // 8. Salva a linha modificada
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Aguarda sair do modo de edição
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })

    // 9. Valida que a duração de 10 minutos (00:10:00) foi gravada e permanece na tabela
    await expect(async () => {
      const allDurations = await page
        .locator('[data-testid="time-entry-duration-input"]')
        .evaluateAll((inputs: HTMLInputElement[]) =>
          inputs.map((input) => input.value),
        )
      expect(allDurations).toContain('00:10:00')
    }).toPass({ timeout: 10000 })

    // 10. Executa reload completo da janela para validar persistência
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // 11. Valida que após o reload a sincronização finaliza e a duração continua íntegra em 00:10:00
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })
    await expect(async () => {
      const allDurationsAfterReload = await page
        .locator('[data-testid="time-entry-duration-input"]')
        .evaluateAll((inputs: HTMLInputElement[]) =>
          inputs.map((input) => input.value),
        )
      expect(allDurationsAfterReload).toContain('00:10:00')
    }).toPass({ timeout: 15000 })
  })
})
