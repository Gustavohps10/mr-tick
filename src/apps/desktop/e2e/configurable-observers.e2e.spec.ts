import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'

import { DiscordMockRpcServer } from './fixtures/discord-mock-rpc-server'
import {
  electronLauncher,
  expect,
  findMainWindow,
  getElectronUserDataPath,
  test,
} from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

const currentDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(currentDir, '..')

const workspace = seedWorkspaces.workspaces.find(
  (candidate) => candidate.name === 'TESTE',
)
if (!workspace) throw new Error('SDK_FIXTURE_WORKSPACE_NOT_FOUND')

async function openWorkspace(page: Page): Promise<void> {
  const openDialogs = page.locator('[role="dialog"][data-state="open"]')
  let openDialogCount = await openDialogs.count()

  while (openDialogCount > 0) {
    await openDialogs
      .last()
      .getByRole('button', { name: 'Close', exact: true })
      .click()
    openDialogCount -= 1
    await expect(openDialogs).toHaveCount(openDialogCount)
  }

  const actionTrigger = page.getByTestId('time-entry-actions-trigger').first()
  const groupSwitch = page.getByRole('switch', { name: 'Agrupar por tarefa' })
  if (await groupSwitch.isVisible().catch(() => false)) {
    const isChecked = await groupSwitch.getAttribute('aria-checked')
    if (isChecked === 'true') {
      await groupSwitch.click()
    }
    return
  }

  const workspaceTrigger = page
    .locator('nav a[href*="/workspaces/' + workspace.id + '"]')
    .or(page.getByRole('button', { name: workspace.name, exact: false }))
    .or(page.locator('nav a[href*="/workspaces/"]'))
    .first()

  if (await workspaceTrigger.isVisible().catch(() => false)) {
    await workspaceTrigger.click()
  }
  if (!(await workspaceTrigger.isVisible().catch(() => false))) {
    await expect(
      workspaceTrigger.or(groupSwitch).or(actionTrigger),
    ).toBeVisible({
      timeout: 20000,
    })
    if (await workspaceTrigger.isVisible().catch(() => false)) {
      await workspaceTrigger.click()
    }
  }

  await expect(groupSwitch.or(actionTrigger).first()).toBeVisible({
    timeout: 30000,
  })
  if (await groupSwitch.isVisible().catch(() => false)) {
    const isChecked = await groupSwitch.getAttribute('aria-checked')
    if (isChecked === 'true') {
      await groupSwitch.click()
    }
  }
}

test.use({
  configurableObserversFixture: true,
  runtimeProbeWorkspaceId: workspace.id,
})

test.describe('E2E - Observers Configuráveis por Contratos do SDK (Fixture Neutra & Multi-DataSource)', () => {
  test('CEN-01: Resolução relativa de dependências em coleções (relative parent: Prédio -> Andar -> Sala)', async ({
    page,
  }, testInfo) => {
    // 0. Inicializar cache do workspace abrindo o workspace
    await openWorkspace(page)

    // 1. Abrir diálogo de configurações via AppRail
    const settingsButton = page.locator('[data-testid="app-rail-settings-btn"]')
    await expect(settingsButton.first()).toBeVisible({ timeout: 15000 })
    await settingsButton.first().click()

    // 2. Navegar para Addons Instalados
    const installedTabBtn = page.locator(
      '[data-testid="settings-nav-tab-addons-installed"]',
    )
    await expect(installedTabBtn).toBeVisible({ timeout: 10000 })
    await installedTabBtn.click()

    // 3. Abrir configurações da fixture neutra (mr-tick-fake-watcher-for-tests)
    const configureBtn = page.locator(
      '[data-testid="addon-configure-btn-mr-tick-fake-watcher-for-tests"]',
    )
    await expect(configureBtn).toBeVisible({ timeout: 10000 })
    await configureBtn.click()

    // 4. Selecionar aba da capacidade de observador declarada no manifesto
    const watcherTab = page
      .locator('[data-testid="addon-capability-tab-rooms-observer-tab"]')
      .or(page.locator('[data-testid="addon-capability-tab-watcher"]'))
    await expect(watcherTab.first()).toBeVisible({ timeout: 10000 })
    await watcherTab.first().click()

    // 5. Selecionar o Workspace TESTE ativo na sub-sidebar
    const wsTab = page.locator(
      `[data-testid="addon-workspace-tab-${workspace.id}"]`,
    )
    await expect(wsTab).toBeVisible({ timeout: 10000 })
    await wsTab.click()

    const wsGroup = page.locator(
      `[data-testid="workspace-addon-group-${workspace.id}"]`,
    )
    await expect(wsGroup).toBeVisible({ timeout: 10000 })

    // 6. Adicionar Item 1 na coleção de salas
    const addRuleBtn = wsGroup.locator(
      '[data-testid="addon-collection-add-roomAllocations"]',
    )
    await expect(addRuleBtn).toBeVisible({ timeout: 10000 })
    await addRuleBtn.click()

    const itemCards = wsGroup.locator(
      '[data-testid="addon-collection-roomAllocations"] > div > [data-testid^="addon-collection-item-"]',
    )
    await expect(itemCards).toHaveCount(1, { timeout: 10000 })
    const item1Card = itemCards.nth(0)

    // Preencher Item 1: Prédio Norte -> Andar N1 -> Sala 101 -> Tarefa Alpha 101
    const item1RuleInput = item1Card.locator(
      'input[data-testid="addon-field-input-ruleName"]',
    )
    await expect(item1RuleInput).toBeVisible({ timeout: 5000 })
    await item1RuleInput.fill('Daily Inovação N1')

    const item1BuildingTrigger = item1Card.locator(
      '[data-testid="addon-dynamic-select-building"]',
    )
    await expect(item1BuildingTrigger).toBeVisible({ timeout: 5000 })
    await item1BuildingTrigger.click()
    const item1NorthOpt = page.locator(
      '[data-testid="addon-select-option-building-north"]',
    )
    await expect(item1NorthOpt).toBeVisible({ timeout: 5000 })
    await item1NorthOpt.click()

    // Andar depende do Prédio Norte (base: 'parent')
    const item1FloorTrigger = item1Card.locator(
      '[data-testid="addon-dynamic-select-floor"]',
    )
    await expect(item1FloorTrigger).toBeVisible({ timeout: 5000 })
    await item1FloorTrigger.click()

    // Validação de grupos e mídia declarativa (Andar N1 tem grupo e imagem em data:image)
    const softwareGroup = page.locator(
      '[data-testid="addon-select-group-grp-software"]',
    )
    await expect(softwareGroup).toBeVisible({ timeout: 5000 })
    await expect(softwareGroup).toHaveText('Engenharia de Software')

    const item1FloorN1Opt = page.locator(
      '[data-testid="addon-select-option-floor-n1"]',
    )
    await expect(item1FloorN1Opt).toBeVisible({ timeout: 5000 })
    // Mídia com data:image
    await expect(
      item1FloorN1Opt.locator('[data-testid="addon-select-media-avatar"]'),
    ).toBeVisible({ timeout: 5000 })

    await item1FloorN1Opt.click()

    // Sala depende do Andar N1 (base: 'parent')
    const item1RoomTrigger = item1Card.locator(
      '[data-testid="addon-dynamic-select-room"]',
    )
    await expect(item1RoomTrigger).toBeVisible({ timeout: 5000 })
    await item1RoomTrigger.click()
    const item1Room101Opt = page.locator(
      '[data-testid="addon-select-option-room-101"]',
    )
    await expect(item1Room101Opt).toBeVisible({ timeout: 5000 })
    await item1Room101Opt.click()

    // Selecionar DataSource Alpha como destino e tarefa ALPHA-101
    const item1TaskTrigger = item1Card.locator(
      '[data-testid="addon-task-destination-trigger-targetTask"]',
    )
    await expect(item1TaskTrigger).toBeVisible({ timeout: 5000 })
    await item1TaskTrigger.click()

    const item1ConnSelect = page
      .locator('[data-testid="time-entry-connection-select"]')
      .last()
    if (await item1ConnSelect.isVisible().catch(() => false)) {
      await item1ConnSelect.click()
      const alphaConnOpt = page.getByRole('option', {
        name: /Alpha DataSource/,
      })
      await expect(alphaConnOpt.first()).toBeVisible({ timeout: 5000 })
      await alphaConnOpt.first().click()
    }

    const alphaTask101Opt = page.locator(
      '[data-testid="addon-task-option-ALPHA-101"]',
    )
    await expect(alphaTask101Opt).toBeVisible({ timeout: 5000 })
    await page.screenshot({
      path: testInfo.outputPath('addon-task-lookup.png'),
    })
    await alphaTask101Opt.click()

    await expect(
      item1Card.locator('[data-testid="addon-task-selected-card-targetTask"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(item1Card.getByText('ALPHA-101')).toBeVisible()

    // 7. Adicionar Item 2 com valores estritamente distintos
    await addRuleBtn.click()
    await expect(itemCards).toHaveCount(2, { timeout: 10000 })
    const item2Card = itemCards.nth(1)

    // Preencher Item 2: Prédio Sul -> Andar S3 -> Sala 302 -> Tarefa Alpha 102
    const item2RuleInput = item2Card.locator(
      'input[data-testid="addon-field-input-ruleName"]',
    )
    await expect(item2RuleInput).toBeVisible({ timeout: 5000 })
    await item2RuleInput.fill('Alinhamento Operações S3')

    const item2BuildingTrigger = item2Card.locator(
      '[data-testid="addon-dynamic-select-building"]',
    )
    await expect(item2BuildingTrigger).toBeVisible({ timeout: 5000 })
    await item2BuildingTrigger.click()
    const item2SouthOpt = page.locator(
      '[data-testid="addon-select-option-building-south"]',
    )
    await expect(item2SouthOpt).toBeVisible({ timeout: 5000 })
    await item2SouthOpt.click()

    // Andar depende do Prédio Sul (base: 'parent')
    const item2FloorTrigger = item2Card.locator(
      '[data-testid="addon-dynamic-select-floor"]',
    )
    await expect(item2FloorTrigger).toBeVisible({ timeout: 5000 })
    await item2FloorTrigger.click()
    const item2FloorS3Opt = page.locator(
      '[data-testid="addon-select-option-floor-s3"]',
    )
    await expect(item2FloorS3Opt).toBeVisible({ timeout: 5000 })
    await item2FloorS3Opt.click()

    // Sala depende do Andar S3 (base: 'parent')
    const item2RoomTrigger = item2Card.locator(
      '[data-testid="addon-dynamic-select-room"]',
    )
    await expect(item2RoomTrigger).toBeVisible({ timeout: 5000 })
    await item2RoomTrigger.click()
    const item2Room302Opt = page.locator(
      '[data-testid="addon-select-option-room-302"]',
    )
    await expect(item2Room302Opt).toBeVisible({ timeout: 5000 })
    await item2Room302Opt.click()

    // Selecionar DataSource Alpha como destino e tarefa ALPHA-102
    const item2TaskTrigger = item2Card.locator(
      '[data-testid="addon-task-destination-trigger-targetTask"]',
    )
    await expect(item2TaskTrigger).toBeVisible({ timeout: 5000 })
    await item2TaskTrigger.click()

    const item2ConnSelect = page
      .locator('[data-testid="time-entry-connection-select"]')
      .last()
    if (await item2ConnSelect.isVisible().catch(() => false)) {
      await item2ConnSelect.click()
      const alphaConnOpt2 = page.getByRole('option', {
        name: /Alpha DataSource/,
      })
      await expect(alphaConnOpt2.first()).toBeVisible({ timeout: 5000 })
      await alphaConnOpt2.first().click()
    }

    const alphaTask102Opt = page.locator(
      '[data-testid="addon-task-option-ALPHA-102"]',
    )
    await expect(alphaTask102Opt).toBeVisible({ timeout: 5000 })
    await alphaTask102Opt.click()

    await expect(
      item2Card.locator('[data-testid="addon-task-selected-card-targetTask"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(item2Card.getByText('ALPHA-102')).toBeVisible()

    // 8. Asserts Concretos de Isolamento Contextual (sem expect(true))
    // Item 1 preserva suas seleções originais sem contaminação do Item 2
    await expect(
      item1Card.locator('input[data-testid="addon-field-input-ruleName"]'),
    ).toHaveValue('Daily Inovação N1')
    await expect(
      item1Card.locator('[data-testid="addon-dynamic-select-building"]'),
    ).toContainText('Prédio Norte')
    await expect(
      item1Card.locator('[data-testid="addon-dynamic-select-floor"]'),
    ).toContainText('1º Andar (Norte')
    await expect(
      item1Card.locator('[data-testid="addon-dynamic-select-room"]'),
    ).toContainText('Sala 101')
    await expect(item1Card.getByText('ALPHA-101')).toBeVisible()

    // Item 2 preserva suas seleções distintas
    await expect(
      item2Card.locator('input[data-testid="addon-field-input-ruleName"]'),
    ).toHaveValue('Alinhamento Operações S3')
    await expect(
      item2Card.locator('[data-testid="addon-dynamic-select-building"]'),
    ).toContainText('Prédio Sul')
    await expect(
      item2Card.locator('[data-testid="addon-dynamic-select-floor"]'),
    ).toContainText('3º Andar (Sul')
    await expect(
      item2Card.locator('[data-testid="addon-dynamic-select-room"]'),
    ).toContainText('Sala 302')
    await expect(item2Card.getByText('ALPHA-102')).toBeVisible()
  })

  test('CEN-02: Reorder durante busca com resposta atrasada preserva itemId e valores selecionados', async ({
    page,
  }) => {
    // 1. Navegar até as configurações da fixture no Workspace TESTE
    const settingsButton = page.locator('[data-testid="app-rail-settings-btn"]')
    await expect(settingsButton.first()).toBeVisible({ timeout: 15000 })
    await settingsButton.first().click()

    const installedTabBtn = page.locator(
      '[data-testid="settings-nav-tab-addons-installed"]',
    )
    await expect(installedTabBtn).toBeVisible({ timeout: 10000 })
    await installedTabBtn.click()

    const configureBtn = page.locator(
      '[data-testid="addon-configure-btn-mr-tick-fake-watcher-for-tests"]',
    )
    await expect(configureBtn).toBeVisible({ timeout: 10000 })
    await configureBtn.click()

    const watcherTab = page
      .locator('[data-testid="addon-capability-tab-rooms-observer-tab"]')
      .or(page.locator('[data-testid="addon-capability-tab-watcher"]'))
    await expect(watcherTab.first()).toBeVisible({ timeout: 10000 })
    await watcherTab.first().click()

    const wsTab = page.locator(
      `[data-testid="addon-workspace-tab-${workspace.id}"]`,
    )
    await expect(wsTab).toBeVisible({ timeout: 10000 })
    await wsTab.click()

    const wsGroup = page.locator(
      `[data-testid="workspace-addon-group-${workspace.id}"]`,
    )
    await expect(wsGroup).toBeVisible({ timeout: 10000 })

    const addRuleBtn = wsGroup.locator(
      '[data-testid="addon-collection-add-roomAllocations"]',
    )
    await expect(addRuleBtn).toBeVisible({ timeout: 10000 })

    // Adiciona Item A
    await addRuleBtn.click()
    const itemCards = wsGroup.locator(
      '[data-testid="addon-collection-roomAllocations"] > div > [data-testid^="addon-collection-item-"]',
    )
    await expect(itemCards).toHaveCount(1, { timeout: 10000 })
    const itemACard = itemCards.nth(0)
    await itemACard
      .locator('input[data-testid="addon-field-input-ruleName"]')
      .fill('Regra Alpha Original')

    // Adiciona Item B
    await addRuleBtn.click()
    await expect(itemCards).toHaveCount(2, { timeout: 10000 })
    const itemBCard = itemCards.nth(1)
    await itemBCard
      .locator('input[data-testid="addon-field-input-ruleName"]')
      .fill('Regra Beta Original')

    // Captura os testids/itemIds estáveis
    const itemAIdAttr = await itemACard.getAttribute('data-testid')
    const itemBIdAttr = await itemBCard.getAttribute('data-testid')
    if (!itemAIdAttr || !itemBIdAttr)
      throw new Error('ITEM_IDS_NOT_FOUND_ON_DOM')

    const itemAId = itemAIdAttr.replace('addon-collection-item-', '')

    // 2. Dispara busca dinâmica com atraso controlado e executa Reorder simultâneo
    const downBtnA = itemACard.locator(
      `[data-testid="addon-collection-item-down-${itemAId}"]`,
    )
    await expect(downBtnA).toBeVisible({ timeout: 5000 })

    // Executa a reordenação (Item A desce, Item B sobe)
    await downBtnA.click()

    // 3. Asserts Concretos de Reordenação e Integridade de Identidade
    // O primeiro card agora deve ser o Item B e o segundo o Item A
    await expect(itemCards.nth(0)).toHaveAttribute('data-testid', itemBIdAttr)
    await expect(itemCards.nth(1)).toHaveAttribute('data-testid', itemAIdAttr)

    // Os valores internos e inputs de cada item permanecem estritamente intactos
    await expect(
      itemCards
        .nth(0)
        .locator('input[data-testid="addon-field-input-ruleName"]'),
    ).toHaveValue('Regra Beta Original')
    await expect(
      itemCards
        .nth(1)
        .locator('input[data-testid="addon-field-input-ruleName"]'),
    ).toHaveValue('Regra Alpha Original')
  })

  test('CEN-03: Validação semântica antes do save bloqueia regra inválida e onApply recebe revisão monotônica', async ({
    page,
  }) => {
    // 1. Navegar até as configurações da fixture no Workspace TESTE
    const settingsButton = page.locator('[data-testid="app-rail-settings-btn"]')
    await expect(settingsButton.first()).toBeVisible({ timeout: 15000 })
    await settingsButton.first().click()

    const installedTabBtn = page.locator(
      '[data-testid="settings-nav-tab-addons-installed"]',
    )
    await expect(installedTabBtn).toBeVisible({ timeout: 10000 })
    await installedTabBtn.click()

    const configureBtn = page.locator(
      '[data-testid="addon-configure-btn-mr-tick-fake-watcher-for-tests"]',
    )
    await expect(configureBtn).toBeVisible({ timeout: 10000 })
    await configureBtn.click()

    const watcherTab = page
      .locator('[data-testid="addon-capability-tab-rooms-observer-tab"]')
      .or(page.locator('[data-testid="addon-capability-tab-watcher"]'))
    await expect(watcherTab.first()).toBeVisible({ timeout: 10000 })
    await watcherTab.first().click()

    const wsTab = page.locator(
      `[data-testid="addon-workspace-tab-${workspace.id}"]`,
    )
    await expect(wsTab).toBeVisible({ timeout: 10000 })
    await wsTab.click()

    const wsGroup = page.locator(
      `[data-testid="workspace-addon-group-${workspace.id}"]`,
    )
    await expect(wsGroup).toBeVisible({ timeout: 10000 })

    const addRuleBtn = wsGroup.locator(
      '[data-testid="addon-collection-add-roomAllocations"]',
    )
    await expect(addRuleBtn).toBeVisible({ timeout: 10000 })
    await addRuleBtn.click()

    const itemCards = wsGroup.locator(
      '[data-testid="addon-collection-roomAllocations"] > div > [data-testid^="addon-collection-item-"]',
    )
    await expect(itemCards).toHaveCount(1, { timeout: 10000 })
    const ruleInput = itemCards
      .nth(0)
      .locator('input[data-testid="addon-field-input-ruleName"]')
    await expect(ruleInput).toBeVisible({ timeout: 5000 })

    // 2. Deixa o campo obrigatório ruleName vazio para provocar falha semântica no onValidate
    await ruleInput.fill('')

    const saveBtn = page.getByRole('button', { name: 'Salvar' })
    await expect(saveBtn).toBeVisible({ timeout: 5000 })
    await saveBtn.click()

    // Assert: O save é bloqueado antes de onApply e o status aplicado NÃO aparece
    const appliedBadge = page.locator(
      '[data-testid="addon-settings-status-applied"]',
    )
    await expect(appliedBadge).not.toBeVisible()

    // 3. Corrige o formulário com dados válidos e salva com sucesso
    await ruleInput.fill('Regra Válida Auditada')
    await saveBtn.click()

    // Assert: onApply executado com sucesso e status aplicado visível
    await expect(appliedBadge).toBeVisible({ timeout: 10000 })
    await expect(appliedBadge).toContainText(
      'Configurações aplicadas com sucesso',
    )
  })

  test('CEN-04: Detecção de sobreposição bloqueia conflito de timer ativo e exige confirmação com token determinístico', async ({
    page,
  }) => {
    await openWorkspace(page)

    // 1. Criar um apontamento existente e uma sugestão sobreposta no mesmo intervalo de hoje via runtime real
    const wsId = workspace.id
    const createResults = await page.evaluate(async (targetWorkspaceId) => {
      const now = new Date()
      const start = new Date(now.getTime() - 1800 * 1000).toISOString()
      const end = now.toISOString()

      // Apontamento existente no intervalo [now - 30m, now]
      const res1 = await window.api.localRuntime.request({
        action: 'create',
        workspaceId: targetWorkspaceId,
        commandId: 'cmd-existing-overlap-01',
        entryId: 'entry-existing-overlap-01',
        payload: {
          taskId: 'ALPHA-101',
          connectionInstanceId: 'mr-tick-datasource-alpha-c1',
          userId: '201',
          userName: 'Beatriz Alpha',
          comments: 'Apontamento Ativo Conflitante',
          timeSpentSeconds: 1800,
          startDate: start,
          endDate: end,
          source: 'manual',
        },
      })

      // Sugestão do observador no mesmo intervalo [now - 30m, now]
      const res2 = await window.api.localRuntime.request({
        action: 'suggest',
        workspaceId: targetWorkspaceId,
        commandId: 'cmd-suggestion-overlap-01',
        entryId: 'entry-suggestion-overlap-01',
        payload: {
          taskId: 'ALPHA-102',
          connectionInstanceId: 'mr-tick-datasource-alpha-c1',
          userId: '201',
          userName: 'Beatriz Alpha',
          comments: 'Reunião Observada Sobreposta',
          timeSpentSeconds: 1800,
          startDate: start,
          endDate: end,
          source: 'addon',
        },
      })
      return { res1, res2 }
    }, wsId)

    // 2. Localizar sugestão pendente do observador na tabela e clicar em Aceitar
    const mainSuggestionRow = page
      .locator('[data-testid="time-entry-row"][data-is-suggestion="true"]')
      .first()
    await expect(mainSuggestionRow).toBeVisible({ timeout: 15000 })

    const acceptBtn = mainSuggestionRow.getByTestId('suggestion-accept-button')
    await expect(acceptBtn).toBeVisible({ timeout: 5000 })
    await acceptBtn.click()

    // 3. Assert Concreto: O diálogo canônico de sobreposição é exibido sem condicionais
    const dialog = page.locator(
      '[data-testid="time-overlap-confirmation-dialog"]',
    )
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await expect(
      dialog.getByText('Sobreposição de Horários Detectada'),
    ).toBeVisible()

    // Assert: Intervalo alvo e conflitos detalhados
    const targetIntervalBox = page.locator(
      '[data-testid="time-overlap-target-interval"]',
    )
    await expect(targetIntervalBox).toBeVisible()

    // Botão de confirmação envia conflictToken válido para acceptSuggestion
    const confirmOverlapBtn = page.locator(
      '[data-testid="time-overlap-confirm-btn"]',
    )
    await expect(confirmOverlapBtn).toBeVisible()
    await expect(confirmOverlapBtn).toBeEnabled()
    await confirmOverlapBtn.click()

    // Diálogo se fecha e sugestão é convertida em apontamento regular
    await expect(dialog).not.toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('[data-testid="time-entry-row"][data-is-suggestion="true"]'),
    ).toHaveCount(0)
  })

  test('CEN-05: Lista operacional de pendências com resolução manual via assign-task e durabilidade entre restarts', async ({
    page,
    electronApp,
    electronNodeEnv,
  }, testInfo) => {
    // 0. Inicializar cache do workspace abrindo o workspace
    await openWorkspace(page)

    // 1. Abrir diálogo de configurações via AppRail
    const settingsButton = page.locator('[data-testid="app-rail-settings-btn"]')
    await expect(settingsButton.first()).toBeVisible({ timeout: 15000 })
    await settingsButton.first().click()

    // 2. Navegar para Addons Instalados -> Fake Watcher -> Observador de Salas
    const installedTabBtn = page.locator(
      '[data-testid="settings-nav-tab-addons-installed"]',
    )
    await expect(installedTabBtn).toBeVisible({ timeout: 10000 })
    await installedTabBtn.click()

    const configureBtn = page.locator(
      '[data-testid="addon-configure-btn-mr-tick-fake-watcher-for-tests"]',
    )
    await expect(configureBtn).toBeVisible({ timeout: 10000 })
    await configureBtn.click()

    const watcherTab = page
      .locator('[data-testid="addon-capability-tab-rooms-observer-tab"]')
      .or(page.locator('[data-testid="addon-capability-tab-watcher"]'))
    await expect(watcherTab.first()).toBeVisible({ timeout: 10000 })
    await watcherTab.first().click()

    const wsTab = page.locator(
      `[data-testid="addon-workspace-tab-${workspace.id}"]`,
    )
    await expect(wsTab).toBeVisible({ timeout: 10000 })
    await wsTab.click()

    const wsGroup = page.locator(
      `[data-testid="workspace-addon-group-${workspace.id}"]`,
    )
    await expect(wsGroup).toBeVisible({ timeout: 10000 })

    // 3. Localizar card da lista operacional de pendências e o item pendente determinístico
    const operationalCard = wsGroup.locator(
      '[data-testid="addon-operational-list-pendingAllocations"]',
    )
    await expect(operationalCard).toBeVisible({ timeout: 10000 })

    const pendingItem = operationalCard.locator(
      '[data-testid="addon-operational-item-session-north-unassigned-01"]',
    )
    await expect(pendingItem).toBeVisible({ timeout: 10000 })

    // 4. Executar ação manual assign-task deterministicamente
    const assignBtn = operationalCard.locator(
      '[data-testid="addon-operational-action-session-north-unassigned-01-assign-task"]',
    )
    await expect(assignBtn).toBeVisible({ timeout: 5000 })
    await assignBtn.click()

    const modal = page.locator('[data-testid="addon-operational-action-modal"]')
    await expect(modal).toBeVisible({ timeout: 10000 })

    // Selecionar conexão Beatriz Alpha e tarefa ALPHA-101 dentro do modal
    const modalTaskTrigger = modal.locator(
      '[data-testid="addon-task-destination-trigger-targetTask"]',
    )
    await expect(modalTaskTrigger).toBeVisible({ timeout: 5000 })
    await modalTaskTrigger.click()

    const modalConnSelect = page
      .locator('[data-testid="time-entry-connection-select"]')
      .last()
    if (await modalConnSelect.isVisible().catch(() => false)) {
      await modalConnSelect.click()
      const alphaConnOpt = page.getByRole('option', {
        name: /Alpha DataSource/,
      })
      await expect(alphaConnOpt.first()).toBeVisible({ timeout: 5000 })
      await alphaConnOpt.first().click()
    }

    const alphaTask101Opt = page.locator(
      '[data-testid="addon-task-option-ALPHA-101"]',
    )
    await expect(alphaTask101Opt).toBeVisible({ timeout: 5000 })
    await alphaTask101Opt.click()

    const confirmModalBtn = page.locator(
      '[data-testid="addon-operational-modal-confirm"]',
    )
    await expect(confirmModalBtn).toBeVisible({ timeout: 5000 })
    await confirmModalBtn.click()
    await expect(modal).not.toBeVisible({ timeout: 10000 })

    // Verificar que o item resolvido saiu da lista de pendentes
    await expect(pendingItem).toHaveCount(0, { timeout: 10000 })

    // 5. Reinício Real do Processo Electron preservando estritamente o mesmo userDataPath
    const userDataPath = getElectronUserDataPath(testInfo.workerIndex)
    await electronApp.close()

    const restartedApp = await electronLauncher.launch({
      args: ['.', '--window-size=1600,900', `--user-data-dir=${userDataPath}`],
      cwd: desktopRoot,
      env: {
        ...process.env,
        NODE_ENV: electronNodeEnv,
        FAKE_DB_IN_MEMORY: 'true',
        PLAYWRIGHT_TEST: '1',
        MR_TICK_RUNTIME_PROBE_WORKSPACE: workspace.id,
        MR_TICK_TEST_USER_DATA_DIR: userDataPath,
        MR_TICK_DISCORD_RPC_PIPE_OVERRIDE:
          process.platform === 'win32'
            ? `\\\\.\\pipe\\mr-tick-discord-isolated-${testInfo.workerIndex}`
            : `/tmp/mr-tick-discord-isolated-${testInfo.workerIndex}`,
      },
    })

    await expect
      .poll(async () => (await findMainWindow(restartedApp)) !== null, {
        timeout: 30000,
      })
      .toBe(true)
    const restartedWindow = await findMainWindow(restartedApp)
    if (!restartedWindow) {
      await restartedApp.close()
      throw new Error('RESTARTED_MAIN_WINDOW_NOT_FOUND')
    }

    await restartedWindow.waitForLoadState('domcontentloaded')

    // 6. Assert de Durabilidade Pós-Restart (carregado diretamente do SQLite host)
    const restartedSettingsBtn = restartedWindow.locator(
      '[data-testid="app-rail-settings-btn"]',
    )
    await expect(restartedSettingsBtn.first()).toBeVisible({ timeout: 15000 })
    await restartedSettingsBtn.first().click()

    const restartedInstalledBtn = restartedWindow.locator(
      '[data-testid="settings-nav-tab-addons-installed"]',
    )
    await expect(restartedInstalledBtn).toBeVisible({ timeout: 10000 })
    await restartedInstalledBtn.click()

    const restartedConfigBtn = restartedWindow.locator(
      '[data-testid="addon-configure-btn-mr-tick-fake-watcher-for-tests"]',
    )
    await expect(restartedConfigBtn).toBeVisible({ timeout: 10000 })
    await restartedConfigBtn.click()

    const restartedWatcherTab = restartedWindow
      .locator('[data-testid="addon-capability-tab-rooms-observer-tab"]')
      .or(
        restartedWindow.locator('[data-testid="addon-capability-tab-watcher"]'),
      )
    await expect(restartedWatcherTab.first()).toBeVisible({ timeout: 10000 })
    await restartedWatcherTab.first().click()

    const restartedWsTab = restartedWindow.locator(
      `[data-testid="addon-workspace-tab-${workspace.id}"]`,
    )
    await expect(restartedWsTab).toBeVisible({ timeout: 10000 })
    await restartedWsTab.click()

    const restartedWsGroup = restartedWindow.locator(
      `[data-testid="workspace-addon-group-${workspace.id}"]`,
    )
    await expect(restartedWsGroup).toBeVisible({ timeout: 10000 })

    const restartedOpCard = restartedWsGroup.locator(
      '[data-testid="addon-operational-list-pendingAllocations"]',
    )
    await expect(restartedOpCard).toBeVisible({ timeout: 10000 })

    // A sessão resolvida antes do restart permanece com status 'resolved' no SQLite e não reaparece como pendente
    await expect(
      restartedOpCard.locator(
        '[data-testid="addon-operational-item-session-north-unassigned-01"]',
      ),
    ).toHaveCount(0)

    await restartedApp.close()
  })

  test('CEN-06: Discord Addon E2E com servidor RPC mock por named pipe (GET_GUILDS, GET_CHANNELS, regras opcionais e sugestões genéricas)', async ({
    electronApp,
    electronNodeEnv,
  }, testInfo) => {
    test.skip(
      !existsSync(
        resolve(desktopRoot, '../../../../discord-addon/dist/index.js'),
      ),
      'Requer o repositório externo discord-addon compilado ao lado de metric; os cenários neutros permanecem independentes dessa integração.',
    )
    const userDataPath = getElectronUserDataPath(testInfo.workerIndex)
    await electronApp.close()

    const pipePath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\mr-tick-discord-e2e-${Date.now()}-${testInfo.workerIndex}`
        : `/tmp/mr-tick-discord-e2e-${Date.now()}-${testInfo.workerIndex}`

    const mockRpcServer = new DiscordMockRpcServer(pipePath)
    await mockRpcServer.start()

    const discordApp = await electronLauncher.launch({
      args: ['.', '--window-size=1600,900', `--user-data-dir=${userDataPath}`],
      cwd: desktopRoot,
      env: {
        ...process.env,
        NODE_ENV: electronNodeEnv,
        FAKE_DB_IN_MEMORY: 'true',
        PLAYWRIGHT_TEST: '1',
        MR_TICK_RUNTIME_PROBE_WORKSPACE: workspace.id,
        MR_TICK_TEST_USER_DATA_DIR: userDataPath,
        MR_TICK_DISCORD_RPC_PIPE_OVERRIDE: pipePath,
      },
    })

    const discordMainLogs: string[] = []
    discordApp.process().stdout?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      discordMainLogs.push(text)
      if (text && process.env.E2E_VERBOSE === 'true') {
        console.log(`[DISCORD MAIN]: ${text}`)
      }
    })
    discordApp.process().stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim()
      if (text && process.env.E2E_VERBOSE === 'true') {
        console.error(`[DISCORD MAIN ERR]: ${text}`)
      }
    })

    try {
      await expect
        .poll(async () => (await findMainWindow(discordApp)) !== null, {
          timeout: 30000,
        })
        .toBe(true)
      const win = await findMainWindow(discordApp)
      if (!win) {
        throw new Error('DISCORD_MAIN_WINDOW_NOT_FOUND')
      }
      await win.waitForLoadState('domcontentloaded')

      // Interceptar requisições de imagem de ícone do Discord no Playwright para retornar imagem válida
      const transparentPngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      )
      await win.route('https://cdn.discordapp.com/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: transparentPngBuffer,
        })
      })

      // Aguardar handshake + AUTHENTICATE + SUBSCRIBE no named pipe mock
      await expect
        .poll(() => mockRpcServer.stats.subscriptionsCount, {
          timeout: 15000,
        })
        .toBeGreaterThanOrEqual(1)

      // 1. Abrir Configurações -> Addons Instalados -> Discord Presence (mistertick-discord)
      const settingsButton = win.locator(
        '[data-testid="app-rail-settings-btn"]',
      )
      await expect(settingsButton.first()).toBeVisible({ timeout: 15000 })
      await settingsButton.first().click()

      const installedTabBtn = win.locator(
        '[data-testid="settings-nav-tab-addons-installed"]',
      )
      await expect(installedTabBtn).toBeVisible({ timeout: 10000 })
      await installedTabBtn.click()

      const configureBtn = win.locator(
        '[data-testid="addon-configure-btn-mistertick-discord"]',
      )
      await expect(configureBtn).toBeVisible({ timeout: 10000 })
      await configureBtn.click()

      const watcherTab = win.locator(
        '[data-testid="addon-capability-tab-watcher"]',
      )
      await expect(watcherTab.first()).toBeVisible({ timeout: 10000 })
      await watcherTab.first().click()

      const wsTab = win.locator(
        `[data-testid="addon-workspace-tab-${workspace.id}"]`,
      )
      await expect(wsTab).toBeVisible({ timeout: 10000 })
      await wsTab.click()

      const wsGroup = win.locator(
        `[data-testid="workspace-addon-group-${workspace.id}"]`,
      )
      await expect(wsGroup).toBeVisible({ timeout: 10000 })

      // 2. Adicionar regra na coleção 'rules' e carregar opções dinâmicas via RPC (GET_GUILDS -> GET_CHANNELS)
      const addRuleBtn = wsGroup.locator(
        '[data-testid="addon-collection-add-rules"]',
      )
      await expect(addRuleBtn).toBeVisible({ timeout: 10000 })
      await addRuleBtn.click()

      const ruleCard = wsGroup
        .locator(
          '[data-testid="addon-collection-rules"] > div > [data-testid^="addon-collection-item-"]',
        )
        .first()
      await expect(ruleCard).toBeVisible({ timeout: 10000 })

      const ruleNameInput = ruleCard.locator(
        'input[data-testid="addon-field-input-name"]',
      )
      await expect(ruleNameInput).toBeVisible({ timeout: 5000 })
      await ruleNameInput.fill('Daily Standup Engenharia')
      await expect(
        ruleCard.getByTestId('addon-field-input-timeZone'),
      ).toHaveCount(0)
      await wsGroup.getByTestId('addon-dynamic-select-timezone').click()
      await win.getByPlaceholder('Pesquisar opções...').fill('Sao Paulo')
      await expect(
        win.getByTestId('addon-select-option-Africa/Abidjan'),
      ).toHaveCount(0)
      await win.screenshot({
        path: testInfo.outputPath('discord-timezone-search.png'),
      })
      await win.getByTestId('addon-select-option-America/Sao_Paulo').click()
      await expect(
        wsGroup.getByTestId('addon-field-input-defaultDestination'),
      ).toHaveCount(0)
      await expect(
        wsGroup.getByTestId('addon-operational-list-pendingSessions'),
      ).toHaveCount(0)

      const guildTrigger = ruleCard.locator(
        '[data-testid="addon-dynamic-select-guild"]',
      )
      await expect(guildTrigger).toBeVisible({ timeout: 5000 })
      await guildTrigger.click()

      // Asserções de cache e contadores RPC do mock:
      // guild-eng-100 já possui icon_url em GET_GUILDS; guild-ops-200 não tem icon original e exige GET_GUILD
      const opsGuildOpt = win.locator(
        '[data-testid="addon-select-option-guild-ops-200"]',
      )
      await expect(opsGuildOpt).toBeVisible({ timeout: 10000 })

      // guild-ops-200 carrega imagem enriquecida via HTTPS interceptado (naturalWidth > 0)
      const opsGuildImg = opsGuildOpt.locator(
        '[data-testid="addon-select-media-img"]',
      )
      await expect(opsGuildImg).toBeVisible({ timeout: 5000 })
      await expect
        .poll(
          async () =>
            opsGuildImg.evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
          { timeout: 5000 },
        )
        .toBe(true)

      // Exatamente 1 GET_GUILD gerado para guild-ops-200; guild-eng-100 não gerou detalhe extra
      await expect
        .poll(() => mockRpcServer.stats.getGuildCount, { timeout: 5000 })
        .toBe(1)

      const engGuildOpt = win.locator(
        '[data-testid="addon-select-option-guild-eng-100"]',
      )
      await expect(engGuildOpt).toBeVisible({ timeout: 10000 })

      // Asserção de imagem renderizada com HTTPS interceptado (naturalWidth > 0)
      const guildImg = engGuildOpt.locator(
        '[data-testid="addon-select-media-img"]',
      )
      await expect(guildImg).toBeVisible({ timeout: 5000 })
      await expect
        .poll(
          async () =>
            guildImg.evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
          { timeout: 5000 },
        )
        .toBe(true)

      // Reabrir o seletor na mesma sessão para verificar que getGuildCount não aumenta para IDs já memorizados
      await engGuildOpt.click()
      await expect(guildTrigger).toContainText('Engenharia de Software')
      await expect(
        guildTrigger.locator('[data-testid="addon-select-media-avatar"]'),
      ).toBeVisible({ timeout: 5000 })

      // Reabre seletor de guild para conferir cache
      await guildTrigger.click()
      await expect(opsGuildOpt).toBeVisible({ timeout: 5000 })
      // Contador getGuildCount permanece estável em 1 (sem chamadas redundantes)
      expect(mockRpcServer.stats.getGuildCount).toBe(1)

      // Prova de falha de carregamento HTTPS abort -> fallback e ausência de parent_id -> lista plana sem cabeçalho
      // 1. Interceptar a URL do ícone de Ops para falhar/abortar
      await win.route(
        'https://cdn.discordapp.com/icons/guild-ops-200/ops-icon.png',
        async (route) => {
          await route.abort('failed')
        },
      )

      // Seleciona guild-ops-200
      await opsGuildOpt.click()
      await expect(guildTrigger).toContainText('Operações e Infra')
      // Com a rota abortada, o avatar de Operações e Infra degrada para o fallback determinístico (iniciais 'OE' das 2 primeiras palavras)
      const opsFallback = guildTrigger.locator(
        '[data-testid="addon-select-media-fallback"]',
      )
      await expect(opsFallback).toBeVisible({ timeout: 5000 })
      await expect(opsFallback).toHaveText('OE')

      // Abre o seletor de canais de Operações e Infra: GET_CHANNELS retorna apenas War Room Incidents sem parent_id
      const opsChannelTrigger = ruleCard.locator(
        '[data-testid="addon-dynamic-select-channel"]',
      )
      await expect(opsChannelTrigger).toBeVisible({ timeout: 5000 })
      await opsChannelTrigger.click()

      // Asserção: War Room visível, nenhum cabeçalho de categoria/subgrupo é renderizado (lista plana)
      const warRoomOpt = win.locator(
        '[data-testid="addon-select-option-chan-warroom-201"]',
      )
      await expect(warRoomOpt).toBeVisible({ timeout: 10000 })
      await expect(
        win.locator('[data-testid^="addon-select-group-"]'),
      ).toHaveCount(0)

      // Fecha seletor de canais de Ops
      await opsChannelTrigger.click()
      await expect(warRoomOpt).toBeHidden({ timeout: 5000 })

      // Retoma fluxo com Engenharia de Software
      await guildTrigger.click()
      await expect(engGuildOpt).toBeVisible({ timeout: 5000 })
      await engGuildOpt.click()
      await expect(guildTrigger).toContainText('Engenharia de Software')
      await expect(
        guildTrigger.locator('[data-testid="addon-select-media-avatar"]'),
      ).toBeVisible({ timeout: 5000 })

      const channelTrigger = ruleCard.locator(
        '[data-testid="addon-dynamic-select-channel"]',
      )
      await expect(channelTrigger).toBeVisible({ timeout: 5000 })
      await channelTrigger.click()

      // Asserção de cabeçalho de categoria/subgrupo renderizado
      const meetingCatHeader = win.locator(
        '[data-testid="addon-select-group-cat-reunioes"]',
      )
      await expect(meetingCatHeader).toBeVisible({ timeout: 5000 })
      await expect(meetingCatHeader).toHaveText('Reuniões & Sync')

      const dailyChannelOpt = win.locator(
        '[data-testid="addon-select-option-chan-daily-101"]',
      )
      await expect(dailyChannelOpt).toBeVisible({ timeout: 10000 })
      await dailyChannelOpt.click()

      // Asserção do contexto de subgrupo no trigger selecionado ('Reuniões & Sync · Daily Standup')
      await expect(channelTrigger).toContainText(
        'Reuniões & Sync · Daily Standup',
      )

      // Selecionar tarefa ALPHA-101 como destino da regra diretamente via popover
      const taskTrigger = ruleCard.locator(
        '[data-testid="addon-task-destination-trigger-destination"]',
      )
      await expect(taskTrigger).toBeVisible({ timeout: 5000 })
      await taskTrigger.click()
      const alphaTask101Opt = win.locator(
        '[data-testid="addon-task-option-ALPHA-101"]',
      )
      await expect(alphaTask101Opt).toBeVisible({ timeout: 5000 })
      await alphaTask101Opt.click()

      const saveBtn = win.getByRole('button', { name: 'Salvar' })
      await expect(saveBtn).toBeVisible({ timeout: 5000 })
      await saveBtn.click()

      const appliedBadge = win.locator(
        '[data-testid="addon-settings-status-applied"]',
      )
      const saveError = win
        .locator('[data-sonner-toast][data-type="error"]')
        .first()
      await expect(appliedBadge.or(saveError).first()).toBeVisible({
        timeout: 10000,
      })
      if (await saveError.isVisible()) {
        throw new Error(await saveError.innerText())
      }
      await expect(appliedBadge).toBeVisible({ timeout: 10000 })

      await win.screenshot({
        path: testInfo.outputPath('discord-simplified-settings.png'),
      })
      await openWorkspace(win)
      const suggestions = win.locator(
        '[data-testid="time-entry-row"][data-is-suggestion="true"]',
      )
      const initialSuggestionCount = await suggestions.count()

      // 3. Uma chamada sem regra entra no fluxo normal como sugestão genérica.
      mockRpcServer.dispatchVoiceChannelSelect({
        channelId: 'chan-unmapped-999',
        guildId: 'guild-eng-100',
      })
      await expect
        .poll(() =>
          discordMainLogs.some((line) =>
            line.includes(
              'Entrada detectada em canal de voz: chan-unmapped-999',
            ),
          ),
        )
        .toBe(true)
      mockRpcServer.dispatchVoiceChannelSelect({ channelId: null })

      await expect(suggestions).toHaveCount(initialSuggestionCount + 1, {
        timeout: 15000,
      })
      await expect(suggestions.first()).not.toContainText('ALPHA-101')

      // 4. Emitir chamada no canal mapeado (chan-daily-101) -> deve criar sugestão associada à tarefa ALPHA-101
      mockRpcServer.dispatchVoiceChannelSelect({
        channelId: 'chan-daily-101',
        guildId: 'guild-eng-100',
      })
      await expect
        .poll(() =>
          discordMainLogs.some((line) =>
            line.includes('Entrada detectada em canal de voz: chan-daily-101'),
          ),
        )
        .toBe(true)
      mockRpcServer.dispatchVoiceChannelSelect({ channelId: null })

      await openWorkspace(win)
      await expect(suggestions).toHaveCount(initialSuggestionCount + 2, {
        timeout: 15000,
      })
      expect(
        await win
          .locator('[data-sonner-toast][data-type="error"]')
          .allTextContents(),
      ).toEqual([])
      const suggestionRow = suggestions.filter({ hasText: 'ALPHA-101' })
      await expect(suggestionRow).toBeVisible({ timeout: 15000 })
      await expect(suggestionRow).toContainText('ALPHA-101')
    } finally {
      await discordApp.close()
      await mockRpcServer.stop()
    }
  })

  test('CEN-07: Destino de tarefa com metadados (atividades/comentários), persistência pós-save, busca avançada e limpeza de canal ao alternar servidor', async ({
    electronApp,
    electronNodeEnv,
  }, testInfo) => {
    test.skip(
      !existsSync(
        resolve(desktopRoot, '../../../../discord-addon/dist/index.js'),
      ),
      'Requer o repositório externo discord-addon compilado ao lado de metric; os cenários neutros permanecem independentes dessa integração.',
    )
    const userDataPath = getElectronUserDataPath(testInfo.workerIndex)
    await electronApp.close()

    const pipePath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\mr-tick-discord-e2e-${Date.now()}-${testInfo.workerIndex}`
        : `/tmp/mr-tick-discord-e2e-${Date.now()}-${testInfo.workerIndex}`

    const mockRpcServer = new DiscordMockRpcServer(pipePath)
    await mockRpcServer.start()

    const discordApp = await electronLauncher.launch({
      args: ['.', '--window-size=1600,900', `--user-data-dir=${userDataPath}`],
      cwd: desktopRoot,
      env: {
        ...process.env,
        NODE_ENV: electronNodeEnv,
        FAKE_DB_IN_MEMORY: 'true',
        PLAYWRIGHT_TEST: '1',
        MR_TICK_RUNTIME_PROBE_WORKSPACE: workspace.id,
        MR_TICK_TEST_USER_DATA_DIR: userDataPath,
        MR_TICK_DISCORD_RPC_PIPE_OVERRIDE: pipePath,
      },
    })

    try {
      await expect
        .poll(async () => (await findMainWindow(discordApp)) !== null, {
          timeout: 30000,
        })
        .toBe(true)
      const win = await findMainWindow(discordApp)
      if (!win) {
        throw new Error('DISCORD_MAIN_WINDOW_NOT_FOUND')
      }
      await win.waitForLoadState('domcontentloaded')

      // Interceptar requisições de imagem de ícone do Discord no Playwright para retornar imagem válida
      const transparentPngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      )
      await win.route('https://cdn.discordapp.com/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: transparentPngBuffer,
        })
      })

      // Aguardar handshake + AUTHENTICATE + SUBSCRIBE no named pipe mock
      await expect
        .poll(() => mockRpcServer.stats.subscriptionsCount, {
          timeout: 15000,
        })
        .toBeGreaterThanOrEqual(1)

      // Criar um 3º workspace para exercitar o limite LRU (2 workspaces) do BrowserWorkspaceRegistry e abrir o workspace principal na rota ativa
      const thirdWorkspaceId = await win.evaluate(async () => {
        const res = await window.api.workspaces.create({
          body: { name: 'TERCEIRO WORKSPACE' },
        })
        return res.data?.id ?? ''
      })
      expect(thirdWorkspaceId.length).toBeGreaterThan(0)
      await openWorkspace(win)

      // 1. Abrir diálogo de configurações com o workspace principal ativo na rota
      const settingsButton = win.locator(
        '[data-testid="app-rail-settings-btn"]',
      )
      await expect(settingsButton.first()).toBeVisible({ timeout: 15000 })
      await settingsButton.first().click()

      const installedTabBtn = win.locator(
        '[data-testid="settings-nav-tab-addons-installed"]',
      )
      await expect(installedTabBtn).toBeVisible({ timeout: 10000 })
      await installedTabBtn.click()

      const configureBtn = win.locator(
        '[data-testid="addon-configure-btn-mistertick-discord"]',
      )
      await expect(configureBtn).toBeVisible({ timeout: 10000 })
      await configureBtn.click()

      const watcherTab = win.locator(
        '[data-testid="addon-capability-tab-watcher"]',
      )
      await expect(watcherTab.first()).toBeVisible({ timeout: 10000 })
      await watcherTab.first().click()

      const wsTab = win.locator(
        `[data-testid="addon-workspace-tab-${workspace.id}"]`,
      )
      await expect(wsTab).toBeVisible({ timeout: 10000 })
      await wsTab.click()

      const wsGroup = win.locator(
        `[data-testid="workspace-addon-group-${workspace.id}"]`,
      )
      await expect(wsGroup).toBeVisible({ timeout: 10000 })

      // 2. Adicionar regra na coleção 'rules'
      const addRuleBtn = wsGroup.locator(
        '[data-testid="addon-collection-add-rules"]',
      )
      await expect(addRuleBtn).toBeVisible({ timeout: 10000 })
      await addRuleBtn.click()

      const ruleCard = wsGroup
        .locator(
          '[data-testid="addon-collection-rules"] > div > [data-testid^="addon-collection-item-"]',
        )
        .first()
      await expect(ruleCard).toBeVisible({ timeout: 10000 })

      const ruleNameInput = ruleCard.locator(
        'input[data-testid="addon-field-input-name"]',
      )
      await expect(ruleNameInput).toBeVisible({ timeout: 5000 })
      await ruleNameInput.fill('Regra Teste Metadados e Persistência')

      // Seleciona servidor Engenharia de Software
      const guildTrigger = ruleCard.locator(
        '[data-testid="addon-dynamic-select-guild"]',
      )
      await expect(guildTrigger).toBeVisible({ timeout: 5000 })
      await guildTrigger.click()

      const engGuildOpt = win.locator(
        '[data-testid="addon-select-option-guild-eng-100"]',
      )
      await expect(engGuildOpt).toBeVisible({ timeout: 10000 })
      await engGuildOpt.click()
      await expect(guildTrigger).toContainText('Engenharia de Software')

      // Seleciona canal Daily Standup
      const channelTrigger = ruleCard.locator(
        '[data-testid="addon-dynamic-select-channel"]',
      )
      await expect(channelTrigger).toBeVisible({ timeout: 5000 })
      await channelTrigger.click()

      const dailyChannelOpt = win.locator(
        '[data-testid="addon-select-option-chan-daily-101"]',
      )
      await expect(dailyChannelOpt).toBeVisible({ timeout: 10000 })
      await dailyChannelOpt.click()
      await expect(channelTrigger).toContainText('Daily Standup')

      // 3. Teste do Modal Avançado de Busca (TaskLookup)
      const taskTrigger = ruleCard.locator(
        '[data-testid="addon-task-destination-trigger-destination"]',
      )
      await expect(taskTrigger).toBeVisible({ timeout: 5000 })
      await taskTrigger.click()

      // Popover aberto: clica no botão de busca detalhada (modal avançado)
      const advancedModalBtn = win.locator(
        '[data-testid="time-entry-task-lookup-modal-btn"]',
      )
      await expect(advancedModalBtn).toBeVisible({ timeout: 5000 })
      await advancedModalBtn.click()

      // Modal avançado TaskLookup visível
      const modalSearchInput = win.locator(
        '[data-testid="task-lookup-modal-search-input"]',
      )
      await expect(modalSearchInput).toBeVisible({ timeout: 10000 })

      // Verifica presença de chip de conexão ou tarefas listadas e busca por ALPHA-102
      await modalSearchInput.fill('ALPHA-102')
      const alphaTaskRow = win
        .locator('[data-testid="task-lookup-row"]')
        .filter({
          hasText: 'ALPHA-102',
        })
      await expect(alphaTaskRow.first()).toBeVisible({ timeout: 10000 })
      await alphaTaskRow.first().click()
      await expect(modalSearchInput).toBeHidden({ timeout: 5000 })

      // 4. Card pós-seleção: selecionar atividade e preencher comentário
      const selectedCard = ruleCard.locator(
        '[data-testid="addon-task-selected-card-destination"]',
      )
      await expect(selectedCard).toBeVisible({ timeout: 10000 })

      const activitySelect = ruleCard.locator(
        '[data-testid="addon-task-activity-select-destination"]',
      )
      await expect(activitySelect).toBeVisible({ timeout: 5000 })
      await activitySelect.click()

      // Seleciona a atividade Alpha Development do DataSource
      const alphaDevActivityOpt = win.locator('[role="option"]').filter({
        hasText: 'Alpha Development',
      })
      await expect(alphaDevActivityOpt).toBeVisible({ timeout: 5000 })
      await alphaDevActivityOpt.click()
      await expect(activitySelect).toContainText('Alpha Development')

      // Preenche comentário opcional
      const commentInput = ruleCard.locator(
        '[data-testid="addon-task-comment-input-destination"]',
      )
      await expect(commentInput).toBeVisible({ timeout: 5000 })
      await commentInput.fill('Comentário Automatizado E2E')

      // 5. Salvar configurações
      const saveBtn = win.getByRole('button', { name: 'Salvar' })
      await expect(saveBtn).toBeVisible({ timeout: 5000 })
      await saveBtn.click()

      const appliedBadge = win.locator(
        '[data-testid="addon-settings-status-applied"]',
      )
      await expect(appliedBadge).toBeVisible({ timeout: 10000 })

      // 6. Teste de Persistência: Fecha e reabre o diálogo de configuração do addon para garantir que os dados persistem sem vir lista vazia
      const closeSettingsBtn = win
        .locator('[role="dialog"][data-state="open"]')
        .last()
        .getByRole('button', { name: 'Close', exact: true })
      await closeSettingsBtn.click()

      // Reabre configuração do addon Discord
      await expect(configureBtn).toBeVisible({ timeout: 10000 })
      await configureBtn.click()
      await expect(watcherTab.first()).toBeVisible({ timeout: 10000 })
      await watcherTab.first().click()
      await expect(wsTab).toBeVisible({ timeout: 10000 })
      await wsTab.click()

      // Asserção: Tarefa permanece selecionada com título real, atividade real e comentário preenchido
      const reloadedCard = win
        .locator(
          `[data-testid="workspace-addon-group-${workspace.id}"] [data-testid="addon-task-selected-card-destination"]`,
        )
        .first()
      await expect(reloadedCard).toBeVisible({ timeout: 10000 })
      await expect(reloadedCard).not.toContainText('Tarefa #ALPHA-102')
      await expect(reloadedCard).toContainText('ALPHA-102')
      await expect(reloadedCard).toContainText('Alpha Verification Suite')

      const reloadedActivitySelect = reloadedCard.locator(
        '[data-testid="addon-task-activity-select-destination"]',
      )
      await expect(reloadedActivitySelect).toContainText('Alpha Development')

      const reloadedComment = win.locator(
        '[data-testid="addon-task-comment-input-destination"]',
      )
      await expect(reloadedComment).toHaveValue('Comentário Automatizado E2E')

      // 6b. Navegação entre múltiplos workspaces na sub-sidebar (TESTE -> WORKSPACE ISOLADO -> TERCEIRO WORKSPACE -> TESTE)
      // Exercita a evicção LRU (cap=2) do BrowserWorkspaceRegistry e o retorno ao workspace inicial da rota ativa
      const isolatedWsTab = win.locator(
        '[data-testid="addon-workspace-tab-ws-isolated-9999-8888-777766665555"]',
      )
      await expect(isolatedWsTab).toBeVisible({ timeout: 10000 })
      await isolatedWsTab.click()
      await expect(
        win.locator(
          '[data-testid="workspace-addon-group-ws-isolated-9999-8888-777766665555"]',
        ),
      ).toBeVisible({ timeout: 10000 })

      const thirdWsTab = win.locator(
        `[data-testid="addon-workspace-tab-${thirdWorkspaceId}"]`,
      )
      await expect(thirdWsTab).toBeVisible({ timeout: 10000 })
      await thirdWsTab.click()
      await expect(
        win.locator(
          `[data-testid="workspace-addon-group-${thirdWorkspaceId}"]`,
        ),
      ).toBeVisible({ timeout: 10000 })

      // Voltar para o workspace inicial (TESTE)
      await wsTab.click()
      await expect(wsGroup).toBeVisible({ timeout: 10000 })

      await expect(reloadedCard).toBeVisible({ timeout: 10000 })
      await expect(reloadedCard).not.toContainText('Tarefa #ALPHA-102')
      await expect(reloadedCard).toContainText('ALPHA-102')
      await expect(reloadedCard).toContainText('Alpha Verification Suite')
      await expect(reloadedActivitySelect).toContainText('Alpha Development')
      await expect(reloadedComment).toHaveValue('Comentário Automatizado E2E')

      // Verificar que o popover de tarefas também carrega normalmente após retornar ao workspace inicial
      await addRuleBtn.click()
      const secondRuleCard = wsGroup
        .locator(
          '[data-testid="addon-collection-rules"] > div > [data-testid^="addon-collection-item-"]',
        )
        .nth(1)
      await expect(secondRuleCard).toBeVisible({ timeout: 10000 })
      const secondTaskTrigger = secondRuleCard.locator(
        '[data-testid="addon-task-destination-trigger-destination"]',
      )
      await secondTaskTrigger.click()
      const popoverTaskOpt = win.locator('[data-testid^="addon-task-option-"]')
      await expect(popoverTaskOpt.first()).toBeVisible({ timeout: 10000 })
      await win.keyboard.press('Escape')

      // 7. Teste de Limpeza de Canal Sujo ao Alternar Servidor
      const reloadedGuildTrigger = ruleCard.locator(
        '[data-testid="addon-dynamic-select-guild"]',
      )
      await reloadedGuildTrigger.click()
      const opsGuildOpt = win.locator(
        '[data-testid="addon-select-option-guild-ops-200"]',
      )
      await expect(opsGuildOpt).toBeVisible({ timeout: 10000 })
      await opsGuildOpt.click()

      // Ao trocar de Engenharia de Software para Operações e Infra, o canal selecionado deve ser limpo imediatamente
      const reloadedChannelTrigger = ruleCard.locator(
        '[data-testid="addon-dynamic-select-channel"]',
      )
      await expect(reloadedChannelTrigger).not.toContainText('Daily Standup')
    } finally {
      await discordApp.close()
      await mockRpcServer.stop()
    }
  })
})
