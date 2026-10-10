import { expect, test } from './fixtures/electron-fixture'
import {
  fakeSyncDiagnostics,
  fakeSyncScope,
  localSyncEntries,
} from './fixtures/fake-sync-observer'

test.describe('E2E - Sincronização e Resiliência Offline (SYNC-02)', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.context().setOffline(false)
    } catch {
      // Silencia se o contexto já estiver fechado
    }
  })

  test('deve criar apontamento offline com pending_push e sincronizar ao restaurar rede (SYNC-02)', async ({
    page,
  }, testInfo) => {
    // 1. Navega para o primeiro workspace configurado
    const workspaceLink = page.locator(
      `nav a[href="#/workspaces/${fakeSyncScope.workspaceId}"]`,
    )
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial assentar ("Sincronizado")
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Obtém contagem inicial de apontamentos
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const initialCount = await actionTriggers.count()
    expect(initialCount).toBeGreaterThan(0)

    // The in-memory provider runs in main, outside browser HTTP interception.
    // Disconnect its replication explicitly; this is a fake runtime-offline proof.
    const disconnected = await page.evaluate(
      (scope) =>
        window.api.localSync.request({
          action: 'disconnect',
          ...scope,
        }),
      fakeSyncScope,
    )
    expect(disconnected.ok).toBe(true)
    const before = await fakeSyncDiagnostics(page)
    await page.context().setOffline(true)

    // 5. Realiza duplicação de um apontamento existente enquanto offline
    const duplicateBtn = page.locator(
      '[data-testid="time-entry-duplicate-btn"]',
    )
    await expect(async () => {
      await actionTriggers.first().scrollIntoViewIfNeeded()
      await actionTriggers.first().click()
      await expect(duplicateBtn).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 15000 })
    await duplicateBtn.click()

    // 6. Salva o rascunho localmente no RxDB/IndexedDB
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    const draftId = await saveBtn.evaluate((element) =>
      element.closest('[data-entry-id]')?.getAttribute('data-entry-id'),
    )
    if (!draftId) return expect.fail('OFFLINE_DRAFT_ID_MISSING')
    const comment = `Offline runtime proof ${testInfo.testId}`
    const commentInput = page.getByTestId('time-entry-comment-input').first()
    await commentInput.fill(comment)
    await commentInput.press('Enter')
    await saveBtn.click()

    // 7. Confirma que a nova linha foi gravada localmente
    await expect(actionTriggers).toHaveCount(initialCount + 1, {
      timeout: 10000,
    })

    // 8. Valida presença do indicador de pendência de envio
    const savedRow = page.locator(
      `[data-testid="time-entry-row"][data-entry-id="${draftId}"]`,
    )
    await expect(savedRow.getByTestId('sync-status-pending-push')).toBeVisible({
      timeout: 10000,
    })

    const saved = (await localSyncEntries(page)).find(
      (entry) => entry.id === draftId,
    )
    expect(saved?.comments).toBe(comment)
    const offline = await fakeSyncDiagnostics(page)
    expect(offline.createAttempts).toBe(before.createAttempts)
    expect(
      offline.entries.filter((entry) => entry.comments === comment),
    ).toHaveLength(0)

    // 9. Restaura a conexão de rede (Online Mode)
    await page.context().setOffline(false)
    const connected = await page.evaluate(
      (scope) =>
        window.api.localSync.request({
          action: 'connect',
          ...scope,
        }),
      fakeSyncScope,
    )
    expect(connected.ok).toBe(true)

    // 10. Reenvia a fila pela porta real do runtime, sem depender de um badge transitório.
    const synchronized = await page.evaluate(
      (scope) =>
        window.api.localSync.request({
          action: 'forceSync',
          direction: 'both',
          ...scope,
        }),
      fakeSyncScope,
    )
    expect(synchronized.ok).toBe(true)

    // 11. Valida que o motor de sincronização finalizou com sucesso
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    await expect
      .poll(
        async () =>
          (await fakeSyncDiagnostics(page)).entries.filter(
            (entry) => entry.comments === comment,
          ).length,
        { timeout: 45000 },
      )
      .toBe(1)
    const online = await fakeSyncDiagnostics(page)
    expect(online.createAttempts).toBe(before.createAttempts + 1)
    expect(online.entries).toHaveLength(before.entries.length + 1)

    // 12. Valida persistência e integridade plena após reload da aplicação
    await page.reload()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    const restored = (await localSyncEntries(page)).find(
      (entry) => entry.id === draftId,
    )
    expect(restored?.comments).toBe(comment)
    // A contagem deve permanecer exatamente com o novo apontamento preservado
    await expect(actionTriggers).toHaveCount(initialCount + 1, {
      timeout: 15000,
    })
  })
})
