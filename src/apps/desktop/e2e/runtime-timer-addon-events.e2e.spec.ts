import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/electron-fixture'
import { inspectCachedTasks } from './fixtures/runtime-task-cache-probe'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

const probeWorkspace = seedWorkspaces.find(
  (candidate) => candidate.name === 'TESTE',
)
if (!probeWorkspace) throw new Error('QUICK_TIMER_FIXTURE_WORKSPACE_NOT_FOUND')
const probeConnection = probeWorkspace.dataSourceConnections.find(
  (candidate) => candidate.dataSourceId === 'mr-tick-datasource-fake',
)
if (!probeConnection)
  throw new Error('QUICK_TIMER_FIXTURE_CONNECTION_NOT_FOUND')
test.use({
  runtimeProbeWorkspaceId: probeWorkspace.id,
  runtimeProbeConnectionId: probeConnection.id,
})

type ObservedTimerAction = 'start' | 'pause' | 'resume' | 'stop'

async function executeProbe(page: Page, commandId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const result = await window.api.addons.executeCommand({
      body: { commandId: id },
    })
    if (!result.isSuccess) throw new Error('TIMER_EVENT_PROBE_COMMAND_FAILED')
    const serialized = JSON.stringify(result.data)
    if (serialized === undefined)
      throw new Error('TIMER_EVENT_PROBE_RESULT_MISSING')
    return serialized
  }, commandId)
}

function eventCount(diagnostics: string, action: ObservedTimerAction): number {
  const matches = diagnostics.match(new RegExp(`"action":"${action}"`, 'g'))
  if (matches === null) return 0
  return matches.length
}

async function expectEvent(
  page: Page,
  action: ObservedTimerAction,
): Promise<void> {
  await expect
    .poll(async () => {
      const diagnostics = await executeProbe(
        page,
        'fake-db:get-timer-event-diagnostics',
      )
      return eventCount(diagnostics, action)
    })
    .toBe(1)
}

test('timer iniciado pela UI chega ao addon com start, pause, resume e stop sem eventos duplicados', async ({
  page,
}) => {
  const workspace = seedWorkspaces.find(
    (candidate) => candidate.name === 'TESTE',
  )
  if (!workspace) throw new Error('TIMER_EVENT_FIXTURE_WORKSPACE_NOT_FOUND')
  const workspaceLink = page
    .locator(`nav a[href*="/workspaces/${workspace.id}"]`)
    .first()
  await expect(workspaceLink).toBeVisible({ timeout: 15000 })
  await workspaceLink.click()
  await expect(
    page.locator(
      '[data-testid="sync-status-indicator"][aria-label="Sincronizado"]',
    ),
  ).toBeVisible({ timeout: 30000 })
  await executeProbe(page, 'fake-db:reset-timer-event-diagnostics')

  const start = page.getByTestId('timerbar-start-btn').first()
  const pause = page.getByTestId('timerbar-pause-btn').first()
  const stop = page.getByTestId('timerbar-stop-btn').first()
  await expect(start).toBeVisible()
  await start.click()
  await expect(pause).toBeVisible()
  await expectEvent(page, 'start')
  await pause.click()
  const resume = page.getByTestId('time-entry-resume-btn').first()
  await expect(resume).toBeVisible()
  await expectEvent(page, 'pause')
  await resume.click()
  await expect(pause).toBeVisible()
  await expectEvent(page, 'resume')
  await stop.click()
  await expect(start).toBeVisible()
  await expectEvent(page, 'stop')

  const diagnostics = await executeProbe(
    page,
    'fake-db:get-timer-event-diagnostics',
  )
  for (const action of ['start', 'pause', 'resume', 'stop']) {
    const matches = diagnostics.match(new RegExp(`"action":"${action}"`, 'g'))
    expect(matches).toHaveLength(1)
  }
  expect(diagnostics).toContain(`"workspaceId":"${workspace.id}"`)
  expect(diagnostics.indexOf('"action":"start"')).toBeLessThan(
    diagnostics.indexOf('"action":"pause"'),
  )
  expect(diagnostics.indexOf('"action":"pause"')).toBeLessThan(
    diagnostics.indexOf('"action":"resume"'),
  )
  expect(diagnostics.indexOf('"action":"resume"')).toBeLessThan(
    diagnostics.indexOf('"action":"stop"'),
  )
})

test('SDK start pause resume stop consecutivos entregam um evento por commit na mesma ordem', async ({
  page,
}) => {
  await expect
    .poll(async () => {
      const result = await page.evaluate(
        (workspaceId) =>
          window.api.localRuntime.request({
            action: 'timerState',
            workspaceId,
          }),
        probeWorkspace.id,
      )
      return result.ok
    })
    .toBe(true)
  await executeProbe(page, 'fake-db:reset-timer-event-diagnostics')
  await expect
    .poll(
      async () => {
        const response = await page.evaluate(
          (workspaceId) =>
            window.api.localSync.request({ action: 'status', workspaceId }),
          probeWorkspace.id,
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
  await expect
    .poll(
      async () => (await inspectCachedTasks(page, probeConnection.id)).length,
      { timeout: 30000 },
    )
    .toBeGreaterThan(0)
  const cachedTasks = await inspectCachedTasks(page, probeConnection.id)
  const selectedTask = cachedTasks.find(
    (candidate) =>
      candidate.connectionInstanceId === probeConnection.id &&
      candidate.sourceId.length > 0 &&
      candidate.title.length > 0,
  )
  if (!selectedTask) throw new Error('QUICK_TIMER_CACHED_TASK_REQUIRED')
  const completed = await page.evaluate(async (task) => {
    const response = await window.api.addons.executeCommand({
      body: {
        commandId: 'fake-db:runtime-quick-timer',
        args: [task.sourceId, task.title],
      },
    })
    if (!response.isSuccess) throw new Error('QUICK_TIMER_COMMAND_FAILED')
    return JSON.stringify(response.data)
  }, selectedTask)
  expect(completed).toContain('"ok":true')
  for (const action of ['start', 'pause', 'resume', 'stop']) {
    await expect
      .poll(async () => {
        const diagnostics = await executeProbe(
          page,
          'fake-db:get-timer-event-diagnostics',
        )
        return diagnostics.match(new RegExp(`"action":"${action}"`, 'g'))
          ?.length
      })
      .toBe(1)
  }
  const diagnostics = await executeProbe(
    page,
    'fake-db:get-timer-event-diagnostics',
  )
  expect(diagnostics.match(/"action":/g)).toHaveLength(4)
  expect(diagnostics.match(/"seconds":/g)).toHaveLength(4)
  const taskEvents =
    diagnostics.split(JSON.stringify(selectedTask.sourceId)).length - 1
  expect(taskEvents, diagnostics).toBe(4)
  expect(
    diagnostics.split(JSON.stringify(selectedTask.title)).length - 1,
    diagnostics,
  ).toBe(4)
  expect(diagnostics.indexOf('"action":"start"')).toBeLessThan(
    diagnostics.indexOf('"action":"pause"'),
  )
  expect(diagnostics.indexOf('"action":"pause"')).toBeLessThan(
    diagnostics.indexOf('"action":"resume"'),
  )
  expect(diagnostics.indexOf('"action":"resume"')).toBeLessThan(
    diagnostics.indexOf('"action":"stop"'),
  )
  const active = await page.evaluate(
    (workspaceId) =>
      window.api.localRuntime.request({ action: 'timerState', workspaceId }),
    probeWorkspace.id,
  )
  expect(active.ok).toBe(true)
  if (!active.ok) throw new Error(active.error.messageKey)
  expect(active.value.timer).toBeNull()
})
