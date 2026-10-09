import { z } from 'zod'

import { expect, test } from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

const renamedActivitySchema = z.object({
  ok: z.literal(true),
  activityId: z.string(),
  previousName: z.string(),
  name: z.string(),
})

test('menu aberto mantém identidade quando metadata da atividade muda sem alterar o apontamento', async ({
  page,
}) => {
  const workspace = seedWorkspaces.find(
    (candidate) => candidate.name === 'TESTE',
  )
  if (!workspace) throw new Error('CELL_LIFECYCLE_WORKSPACE_NOT_FOUND')
  await page.locator(`nav a[href$="/workspaces/${workspace.id}"]`).click()
  await expect(
    page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    ),
  ).toBeVisible({ timeout: 30000 })
  const firstTrigger = page.getByTestId('time-entry-actions-trigger').first()
  await expect(firstTrigger).toBeVisible()
  const entryId = await firstTrigger
    .locator('xpath=ancestor::tr[1]')
    .getAttribute('data-entry-id')
  if (!entryId) throw new Error('CELL_LIFECYCLE_ENTRY_ID_MISSING')
  const escapedEntryId = await page.evaluate((id) => CSS.escape(id), entryId)
  const row = page.locator(
    `[data-testid="time-entry-row"][data-entry-id="${escapedEntryId}"]`,
  )
  const before = await page.evaluate(
    (scope) =>
      window.api.localRuntime.request({
        action: 'get',
        workspaceId: scope.workspaceId,
        entryId: scope.entryId,
      }),
    { workspaceId: workspace.id, entryId },
  )
  expect(before.ok).toBe(true)
  if (!before.ok) throw new Error(before.error.messageKey)
  const entry = before.value.entry
  if (!entry) throw new Error('CELL_LIFECYCLE_ENTRY_NOT_FOUND')
  if (!entry.connectionInstanceId)
    throw new Error('CELL_LIFECYCLE_CONNECTION_MISSING')
  if (!entry.activityId) throw new Error('CELL_LIFECYCLE_ACTIVITY_MISSING')
  await row.getByTestId('time-entry-actions-trigger').click()
  const edit = page.getByTestId('time-entry-edit-btn')
  await expect(edit).toBeVisible()
  const renamed = await page.evaluate(
    (activityId) =>
      window.api.addons.executeCommand({
        body: {
          commandId: 'fake-db:rename-activity-metadata',
          args: [{ activityId }],
        },
      }),
    entry.activityId,
  )
  expect(renamed.isSuccess).toBe(true)
  const activity = renamedActivitySchema.parse(renamed.data)
  expect(activity.activityId).toBe(entry.activityId)
  await expect(
    row.getByText(activity.previousName, { exact: true }),
  ).toBeVisible()
  const pulled = await page.evaluate(
    (scope) =>
      window.api.localSync.request({
        action: 'forceSync',
        workspaceId: scope.workspaceId,
        connectionInstanceId: scope.connectionInstanceId,
        direction: 'pull',
      }),
    {
      workspaceId: workspace.id,
      connectionInstanceId: entry.connectionInstanceId,
    },
  )
  expect(pulled.ok).toBe(true)
  await expect(row.getByText(activity.name, { exact: true })).toBeVisible()
  const after = await page.evaluate(
    (scope) =>
      window.api.localRuntime.request({
        action: 'get',
        workspaceId: scope.workspaceId,
        entryId: scope.entryId,
      }),
    { workspaceId: workspace.id, entryId },
  )
  expect(after).toEqual(before)
  await expect(row).toHaveCount(1)
  await expect(edit).toBeVisible()
  await edit.click()
  await expect(row.getByTestId('time-entry-comment-input')).toBeVisible()
})

test('comentário em edição mantém foco e texto durante atualização de metadata da atividade', async ({
  page,
}) => {
  const workspace = seedWorkspaces.find(
    (candidate) => candidate.name === 'TESTE',
  )
  if (!workspace) throw new Error('CELL_LIFECYCLE_WORKSPACE_NOT_FOUND')
  await page.locator(`nav a[href$="/workspaces/${workspace.id}"]`).click()
  await expect(
    page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    ),
  ).toBeVisible({ timeout: 30000 })
  const firstTrigger = page.getByTestId('time-entry-actions-trigger').first()
  await expect(firstTrigger).toBeVisible()
  const entryId = await firstTrigger
    .locator('xpath=ancestor::tr[1]')
    .getAttribute('data-entry-id')
  if (!entryId) throw new Error('CELL_LIFECYCLE_ENTRY_ID_MISSING')
  const escapedEntryId = await page.evaluate((id) => CSS.escape(id), entryId)
  const row = page.locator(
    `[data-testid="time-entry-row"][data-entry-id="${escapedEntryId}"]`,
  )
  const before = await page.evaluate(
    (scope) =>
      window.api.localRuntime.request({
        action: 'get',
        workspaceId: scope.workspaceId,
        entryId: scope.entryId,
      }),
    { workspaceId: workspace.id, entryId },
  )
  expect(before.ok).toBe(true)
  if (!before.ok) throw new Error(before.error.messageKey)
  const entry = before.value.entry
  if (!entry) throw new Error('CELL_LIFECYCLE_ENTRY_NOT_FOUND')
  if (!entry.connectionInstanceId)
    throw new Error('CELL_LIFECYCLE_CONNECTION_MISSING')
  if (!entry.activityId) throw new Error('CELL_LIFECYCLE_ACTIVITY_MISSING')
  await row.dblclick()
  const input = row.getByTestId('time-entry-comment-input')
  await expect(input).toBeVisible()
  const draft = 'Draft preservado durante atualização de metadata'
  await input.focus()
  await input.fill(draft)
  await expect(input).toBeFocused()
  await expect(input).toHaveValue(draft)
  const renamed = await page.evaluate(
    (activityId) =>
      window.api.addons.executeCommand({
        body: {
          commandId: 'fake-db:rename-activity-metadata',
          args: [{ activityId }],
        },
      }),
    entry.activityId,
  )
  expect(renamed.isSuccess).toBe(true)
  const activity = renamedActivitySchema.parse(renamed.data)
  expect(activity.activityId).toBe(entry.activityId)
  await expect(
    row.getByText(activity.previousName, { exact: true }),
  ).toBeVisible()
  const pulled = await page.evaluate(
    (scope) =>
      window.api.localSync.request({
        action: 'forceSync',
        workspaceId: scope.workspaceId,
        connectionInstanceId: scope.connectionInstanceId,
        direction: 'pull',
      }),
    {
      workspaceId: workspace.id,
      connectionInstanceId: entry.connectionInstanceId,
    },
  )
  expect(pulled.ok).toBe(true)
  await expect(row.getByText(activity.name, { exact: true })).toBeVisible()
  const after = await page.evaluate(
    (scope) =>
      window.api.localRuntime.request({
        action: 'get',
        workspaceId: scope.workspaceId,
        entryId: scope.entryId,
      }),
    { workspaceId: workspace.id, entryId },
  )
  expect(after).toEqual(before)
  await expect(row).toHaveCount(1)
  await expect(input).toBeFocused()
  await expect(input).toHaveValue(draft)
})
