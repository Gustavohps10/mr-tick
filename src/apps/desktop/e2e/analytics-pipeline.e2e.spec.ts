import { expect, test } from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

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
  const add = page.getByRole('button', { name: 'Adicionar', exact: true })
  await add.click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: /Adicionar Elemento ao Workflow/ }),
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
  await expect(
    page.getByRole('status').filter({ hasText: 'cobertura' }),
  ).toContainText('cobertura')

  await page.getByText('Horas da conexão selecionada', { exact: true }).click()
  await expect(
    dialog.getByRole('status').filter({ hasText: 'Página local' }),
  ).toContainText('Página local 1')
  await expect(
    dialog.getByRole('status').filter({ hasText: 'Página local' }),
  ).toContainText('conjunto publicado completo')
  await dialog
    .getByRole('button', { name: 'Próxima página', exact: true })
    .click()
  await expect(
    dialog.getByRole('status').filter({ hasText: 'Página local' }),
  ).toContainText('Página local 2')
  await dialog
    .getByRole('button', { name: 'Fechar Inspeção', exact: true })
    .click()

  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(
    dialog.getByRole('heading', { name: /Editar Consulta/ }),
  ).toBeVisible()
  await sourceTitle.fill('Horas consultadas')
  await dialog
    .getByRole('button', { name: 'Salvar Alterações', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByText('Horas consultadas', { exact: true }),
  ).toBeVisible()

  await add.click()
  await dialog.getByRole('button', { name: /Publicar Visualização/ }).click()
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
    .getByRole('combobox', { name: 'Métrica da visualização' })
    .click()
  await page.getByRole('option', { name: /Horas/ }).click()
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
  await expect(
    page.getByText('Horas consolidadas', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/\d+ grupos · unverified/)).toBeVisible()
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
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
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
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await dialog.getByRole('button', { name: /Publicar Visualização/ }).click()
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
  ).toBeDisabled()
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
    .getByRole('combobox', { name: 'Métrica da visualização' })
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
