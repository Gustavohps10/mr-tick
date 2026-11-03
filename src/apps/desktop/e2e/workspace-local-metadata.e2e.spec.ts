import { expect, test } from './fixtures/electron-fixture'
import seed from './fixtures/seed-workspaces.json' with { type: 'json' }

test('metadados locais: cadastrar, renomear e usar atividade sem conexão externa após reload', async ({
  page,
}) => {
  const workspace = seed.workspaces.find(
    (item) => item.connections.length === 0,
  )
  expect(workspace).toBeDefined()
  if (!workspace) return
  await page.locator(`nav a[href*="/workspaces/${workspace.id}"]`).click()
  await page
    .getByRole('button', { name: 'Configurações do Workspace', exact: true })
    .click()
  await page.getByRole('tab', { name: 'Metadados locais', exact: true }).click()
  const settings = page.getByTestId('local-metadata-settings')
  await settings
    .getByRole('textbox', { name: 'Nome do metadado' })
    .pressSequentially('Análise local')
  await settings
    .getByRole('button', { name: 'Salvar item', exact: true })
    .click()
  await expect(
    settings.getByText('Análise local', { exact: true }),
  ).toBeVisible()
  await settings
    .getByRole('button', { name: 'Editar Análise local', exact: true })
    .click()
  await settings
    .getByRole('textbox', { name: 'Nome do metadado' })
    .fill('Revisão local')
  await settings
    .getByRole('button', { name: 'Salvar item', exact: true })
    .click()
  await expect(
    settings.getByText('Revisão local', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'Metadados locais', exact: true }).click()
  await expect(
    settings.getByText('Revisão local', { exact: true }),
  ).toBeVisible()
  await page.getByTestId('timerbar-task-popover-trigger').click()
  const input = page.getByTestId('time-entry-task-lookup-input')
  const popup = page
    .locator('[data-slot="popover-content"]')
    .filter({ has: input })
  await popup.getByRole('combobox', { name: 'Conexão', exact: true }).click()
  await page.getByRole('option', { name: /Local/ }).click()
  await popup.getByRole('combobox', { name: 'Atividade', exact: true }).click()
  await page.getByRole('option', { name: 'Revisão local', exact: true }).click()
  await input.pressSequentially('LOCAL-123456')
  await expect(input).toHaveValue('LOCAL-123456')
  await input.press('Enter')
  await expect(input).not.toBeVisible()
  await expect(page.getByTestId('timerbar-task-badge')).toContainText(
    'LOCAL-123456',
  )
})
