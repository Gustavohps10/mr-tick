import { expect, test } from './fixtures/electron-fixture'
import seedWorkspaces from './fixtures/seed-workspaces.json' with { type: 'json' }

const addonId = 'connection-pending-work-probe'
const profileId = 'fake-main'
const workspace = seedWorkspaces.workspaces.find(
  (candidate) => candidate.name === 'TESTE',
)
if (!workspace) throw new Error('PENDING_WORK_WORKSPACE_NOT_FOUND')

test.use({ pendingWorkArchiveProbe: true })

async function archiveConnection(
  page: import('@playwright/test').Page,
  connectionInstanceId: string,
) {
  return page.evaluate(
    async ({ scope, requestedAddonId }) =>
      window.api.addons.executeCommand({
        body: {
          commandId: `${requestedAddonId}:pending-work:archive-connection`,
          args: [scope],
        },
      }),
    {
      requestedAddonId: addonId,
      scope: { workspaceId: workspace.id, connectionInstanceId },
    },
  )
}

test('T25 archive is blocked by persisted RxDB writes until synchronization confirms them', async ({
  page,
}) => {
  const connectionInstanceId = 'connection-pending-work-archive'
  const linked = await page.evaluate(
    (input) =>
      window.api.workspaces.linkDataSource({
        body: {
          workspaceId: input.workspaceId,
          addonId: input.addonId,
          connectionInstanceId: input.connectionInstanceId,
          connectionProfileId: input.profileId,
        },
      }),
    {
      workspaceId: workspace.id,
      addonId,
      connectionInstanceId,
      profileId,
    },
  )
  expect(linked.isSuccess).toBe(true)

  const connected = await page.evaluate(
    (input) =>
      window.api.workspaces.submitCredentials({
        body: {
          workspaceId: input.workspaceId,
          connectionInstanceId: input.connectionInstanceId,
          authenticationInput: {
            kind: 'credentials',
            authorizationRole: 'primary',
            authProfileId: input.profileId,
            credentials: {},
            configuration: {},
          },
        },
      }),
    {
      workspaceId: workspace.id,
      connectionInstanceId,
      profileId,
    },
  )
  expect(connected.isSuccess, JSON.stringify(connected)).toBe(true)

  const stopped = await page.evaluate(
    (scope) =>
      window.api.localSync.request({
        action: 'disconnect',
        ...scope,
      }),
    { workspaceId: workspace.id, connectionInstanceId },
  )
  expect(stopped.ok).toBe(true)

  const entryId = 'entry-pending-work-archive'
  const created = await page.evaluate(
    (input) =>
      window.api.localRuntime.request({
        action: 'create',
        workspaceId: input.workspaceId,
        commandId: 'command-pending-work-archive',
        entryId: input.entryId,
        payload: {
          connectionInstanceId: input.connectionInstanceId,
          dataSourceId: input.addonId,
          userId: '1',
          taskId: 'TASK-1',
          activityId: 'act-coding',
          startDate: '2026-10-18T10:00:00.000Z',
          endDate: '2026-10-18T10:01:00.000Z',
          timeSpentSeconds: 60,
          comments: 'T25 persisted pending write',
        },
      }),
    {
      workspaceId: workspace.id,
      entryId,
      addonId,
      connectionInstanceId,
    },
  )
  expect(created.ok).toBe(true)

  const pending = await page.evaluate(
    (scope) =>
      window.api.localRuntime.request({
        action: 'list',
        workspaceId: scope.workspaceId,
        filter: { connectionInstanceId: scope.connectionInstanceId },
      }),
    { workspaceId: workspace.id, connectionInstanceId },
  )
  expect(pending.ok).toBe(true)
  if (!pending.ok) throw new Error(pending.error.messageKey)
  expect(pending.value.pendingWrites).toBe(true)
  expect(pending.value.entries.map((entry) => entry.id)).toContain(entryId)

  const blocked = await archiveConnection(page, connectionInstanceId)
  expect(blocked.isSuccess).toBe(true)
  expect(blocked.data).toMatchObject({
    ok: false,
    error: 'CONNECTION_PENDING_WRITES',
    statusCode: 409,
  })

  const resumed = await page.evaluate(
    (scope) =>
      window.api.localSync.request({
        action: 'connect',
        workspaceId: scope.workspaceId,
        connectionInstanceId: scope.connectionInstanceId,
        dataSourceId: scope.addonId,
      }),
    { workspaceId: workspace.id, connectionInstanceId, addonId },
  )
  expect(resumed.ok).toBe(true)

  const syncStarted = await page.evaluate(
    (scope) =>
      window.api.localSync.request({
        action: 'forceSync',
        ...scope,
        direction: 'both',
      }),
    { workspaceId: workspace.id, connectionInstanceId },
  )
  expect(syncStarted.ok).toBe(true)

  await expect
    .poll(async () => {
      const response = await page.evaluate(
        (scope) =>
          window.api.localRuntime.request({
            action: 'list',
            workspaceId: scope.workspaceId,
            filter: { connectionInstanceId: scope.connectionInstanceId },
          }),
        { workspaceId: workspace.id, connectionInstanceId },
      )
      return response.ok && !response.value.pendingWrites
    })
    .toBe(true)

  const archived = await archiveConnection(page, connectionInstanceId)
  expect(archived.isSuccess).toBe(true)
  expect(archived.data).toMatchObject({ ok: true })

  const finalWorkspace = await page.evaluate(
    (workspaceId) => window.api.workspaces.getById({ body: { workspaceId } }),
    workspace.id,
  )
  expect(finalWorkspace.isSuccess).toBe(true)
  expect(
    finalWorkspace.data?.connections.find(
      (connection) => connection.id === connectionInstanceId,
    ),
  ).toMatchObject({ id: connectionInstanceId, status: 'archived' })

  const finalEntry = await page.evaluate(
    (scope) =>
      window.api.localRuntime.request({
        action: 'get',
        workspaceId: scope.workspaceId,
        entryId: scope.entryId,
      }),
    { workspaceId: workspace.id, entryId },
  )
  expect(finalEntry.ok).toBe(true)
  if (!finalEntry.ok) throw new Error(finalEntry.error.messageKey)
  expect(finalEntry.value.entry?.id).toBe(entryId)
  expect(finalEntry.value.entry?.connectionInstanceId).toBe(
    connectionInstanceId,
  )
})
