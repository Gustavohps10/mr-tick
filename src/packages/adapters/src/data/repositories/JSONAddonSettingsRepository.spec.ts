import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { projectAddonSettings } from '@mr-tick/application'
import { afterEach, describe, expect, it } from 'vitest'

import { JSONAddonSettingsRepository } from './JSONAddonSettingsRepository'

let temporaryDirectory: string | undefined

afterEach(async () => {
  if (temporaryDirectory === undefined) return
  const directory = path.resolve(temporaryDirectory)
  const allowedPrefix = path.resolve(os.tmpdir(), 'addon-settings-repository-')
  expect(directory.startsWith(allowedPrefix)).toBe(true)
  if (!directory.startsWith(allowedPrefix)) return
  await fs.rm(directory, { recursive: true, force: true })
  temporaryDirectory = undefined
})

describe('JSON addon settings repository', () => {
  it('composes independent field patches and conflicts on stale same-field patches', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'addon-settings-repository-'),
    )
    const repository = new JSONAddonSettingsRepository(temporaryDirectory)
    const first = await repository.patch(
      'addon-a',
      'workspace:workspace-a',
      0,
      { theme: 'dark' },
      ['theme', 'locale'],
    )
    expect(first.isSuccess()).toBe(true)
    if (first.isFailure()) return expect.fail(first.failure.messageKey)
    expect(first.success.revision).toBe(1)

    const independent = await repository.patch(
      'addon-a',
      'workspace:workspace-a',
      0,
      { locale: 'pt-BR' },
      ['theme', 'locale'],
    )
    expect(independent.isSuccess()).toBe(true)
    if (independent.isFailure())
      return expect.fail(independent.failure.messageKey)
    expect(independent.success.revision).toBe(2)

    const conflict = await repository.patch(
      'addon-a',
      'workspace:workspace-a',
      0,
      { theme: 'light' },
      ['theme', 'locale'],
    )
    expect(conflict.isFailure()).toBe(true)
    if (conflict.isSuccess()) return expect.fail('Expected same-field conflict')
    expect(conflict.failure.messageKey).toBe('ADDON_SETTINGS_FIELD_CONFLICT')

    const secret = await repository.patch(
      'addon-a',
      'workspace:workspace-a',
      2,
      { apiKey: 'SECRET_SENTINEL' },
      ['theme', 'locale'],
    )
    expect(secret.isFailure()).toBe(true)
    if (secret.isSuccess()) return expect.fail('Expected non-editable field')
    expect(secret.failure.messageKey).toBe('ADDON_SETTINGS_FIELD_NOT_EDITABLE')

    const snapshot = await repository.read('addon-a', 'workspace:workspace-a')
    expect(snapshot.isSuccess()).toBe(true)
    expect(snapshot.isSuccess() && snapshot.success.values).toEqual({
      theme: 'dark',
      locale: 'pt-BR',
    })
    const persisted = await fs.readFile(
      path.join(temporaryDirectory, 'addon-settings.json'),
      'utf8',
    )
    expect(persisted).not.toContain('SECRET_SENTINEL')
  })

  it('rejects a future revision instead of accepting an invalid CAS', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'addon-settings-repository-'),
    )
    const repository = new JSONAddonSettingsRepository(temporaryDirectory)
    const result = await repository.patch(
      'addon-a',
      'addon',
      1,
      { theme: 'dark' },
      ['theme'],
    )
    expect(result.isFailure()).toBe(true)
    if (result.isSuccess())
      return expect.fail('Expected future revision conflict')
    expect(result.failure.statusCode).toBe(409)
    expect(result.failure.messageKey).toBe('ADDON_SETTINGS_REVISION_AHEAD')
  })

  it('projects secrets out of an adulterated persisted settings document', async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'addon-settings-repository-'),
    )
    await fs.writeFile(
      path.join(temporaryDirectory, 'addon-settings.json'),
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          {
            addonId: 'addon-a',
            scopeKey: 'workspace:workspace-a',
            revision: 3,
            values: { theme: 'dark', apiKey: 'SECRET_SENTINEL' },
            fieldRevisions: { theme: 3, apiKey: 3 },
          },
        ],
      }),
      'utf8',
    )
    const repository = new JSONAddonSettingsRepository(temporaryDirectory)
    const snapshot = await repository.read('addon-a', 'workspace:workspace-a')
    expect(snapshot.isSuccess()).toBe(true)
    if (snapshot.isFailure()) return expect.fail(snapshot.failure.messageKey)
    const exposed = projectAddonSettings(snapshot.success, [
      { id: 'theme', scope: 'configuration' },
      { id: 'apiKey', scope: 'credential' },
    ])
    expect(exposed.values).toEqual({ theme: 'dark' })
    expect(JSON.stringify(exposed)).not.toContain('SECRET_SENTINEL')
  })
})
