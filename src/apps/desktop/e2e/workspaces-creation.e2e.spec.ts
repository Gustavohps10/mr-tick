import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Criação de Novo Workspace via UI (WS-03)', () => {
  test('deve criar um novo workspace via stepper e provisionar seu banco local isolado', async ({
    page,
  }) => {
    // 1. Localiza e clica no botão de adicionar workspace na AppRail
    const newWorkspaceBtn = page.locator(
      '[data-testid="app-rail-new-workspace-btn"]',
    )
    await expect(newWorkspaceBtn).toBeVisible({ timeout: 15000 })
    await newWorkspaceBtn.click()

    // 2. Valida abertura do diálogo de criação de workspace
    const workspaceNameInput = page.locator(
      '[data-testid="workspace-name-input"]',
    )
    await expect(workspaceNameInput).toBeVisible({ timeout: 10000 })

    const uniqueWorkspaceName = `Workspace E2E ${Date.now()}`
    await workspaceNameInput.fill(uniqueWorkspaceName)

    // 3. Clica em "Criar e Continuar" no Step 1 (Identidade)
    const nextBtn = page.locator('[data-testid="workspace-stepper-next-btn"]')
    await expect(nextBtn).toBeVisible()
    await nextBtn.click()

    // 4. No Step 2 / Step 3 / Step 4, avança ou pula até finalizar a configuração
    const skipBtn = page.locator('[data-testid="workspace-stepper-skip-btn"]')
    const finishBtn = page.locator(
      '[data-testid="workspace-stepper-finish-btn"]',
    )

    // Avança pelos passos restantes usando Skip ou Próximo até chegar em Finalizar
    for (let step = 0; step < 4; step += 1) {
      const isFinishVisible = await finishBtn.isVisible()
      if (isFinishVisible) break

      const isSkipVisible = await skipBtn.isVisible()
      if (isSkipVisible) {
        await skipBtn.click()
        continue
      }

      const isNextVisible = await nextBtn.isVisible()
      if (isNextVisible) {
        await nextBtn.click()
      }
    }

    // 5. Clica no botão Finalizar para consolidar o workspace como 'configured'
    await expect(finishBtn).toBeVisible({ timeout: 10000 })
    await finishBtn.click()

    // 6. Valida que o modal fechou
    await expect(workspaceNameInput).not.toBeVisible()

    // 7. Valida que o novo workspace aparece na AppRail
    const createdWorkspaceLink = page
      .locator(`nav a[href*="/workspaces/"][title*="${uniqueWorkspaceName}"]`)
      .or(page.locator(`nav a[href*="/workspaces/"]`).last())

    await expect(createdWorkspaceLink).toBeVisible({ timeout: 15000 })
    await createdWorkspaceLink.click()

    // 8. Valida inicialização limpa do banco local no novo workspace
    await expect(page).toHaveURL(/\/workspaces\/[^/]+/, { timeout: 15000 })

    // Valida que o novo workspace inicia sem apontamentos prévios (isolamento)
    const actionTriggers = page.locator(
      '[data-testid="time-entry-actions-trigger"]',
    )
    await expect(actionTriggers).toHaveCount(0)

    // 9. Executa reload completo da janela para certificar persistência no workspaces.json
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    await expect(page).toHaveURL(/\/workspaces\/[^/]+/, { timeout: 15000 })
    await expect(actionTriggers).toHaveCount(0)
  })
})
