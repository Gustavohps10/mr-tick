import type { Page } from '@playwright/test'
import { z } from 'zod'

import { expect, test } from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

const syncDiagnostics = z.object({ retainedPulls: z.number() })
async function fakeCommand(page: Page, commandId: string) {
  const response = await page.evaluate(
    (id) => window.api.addons.executeCommand({ body: { commandId: id } }),
    commandId,
  )
  expect(response.isSuccess).toBe(true)
  return response.data
}
async function createLocal(
  page: Page,
  workspaceId: string,
  comments: string,
): Promise<string> {
  const identity = await page.evaluate(() => ({
    commandId: crypto.randomUUID(),
    entryId: crypto.randomUUID(),
  }))
  const response = await page.evaluate(
    (scope) =>
      window.api.localRuntime.request({
        action: 'create',
        workspaceId: scope.workspaceId,
        commandId: scope.commandId,
        entryId: scope.entryId,
        payload: {
          taskId: '',
          activityId: '',
          timeSpentSeconds: 60,
          startDate: '2026-10-08T10:00:00.000Z',
          endDate: '2026-10-08T10:01:00.000Z',
          comments: scope.comments,
        },
      }),
    { workspaceId, comments, ...identity },
  )
  expect(response, JSON.stringify(response)).toMatchObject({ ok: true })
  if (!response.ok) throw new Error(response.error.messageKey)
  expect(response.value.entry?.id).toBe(identity.entryId)
  return identity.entryId
}

test('reset espera lease remoto, fecha reader real e reabre CRUD/cache no novo storage', async ({
  page,
}) => {
  const workspace = seedWorkspaces.find(
    (candidate) => candidate.name === 'TESTE',
  )
  if (!workspace) throw new Error('RESET_FIXTURE_WORKSPACE_NOT_FOUND')
  const connection = workspace.dataSourceConnections.find(
    (candidate) => candidate.dataSourceId === 'mr-tick-datasource-fake',
  )
  if (!connection) throw new Error('RESET_FIXTURE_CONNECTION_NOT_FOUND')
  await page
    .locator(`nav a[href*="/workspaces/${workspace.id}"]`)
    .first()
    .click()
  await expect(
    page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    ),
  ).toBeVisible({ timeout: 30000 })
  const beforeId = await createLocal(
    page,
    workspace.id,
    'Runtime reset before proof',
  )
  await expect(
    page.getByText('Runtime reset before proof', { exact: true }),
  ).toBeVisible()
  await fakeCommand(page, 'fake-db:pause-one-time-entry-pull')
  try {
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
    await expect
      .poll(
        async () =>
          syncDiagnostics.parse(
            await fakeCommand(page, 'fake-db:get-time-entry-sync-diagnostics'),
          ).retainedPulls,
      )
      .toBeGreaterThan(0)
    const reset = page.evaluate(
      (workspaceId) =>
        window.api.localSync.request({ action: 'reset', workspaceId }),
      workspace.id,
    )
    await expect
      .poll(async () => {
        const query = await page.evaluate(
          (workspaceId) =>
            window.api.localRuntime.request({
              action: 'timerState',
              workspaceId,
            }),
          workspace.id,
        )
        if (query.ok) return null
        return query.error.messageKey
      })
      .toBe('localRuntime.workspaceMaintenance')
    await expect(
      page.getByText('Runtime reset before proof', { exact: true }),
    ).not.toBeVisible()
    expect(
      syncDiagnostics.parse(
        await fakeCommand(page, 'fake-db:get-time-entry-sync-diagnostics'),
      ).retainedPulls,
    ).toBeGreaterThan(0)
    await fakeCommand(page, 'fake-db:release-time-entry-pulls')
    const result = await reset
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
    const oldRecord = await page.evaluate(
      (scope) =>
        window.api.localRuntime.request({
          action: 'get',
          workspaceId: scope.workspaceId,
          entryId: scope.entryId,
        }),
      { workspaceId: workspace.id, entryId: beforeId },
    )
    expect(oldRecord.ok).toBe(true)
    if (!oldRecord.ok) throw new Error(oldRecord.error.messageKey)
    expect(oldRecord.value.entry).toBeNull()
    const afterId = await createLocal(
      page,
      workspace.id,
      'Runtime reset after proof',
    )
    expect(afterId).not.toBe(beforeId)
    await expect(
      page.getByText('Runtime reset after proof', { exact: true }),
    ).toBeVisible({ timeout: 15000 })
    await expect(
      page.getByText('Runtime reset before proof', { exact: true }),
    ).not.toBeVisible()
  } finally {
    await fakeCommand(page, 'fake-db:release-time-entry-pulls')
  }
})
