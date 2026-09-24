import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Seleção e Busca de Tarefa (TSK-01)', () => {
  test('deve pesquisar tarefa e atualizar apontamento (TSK-01)', async ({
    page,
  }) => {
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })

    await actionTriggers.first().click()
    const editBtn = page.locator('[data-testid="time-entry-edit-btn"]')
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    // Abre o popover de tarefa
    const popoverTrigger = page
      .locator('[data-testid="time-entry-task-popover-trigger"]')
      .first()
    await expect(popoverTrigger).toBeVisible()
    await popoverTrigger.click()

    // Input de busca compacto
    const searchInput = page.getByPlaceholder('Buscar ou digitar ID...')
    await expect(searchInput).toBeVisible()

    // Digita uma tarefa para buscar
    await searchInput.fill('DEV-552')

    // Verifica se a tarefa apareceu na mini-lista e clica
    const taskItem = page.locator('text=DEV-552').first()
    await expect(taskItem).toBeVisible({ timeout: 10000 })
    await taskItem.click()

    // Clica no botão Salvar (com force para evitar erros de detach durante re-render do React)
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click({ force: true })

    // Verifica se a tarefa foi selecionada e a edição fechou
    await expect(saveBtn).not.toBeVisible()
    await expect(page.locator('text=#DEV-552').first()).toBeVisible()
  })

  test('deve abrir modal de busca avançada e filtrar tarefas por status (TSK-02)', async ({
    page,
  }) => {
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })

    await actionTriggers.first().click()
    const editBtn = page.locator('[data-testid="time-entry-edit-btn"]')
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    // Abre o popover de tarefa
    const popoverTrigger = page
      .locator('[data-testid="time-entry-task-popover-trigger"]')
      .first()
    await expect(popoverTrigger).toBeVisible()
    await popoverTrigger.click()

    // Clica no botão de modal detalhado
    const lookupModalBtn = page.locator(
      '[data-testid="time-entry-task-lookup-modal-btn"]',
    )
    await expect(lookupModalBtn).toBeVisible()
    await lookupModalBtn.click()

    // Valida que o modal de busca detalhada abriu
    const modalInput = page.locator(
      '[data-testid="task-lookup-modal-search-input"]',
    )
    await expect(modalInput).toBeVisible({ timeout: 10000 })

    // Valida presença das tarefas carregadas
    const taskRows = page.locator('[data-testid="task-lookup-row"]')
    await expect(taskRows.first()).toBeVisible({ timeout: 10000 })

    // Interage com o filtro de status
    const statusFilter = page.locator(
      '[data-testid="task-lookup-status-filter"]',
    )
    await expect(statusFilter).toBeVisible()
    await statusFilter.click()

    // Seleciona um status na lista do dropdown (ex: In Progress)
    const statusOption = page.getByRole('option', { name: /In Progress/i })
    await expect(statusOption).toBeVisible()
    await statusOption.click()

    // Verifica que a lista de tarefas reage ao filtro
    await expect(taskRows.first()).toBeVisible({ timeout: 10000 })

    // Seleciona a primeira tarefa da lista filtrada
    await taskRows.first().click()

    // Valida que o modal de busca avançada fechou após a seleção
    await expect(modalInput).not.toBeVisible()

    // Salva a alteração
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click({ force: true })
    await expect(saveBtn).not.toBeVisible()
  })
})
