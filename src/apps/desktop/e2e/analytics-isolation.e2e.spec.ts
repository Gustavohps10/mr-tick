import type { LocalRuntimeRequest } from '@mr-tick/application'
import type { Page } from '@playwright/test'
import { z } from 'zod'

import { expect, test } from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

const diagnosticsSchema = z.object({
  requests: z.number(),
  retained: z.number(),
})
const injectedEntrySchema = z.object({
  created: z.object({ comments: z.string().min(1) }),
})
const remoteSchema = z.object({
  pullAttempts: z.number(),
  entries: z.array(
    z.object({ id: z.string().optional(), comments: z.string().optional() }),
  ),
})

async function command(page: Page, commandId: string) {
  const result = await page.evaluate(
    (id) => window.api.addons.executeCommand({ body: { commandId: id } }),
    commandId,
  )
  expect(result.isSuccess).toBe(true)
  return result.data
}

async function runtime(page: Page, request: LocalRuntimeRequest) {
  const result = await page.evaluate(
    (input) => window.api.localRuntime.request(input),
    request,
  )
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
  if (!result.ok) throw new Error(result.error.messageKey)
  return result.value
}

for (const outcome of ['success', 'failure', 'cancel'] as const) {
  test(`personal create/update/timer/push/pull remains usable during analytical ${outcome} [F4-02]`, async ({
    page,
  }) => {
    test.setTimeout(120000)
    const workspace = seedWorkspaces.workspaces.find(
      (item) => item.name === 'TESTE',
    )
    if (workspace === undefined) throw new Error('FIXTURE_WORKSPACE_REQUIRED')
    const connection = workspace.connections.find(
      (item) => item.addonId === 'mr-tick-datasource-fake',
    )
    if (connection === undefined) throw new Error('FIXTURE_CONNECTION_REQUIRED')
    const scope = {
      workspaceId: workspace.id,
      connectionInstanceId: connection.id,
    }

    await page.locator(`nav a[href="#/workspaces/${workspace.id}"]`).click()
    await expect
      .poll(
        async () => {
          const result = await page.evaluate(
            (input) =>
              window.api.localSync.request({
                action: 'status',
                workspaceId: input.workspaceId,
              }),
            scope,
          )
          return (
            result.ok &&
            result.statuses !== undefined &&
            result.statuses.length > 0 &&
            result.statuses.every(
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

    const catalog = await page.evaluate(
      (input) => window.api.addons.listAnalyticsDatasets({ body: input }),
      scope,
    )
    const dataset = catalog.data?.find(
      (item) => item.id === 'fake_time_entries',
    )
    expect(dataset).toBeDefined()
    if (dataset === undefined) return
    const load = {
      ...scope,
      query: {
        datasetId: dataset.id,
        execution: { kind: 'snapshot' as const, batchSize: 100 },
      },
      policy: { mode: 'full' as const },
    }
    const baseline = await page.evaluate(
      (body) => window.api.addons.loadAnalyticsDataset({ body }),
      load,
    )
    expect(baseline.isSuccess).toBe(true)
    if (baseline.data === undefined)
      throw new Error('BASELINE_PUBLICATION_REQUIRED')
    expect(baseline.data.publication.rowCount).toBeGreaterThan(100)
    const published = baseline.data

    try {
      await command(page, 'fake-db:pause-analytics-after-first-page')
      const updating = page.evaluate(
        (body) => window.api.addons.loadAnalyticsDataset({ body }),
        load,
      )
      await expect
        .poll(
          async () =>
            diagnosticsSchema.parse(
              await command(page, 'fake-db:get-analytics-page-diagnostics'),
            ).retained,
        )
        .toBe(1)
      expect(
        diagnosticsSchema.parse(
          await command(page, 'fake-db:get-analytics-page-diagnostics'),
        ).requests,
      ).toBe(2)

      const entryId = crypto.randomUUID()
      const payload = {
        taskId: 'DEV-9999',
        activityId: 'act-coding',
        activityName: 'Coding',
        connectionInstanceId: connection.id,
        dataSourceId: connection.addonId,
        userId: '1',
        userName: 'John Doe',
        timeSpentSeconds: 120,
        startDate: '2026-10-08T15:00:00.000Z',
        endDate: '2026-10-08T15:02:00.000Z',
        comments: `Personal during analytics ${outcome}`,
      }
      await runtime(page, {
        action: 'create',
        workspaceId: workspace.id,
        commandId: crypto.randomUUID(),
        entryId,
        payload,
      })
      await expect
        .poll(
          async () =>
            remoteSchema
              .parse(
                await command(page, 'fake-db:get-time-entry-sync-diagnostics'),
              )
              .entries.some((entry) => entry.comments === payload.comments),
          { timeout: 30000 },
        )
        .toBe(true)
      await expect
        .poll(async () => {
          const result = await page.evaluate(
            (input) =>
              window.api.localSync.request({
                action: 'status',
                workspaceId: input.workspaceId,
              }),
            scope,
          )
          return (
            result.ok &&
            result.statuses !== undefined &&
            result.statuses.every(
              (status) => !status.isPulling && !status.isPushing,
            )
          )
        })
        .toBe(true)
      const edited = await runtime(page, {
        action: 'update',
        workspaceId: workspace.id,
        commandId: crypto.randomUUID(),
        entryId,
        payload: { comments: `Updated during analytics ${outcome}` },
      })
      expect(edited.entry?.comments).toBe(`Updated during analytics ${outcome}`)

      const timerId = crypto.randomUUID()
      await runtime(page, {
        action: 'timerStart',
        workspaceId: workspace.id,
        commandId: crypto.randomUUID(),
        entryId: timerId,
        payload: {
          ...payload,
          startDate: new Date().toISOString(),
          endDate: undefined,
          timeSpentSeconds: 0,
          mode: 'countup',
        },
      })
      await runtime(page, {
        action: 'timerPause',
        workspaceId: workspace.id,
        commandId: crypto.randomUUID(),
        entryId: timerId,
      })
      await runtime(page, {
        action: 'timerResume',
        workspaceId: workspace.id,
        commandId: crypto.randomUUID(),
        entryId: timerId,
      })
      await runtime(page, {
        action: 'timerStop',
        workspaceId: workspace.id,
        commandId: crypto.randomUUID(),
        entryId: timerId,
      })

      const sync = await page.evaluate(
        (input) =>
          window.api.localSync.request({
            action: 'forceSync',
            ...input,
            direction: 'push',
          }),
        scope,
      )
      expect(sync.ok).toBe(true)
      await expect
        .poll(
          async () => {
            const remote = remoteSchema.parse(
              await command(page, 'fake-db:get-time-entry-sync-diagnostics'),
            )
            return remote.entries.some(
              (entry) =>
                entry.comments === `Updated during analytics ${outcome}`,
            )
          },
          { timeout: 30000 },
        )
        .toBe(true)
      const pullsBefore = remoteSchema.parse(
        await command(page, 'fake-db:get-time-entry-sync-diagnostics'),
      ).pullAttempts
      const beforeInjection = await runtime(page, {
        action: 'list',
        workspaceId: workspace.id,
        filter: { connectionInstanceId: connection.id },
      })
      const injected = injectedEntrySchema.parse(
        await command(page, 'fake-db:inject-today'),
      )
      expect(
        beforeInjection.entries.some(
          (entry) => entry.comments === injected.created.comments,
        ),
      ).toBe(false)
      const pull = await page.evaluate(
        (input) =>
          window.api.localSync.request({
            action: 'forceSync',
            ...input,
            direction: 'pull',
          }),
        scope,
      )
      expect(pull.ok).toBe(true)
      await expect
        .poll(
          async () =>
            remoteSchema.parse(
              await command(page, 'fake-db:get-time-entry-sync-diagnostics'),
            ).pullAttempts,
        )
        .toBeGreaterThan(pullsBefore)
      await expect
        .poll(async () => {
          const result = await page.evaluate(
            (input) =>
              window.api.localSync.request({
                action: 'status',
                workspaceId: input.workspaceId,
              }),
            scope,
          )
          return (
            result.ok &&
            result.statuses !== undefined &&
            result.statuses.every(
              (status) =>
                !status.isPulling &&
                !status.isPushing &&
                status.error === null &&
                status.lastPullResult === 'success',
            )
          )
        })
        .toBe(true)
      expect(
        diagnosticsSchema.parse(
          await command(page, 'fake-db:get-analytics-page-diagnostics'),
        ).requests,
      ).toBe(2)
      await expect
        .poll(async () => {
          const imported = await runtime(page, {
            action: 'list',
            workspaceId: workspace.id,
            filter: { connectionInstanceId: connection.id },
          })
          return imported.entries.some(
            (entry) => entry.comments === injected.created.comments,
          )
        })
        .toBe(true)

      let releaseCommand = 'fake-db:release-analytics-page'
      if (outcome === 'failure') releaseCommand = 'fake-db:fail-analytics-page'
      if (outcome === 'cancel') releaseCommand = 'fake-db:cancel-analytics-page'
      await command(page, releaseCommand)
      const refreshed = await updating
      if (outcome === 'success') expect(refreshed.isSuccess).toBe(true)
      if (outcome === 'failure') expect(refreshed.statusCode).toBe(503)
      if (outcome === 'cancel') expect(refreshed.statusCode).toBe(499)

      const hydrated = await page.evaluate(
        (workspaceId) =>
          window.api.addons.hydrateAnalytics({ body: { workspaceId } }),
        workspace.id,
      )
      const current = hydrated.data?.publications.find(
        (entry) =>
          entry.publication.selectionKey === published.publication.selectionKey,
      )
      expect(current).toBeDefined()
      if (outcome !== 'success') {
        expect(current?.publication.generationId).toBe(
          published.publication.generationId,
        )
        expect(current?.syncState.lastFastSyncAt).toBe(
          published.syncState.lastFastSyncAt,
        )
        expect(current?.syncState.lastFullReconcileAt).toBe(
          published.syncState.lastFullReconcileAt,
        )
      }
      const personal = await runtime(page, {
        action: 'get',
        workspaceId: workspace.id,
        entryId,
      })
      expect(personal.entry?.comments).toBe(
        `Updated during analytics ${outcome}`,
      )
      const recovery = await page.evaluate(
        (body) => window.api.addons.loadAnalyticsDataset({ body }),
        load,
      )
      expect(recovery.isSuccess).toBe(true)
    } finally {
      await command(page, 'fake-db:release-analytics-page')
      await command(page, 'fake-db:reset-seed')
    }
  })
}
