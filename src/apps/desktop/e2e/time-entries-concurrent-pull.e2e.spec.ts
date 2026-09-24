import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Concorrência Pull vs Edição Local (STR-03)', () => {
  test('deve manter dados digitados pelo usuário durante background pull e salvar com sucesso (STR-03)', async ({
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
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Obtém os botões de ação e entra em modo de edição na primeira linha
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    await actionTriggers.first().click()

    const editBtn = page.locator('[data-testid="time-entry-edit-btn"]')
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    // 4. Digita um comentário na linha em edição SEM salvar ainda
    const commentInput = page
      .locator('[data-testid="time-entry-comment-input"]')
      .first()
    await expect(commentInput).toBeVisible()
    const concurrentComment = 'Edição Concorrente Local E2E'
    await commentInput.fill(concurrentComment)

    // 5. Simula atualização concorrente no servidor (injetando novo registro via Addon Fake DB)
    const addonsBtn = page.locator('button[title="Addons do Sistema"]')
    await expect(addonsBtn).toBeVisible()
    await addonsBtn.click({ force: true })

    const injectTodayBtn = page.locator(
      'button:has-text("Criar apontamento hoje")',
    )
    await expect(injectTodayBtn).toBeVisible()
    await injectTodayBtn.click({ force: true })

    // Aguarda o toast de confirmação do Addon
    await expect(
      page.locator('text=Fake DB: Novo Registro').first(),
    ).toBeVisible({ timeout: 5000 })

    // Fecha o popover de Addons
    await page.keyboard.press('Escape')

    // 6. Força sincronização Pull em segundo plano enquanto a edição continua aberta
    await syncIndicator.click({ force: true })
    const syncAllBtn = page.locator('[data-testid="sync-all-button"]')
    await expect(syncAllBtn).toBeVisible({ timeout: 5000 })
    await syncAllBtn.click({ force: true })
    await page.keyboard.press('Escape')

    // Aguarda o sync assentar de volta para "Sincronizado"
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 7. Validação crucial: o input de comentário AINDA CONTÉM o texto digitado pelo usuário
    await expect(commentInput).toHaveValue(concurrentComment)

    // 8. Clica em Salvar na linha
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Aguarda sair do modo de edição
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })

    // 9. Valida que o comentário foi salvo no documento local
    await expect(page.locator(`text=${concurrentComment}`).first()).toBeVisible(
      { timeout: 10000 },
    )

    // 10. Valida que a linha ficou marcada com pending_push para envio
    const pendingPushStatus = page.locator(
      '[data-testid="sync-status-pending-push"]',
    )
    await expect(pendingPushStatus.first()).toBeVisible({ timeout: 10000 })
  })
})
