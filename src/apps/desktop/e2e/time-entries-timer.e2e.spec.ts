import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Timer Lifecycle e Crash Recovery (TMR-01, TMR-02, TMR-03)', () => {
  test('deve resumir um timer pausado, persistir o estado e permitir parar (TMR-01, TMR-02, TMR-03)', async ({
    page,
  }) => {
    // 1. Navega para o workspace
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })

    // 3. Inicia um timer via timerbar (cria um novo apontamento em estado "running")
    const startBtn = page.locator('[data-testid="timerbar-start-btn"]').first()
    await expect(startBtn).toBeVisible({ timeout: 10000 })
    await startBtn.click()

    // 4. TMR-01: Aguarda o botão de pause aparecer na timerbar (indica que está rodando)
    const timerbarPauseBtn = page
      .locator('[data-testid="timerbar-pause-btn"]')
      .first()
    await expect(timerbarPauseBtn).toBeVisible({ timeout: 10000 })

    // 5. Pausa o timer via timerbar
    await timerbarPauseBtn.click()

    // 6. Aguarda o botão de Continuar Apontamento aparecer na linha da tabela
    const resumeBtn = page
      .locator('[data-testid="time-entry-resume-btn"]')
      .first()
    await expect(resumeBtn).toBeVisible({ timeout: 10000 })

    // 7. Clica em Resumir (Play)
    await resumeBtn.click()

    // 8. Verifica se o botão de stop aparece na linha da tabela (indicando que está rodando)
    const rowStopBtn = page
      .locator('[data-testid="time-entry-stop-btn"]')
      .first()
    await expect(rowStopBtn).toBeVisible({ timeout: 10000 })

    // 9. TMR-03: Simula um crash/reload enquanto o timer está rodando
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })

    // 10. Valida que o timer continua rodando após reload (stop btn ou timerbar stop visível)
    const timerbarStopBtn = page
      .locator('[data-testid="timerbar-stop-btn"]')
      .first()
    await expect(timerbarStopBtn).toBeVisible({ timeout: 10000 })

    // 11. TMR-02: Para o timer via timerbar
    await timerbarStopBtn.click()

    // 12. Verifica que o timerbar voltou ao estado idle (start btn reaparece)
    await expect(startBtn).toBeVisible({ timeout: 10000 })

    // 13. Verifica que o trigger de edição (actions) voltou a aparecer na linha,
    // indicando que a linha voltou para estado finalizado.
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 10000 })
  })
})
