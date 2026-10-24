import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from './fixtures/electron-fixture'

const addonId = 'connection-cardinality-e2e'
const profileId = 'single-primary'
const workspaceId = 'ws-isolated-9999-8888-777766665555'
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const sourceAddonDirectory = resolve(
  currentDirectory,
  '../../../dev-addons/datasource-fake',
)

function prepareSingleProfileAddon(userDataPath: string): void {
  const addonDirectory = join(userDataPath, 'addons', addonId)
  const addonDistDirectory = join(addonDirectory, 'dist')
  const sourceManifest = readFileSync(
    join(sourceAddonDirectory, 'manifest.yaml'),
    'utf8',
  )
  const sourceBundle = readFileSync(
    join(sourceAddonDirectory, 'dist', 'index.js'),
    'utf8',
  )
  const originalId = 'id: mr-tick-datasource-fake'
  const originalProfile =
    'connectionProfileId: "fake-main",\n        cardinality: "multi",\n        default: true'
  const targetProfile = `connectionProfileId: "${profileId}",\n        cardinality: "single",\n        default: true`

  expect(sourceManifest).toContain(originalId)
  expect(sourceBundle).toContain(originalProfile)
  mkdirSync(addonDistDirectory, { recursive: true })
  writeFileSync(
    join(addonDirectory, 'manifest.yaml'),
    sourceManifest.replace(originalId, `id: ${addonId}`),
  )
  writeFileSync(
    join(addonDirectory, 'package.json'),
    JSON.stringify({ name: addonId, version: '1.0.0', type: 'module' }),
  )
  writeFileSync(
    join(addonDistDirectory, 'index.js'),
    sourceBundle
      .replace(originalProfile, targetProfile)
      .replace(
        'connections.registerSchema(\n      "fake-main",',
        `connections.registerSchema(\n      "${profileId}",`,
      ),
  )
}

function removeSingleProfileAddon(userDataPath: string): void {
  const resolvedUserDataPath = resolve(userDataPath)
  const expectedUserDataRoot = resolve(
    currentDirectory,
    '../test-results/electron-user-data',
  )
  const expectedUserDataPrefix = `${expectedUserDataRoot}${sep}`
  const resolvedAddonDirectory = resolve(
    resolvedUserDataPath,
    'addons',
    addonId,
  )
  const expectedAddonPrefix = `${resolve(resolvedUserDataPath, 'addons')}${sep}`
  const userDataIsScoped = resolvedUserDataPath.startsWith(
    expectedUserDataPrefix,
  )
  const addonIsScoped = resolvedAddonDirectory.startsWith(expectedAddonPrefix)

  expect(userDataIsScoped).toBe(true)
  expect(addonIsScoped).toBe(true)
  if (!userDataIsScoped || !addonIsScoped) return
  rmSync(resolvedAddonDirectory, { recursive: true, force: true })
}

test.afterEach(async ({ electronApp }) => {
  const userDataPath = await electronApp.evaluate(({ app }) =>
    app.getPath('userData'),
  )
  removeSingleProfileAddon(userDataPath)
})

test.use({ singleCardinalityProbe: true })

test('T04 Electron bridge accepts only one concurrent link for a single profile', async ({
  page,
}) => {
  const profiles = await page.evaluate(
    async (requestedAddonId) =>
      window.api.addons.getConnectionProfiles({
        body: { addonId: requestedAddonId },
      }),
    addonId,
  )
  expect(profiles.isSuccess).toBe(true)
  expect(profiles.data).toEqual([
    {
      connectionProfileId: profileId,
      cardinality: 'single',
      default: true,
      allowedAuthProfileIds: ['fake-main'],
      defaultAuthProfileId: 'fake-main',
      roles: [
        {
          authorizationRole: 'primary',
          allowedAuthProfileIds: ['fake-main'],
          defaultAuthProfileId: 'fake-main',
          required: true,
        },
      ],
    },
  ])

  const connectionIds = ['connection-a', 'connection-b']
  const outcomes = await page.evaluate(
    async ({
      requestedAddonId,
      requestedProfileId,
      requestedWorkspaceId,
      ids,
    }) => {
      const responses = await Promise.all(
        ids.map((connectionInstanceId) =>
          window.api.workspaces.linkDataSource({
            body: {
              workspaceId: requestedWorkspaceId,
              addonId: requestedAddonId,
              connectionInstanceId,
              connectionProfileId: requestedProfileId,
            },
          }),
        ),
      )
      return responses.map((response) => ({
        isSuccess: response.isSuccess,
        statusCode: response.statusCode,
        error: response.error,
      }))
    },
    {
      requestedAddonId: addonId,
      requestedProfileId: profileId,
      requestedWorkspaceId: workspaceId,
      ids: connectionIds,
    },
  )

  expect(outcomes.filter((outcome) => outcome.isSuccess)).toHaveLength(1)
  const failures = outcomes.filter((outcome) => !outcome.isSuccess)
  expect(failures).toHaveLength(1)
  const cardinalityConflict = failures.find(
    (outcome) => outcome.error === 'CONNECTION_CARDINALITY_REACHED',
  )
  expect(cardinalityConflict).toMatchObject({
    statusCode: 409,
    error: 'CONNECTION_CARDINALITY_REACHED',
  })

  const persistedWorkspace = await page.evaluate(
    async (requestedWorkspaceId) =>
      window.api.workspaces.getById({
        body: { workspaceId: requestedWorkspaceId },
      }),
    workspaceId,
  )
  expect(persistedWorkspace.isSuccess).toBe(true)
  expect(persistedWorkspace.data).toBeDefined()
  if (!persistedWorkspace.data) return
  expect(persistedWorkspace.data.connections).toHaveLength(1)
  const persistedConnection = persistedWorkspace.data.connections.find(
    (connection) => connection.connectionProfileId === profileId,
  )
  expect(persistedConnection).toMatchObject({
    connectionProfileId: profileId,
    cardinality: 'single',
  })
})
