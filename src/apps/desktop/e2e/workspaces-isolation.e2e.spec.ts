import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Multi-Tenancy e Isolamento de Workspaces (WS-01)', () => {
  test('deve isolar completamente apontamentos e bancos IndexedDB entre workspaces diferentes', async ({
    page,
  }) => {
    // 1. Identifica os links dos workspaces no rail lateral
    const workspaceLinks = page.locator('nav a[href*="/workspaces/"]')
    await expect(workspaceLinks.nth(0)).toBeVisible({ timeout: 15000 })
    await expect(workspaceLinks.nth(1)).toBeVisible({ timeout: 15000 })

    // 2. Acessa o primeiro workspace (Workspace 1: TESTE)
    await workspaceLinks.nth(0).click()

    // 3. Aguarda a sincronização inicial do Workspace 1
    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 15000 })

    // 4. Valida que os apontamentos do Workspace 1 são carregados
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=#DEV-27').first()).toBeVisible({
      timeout: 10000,
    })

    // 5. Alterna para o segundo workspace (Workspace 2: WORKSPACE ISOLADO)
    await workspaceLinks.nth(1).click()

    // 6. Valida que a URL mudou para o segundo workspace
    await expect(page).toHaveURL(/.*\/workspaces\/ws-isolated-/, {
      timeout: 15000,
    })

    // 7. Garante que nenhum apontamento do Workspace 1 vazou para o Workspace 2
    await expect(page.locator('text=#DEV-27')).toHaveCount(0, {
      timeout: 10000,
    })
    await expect(
      page.locator('text=Nenhum registro para exibir.').first(),
    ).toBeVisible({ timeout: 10000 })

    // 8. Retorna para o Workspace 1
    await workspaceLinks.nth(0).click()
    await expect(page).toHaveURL(/.*\/workspaces\/ws-15c9d402-/, {
      timeout: 15000,
    })

    // 9. Garante que os apontamentos do Workspace 1 continuam intactos
    await expect(page.locator('text=#DEV-27').first()).toBeVisible({
      timeout: 15000,
    })
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
  })
})
