import type { Page } from '@playwright/test'
import { z } from 'zod'

import type { AnalyticsDatasetQueryInput } from '../../../packages/application/src/contracts/data/providers/IAnalyticsProvider'
import type { IHostBridge } from '../../../packages/application/src/contracts/host/IHostBridge'
import { expect, test } from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

declare global {
  interface Window {
    api: IHostBridge
  }
}

const fakeSyncDiagnosticsSchema = z.object({ retainedPulls: z.number() })

interface AnalyticsIssueMutationArg {
  upserts?: Array<{
    id: string
    title: string
    projectName?: string
    createdAt?: string
  }>
  deletes?: string[]
}

async function runFakeCommand(
  page: Page,
  commandId: string,
  arg?: AnalyticsIssueMutationArg,
) {
  let commandArgs: AnalyticsIssueMutationArg[] | undefined = undefined
  if (arg !== undefined) commandArgs = [arg]

  const response = await page.evaluate(
    ({ id, argsPayload }) =>
      window.api.addons.executeCommand({
        body: { commandId: id, args: argsPayload },
      }),
    { id: commandId, argsPayload: commandArgs },
  )
  expect(response.isSuccess).toBe(true)
  return response.data
}

async function readRetainedPulls(page: Page): Promise<number> {
  return fakeSyncDiagnosticsSchema.parse(
    await runFakeCommand(page, 'fake-db:get-time-entry-sync-diagnostics'),
  ).retainedPulls
}

test('analytics extracts a selected dataset, edits its source and publishes a chart', async ({
  page,
}) => {
  const workspace = seedWorkspaces.workspaces.find(
    (item) => item.name === 'TESTE',
  )
  expect(workspace).toBeDefined()
  if (!workspace) return
  await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Meu Espaço Analítico' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /^Background/ }).click()
  const addSource = page.getByRole('button', {
    name: 'Adicionar Fonte (Extract)',
    exact: true,
  })
  const addTransform = page.getByRole('button', {
    name: 'Adicionar Transformação (SQL)',
    exact: true,
  })
  const addOutput = page.getByRole('button', {
    name: 'Adicionar Visualização (Load)',
    exact: true,
  })
  await addSource.click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: /Adicionar Fonte \(Extract\)/ }),
  ).toBeVisible()
  const sourceTitle = dialog.getByPlaceholder(
    'Ex: Apontamentos Redmine Docker, Tarefas Jira',
  )
  await sourceTitle.fill('Horas da conexão selecionada')
  await dialog.getByRole('combobox', { name: 'Conexão analítica' }).click()
  await page.getByRole('option', { name: /DataSource Fake/ }).click()
  const datasets = dialog.getByRole('combobox', { name: 'Dataset analítico' })
  await expect(datasets).toBeEnabled()
  await datasets.click()
  await page.getByRole('option', { name: /^Apontamentos/ }).click()
  await expect(dialog.getByText('Filtros', { exact: true })).toBeVisible()
  await dialog
    .getByRole('button', { name: 'Adicionar ao Workflow', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByText('Horas da conexão selecionada', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', {
      name: 'Status do Analytics: cobertura não confirmada',
    })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Status do Analytics' }),
  ).toContainText('A cobertura desta consulta ainda não foi confirmada')
  await page.keyboard.press('Escape')

  await page.getByText('Horas da conexão selecionada', { exact: true }).click()
  await expect(
    dialog
      .getByRole('status')
      .filter({ hasText: 'conjunto publicado completo' }),
  ).toContainText(/Mostrando 1–100 de \d+ registros/)
  await expect(dialog.getByText(/Página 1 de \d+/)).toBeVisible()
  await dialog
    .getByRole('button', { name: 'Ir para a próxima página', exact: true })
    .click()
  await expect(dialog.getByText(/Página 2 de \d+/)).toBeVisible()
  await expect(
    dialog
      .getByRole('status')
      .filter({ hasText: 'conjunto publicado completo' }),
  ).toContainText(/Mostrando 101–\d+ de \d+ registros/)
  await dialog
    .getByRole('button', { name: 'Fechar Inspeção', exact: true })
    .click()

  await page.getByText('Horas da conexão selecionada', { exact: true }).click()
  await dialog.getByRole('tab', { name: 'Edição' }).click()
  await expect(
    dialog.getByRole('tab', { name: 'Edição', selected: true }),
  ).toBeVisible()
  await sourceTitle.fill('Horas consultadas')
  await dialog
    .getByRole('button', { name: 'Salvar Alterações', exact: true })
    .click()
  await expect(
    dialog.getByRole('heading', { name: 'Horas consultadas' }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('tab', { name: /^Dados/, selected: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Fechar Inspeção' }).click()

  await addTransform.click()
  await dialog
    .getByPlaceholder('Ex: SQL Pivot Colaborador × Atividade')
    .fill('Projetos transformados')
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: /Horas consultadas/ }).click()
  const transformSql = 'SELECT project FROM input'
  const transformQuery = dialog.getByPlaceholder(/^SELECT coluna/)
  await transformQuery.fill(transformSql)
  await dialog.getByRole('button', { name: 'Adicionar ao Workflow' }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByText('Projetos transformados', { exact: true }).click()
  await expect(
    dialog.getByText('Transformação SQL', { exact: true }),
  ).toBeVisible()
  await dialog.getByRole('tab', { name: 'SQL', exact: true }).click()
  await expect(dialog.getByText(transformSql, { exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: 'Edição' }).click()
  await expect(transformQuery).toHaveValue(transformSql)
  await dialog.getByRole('button', { name: 'Fechar Inspeção' }).click()

  await addOutput.click()
  await dialog
    .getByPlaceholder('Ex: Gráfico de Entregas por Colaborador')
    .fill('Horas consolidadas')
  await dialog
    .getByRole('combobox', { name: 'Entrada da visualização' })
    .click()
  await page.getByRole('option', { name: /Horas consultadas/ }).click()
  await dialog
    .getByRole('combobox', { name: 'Dimensão da visualização' })
    .click()
  await page.getByRole('option', { name: /Projeto/ }).click()
  await dialog
    .getByRole('combobox', { name: 'Métrica da visualização', exact: true })
    .click()
  await page.getByRole('option', { name: /Horas/ }).click()
  const chartType = dialog.getByRole('combobox', {
    name: 'Modelo visual da visualização',
  })
  await chartType.click()
  await page.getByRole('option', { name: /Combo Multi-Eixo/ }).click()
  await expect(
    dialog.getByRole('region', { name: 'Prévia da visualização' }),
  ).toContainText('Dados fictícios')
  await expect(
    dialog.getByText('Segunda métrica: selecione uma coluna.', { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Adicionar ao Workflow', exact: true }),
  ).toBeDisabled()
  await chartType.click()
  await page.getByRole('option', { name: /Barras Verticais/ }).click()
  await dialog
    .getByRole('button', { name: 'Adicionar ao Workflow', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  await page.getByText('Horas consolidadas', { exact: true }).click()
  await expect(
    dialog.getByRole('tab', { name: 'Visualização', selected: true }),
  ).toBeVisible()
  await expect(dialog.getByText(/\d+ grupos · unverified/)).toBeVisible()
  const lineage = dialog.getByRole('navigation', { name: 'Linhagem completa' })
  await lineage.getByRole('button', { name: /Horas consultadas/ }).click()
  await expect(
    dialog.getByRole('tab', { name: /^Dados/, selected: true }),
  ).toBeVisible()
  await lineage.getByRole('button', { name: /Projetos transformados/ }).click()
  await expect(
    dialog.getByRole('heading', { name: 'Projetos transformados' }),
  ).toBeVisible()
  await lineage.getByRole('button', { name: 'Horas consolidadas' }).click()
  await expect(
    dialog.getByRole('tab', { name: 'Visualização', selected: true }),
  ).toBeVisible()
  await dialog.getByRole('tab', { name: 'Edição' }).click()
  await expect(
    dialog.getByRole('combobox', { name: 'Modelo visual da visualização' }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Fechar Inspeção' }).click()
  await page
    .getByRole('button', {
      name: 'View Final (Grade Inteligente)',
      exact: true,
    })
    .click()
  await expect(
    page.getByText('Horas consolidadas', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/\d+ grupos · unverified/)).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Modelo visual da visualização' }),
  ).toHaveCount(0)
  await expect(page.getByTitle('Largura Total (3/3)')).toBeVisible()
})

test('analytics publishes a declared remote aggregate without selecting raw columns', async ({
  page,
}) => {
  const workspace = seedWorkspaces.workspaces.find(
    (item) => item.name === 'TESTE',
  )
  expect(workspace).toBeDefined()
  if (workspace === undefined) return
  await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await page.getByRole('button', { name: /^Background/ }).click()
  await page
    .getByRole('button', { name: 'Adicionar Fonte (Extract)', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByPlaceholder('Ex: Apontamentos Redmine Docker, Tarefas Jira')
    .fill('Remote totals')
  await dialog.getByRole('combobox', { name: 'Conexão analítica' }).click()
  await page.getByRole('option', { name: /DataSource Fake/ }).click()
  await dialog.getByRole('combobox', { name: 'Dataset analítico' }).click()
  await page.getByRole('option', { name: /^Apontamentos/ }).click()
  await dialog.getByRole('button', { name: 'Limpar', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Execução da fonte' }).click()
  await page
    .getByRole('option', { name: 'Agregação remota', exact: true })
    .click()
  await dialog.getByRole('checkbox', { name: 'project', exact: true }).check()
  await dialog
    .getByRole('textbox', { name: 'Nome da medida remota' })
    .fill('hours_from_source')
  await dialog.getByRole('combobox', { name: 'Operador remoto' }).click()
  await page.getByRole('option', { name: 'sum', exact: true }).click()
  await dialog
    .getByRole('combobox', { name: 'Coluna da medida remota' })
    .click()
  await page.getByRole('option', { name: 'Horas', exact: true }).click()
  await dialog
    .getByRole('button', { name: 'Adicionar medida', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Adicionar ao Workflow', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  await page.getByText('Remote totals', { exact: true }).click()
  await expect(
    dialog.getByRole('columnheader', {
      name: 'hours_from_source',
      exact: true,
    }),
  ).toBeVisible()
  await dialog
    .getByRole('button', { name: 'Fechar Inspeção', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Adicionar Visualização (Load)', exact: true })
    .click()
  await dialog
    .getByPlaceholder('Ex: Gráfico de Entregas por Colaborador')
    .fill('Remote chart')
  await dialog
    .getByRole('combobox', { name: 'Entrada da visualização' })
    .click()
  await page.getByRole('option', { name: /Remote totals/ }).click()
  await expect(
    dialog.getByRole('combobox', {
      name: 'Empilhar ou pivotar visualização',
    }),
  ).toHaveCount(0)
  await dialog
    .getByRole('combobox', { name: 'Linha de referência da visualização' })
    .click()
  await expect(
    page.getByRole('option', { name: 'Média Simples (AVG)' }),
  ).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await dialog
    .getByRole('combobox', { name: 'Dimensão da visualização' })
    .click()
  await page.getByRole('option', { name: /Projeto/ }).click()
  await dialog
    .getByRole('combobox', { name: 'Métrica da visualização', exact: true })
    .click()
  await page.getByRole('option', { name: /hours_from_source/ }).click()
  await dialog
    .getByRole('button', { name: 'Adicionar ao Workflow', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  await page
    .getByRole('button', {
      name: 'View Final (Grade Inteligente)',
      exact: true,
    })
    .click()
  await expect(page.getByText('Remote chart', { exact: true })).toBeVisible()
  await expect(page.getByText(/\d+ grupos · complete/)).toBeVisible()
})

test('hydrates offline analytics state, runs incremental changes upsert/delete and full reconcile without blocking personal flows', async ({
  page,
}) => {
  test.setTimeout(120000)

  const workspace = seedWorkspaces.workspaces.find(
    (item) => item.name === 'TESTE',
  )
  expect(workspace).toBeDefined()
  if (!workspace) return

  const connection = workspace.connections.find(
    (item) => item.addonId === 'mr-tick-datasource-fake',
  )
  expect(connection).toBeDefined()
  if (!connection) return

  try {
    await runFakeCommand(page, 'fake-db:analytics-mutate-issues', {
      upserts: [
        {
          id: 'E2E-ISSUE-1',
          title: 'E2E Tarefa Inicial',
          projectName: 'Projeto Alpha',
          createdAt: '2026-10-15T12:00:00.000Z',
        },
        {
          id: 'E2E-ISSUE-2',
          title: 'E2E Tarefa Para Excluir',
          projectName: 'Projeto Alpha',
          createdAt: '2026-10-16T12:00:00.000Z',
        },
      ],
    })

    await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
    await expect
      .poll(
        async () => {
          const statusRes = await page.evaluate(
            (workspaceId) =>
              window.api.localSync.request({ action: 'status', workspaceId }),
            workspace.id,
          )
          return (
            statusRes.ok &&
            statusRes.statuses !== undefined &&
            statusRes.statuses.length > 0 &&
            statusRes.statuses.every(
              (status) =>
                status.lastReplication !== null &&
                !status.isPulling &&
                !status.isPushing,
            )
          )
        },
        { timeout: 30000 },
      )
      .toBe(true)

    await page.getByRole('link', { name: 'Analytics', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Meu Espaço Analítico' }),
    ).toBeVisible()
    await page.getByRole('button', { name: /^Background/ }).click()
    await page
      .getByRole('button', { name: 'Adicionar Fonte (Extract)', exact: true })
      .click()

    const dialog = page.getByRole('dialog')
    await dialog
      .getByPlaceholder('Ex: Apontamentos Redmine Docker, Tarefas Jira')
      .fill('Tarefas E2E')
    await dialog.getByRole('combobox', { name: 'Conexão analítica' }).click()
    await page.getByRole('option', { name: /DataSource Fake/ }).click()
    const datasets = dialog.getByRole('combobox', {
      name: 'Dataset analítico',
    })
    await expect(datasets).toBeEnabled()
    await datasets.click()
    await page.getByRole('option', { name: /^Tarefas/ }).click()
    await expect(dialog.getByText('Filtros', { exact: true })).toBeVisible()

    const projectFilter = dialog
      .getByRole('combobox')
      .filter({ hasText: 'Todos os projetos' })
    await expect(projectFilter).toBeVisible()
    await projectFilter.click()
    await expect(
      page.getByRole('option', { name: 'Projeto Alpha', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('option', { name: 'Projeto Alpha', exact: true })
      .click()

    await dialog
      .getByRole('button', { name: 'Adicionar ao Workflow', exact: true })
      .click()
    await expect(dialog).not.toBeVisible()

    const tarefasNode = page
      .locator('.react-flow__node')
      .filter({ hasText: 'Tarefas E2E' })
    await expect(tarefasNode).toBeVisible()
    await expect(tarefasNode.getByText('2 reg.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^Status do Analytics/ }).click()
    await expect(
      page
        .getByRole('dialog', { name: 'Status do Analytics' })
        .getByText('Incremental (changes)', { exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')

    const pollingCombobox = page.getByRole('combobox', {
      name: 'Frequência de atualização',
    })
    await pollingCombobox.click()
    await page
      .getByRole('option', { name: 'Atualização: Manual', exact: true })
      .click()
    await expect(pollingCombobox).toContainText('Atualização: Manual')

    let hydratedQuery: AnalyticsDatasetQueryInput | undefined
    let initialFastSyncAt = ''
    await expect
      .poll(async () => {
        const res = await page.evaluate(
          (workspaceId) =>
            window.api.addons.hydrateAnalytics({ body: { workspaceId } }),
          workspace.id,
        )
        if (!res.isSuccess || res.data === undefined) return false
        if (res.data.settings?.pollingIntervalMinutes !== 0) return false
        if (!res.data.settings.spacesJson?.includes('Tarefas E2E')) return false
        if (res.data.publications.length !== 1) return false

        const [firstPublication] = res.data.publications
        if (firstPublication === undefined) return false

        hydratedQuery = firstPublication.publication.query
        initialFastSyncAt = firstPublication.syncState.lastFastSyncAt
        return true
      })
      .toBe(true)

    expect(hydratedQuery).toBeDefined()
    expect(initialFastSyncAt).not.toBe('')

    // Exercise personal local-first runtime alongside configured analytics without blocking.
    await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
    await expect(
      page.locator('[data-testid="time-entry-actions-trigger"]').first(),
    ).toBeVisible({ timeout: 15000 })

    await runFakeCommand(page, 'fake-db:pause-one-time-entry-pull')
    await page.evaluate(
      (scope) => {
        void window.api.localSync.request({
          action: 'forceSync',
          workspaceId: scope.workspaceId,
          connectionInstanceId: scope.connectionInstanceId,
          direction: 'pull',
        })
      },
      { workspaceId: workspace.id, connectionInstanceId: connection.id },
    )
    await expect.poll(() => readRetainedPulls(page)).toBeGreaterThan(0)

    const personalIds = await page.evaluate(() => ({
      commandId: crypto.randomUUID(),
      entryId: crypto.randomUUID(),
    }))
    const personalCreate = await page.evaluate(
      (scope) =>
        window.api.localRuntime.request({
          action: 'create',
          workspaceId: scope.workspaceId,
          commandId: scope.commandId,
          entryId: scope.entryId,
          payload: {
            taskId: '',
            activityId: '',
            timeSpentSeconds: 120,
            startDate: '2026-10-08T11:00:00.000Z',
            endDate: '2026-10-08T11:02:00.000Z',
            comments: 'Personal flow independent of analytics',
          },
        }),
      { workspaceId: workspace.id, ...personalIds },
    )
    expect(personalCreate.ok).toBe(true)
    expect(await readRetainedPulls(page)).toBeGreaterThan(0)
    await runFakeCommand(page, 'fake-db:release-time-entry-pulls')
    await expect
      .poll(
        async () => {
          const statusRes = await page.evaluate(
            (workspaceId) =>
              window.api.localSync.request({ action: 'status', workspaceId }),
            workspace.id,
          )
          return (
            statusRes.ok &&
            statusRes.statuses !== undefined &&
            statusRes.statuses.every(
              (status) => !status.isPulling && !status.isPushing,
            )
          )
        },
        { timeout: 30000 },
      )
      .toBe(true)

    await page.getByRole('link', { name: 'Analytics', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Meu Espaço Analítico' }),
    ).toBeVisible()
    await expect(pollingCombobox).toContainText('Atualização: Manual')

    // Mutate remote before reload: Manual polling must preserve offline DuckDB state without re-fetching.
    await runFakeCommand(page, 'fake-db:analytics-mutate-issues', {
      upserts: [
        {
          id: 'E2E-ISSUE-1',
          title: 'E2E Tarefa Editada Remotamente',
          projectName: 'Projeto Alpha',
          createdAt: '2026-10-15T12:00:00.000Z',
        },
        {
          id: 'E2E-ISSUE-3',
          title: 'E2E Tarefa Inserida Remotamente',
          projectName: 'Projeto Alpha',
          createdAt: '2026-10-17T12:00:00.000Z',
        },
      ],
      deletes: ['E2E-ISSUE-2'],
    })

    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Meu Espaço Analítico' }),
    ).toBeVisible()
    await expect(pollingCombobox).toContainText('Atualização: Manual')

    await page.getByRole('button', { name: /^Background/ }).click()
    await expect(tarefasNode).toBeVisible()
    await expect(tarefasNode.getByText('2 reg.', { exact: true })).toBeVisible()

    const hydratedOffline = await page.evaluate(
      (workspaceId) =>
        window.api.addons.hydrateAnalytics({ body: { workspaceId } }),
      workspace.id,
    )
    expect(hydratedOffline.isSuccess).toBe(true)
    expect(
      hydratedOffline.data?.publications[0]?.syncState.lastFastSyncAt,
    ).toBe(initialFastSyncAt)

    await tarefasNode.click()
    await expect(
      dialog.getByText('E2E Tarefa Inicial', { exact: true }).first(),
    ).toBeVisible()
    await expect(
      dialog.getByText('E2E Tarefa Para Excluir', { exact: true }).first(),
    ).toBeVisible()
    await expect(
      dialog.getByText('E2E Tarefa Editada Remotamente', { exact: true }),
    ).toHaveCount(0)
    await expect(
      dialog.getByText('E2E Tarefa Inserida Remotamente', { exact: true }),
    ).toHaveCount(0)
    await dialog
      .getByRole('button', { name: 'Fechar Inspeção', exact: true })
      .click()
    await expect(dialog).not.toBeVisible()

    if (hydratedQuery === undefined) return

    const fastMode: 'fast' = 'fast'

    // Trigger real IPC incremental changes merge (fast mode).
    const fastLoad = await page.evaluate(
      (input) => window.api.addons.loadAnalyticsDataset({ body: input }),
      {
        workspaceId: workspace.id,
        connectionInstanceId: connection.id,
        query: hydratedQuery,
        policy: { mode: fastMode },
      },
    )
    expect(fastLoad.isSuccess).toBe(true)
    expect(fastLoad.data?.strategy).toBe('incremental_changes')
    expect(fastLoad.data?.publication.rowCount).toBe(2)

    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Meu Espaço Analítico' }),
    ).toBeVisible()
    await page.getByRole('button', { name: /^Background/ }).click()
    await expect(tarefasNode.getByText('2 reg.', { exact: true })).toBeVisible()
    await tarefasNode.click()
    await expect(
      dialog
        .getByText('E2E Tarefa Editada Remotamente', { exact: true })
        .first(),
    ).toBeVisible()
    await expect(
      dialog
        .getByText('E2E Tarefa Inserida Remotamente', { exact: true })
        .first(),
    ).toBeVisible()
    await expect(
      dialog.getByText('E2E Tarefa Para Excluir', { exact: true }),
    ).toHaveCount(0)
    await expect(
      dialog.getByText('E2E Tarefa Inicial', { exact: true }),
    ).toHaveCount(0)
    await dialog
      .getByRole('button', { name: 'Fechar Inspeção', exact: true })
      .click()
    await expect(dialog).not.toBeVisible()

    const beforeManualHydrate = await page.evaluate(
      (workspaceId) =>
        window.api.addons.hydrateAnalytics({ body: { workspaceId } }),
      workspace.id,
    )
    const generationBeforeManual =
      beforeManualHydrate.data?.publications[0]?.publication.generationId

    // Mutate remote again and trigger full reconcile from top bar button.
    await runFakeCommand(page, 'fake-db:analytics-mutate-issues', {
      upserts: [
        {
          id: 'E2E-ISSUE-4',
          title: 'E2E Tarefa Full Reconcile',
          projectName: 'Projeto Alpha',
          createdAt: '2026-10-18T12:00:00.000Z',
        },
      ],
      deletes: ['E2E-ISSUE-1'],
    })

    const syncButton = page.getByRole('button', {
      name: 'Sincronizar',
      exact: true,
    })
    await syncButton.click()

    await expect
      .poll(async () => {
        const afterManual = await page.evaluate(
          (workspaceId) =>
            window.api.addons.hydrateAnalytics({ body: { workspaceId } }),
          workspace.id,
        )
        const pub = afterManual.data?.publications[0]
        if (pub === undefined) return false
        return (
          pub.publication.generationId !== generationBeforeManual &&
          pub.syncState.strategy === 'full_replace'
        )
      })
      .toBe(true)
    await expect(syncButton).toBeEnabled()
    await expect(tarefasNode.getByText('2 reg.', { exact: true })).toBeVisible()

    await tarefasNode.click()
    await expect(
      dialog.getByText('E2E Tarefa Full Reconcile', { exact: true }).first(),
    ).toBeVisible()
    await expect(
      dialog
        .getByText('E2E Tarefa Inserida Remotamente', { exact: true })
        .first(),
    ).toBeVisible()
    await expect(
      dialog.getByText('E2E Tarefa Editada Remotamente', { exact: true }),
    ).toHaveCount(0)
    await dialog
      .getByRole('button', { name: 'Fechar Inspeção', exact: true })
      .click()
  } finally {
    await runFakeCommand(page, 'fake-db:release-time-entry-pulls').catch(
      () => undefined,
    )
    await runFakeCommand(page, 'fake-db:reset-seed').catch(() => undefined)
  }
})

test('deduplicates identical source scopes across multiple workflow nodes', async ({
  page,
}) => {
  const workspace = seedWorkspaces.workspaces.find(
    (item) => item.name === 'TESTE',
  )
  expect(workspace).toBeDefined()
  if (!workspace) return

  await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Meu Espaço Analítico' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /^Background/ }).click()

  const addSourceNode = async (label: string) => {
    await page
      .getByRole('button', { name: 'Adicionar Fonte (Extract)', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByRole('heading', { name: /Adicionar Fonte \(Extract\)/ }),
    ).toBeVisible()
    await dialog
      .getByPlaceholder('Ex: Apontamentos Redmine Docker, Tarefas Jira')
      .fill(label)
    await dialog.getByRole('combobox', { name: 'Conexão analítica' }).click()
    await page.getByRole('option', { name: /DataSource Fake/ }).click()
    const datasets = dialog.getByRole('combobox', {
      name: 'Dataset analítico',
    })
    await expect(datasets).toBeEnabled()
    await datasets.click()
    await page.getByRole('option', { name: /^Apontamentos/ }).click()
    await dialog
      .getByRole('button', { name: 'Adicionar ao Workflow', exact: true })
      .click()
    await expect(dialog).not.toBeVisible()
  }

  await addSourceNode('Fonte Duplicada A')

  const nodeA = page
    .locator('.react-flow__node')
    .filter({ hasText: 'Fonte Duplicada A' })
  await expect(nodeA).toBeVisible()
  const nodeACount = nodeA.getByText(/^[1-9]\d* reg\.$/)
  await expect(nodeACount).toBeVisible()
  const countText = await nodeACount.textContent()
  expect(countText).not.toBeNull()
  if (countText === null) return

  await addSourceNode('Fonte Duplicada B')

  const nodeB = page
    .locator('.react-flow__node')
    .filter({ hasText: 'Fonte Duplicada B' })
  await expect(nodeB).toBeVisible()
  await expect(nodeB.getByText(countText.trim(), { exact: true })).toBeVisible()
  await expect(page.locator('[role="alert"]')).toHaveCount(0)

  await expect
    .poll(async () => {
      const hydrated = await page.evaluate(
        (workspaceId) =>
          window.api.addons.hydrateAnalytics({ body: { workspaceId } }),
        workspace.id,
      )
      if (!hydrated.isSuccess || hydrated.data === undefined) return -1
      return hydrated.data.publications.length
    })
    .toBe(1)
})
