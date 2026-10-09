import type { Page } from '@playwright/test'
import { z } from 'zod'

import { expect, test } from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

const diagnosticsSchema = z.object({ retainedPulls: z.number() })
async function command(page: Page, commandId: string) {
  const response = await page.evaluate(
    (id) => window.api.addons.executeCommand({ body: { commandId: id } }),
    commandId,
  )
  expect(response.isSuccess).toBe(true)
  return response.data
}
async function retainedPulls(page: Page): Promise<number> {
  return diagnosticsSchema.parse(
    await command(page, 'fake-db:get-time-entry-sync-diagnostics'),
  ).retainedPulls
}

test('CRUD local permanece disponível enquanto forceSync aguarda o provedor', async ({
  page,
}) => {
  const workspace = seedWorkspaces.find(
    (candidate) => candidate.name === 'TESTE',
  )
  if (!workspace) throw new Error('LOCAL_FIRST_FIXTURE_WORKSPACE_NOT_FOUND')
  const connection = workspace.dataSourceConnections.find(
    (candidate) => candidate.dataSourceId === 'mr-tick-datasource-fake',
  )
  if (!connection) throw new Error('LOCAL_FIRST_FIXTURE_CONNECTION_NOT_FOUND')
  await expect
    .poll(
      async () => {
        const response = await page.evaluate(
          (workspaceId) =>
            window.api.localSync.request({ action: 'status', workspaceId }),
          workspace.id,
        )
        return (
          response.ok &&
          response.statuses !== undefined &&
          response.statuses.length > 0 &&
          response.statuses.every(
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
  await command(page, 'fake-db:pause-one-time-entry-pull')
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
    await expect.poll(() => retainedPulls(page)).toBeGreaterThan(0)
    const identity = await page.evaluate(() => ({
      commandId: crypto.randomUUID(),
      entryId: crypto.randomUUID(),
    }))
    const created = await page.evaluate(
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
            comments: 'Local-first while remote pending',
          },
        }),
      { workspaceId: workspace.id, ...identity },
    )
    const retainedDuringCreate = await retainedPulls(page)
    expect(retainedDuringCreate).toBeGreaterThan(0)
    expect(
      created,
      JSON.stringify({ created, retainedDuringCreate }),
    ).toMatchObject({ ok: true })
    if (!created.ok) throw new Error(created.error.messageKey)
    expect(created.value.entry?.id).toBe(identity.entryId)
    const read = await page.evaluate(
      (scope) =>
        window.api.localRuntime.request({
          action: 'get',
          workspaceId: scope.workspaceId,
          entryId: scope.entryId,
        }),
      { workspaceId: workspace.id, entryId: identity.entryId },
    )
    expect(read.ok).toBe(true)
    if (!read.ok) throw new Error(read.error.messageKey)
    expect(read.value.entry?.comments).toBe('Local-first while remote pending')
    expect(await retainedPulls(page)).toBeGreaterThan(0)
  } finally {
    await command(page, 'fake-db:release-time-entry-pulls')
  }
})
