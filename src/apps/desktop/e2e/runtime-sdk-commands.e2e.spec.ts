import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

const workspace = seedWorkspaces.find((candidate) => candidate.name === 'TESTE')
if (!workspace) throw new Error('SDK_FIXTURE_WORKSPACE_NOT_FOUND')
const connection = workspace.dataSourceConnections.find(
  (candidate) => candidate.dataSourceId === 'mr-tick-datasource-fake',
)
if (!connection) throw new Error('SDK_FIXTURE_CONNECTION_NOT_FOUND')

test.use({
  runtimeProbeWorkspaceId: workspace.id,
  runtimeProbeConnectionId: connection.id,
})

async function probe(page: Page, commandId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const response = await window.api.addons.executeCommand({
      body: { commandId: id },
    })
    if (!response.isSuccess) throw new Error('SDK_PROBE_COMMAND_FAILED')
    const serialized = JSON.stringify(response.data)
    if (serialized === undefined) throw new Error('SDK_PROBE_RESPONSE_MISSING')
    return serialized
  }, commandId)
}

test('addon SDK grava no workspace explícito e reutiliza operação após reload do executor', async ({
  page,
  electronApp,
}) => {
  expect(new URL(page.url()).hash).not.toContain(`/workspaces/${workspace.id}`)
  await expect
    .poll(async () => {
      const response = await page.evaluate(
        (workspaceId) =>
          window.api.localRuntime.request({
            action: 'list',
            workspaceId,
            filter: {},
          }),
        workspace.id,
      )
      return response.ok
    })
    .toBe(true)

  const created = await probe(page, 'fake-db:runtime-create-entry')
  expect(created).toContain('"ok":true')
  expect(created).toContain('"comments":"SDK runtime proof"')
  expect(created).toContain(`"dataSourceId":"${connection.dataSourceId}"`)
  expect(created).toContain(`"connectionInstanceId":"${connection.id}"`)
  const read = await probe(page, 'fake-db:runtime-get-entry')
  expect(read).toContain('"ok":true')
  expect(read).toContain('"comments":"SDK runtime proof"')
  expect(await probe(page, 'fake-db:runtime-create-entry')).toBe(created)

  const records = await page.evaluate(
    (workspaceId) =>
      window.api.localRuntime.request({
        action: 'list',
        workspaceId,
        filter: {},
      }),
    workspace.id,
  )
  expect(records.ok).toBe(true)
  if (!records.ok) throw new Error(records.error.messageKey)
  const proof = records.value.entries.filter(
    (entry) => entry.comments === 'SDK runtime proof',
  )
  expect(proof).toHaveLength(1)
  const entry = proof.find(
    (candidate) => candidate.connectionInstanceId === connection.id,
  )
  if (!entry) throw new Error('SDK_PERSISTED_ENTRY_NOT_FOUND')

  let owner: Page | null = null
  for (const candidate of await electronApp.windows()) {
    const window = await electronApp.browserWindow(candidate)
    const isOwner = await window.evaluate(
      (browserWindow) => browserWindow.windowType === 'runtime',
    )
    await window.dispose()
    if (isOwner) owner = candidate
  }
  if (!owner) throw new Error('SDK_RUNTIME_OWNER_NOT_FOUND')
  await owner.reload({ waitUntil: 'domcontentloaded' })
  await expect
    .poll(async () => {
      const response = await page.evaluate(
        (scope) =>
          window.api.localRuntime.request({
            action: 'get',
            workspaceId: scope.workspaceId,
            entryId: scope.entryId,
          }),
        { workspaceId: workspace.id, entryId: entry.id },
      )
      return response.ok && response.value.entry?.id === entry.id
    })
    .toBe(true)
  expect(await probe(page, 'fake-db:runtime-create-entry')).toBe(created)
  const afterReload = await page.evaluate(
    (workspaceId) =>
      window.api.localRuntime.request({
        action: 'list',
        workspaceId,
        filter: {},
      }),
    workspace.id,
  )
  expect(afterReload.ok).toBe(true)
  if (!afterReload.ok) throw new Error(afterReload.error.messageKey)
  expect(
    afterReload.value.entries.filter((candidate) => candidate.id === entry.id),
  ).toHaveLength(1)

  const isolatedWorkspace = seedWorkspaces.find(
    (candidate) => candidate.name === 'WORKSPACE ISOLADO',
  )
  if (!isolatedWorkspace) throw new Error('SDK_ISOLATED_WORKSPACE_NOT_FOUND')
  const isolated = await page.evaluate(
    (scope) =>
      window.api.localRuntime.request({
        action: 'get',
        workspaceId: scope.workspaceId,
        entryId: scope.entryId,
      }),
    { workspaceId: isolatedWorkspace.id, entryId: entry.id },
  )
  expect(isolated.ok).toBe(true)
  if (!isolated.ok) throw new Error(isolated.error.messageKey)
  expect(isolated.value.entry).toBeNull()
})
