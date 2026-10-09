import type {
  LocalRuntimeRequest,
  LocalRuntimeResponse,
} from '@mr-tick/application'
import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

async function requestRuntime(
  page: Page,
  input: LocalRuntimeRequest,
): Promise<LocalRuntimeResponse> {
  return page.evaluate(
    (request) => window.api.localRuntime.request(request),
    input,
  )
}

function fixtureScope() {
  const workspace = seedWorkspaces.find(
    (candidate) => candidate.name === 'TESTE',
  )
  if (!workspace) throw new Error('CONNECTED_FIXTURE_WORKSPACE_NOT_FOUND')
  const connection = workspace.dataSourceConnections.find(
    (candidate) => candidate.dataSourceId === 'mr-tick-datasource-fake',
  )
  if (!connection) throw new Error('FAKE_FIXTURE_CONNECTION_NOT_FOUND')
  return { workspace, connection }
}

test.describe('Runtime local - CRUD explícito e replay', () => {
  test('CRUD opera fora da rota ativa e preserva identidade após replay e reload', async ({
    electronApp,
    page,
  }) => {
    const { workspace, connection } = fixtureScope()
    expect(new URL(page.url()).hash).not.toContain(
      `/workspaces/${workspace.id}`,
    )
    await expect
      .poll(async () => {
        const result = await requestRuntime(page, {
          action: 'list',
          workspaceId: workspace.id,
          filter: {},
        })
        return result.ok
      })
      .toBe(true)

    const taskResult = await page.evaluate(
      async (scope) => {
        return window.api.tasks.listTasks({
          body: {
            workspaceId: scope.workspace.id,
            connectionInstanceId: scope.connection.id,
            ids: ['DEV-9999'],
          },
        })
      },
      { workspace, connection },
    )
    expect(taskResult.isSuccess).toBe(true)
    const task = taskResult.data?.find(
      (candidate) => candidate.id === 'DEV-9999',
    )
    if (!task) throw new Error('E2E_SUPPORT_TASK_NOT_FOUND')

    const metadataResult = await page.evaluate(
      async (scope) => {
        return window.api.metadata.pull({
          body: {
            workspaceId: scope.workspace.id,
            connectionInstanceId: scope.connection.id,
            checkpoint: { updatedAt: new Date(0), id: '' },
            batch: 25,
          },
        })
      },
      { workspace, connection },
    )
    expect(metadataResult.isSuccess).toBe(true)
    const activity = metadataResult.data?.activities.find(
      (candidate) => candidate.name === 'Coding',
    )
    if (!activity) throw new Error('E2E_CODING_ACTIVITY_NOT_FOUND')
    const identity = await page.evaluate(() => ({
      commandId: crypto.randomUUID(),
      entryId: crypto.randomUUID(),
    }))
    const create: LocalRuntimeRequest = {
      action: 'create',
      ...identity,
      workspaceId: workspace.id,
      payload: {
        taskId: task.id,
        activityId: activity.id,
        activityName: activity.name,
        connectionInstanceId: connection.id,
        dataSourceId: connection.dataSourceId,
        userId: connection.member.id,
        userName: connection.member.name,
        timeSpentSeconds: 900,
        startDate: '2026-10-08T10:00:00.000Z',
        endDate: '2026-10-08T10:15:00.000Z',
        comments: 'Runtime CRUD proof',
      },
    }
    const created = await requestRuntime(page, create)
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error(created.error.messageKey)
    expect(created.value.entry?.id).toBe(identity.entryId)
    const replay = await requestRuntime(page, create)
    expect(replay.ok).toBe(true)
    if (!replay.ok) throw new Error(replay.error.messageKey)
    expect(replay.value.replayed).toBe(true)
    expect(replay.value.entry).toEqual(created.value.entry)
    expect(replay.value.timer).toEqual(created.value.timer)
    expect(replay.value.deleted).toEqual(created.value.deleted)

    const changedPayload = {
      ...create,
      payload: { ...create.payload, comments: 'Different command payload' },
    }
    const conflict = await requestRuntime(page, changedPayload)
    expect(conflict.ok).toBe(false)
    if (conflict.ok) throw new Error('COMMAND_PAYLOAD_CONFLICT_NOT_REJECTED')
    expect(conflict.error.statusCode).toBe(409)

    const windows = await electronApp.windows()
    let executor: Page | null = null
    for (const candidate of windows) {
      const window = await electronApp.browserWindow(candidate)
      const isRuntime = await window.evaluate(
        (browserWindow) => browserWindow.windowType === 'runtime',
      )
      await window.dispose()
      if (isRuntime) executor = candidate
    }
    if (!executor) throw new Error('RUNTIME_WINDOW_NOT_FOUND')
    await executor.reload({ waitUntil: 'domcontentloaded' })
    await expect
      .poll(async () => {
        const result = await requestRuntime(page, {
          action: 'get',
          workspaceId: workspace.id,
          entryId: identity.entryId,
        })
        if (!result.ok) return null
        return result.value.entry?.id
      })
      .toBe(identity.entryId)
    const replayAfterReload = await requestRuntime(page, create)
    expect(replayAfterReload.ok).toBe(true)
    if (!replayAfterReload.ok)
      throw new Error(replayAfterReload.error.messageKey)
    expect(replayAfterReload.value.replayed).toBe(true)
    expect(replayAfterReload.value.entry).toEqual(created.value.entry)
    expect(replayAfterReload.value.deleted).toEqual(created.value.deleted)

    const list = await requestRuntime(page, {
      action: 'list',
      workspaceId: workspace.id,
      filter: { taskId: task.id },
    })
    expect(list.ok).toBe(true)
    if (!list.ok) throw new Error(list.error.messageKey)
    expect(
      list.value.entries.filter((entry) => entry.id === identity.entryId),
    ).toHaveLength(1)
    const updateId = await page.evaluate(() => crypto.randomUUID())
    const updated = await requestRuntime(page, {
      action: 'update',
      commandId: updateId,
      workspaceId: workspace.id,
      entryId: identity.entryId,
      payload: { comments: 'Edited via runtime' },
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) throw new Error(updated.error.messageKey)
    expect(updated.value.entry?.comments).toBe('Edited via runtime')
    const deleteId = await page.evaluate(() => crypto.randomUUID())
    const deleted = await requestRuntime(page, {
      action: 'delete',
      commandId: deleteId,
      workspaceId: workspace.id,
      entryId: identity.entryId,
    })
    expect(deleted.ok).toBe(true)
    if (!deleted.ok) throw new Error(deleted.error.messageKey)
    expect(deleted.value.deleted).toBe(true)
    const missing = await requestRuntime(page, {
      action: 'get',
      workspaceId: workspace.id,
      entryId: identity.entryId,
    })
    expect(missing.ok).toBe(true)
    if (!missing.ok) throw new Error(missing.error.messageKey)
    expect(missing.value.entry).toBeNull()
  })
})
