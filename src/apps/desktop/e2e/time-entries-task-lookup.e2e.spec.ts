import type { TimeEntryPullCheckpointDTO } from '@mr-tick/application'
import { z } from 'zod'

import { expect, test } from './fixtures/electron-fixture'
import { fakeSyncScope } from './fixtures/fake-sync-observer'
import { syncStatusIndicator } from './fixtures/sync-status'

test.describe('E2E - Seleção e Busca de Tarefa (TSK-01)', () => {
  test('TSK-07: confirmar ID ausente do cache e enviar o apontamento ao provider fake', async ({
    page,
  }, testInfo) => {
    await page
      .locator(`nav a[href*="/workspaces/${fakeSyncScope.workspaceId}"]`)
      .click()
    await expect(syncStatusIndicator(page, 'synced')).toBeVisible({
      timeout: 30000,
    })
    const since = new Date().toISOString()
    const missing = await page.evaluate(
      (scope) =>
        window.api.core.getTask({
          body: { ...scope, taskId: 'UNRESOLVED-123456' },
        }),
      fakeSyncScope,
    )
    expect(missing.statusCode).toBe(404)
    await page.getByTestId('time-entry-actions-trigger').first().click()
    await page.getByTestId('time-entry-edit-btn').click()
    await page.getByTestId('time-entry-task-popover-trigger').first().click()
    const input = page.getByTestId('time-entry-task-lookup-input')
    await input.pressSequentially('UNRESOLVED-123456')
    await expect(input).toHaveValue('UNRESOLVED-123456')
    await input.press('Enter')
    await expect(input).not.toBeVisible()
    await page.getByTestId('time-entry-save-btn').first().click()
    await expect
      .poll(
        () =>
          page.evaluate(
            async ({ scope, since }) => {
              let checkpoint: TimeEntryPullCheckpointDTO = {
                updatedAt: new Date(since),
                id: '',
              }

              while (true) {
                const response = await window.api.timeEntries.pull({
                  body: {
                    workspaceId: scope.workspaceId,
                    connectionInstanceId: scope.connectionInstanceId,
                    checkpoint,
                    batch: 50,
                  },
                })
                if (!response.isSuccess || !response.data) return false
                if (
                  response.data.items.some(
                    (entry) => entry.task.id === 'UNRESOLVED-123456',
                  )
                )
                  return true
                if (!response.data.hasMore) return false
                checkpoint = response.data.checkpoint
              }
            },
            { scope: fakeSyncScope, since },
          ),
        { timeout: 30000 },
      )
      .toBe(true)

    const references = await page.evaluate(
      (scope) =>
        window.api.core.listTaskReferences({
          body: {
            ...scope,
            origin: 'remote',
            search: 'UNRESOLVED-123456',
            limit: 5,
          },
        }),
      fakeSyncScope,
    )
    expect(
      references.data?.some(
        (reference) => reference.taskId === 'UNRESOLVED-123456',
      ),
    ).toBe(true)
    await page.getByTestId('time-entry-actions-trigger').first().click()
    await page.getByTestId('time-entry-edit-btn').click()
    await page.getByTestId('time-entry-task-popover-trigger').first().click()
    const popup = page
      .locator('[data-slot="popover-content"]')
      .filter({ has: input })
    await expect(input).toHaveValue('')
    await expect(popup.getByText(/detalhes ainda não carregados/)).toHaveCount(
      0,
    )
    await expect(popup.getByTestId('task-use-manual-id')).toHaveCount(0)
    await expect(
      popup
        .getByRole('listbox', { name: 'Tarefas', exact: true })
        .getByRole('option')
        .first()
        .locator('img, svg')
        .first(),
    ).toBeVisible()
    const bounds = await popup.boundingBox()
    const viewport = page.viewportSize()
    expect(bounds).not.toBeNull()
    expect(viewport).not.toBeNull()
    if (!bounds || !viewport) throw new Error('LOOKUP_VIEWPORT_UNAVAILABLE')
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
    await popup.screenshot({
      path: testInfo.outputPath('task-lookup-compact.png'),
    })
    await input.pressSequentially('123456')
    const manual = popup.getByTestId('task-use-manual-id')
    await expect(manual).toHaveCount(1)
    await expect(manual.locator('img, svg').first()).toBeVisible()
    const manualBounds = await manual.boundingBox()
    const loadingBounds = await popup.boundingBox()
    if (!manualBounds || !loadingBounds)
      throw new Error('LOOKUP_ACTION_BOUNDS_UNAVAILABLE')
    expect(manualBounds.y + manualBounds.height).toBeLessThanOrEqual(
      loadingBounds.y + loadingBounds.height,
    )
    await popup.screenshot({
      path: testInfo.outputPath('task-lookup-manual-id.png'),
    })
  })

  test('TSK-06: busca remota controlada mantém ID manual disponível e enriquece cache uma vez', async ({
    page,
  }) => {
    await page
      .locator(`nav a[href*="/workspaces/${fakeSyncScope.workspaceId}"]`)
      .click()
    await expect(syncStatusIndicator(page, 'synced')).toBeVisible({
      timeout: 30000,
    })
    const prepared = await page.evaluate(() =>
      window.api.addons.executeCommand({
        body: { commandId: 'fake-db:prepare-task-lookup' },
      }),
    )
    expect(prepared.data).toEqual({ prepared: true })
    await page.getByTestId('time-entry-actions-trigger').first().click()
    await page.getByTestId('time-entry-edit-btn').click()
    await page.getByTestId('time-entry-task-popover-trigger').first().click()
    const input = page.getByTestId('time-entry-task-lookup-input')
    await page.clock.install({ time: new Date() })
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    await input.pressSequentially('LOOKUP-REMOTE-123456')
    await expect(input).toHaveValue('LOOKUP-REMOTE-123456')
    await page.clock.runFor(400)
    await page.clock.resume()
    await expect(page.getByTestId('task-search-status')).toContainText(
      'Buscando em',
    )
    await expect(page.getByTestId('task-use-manual-id')).toBeEnabled()
    const missing = await page.evaluate(
      (scope) =>
        window.api.core.getTask({
          body: { ...scope, taskId: 'LOOKUP-REMOTE-123456' },
        }),
      fakeSyncScope,
    )
    expect(missing.statusCode).toBe(404)
    const diagnostics = await page.evaluate(() =>
      window.api.addons.executeCommand({
        body: { commandId: 'fake-db:get-task-lookup-diagnostics' },
      }),
    )
    const calls = z
      .object({
        requests: z.array(z.object({ id: z.string(), startedAt: z.number() })),
      })
      .parse(diagnostics.data)
    expect(
      calls.requests.filter((request) => request.id === 'LOOKUP-REMOTE-123456'),
    ).toHaveLength(1)
    expect(
      calls.requests.filter(
        (request) =>
          request.id.startsWith('LOOKUP-REMOTE-') &&
          request.id !== 'LOOKUP-REMOTE-123456',
      ),
    ).toHaveLength(0)
    // A second intent queues behind the controlled remote request. Clearing it
    // must cancel that consumer before the provider gate is released.
    await input.fill('LOOKUP-CANCELLED')
    await page.clock.runFor(400)
    await expect(page.getByTestId('task-search-status')).toContainText(
      'Buscando em',
    )
    await input.clear()
    await input.fill('LOOKUP-REMOTE-123456')
    await page.evaluate(() =>
      window.api.addons.executeCommand({
        body: { commandId: 'fake-db:release-task-lookups' },
      }),
    )
    await expect(
      page.getByText('Tarefa remota exclusiva do lookup', { exact: true }),
    ).toBeVisible()
    const cached = await page.evaluate(
      (scope) =>
        window.api.core.getTask({
          body: { ...scope, taskId: 'LOOKUP-REMOTE-123456' },
        }),
      fakeSyncScope,
    )
    expect(cached.isSuccess).toBe(true)
    expect(cached.data?.taskId).toBe('LOOKUP-REMOTE-123456')
    await expect(page.getByTestId('task-search-status')).toContainText(
      'Busca atualizada',
    )
    const completed = await page.evaluate(() =>
      window.api.addons.executeCommand({
        body: { commandId: 'fake-db:get-task-lookup-diagnostics' },
      }),
    )
    expect(
      z
        .object({ requests: z.array(z.object({ id: z.string() })) })
        .parse(completed.data).requests,
    ).not.toContainEqual({ id: 'LOOKUP-CANCELLED' })
    await input.press('ArrowDown')
    await input.press('Enter')
    await expect(input).not.toBeVisible()
    await page.getByTestId('time-entry-save-btn').first().click()
    await expect(page.getByTestId('time-entry-save-btn')).toHaveCount(0)
    await expect(
      page.getByText('#LOOKUP-REMOTE-123456', { exact: true }).first(),
    ).toBeVisible()
  })

  test('TSK-05: pesquisar por título e selecionar usando setas e Enter', async ({
    page,
  }) => {
    await page.locator('nav a[href*="/workspaces/"]').first().click()
    await expect(syncStatusIndicator(page, 'synced')).toBeVisible({
      timeout: 30000,
    })
    await page.getByTestId('time-entry-actions-trigger').first().click()
    await page.getByTestId('time-entry-edit-btn').click()
    await page.getByTestId('time-entry-task-popover-trigger').first().click()
    const input = page.getByTestId('time-entry-task-lookup-input')
    await input.fill('')
    await input.pressSequentially('responsividade')
    await expect(input).toHaveValue('responsividade')
    const popup = page
      .locator('[data-slot="popover-content"]')
      .filter({ has: input })
    await expect(
      popup.getByText('Ajustar responsividade do dashboard (API-240)', {
        exact: true,
      }),
    ).toBeVisible()
    await input.press('ArrowDown')
    await expect(input).toHaveAttribute('aria-activedescendant', /.+/)
    await input.press('Enter')
    await expect(input).not.toBeVisible()
    await page.getByTestId('time-entry-save-btn').first().click()
    await expect(page.getByTestId('time-entry-save-btn')).toHaveCount(0)
    await expect(
      page.getByText('#API-240', { exact: true }).first(),
    ).toBeVisible()
  })

  test('deve pesquisar tarefa e atualizar apontamento (TSK-01)', async ({
    page,
  }, testInfo) => {
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    const syncIndicator = syncStatusIndicator(page, 'synced')
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

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

    // Abre o popover de tarefa
    const popoverTrigger = page
      .locator('[data-testid="time-entry-task-popover-trigger"]')
      .first()
    await expect(popoverTrigger).toBeVisible()
    await popoverTrigger.click()

    // Valida que o popover abriu
    await expect(page.getByText('Detalhes da Tarefa')).toBeVisible({
      timeout: 5000,
    })

    // Input de busca compacto
    const searchInput = page.getByTestId('time-entry-task-lookup-input')
    await expect(searchInput).toBeVisible()

    // Valida que a mini-lista lista as tarefas sincronizadas inicialmente sem busca digitada
    const initialTask = page.locator('text=DEV-').first()
    await expect(initialTask).toBeVisible({ timeout: 10000 })
    const compactPopup = page
      .locator('[data-slot="popover-content"]')
      .filter({ has: searchInput })
    await expect(compactPopup).toHaveCSS('width', '460px')
    await page.screenshot({
      path: testInfo.outputPath('task-lookup-compact.png'),
    })
    await page.setViewportSize({ width: 420, height: 740 })
    await expect(compactPopup).toHaveCSS('width', '388px')
    await page.screenshot({
      path: testInfo.outputPath('task-lookup-narrow.png'),
    })
    await page.setViewportSize({ width: 1600, height: 900 })

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
  }, testInfo) => {
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    const syncIndicator = syncStatusIndicator(page, 'synced')
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

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
    await page.screenshot({
      path: testInfo.outputPath('task-lookup-advanced.png'),
    })

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

  test('deve abrir o popover e selecionar diretamente uma tarefa da listagem inicial sem digitar busca (TSK-03)', async ({
    page,
  }) => {
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    const syncIndicator = syncStatusIndicator(page, 'synced')
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

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

    // Abre o popover de tarefa
    const popoverTrigger = page
      .locator('[data-testid="time-entry-task-popover-trigger"]')
      .first()
    await expect(popoverTrigger).toBeVisible()
    await popoverTrigger.click()

    // Valida que o popover abriu
    await expect(page.getByText('Detalhes da Tarefa')).toBeVisible({
      timeout: 5000,
    })

    // Valida que a mini-lista já exibe tarefas sincronizadas imediatamente
    const firstListedTask = page.locator('text=DEV-').first()
    await expect(firstListedTask).toBeVisible({ timeout: 10000 })

    // Clica diretamente na tarefa listada sem digitar nada no input de busca
    await firstListedTask.click()

    // Salva a alteração
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click({ force: true })

    // Verifica que a alteração foi persistida e a linha exibe a tarefa
    await expect(saveBtn).not.toBeVisible()
    await expect(page.locator('text=DEV-').first()).toBeVisible()
  })

  test('deve validar título e tracker após pull e atualizar tarefa via popover com título completo (TSK-04)', async ({
    page,
  }) => {
    const workspaceLink = page.locator('nav a[href*="/workspaces/"]').first()
    await expect(workspaceLink).toBeVisible({ timeout: 15000 })
    await workspaceLink.click()

    const syncIndicator = syncStatusIndicator(page, 'synced')
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // Valida que apontamentos sincronizados no pull exibem o título completo da tarefa
    const rowWithTitle = page
      .locator('text=Ajustar responsividade do dashboard (API-240)')
      .first()
    await expect(rowWithTitle).toBeVisible({ timeout: 15000 })

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

    // Abre o popover de tarefa
    const popoverTrigger = page
      .locator('[data-testid="time-entry-task-popover-trigger"]')
      .first()
    await expect(popoverTrigger).toBeVisible()
    await popoverTrigger.click()

    // Valida que o popover abriu
    await expect(page.getByText('Detalhes da Tarefa')).toBeVisible({
      timeout: 5000,
    })

    // Busca pela tarefa API-240
    const searchInput = page.getByTestId('time-entry-task-lookup-input')
    await expect(searchInput).toBeVisible()

    // Aguarda o carregamento inicial da mini-lista reativa
    const initialTask = page.locator('text=DEV-').first()
    await expect(initialTask).toBeVisible({ timeout: 10000 })

    await searchInput.fill('API-240')

    // Localiza o item da tarefa e valida o título completo
    const taskItem = page.locator('text=API-240').first()
    await expect(taskItem).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByText('Ajustar responsividade do dashboard (API-240)').first(),
    ).toBeVisible({
      timeout: 5000,
    })

    // Clica para selecionar a tarefa
    await taskItem.click()

    // Salva a alteração
    const saveBtn = page.locator('[data-testid="time-entry-save-btn"]').first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click({ force: true })

    // Valida que a alteração foi persistida e a linha exibe a tarefa com título e ID
    await expect(saveBtn).not.toBeVisible()
    await expect(page.locator('text=API-240').first()).toBeVisible()
  })
})
