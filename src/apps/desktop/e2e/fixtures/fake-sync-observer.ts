import type { Page } from '@playwright/test'
import { z } from 'zod'

import { expect } from './electron-fixture'
import seedWorkspaces from './seed-workspaces.json' with { type: 'json' }

const workspace = seedWorkspaces.find((candidate) => candidate.name === 'TESTE')
if (!workspace) throw new Error('SYNC_FIXTURE_WORKSPACE_NOT_FOUND')
const connection = workspace.dataSourceConnections.find(
  (candidate) => candidate.dataSourceId === 'mr-tick-datasource-fake',
)
if (!connection) throw new Error('SYNC_FIXTURE_CONNECTION_NOT_FOUND')
export const fakeSyncScope = {
  workspaceId: workspace.id,
  connectionInstanceId: connection.id,
  dataSourceId: connection.dataSourceId,
}
const diagnosticsSchema = z.object({
  pullAttempts: z.number(),
  createAttempts: z.number(),
  updateAttempts: z.number(),
  deleteAttempts: z.number(),
  entries: z.array(
    z.object({ id: z.string().optional(), comments: z.string().optional() }),
  ),
})
export async function fakeSyncDiagnostics(page: Page) {
  const result = await page.evaluate(() =>
    window.api.addons.executeCommand({
      body: { commandId: 'fake-db:get-time-entry-sync-diagnostics' },
    }),
  )
  expect(result.isSuccess).toBe(true)
  return diagnosticsSchema.parse(result.data)
}
export async function localSyncEntries(page: Page) {
  const response = await page.evaluate(
    (scope) =>
      window.api.localRuntime.request({
        action: 'list',
        workspaceId: scope.workspaceId,
        filter: { connectionInstanceId: scope.connectionInstanceId },
      }),
    fakeSyncScope,
  )
  if (!response.ok) throw new Error(response.error.messageKey)
  return response.value.entries
}
