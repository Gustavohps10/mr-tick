import { expect, test } from './fixtures/electron-fixture'
import { fakeSyncScope } from './fixtures/fake-sync-observer'

test.describe('E2E - Timer Lifecycle e Crash Recovery (TMR-01, TMR-02, TMR-03)', () => {
  test('deve resumir um timer pausado, persistir o estado e permitir parar (TMR-01, TMR-02, TMR-03)', async ({
    page,
  }) => {
    // 1. Navega para o workspace
    const workspaceLink = page
      .locator(`nav a[href*="/workspaces/${fakeSyncScope.workspaceId}"]`)
      .first()
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
    const inspectActiveTimer = () =>
      page.evaluate(
        (workspaceId) =>
          window.api.localRuntime.request({
            action: 'timerState',
            workspaceId,
          }),
        fakeSyncScope.workspaceId,
      )
    await expect.poll(inspectActiveTimer).toMatchObject({
      ok: true,
      value: { entry: { status: 'running' } },
    })
    const started = await inspectActiveTimer()
    if (!started.ok) throw new Error(started.error.messageKey)
    if (started.value.entry === null) throw new Error('ACTIVE_TIMER_NOT_FOUND')
    const entryId = started.value.entry.id
    expect(started.value.entry.status).toBe('running')
    const timerRow = page.locator(
      `[data-testid="time-entry-row"][data-entry-id="${entryId}"]`,
    )

    // 4. TMR-01: Aguarda o botão de pause aparecer na timerbar (indica que está rodando)
    const timerbarPauseBtn = page
      .locator('[data-testid="timerbar-pause-btn"]')
      .first()
    await expect(timerbarPauseBtn).toBeVisible({ timeout: 10000 })

    // 5. Pausa o timer via timerbar
    await timerbarPauseBtn.click()
    await expect.poll(inspectActiveTimer).toMatchObject({
      ok: true,
      value: { entry: { id: entryId, status: 'paused' } },
    })

    // 6. Aguarda o botão de Continuar Apontamento aparecer na linha da tabela
    const resumeBtn = timerRow.getByTestId('time-entry-resume-btn')
    await expect(resumeBtn).toBeVisible({ timeout: 10000 })

    // 7. Clica em Resumir (Play)
    await resumeBtn.click()
    await expect.poll(inspectActiveTimer).toMatchObject({
      ok: true,
      value: { entry: { id: entryId, status: 'running' } },
    })

    // Stop também existe no estado pausado. Aguarda a retomada persistida antes do reload.
    const rowPauseBtn = timerRow.getByTestId('time-entry-pause-btn')
    await expect(rowPauseBtn).toBeVisible({ timeout: 10000 })
    await expect(resumeBtn).not.toBeVisible()
    await expect(timerbarPauseBtn).toBeVisible({ timeout: 10000 })

    // 9. TMR-03: Simula um crash/reload enquanto o timer está rodando
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })

    // 10. Owner, reader e controles recuperam o mesmo timer após reload.
    await expect.poll(inspectActiveTimer).toMatchObject({
      ok: true,
      value: { entry: { id: entryId, status: 'running' } },
    })
    await expect(timerbarPauseBtn).toBeVisible({ timeout: 10000 })
    await expect(rowPauseBtn).toBeVisible({ timeout: 10000 })
    const timerbarStopBtn = page
      .locator('[data-testid="timerbar-stop-btn"]')
      .first()
    await expect(timerbarStopBtn).toBeVisible({ timeout: 10000 })

    // 11. TMR-02: Para o timer via timerbar
    await timerbarStopBtn.click()
    await expect
      .poll(inspectActiveTimer)
      .toMatchObject({ ok: true, value: { entry: null } })
    await expect
      .poll(() =>
        page.evaluate(
          (reference) =>
            window.api.localRuntime.request({ action: 'get', ...reference }),
          { workspaceId: fakeSyncScope.workspaceId, entryId },
        ),
      )
      .toMatchObject({
        ok: true,
        value: { entry: { id: entryId, status: 'finished' } },
      })

    // 12. Verifica que o timerbar voltou ao estado idle (start btn reaparece)
    await expect(startBtn).toBeVisible({ timeout: 10000 })

    // 13. Verifica que o trigger de edição (actions) voltou a aparecer na linha,
    // indicando que a linha voltou para estado finalizado.
    const actionTrigger = timerRow.getByTestId('time-entry-actions-trigger')
    await expect(actionTrigger).toBeVisible({ timeout: 10000 })
  })
})
