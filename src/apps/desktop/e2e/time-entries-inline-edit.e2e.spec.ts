import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Edição Inline Direta (Ghost Mode)', () => {
  test('deve editar comentário de um apontamento e garantir persistência (TE-04)', async ({
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

    // 4. Abre o menu de contexto do primeiro apontamento e clica em "Editar"
    await actionTriggers.first().click()

    const editBtn = page.locator('[data-testid="time-entry-edit-btn"]')
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    // 5. Edita o comentário usando o input recém-anotado com data-testid
    const commentInput = page
      .locator('[data-testid="time-entry-comment-input"]')
      .first()
    await expect(commentInput).toBeVisible()

    const novoComentario = 'Comentário Editado E2E ' + Date.now()
    await commentInput.fill(novoComentario)
    await commentInput.press('Enter')

    // 6. Clica no botão Salvar da linha em edição
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // 7. Aguarda o modo edição fechar (botão Salvar sumir)
    await expect(saveBtn).not.toBeVisible()

    // 8. Verifica se o novo comentário aparece na grid
    await expect(page.locator(`text=${novoComentario}`)).toBeVisible()

    // 9. Dá reload na página para validar persistência local-first
    await page.reload()

    // 10. Aguarda sincronização e valida que a edição se manteve
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })
    await expect(page.locator(`text=${novoComentario}`)).toBeVisible()
  })

  test('deve iniciar edição e cancelar, revertendo para o estado original (TE-06)', async ({
    page,
  }) => {
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })

    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })

    await actionTriggers.first().click()
    const editBtn = page.locator('[data-testid="time-entry-edit-btn"]')
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    const commentInput = page
      .locator('[data-testid="time-entry-comment-input"]')
      .first()
    await expect(commentInput).toBeVisible()

    // Captura o valor original
    const valorOriginal = await commentInput.inputValue()

    // Altera o valor
    await commentInput.fill('Texto que será cancelado')

    // Clica em cancelar
    const cancelBtn = page
      .locator('[data-testid="time-entry-cancel-btn"]')
      .first()
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()

    // Aguarda o modo edição fechar
    await expect(cancelBtn).not.toBeVisible()

    // Valida que o texto cancelado não está na tela e o original ou nada mudou de forma indevida
    await expect(
      page.locator('text=Texto que será cancelado'),
    ).not.toBeVisible()
    if (valorOriginal) {
      // Se havia valor original, ele deve estar visível
      await expect(page.locator(`text=${valorOriginal}`).first()).toBeVisible()
    }
  })
})
