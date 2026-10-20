import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/electron-fixture'

const currentDir = dirname(fileURLToPath(import.meta.url))
const seedWorkspaces: {
  workspaces: Array<{
    id: string
    name: string
    status: string
    connections: Array<{ id: string; addonId: string }>
  }>
} = JSON.parse(
  readFileSync(resolve(currentDir, 'fixtures/seed-workspaces.json'), 'utf-8'),
)

const workspace = seedWorkspaces.workspaces.find(
  (candidate) => candidate.name === 'TESTE',
)
if (!workspace) throw new Error('SDK_FIXTURE_WORKSPACE_NOT_FOUND')
const connection = workspace.connections.find(
  (candidate) => candidate.addonId === 'mr-tick-datasource-fake',
)
if (!connection) throw new Error('SDK_FIXTURE_CONNECTION_NOT_FOUND')

test.use({
  runtimeProbeWorkspaceId: workspace.id,
  runtimeProbeConnectionId: connection.id,
})

async function openWorkspace(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  const actionTrigger = page.getByTestId('time-entry-actions-trigger').first()
  if (await actionTrigger.isVisible().catch(() => false)) {
    return
  }

  const workspaceTrigger = page
    .locator('nav a[href*="/workspaces/' + workspace.id + '"]')
    .or(page.getByRole('button', { name: workspace.name, exact: false }))
    .or(page.locator('nav a[href*="/workspaces/"]'))
    .first()

  if (await workspaceTrigger.isVisible().catch(() => false)) {
    await workspaceTrigger.click()
  } else {
    await expect(workspaceTrigger.or(actionTrigger)).toBeVisible({
      timeout: 20000,
    })
    if (await workspaceTrigger.isVisible().catch(() => false)) {
      await workspaceTrigger.click()
    }
  }

  await expect(actionTrigger).toBeVisible({ timeout: 30000 })
}

test('ciclo de vida de sugestões: emissão por addon, reatividade na UI, paridade no widget popover e aceite/descarte otimista', async ({
  electronApp,
  page,
}) => {
  test.setTimeout(120000)

  // 1. Abre o workspace no app principal
  await openWorkspace(page)

  // 2. Localiza a janela flutuante do widget timer
  await expect
    .poll(
      () =>
        electronApp.windows().filter((w) => w.url().includes('/widgets/timer'))
          .length,
      { timeout: 30000 },
    )
    .toBe(1)

  const widget = electronApp
    .windows()
    .find((w) => w.url().includes('/widgets/timer'))
  expect(widget).toBeDefined()
  if (!widget) return

  // 3. Emite uma sugestão via item no popover de addons da Timerbar
  const addonsButton = widget.getByTestId('timerbar-addons-button')
  await expect(addonsButton).toBeVisible({ timeout: 15000 })
  await addonsButton.click()

  const suggestItem = widget.getByTestId(
    'addon-timerbar-item-fake-db:suggest-today',
  )
  await expect(suggestItem).toBeVisible({ timeout: 15000 })
  await suggestItem.click()

  // 4. Validação reativa na janela principal: banner de sugestão e linha com badge/status de sugestão
  const mainBanner = page.getByTestId('time-entry-suggestion-banner')
  await expect(mainBanner).toBeVisible({ timeout: 15000 })

  const mainSuggestionRow = page
    .locator('[data-testid="time-entry-row"][data-is-suggestion="true"]')
    .first()
  await expect(mainSuggestionRow).toBeVisible({ timeout: 15000 })

  // 5. Validação no widget: abrir popover de visão de apontamentos
  await expect(widget.getByTestId('timerbar-overview-button')).toBeVisible({
    timeout: 15000,
  })
  await widget.getByTestId('timerbar-overview-button').click()

  // 6. Comprovar paridade entre janela principal e o popover do widget
  const widgetBanner = widget.getByTestId('time-entry-suggestion-banner')
  await expect(widgetBanner).toBeVisible({ timeout: 15000 })

  const widgetSuggestionRow = widget
    .locator('[data-testid="time-entry-row"][data-is-suggestion="true"]')
    .first()
  await expect(widgetSuggestionRow).toBeVisible({ timeout: 15000 })

  // 7. Aceitar a sugestão através do botão na linha do widget
  const acceptButton = widgetSuggestionRow.getByTestId(
    'suggestion-accept-button',
  )
  await expect(acceptButton).toBeVisible()
  await acceptButton.click()

  // 8. Otimismo e transição atômica: banner desparece e linha vira apontamento regular (não-sugestão)
  await expect(widgetBanner).not.toBeVisible({ timeout: 15000 })
  await expect(
    widget.locator('[data-testid="time-entry-row"][data-is-suggestion="true"]'),
  ).toHaveCount(0)

  // Na janela principal, a sugestão foi convertida automaticamente para apontamento normal
  await expect(mainBanner).not.toBeVisible({ timeout: 15000 })
  await expect(
    page.locator('[data-testid="time-entry-row"][data-is-suggestion="true"]'),
  ).toHaveCount(0)

  // 9. Teste de Descarte (Dismiss): emite uma segunda sugestão via popover de addons
  await addonsButton.click()
  await expect(suggestItem).toBeVisible({ timeout: 15000 })
  await suggestItem.click()

  // Banner reaparece na janela principal
  await expect(mainBanner).toBeVisible({ timeout: 15000 })
  const secondSuggestionRow = page
    .locator('[data-testid="time-entry-row"][data-is-suggestion="true"]')
    .first()
  await expect(secondSuggestionRow).toBeVisible({ timeout: 15000 })

  // Clica no botão Descartar do banner
  const dismissButton = mainBanner.getByTestId('suggestion-dismiss-all-button')
  await expect(dismissButton).toBeVisible()
  await dismissButton.click()

  // Comprova que o banner some e a linha foi removida do DOM em ambas as janelas
  await expect(mainBanner).not.toBeVisible({ timeout: 15000 })
  await expect(
    page.locator('[data-testid="time-entry-row"][data-is-suggestion="true"]'),
  ).toHaveCount(0)

  await expect(widgetBanner).not.toBeVisible({ timeout: 15000 })
  await expect(
    widget.locator('[data-testid="time-entry-row"][data-is-suggestion="true"]'),
  ).toHaveCount(0)
})
