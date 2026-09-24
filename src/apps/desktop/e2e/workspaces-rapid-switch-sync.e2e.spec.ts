import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Troca Rápida de Workspaces durante Sincronização (STR-04)', () => {
  test('deve alternar workspaces rapidamente durante sincronização ativa sem locks residuais ou crash (STR-04)', async ({
    page,
  }) => {
    // 1. Identifica os links dos workspaces no rail lateral de navegação
    const workspaceLinks = page.locator('nav a[href*="/workspaces/"]')
    await expect(workspaceLinks.nth(0)).toBeVisible({ timeout: 15000 })
    await expect(workspaceLinks.nth(1)).toBeVisible({ timeout: 15000 })

    // 2. Acessa o Workspace 1 (TESTE) e aguarda sincronização inicial
    await workspaceLinks.nth(0).click()

    const syncIndicator = page.locator(
      '[data-testid="sync-status-indicator"][data-status="synced"]',
    )
    await expect(syncIndicator).toBeVisible({ timeout: 30000 })

    // 3. Garante que os registros do Workspace 1 estão visíveis
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers.first()).toBeVisible({ timeout: 15000 })
    const initialCountWs1 = await actionTriggers.count()
    expect(initialCountWs1).toBeGreaterThan(0)

    // 4. Inicia uma sincronização manual no Workspace 1
    const statusBtn = page.locator('[data-testid="sync-status-indicator"]')
    await statusBtn.click({ force: true })
    const syncAllBtn = page.locator('[data-testid="sync-all-button"]')
    await expect(syncAllBtn).toBeVisible({ timeout: 5000 })
    await syncAllBtn.click({ force: true })

    // 5. IMEDIATAMENTE (durante o sync ativo), alterna para o Workspace 2 no sidebar
    await workspaceLinks.nth(1).click()

    // 6. Valida que a navegação para o Workspace 2 ocorre com sucesso
    await expect(page).toHaveURL(/.*\/workspaces\/ws-isolated-/, {
      timeout: 15000,
    })

    // Valida que o Workspace 2 carrega sua view limpa sem registros vazados
    await expect(
      page.locator('text=Nenhum registro para exibir.').first(),
    ).toBeVisible({ timeout: 15000 })

    // 7. IMEDIATAMENTE alterna de volta para o Workspace 1
    await workspaceLinks.nth(0).click()
    await expect(page).toHaveURL(/.*\/workspaces\/ws-15c9d402-/, {
      timeout: 15000,
    })

    // 8. Valida que o Workspace 1 re-inicializa o banco e o motor de sincronização perfeitamente
    await expect(syncIndicator).toBeVisible({ timeout: 60000 })

    // 9. Valida que os apontamentos do Workspace 1 permanecem íntegros e funcionais
    await expect(actionTriggers).toHaveCount(initialCountWs1, {
      timeout: 15000,
    })
    await expect(page.locator('text=#DEV-27').first()).toBeVisible({
      timeout: 15000,
    })
  })
})
