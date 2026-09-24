import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Resolução de Conflitos Locais vs Remotos (SYNC-03, SYNC-04, SYNC-05)', () => {
  test('deve detectar conflito ao editar um apontamento alterado remotamente e permitir resolução', async ({
    page,
  }) => {
    // 1. Navegar para o workspace
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Modifica a última entrada remotamente (via Addon Fake DB)
    const addonsBtn = page.locator('button[title="Addons do Sistema"]')
    await expect(addonsBtn).toBeVisible()
    await addonsBtn.click({ force: true })

    const touchConflictBtn = page.locator(
      'button:has-text("Gerar conflito no último")',
    )
    await expect(touchConflictBtn).toBeVisible()
    await touchConflictBtn.click({ force: true })

    // 4. Aguarda o toast de confirmação
    await expect(
      page.locator('text=Fake DB: Conflito Criado').first(),
    ).toBeVisible({ timeout: 5000 })

    // Fecha o popover de Addons
    await page.keyboard.press('Escape')

    // 5. Imediatamente edita a mesma (última/primeira) linha LOCALMENTE
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

    // Edita o comentário local
    const commentInput = page
      .locator('[data-testid="time-entry-comment-input"]')
      .first()
    await expect(commentInput).toBeVisible()
    await commentInput.fill('Local Edit Overwrite E2E')
    await commentInput.press('Enter')

    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()
    // Aguarda o botão salvar sumir (indicando que saiu do modo de edição)
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })

    // 6. Força Sincronização
    await page.keyboard.press('Escape')
    const syncIndicatorPopover = page
      .locator('[data-testid="sync-status-indicator"]')
      .first()
    await expect(syncIndicatorPopover).toBeVisible()
    await syncIndicatorPopover.click({ force: true })

    const forceSyncBtn = page
      .getByRole('button', { name: 'Sincronizar tudo' })
      .first()
    await expect(forceSyncBtn).toBeVisible()
    await forceSyncBtn.click({ force: true })

    // 7. Espera o botão de resolver conflito aparecer e abre o modal
    const resolverBtn = page.getByRole('button', { name: 'Resolver' }).first()
    const conflictModal = page.locator(
      '[role="dialog"]:has-text("Conflito de Sincronização")',
    )

    await expect(async () => {
      const isModalVisible = await conflictModal.isVisible()
      if (isModalVisible) return

      const isResolverVisible = await resolverBtn.isVisible()
      if (!isResolverVisible) {
        await syncIndicatorPopover.click({ force: true })
      }
      await expect(resolverBtn).toBeVisible({ timeout: 2000 })
      await resolverBtn.click({ force: true })
      await expect(conflictModal).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20000 })

    // 8. Escolhe "Selecionar Tudo Local" e "Aceitar Mesclagem"
    const keepLocalBtn = conflictModal.locator(
      'button:has-text("Selecionar Tudo Local")',
    )
    await expect(keepLocalBtn).toBeVisible({ timeout: 10000 })
    await keepLocalBtn.click()

    const acceptBtn = conflictModal.locator(
      'button:has-text("Aceitar Mesclagem")',
    )
    await expect(acceptBtn).toBeVisible({ timeout: 5000 })
    await acceptBtn.click()

    // 9. Conflito resolvido, verifica se o estado voltou a Sincronizado
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })
  })

  test('deve resolver conflito aceitando a versão remota (SYNC-05)', async ({
    page,
  }) => {
    // 1. Navegar para o workspace
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    // 2. Aguarda a sincronização inicial
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Modifica a última entrada remotamente (via Addon Fake DB)
    const addonsBtn = page.locator('button[title="Addons do Sistema"]')
    await expect(addonsBtn).toBeVisible()
    await addonsBtn.click({ force: true })

    const touchConflictBtn = page.locator(
      'button:has-text("Gerar conflito no último")',
    )
    await expect(touchConflictBtn).toBeVisible()
    await touchConflictBtn.click({ force: true })

    await expect(
      page.locator('text=Fake DB: Conflito Criado').first(),
    ).toBeVisible({ timeout: 5000 })

    await page.keyboard.press('Escape')

    // 4. Edita a mesma linha localmente
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

    const commentInput = page
      .locator('[data-testid="time-entry-comment-input"]')
      .first()
    await expect(commentInput).toBeVisible()
    const discardedComment = 'Comentario Local Descartado ' + Date.now()
    await commentInput.fill(discardedComment)
    await commentInput.press('Enter')

    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()
    await expect(saveBtn).not.toBeVisible({ timeout: 10000 })

    // 5. Força sincronização para detectar conflito
    await page.keyboard.press('Escape')
    const syncIndicatorPopover = page
      .locator('[data-testid="sync-status-indicator"]')
      .first()
    await expect(syncIndicatorPopover).toBeVisible()

    const forceSyncBtn = page
      .getByRole('button', { name: 'Sincronizar tudo' })
      .first()

    await expect(async () => {
      const isVisible = await forceSyncBtn.isVisible()
      if (!isVisible) {
        await syncIndicatorPopover.click({ force: true })
      }
      expect(await forceSyncBtn.isVisible()).toBe(true)
    }).toPass({ timeout: 10000 })

    await forceSyncBtn.click({ force: true })

    // 6. Abre modal de resolução de conflito
    const resolverBtn = page.getByRole('button', { name: 'Resolver' }).first()
    const conflictModal = page.locator(
      '[role="dialog"]:has-text("Conflito de Sincronização")',
    )

    await expect(async () => {
      const isModalVisible = await conflictModal.isVisible()
      if (isModalVisible) return

      const isResolverVisible = await resolverBtn.isVisible()
      if (!isResolverVisible) {
        await syncIndicatorPopover.click({ force: true })
      }
      await expect(resolverBtn).toBeVisible({ timeout: 2000 })
      await resolverBtn.click({ force: true })
      await expect(conflictModal).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20000 })

    // 7. Escolhe "Selecionar Tudo Remoto" e "Aceitar Mesclagem"
    const keepRemoteBtn = conflictModal.locator(
      'button:has-text("Selecionar Tudo Remoto")',
    )
    await expect(keepRemoteBtn).toBeVisible({ timeout: 10000 })
    await keepRemoteBtn.click()

    const acceptBtn = conflictModal.locator(
      'button:has-text("Aceitar Mesclagem")',
    )
    await expect(acceptBtn).toBeVisible({ timeout: 5000 })
    await acceptBtn.click()

    // 8. Valida retorno ao estado Sincronizado e que o comentário local descartado NÃO está na tela
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })
    await expect(page.locator(`text=${discardedComment}`)).not.toBeVisible()
  })
})
