import type {
  AddonSettingsSnapshot,
  IAddonSettingsRepository,
  IConnectionCredentialsVault,
  ICredentialsVault,
  IWorkspaceCredentialReferenceRegistry,
  WorkspaceCredentialReference,
} from '@mr-tick/application'
import { CredentialReferenceFactory } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { describe, expect, it, vi } from 'vitest'

import { AddonScopedVault } from './AddonScopedVault'

function fixture() {
  const records = new Map<string, string>()
  const workspaceReferences = new Map<string, WorkspaceCredentialReference>()
  const referenceRegistry: IWorkspaceCredentialReferenceRegistry = {
    reserveWorkspaceCredentialWrite: async (reservation) => {
      const key = reservation.logicalReferenceId
      workspaceReferences.set(key, {
        workspaceId: reservation.workspaceId,
        ownerId: reservation.ownerId,
        logicalReferenceId: reservation.logicalReferenceId,
        status: 'write_pending',
        activeReferenceId: reservation.previousReferenceId,
        candidateReferenceId: reservation.candidateReferenceId,
        cleanupReferenceId: null,
      })
      return Either.success()
    },
    commitWorkspaceCredentialWrite: async (reservation) => {
      workspaceReferences.set(reservation.logicalReferenceId, {
        workspaceId: reservation.workspaceId,
        ownerId: reservation.ownerId,
        logicalReferenceId: reservation.logicalReferenceId,
        status: 'cleanup_pending',
        activeReferenceId: reservation.candidateReferenceId,
        candidateReferenceId: null,
        cleanupReferenceId: reservation.previousReferenceId,
      })
      return Either.success()
    },
    finishWorkspaceCredentialWrite: async (reservation) => {
      workspaceReferences.set(reservation.logicalReferenceId, {
        workspaceId: reservation.workspaceId,
        ownerId: reservation.ownerId,
        logicalReferenceId: reservation.logicalReferenceId,
        status: 'active',
        activeReferenceId: reservation.candidateReferenceId,
        candidateReferenceId: null,
        cleanupReferenceId: null,
      })
      return Either.success()
    },
    rollbackWorkspaceCredentialWrite: async (reservation) => {
      if (reservation.previousReferenceId === null)
        workspaceReferences.delete(reservation.logicalReferenceId)
      if (reservation.previousReferenceId !== null)
        workspaceReferences.set(reservation.logicalReferenceId, {
          workspaceId: reservation.workspaceId,
          ownerId: reservation.ownerId,
          logicalReferenceId: reservation.logicalReferenceId,
          status: 'active',
          activeReferenceId: reservation.previousReferenceId,
          candidateReferenceId: null,
          cleanupReferenceId: null,
        })
      return Either.success()
    },
    reserveWorkspaceCredentialDelete: async (reservation) => {
      workspaceReferences.set(reservation.logicalReferenceId, {
        workspaceId: reservation.workspaceId,
        ownerId: reservation.ownerId,
        logicalReferenceId: reservation.logicalReferenceId,
        status: 'delete_pending',
        activeReferenceId: reservation.previousReferenceId,
        candidateReferenceId: null,
        cleanupReferenceId: null,
      })
      return Either.success()
    },
    finishWorkspaceCredentialDelete: async (reservation) => {
      workspaceReferences.delete(reservation.logicalReferenceId)
      return Either.success()
    },
    getWorkspaceCredentialReference: async (reference) =>
      Either.success(workspaceReferences.get(reference.logicalReferenceId)),
    listPendingWorkspaceCredentialReferences: async () =>
      Either.success(
        Array.from(workspaceReferences.values()).filter(
          (reference) => reference.status !== 'active',
        ),
      ),
    unregisterWorkspaceCredentialReference: async (reference) => {
      workspaceReferences.delete(reference.logicalReferenceId)
      return Either.success()
    },
    listWorkspaceCredentialReferences: async (workspaceId) => {
      const references = Array.from(workspaceReferences.values()).filter(
        (reference) => reference.workspaceId === workspaceId,
      )
      return Either.success(references)
    },
  }
  const credentials: ICredentialsVault & IConnectionCredentialsVault = {
    readCredential: async (reference) => {
      const value = records.get(`${reference.service}/${reference.account}`)
      if (value === undefined) return { kind: 'absent' }
      return { kind: 'present', token: value }
    },
    getToken: async (service, account) => {
      const value = records.get(`${service}/${account}`)
      if (value === undefined) return { kind: 'absent' }
      return { kind: 'present', token: value }
    },
    saveToken: vi.fn(async (service, account, value) => {
      records.set(`${service}/${account}`, value)
    }),
    deleteToken: vi.fn(async (service, account) => {
      records.delete(`${service}/${account}`)
    }),
    hasToken: async (service, account) => {
      if (records.has(`${service}/${account}`)) return { kind: 'present' }
      return { kind: 'absent' }
    },
    replaceToken: async (service, account, value) => {
      records.set(`${service}/${account}`, value)
    },
    writeCredential: async (reference, token) => {
      records.set(`${reference.service}/${reference.account}`, token)
      return { kind: 'completed' }
    },
    removeCredential: async (reference) => {
      records.delete(`${reference.service}/${reference.account}`)
      return { kind: 'completed' }
    },
  }
  const settings = new Map<string, AddonSettingsSnapshot>()
  const settingsRepository: IAddonSettingsRepository = {
    read: async (addonId, scopeKey) =>
      Either.success(
        settings.get(`${addonId}/${scopeKey}`) || {
          schemaVersion: 1,
          revision: 0,
          values: {},
        },
      ),
    patch: async (addonId, scopeKey, expectedRevision, patch) => {
      const key = `${addonId}/${scopeKey}`
      const current = settings.get(key) || {
        schemaVersion: 1,
        revision: 0,
        values: {},
      }
      if (current.revision !== expectedRevision)
        return Either.failure(AppError.Http(409, 'CONFLICT'))
      const next: AddonSettingsSnapshot = {
        schemaVersion: 1,
        revision: current.revision + 1,
        values: { ...current.values, ...patch },
      }
      settings.set(key, next)
      return Either.success(next)
    },
  }
  return {
    records,
    credentials,
    workspaceReferences,
    referenceRegistry,
    settingsRepository,
    vault: new AddonScopedVault(
      'addon-a',
      credentials,
      credentials,
      referenceRegistry,
      settingsRepository,
    ),
  }
}

async function registerActiveReference(
  registry: IWorkspaceCredentialReferenceRegistry,
  workspaceId: string,
  ownerId: string,
  referenceId: string,
): Promise<void> {
  const reservation = {
    workspaceId,
    ownerId,
    logicalReferenceId: referenceId,
    candidateReferenceId: referenceId,
    previousReferenceId: null,
  }
  expect(
    (await registry.reserveWorkspaceCredentialWrite(reservation)).isSuccess(),
  ).toBe(true)
  expect(
    (await registry.commitWorkspaceCredentialWrite(reservation)).isSuccess(),
  ).toBe(true)
  expect(
    (await registry.finishWorkspaceCredentialWrite(reservation)).isSuccess(),
  ).toBe(true)
}

describe('Explicit addon vault scopes', () => {
  it('keeps credentials separate while persisting configuration settings', async () => {
    const { vault } = fixture()
    const scope: import('@mr-tick/application').AddonVaultScope = {
      kind: 'workspace',
      workspaceId: 'workspace-a',
    }
    const results = await Promise.all([
      vault.set(scope, 'channel', 'channel-a'),
      vault.saveSettings(scope, 0, { locale: 'pt-BR' }, ['locale']),
      vault.set(
        { kind: 'workspace', workspaceId: 'workspace-b' },
        'channel',
        'channel-b',
      ),
    ])
    expect(results.every((result) => result.isSuccess())).toBe(true)
    expect((await vault.get(scope, 'token')).success).toBe(null)
    const settings = await vault.getSettings(scope)
    expect(settings.isSuccess()).toBe(true)
    if (settings.isFailure()) return expect.fail(settings.failure.messageKey)
    expect(settings.success.values).toEqual({ locale: 'pt-BR' })
    const other = await vault.get(
      { kind: 'workspace', workspaceId: 'workspace-b' },
      'channel',
    )
    expect(other.isSuccess() && other.success).toBe('channel-b')
  })
  it('isolates addon/global scope and never clears corrupted persisted values', async () => {
    const {
      vault,
      records,
      credentials,
      referenceRegistry,
      settingsRepository,
    } = fixture()
    const brokenReference = CredentialReferenceFactory.createAddonWorkspace(
      'addon-a',
      'broken',
    )
    records.set(
      `${brokenReference.service}/${brokenReference.account}`,
      '{broken',
    )
    await registerActiveReference(
      referenceRegistry,
      'broken',
      'addon-a',
      brokenReference.id,
    )
    const broken: import('@mr-tick/application').AddonVaultScope = {
      kind: 'workspace',
      workspaceId: 'broken',
    }
    expect((await vault.set(broken, 'token', 'new')).isSuccess()).toBe(true)
    expect((await vault.delete(broken, 'token')).isSuccess()).toBe(true)
    const invalidSettings = await vault.getSettings(broken)
    expect(invalidSettings.isSuccess()).toBe(true)
    expect(
      records.get(`${brokenReference.service}/${brokenReference.account}`),
    ).toBe('{broken')
    expect(credentials.saveToken).not.toHaveBeenCalled()
    expect(credentials.deleteToken).not.toHaveBeenCalled()
    expect((await vault.set({ kind: 'addon' }, 'key', 'own')).isSuccess()).toBe(
      true,
    )
    const isolated = new AddonScopedVault(
      'addon-b',
      credentials,
      credentials,
      referenceRegistry,
      settingsRepository,
    )
    const value = await isolated.get({ kind: 'addon' }, 'key')
    expect(value.isSuccess() && value.success).toBe(null)
    expect(
      (
        await vault.get({ kind: 'workspace', workspaceId: '' }, 'key')
      ).isFailure(),
    ).toBe(true)
  })
  it('returns transport failures as Either and does not lose prototype-named keys', async () => {
    const { vault, credentials } = fixture()
    expect(
      (await vault.set({ kind: 'addon' }, '__proto__', 'safe')).isSuccess(),
    ).toBe(true)
    const value = await vault.get({ kind: 'addon' }, '__proto__')
    expect(value.isSuccess() && value.success).toBe('safe')
    vi.spyOn(credentials, 'getToken').mockResolvedValueOnce({
      kind: 'unavailable',
    })
    const failure = await vault.get({ kind: 'addon' }, 'key')
    expect(failure.isFailure()).toBe(true)
    if (failure.isSuccess()) return expect.fail('Expected keychain failure')
    expect(failure.failure.messageKey).toBe('ADDON_VAULT_READ_FAILED')
  })

  it('does not read unregistered legacy credential addresses', async () => {
    const { vault, records } = fixture()
    records.set('addon-a/ws_legacy-workspace_config', '{"token":"old"}')
    const result = await vault.get(
      {
        kind: 'workspace',
        workspaceId: 'legacy-workspace',
      },
      'token',
    )
    expect(result.isSuccess()).toBe(true)
    expect(result.isSuccess() && result.success).toBe(null)
  })

  it('blocks reads while a workspace credential delete is logically pending', async () => {
    const { vault, credentials, referenceRegistry } = fixture()
    const reference = CredentialReferenceFactory.createAddonSecret(
      'addon-a',
      { kind: 'workspace', workspaceId: 'delete-pending' },
      'token',
    )
    await registerActiveReference(
      referenceRegistry,
      'delete-pending',
      'addon-a',
      reference.id,
    )
    const deletion = await referenceRegistry.reserveWorkspaceCredentialDelete({
      workspaceId: 'delete-pending',
      ownerId: 'addon-a',
      logicalReferenceId: reference.id,
      previousReferenceId: reference.id,
    })
    expect(deletion.isSuccess()).toBe(true)
    const getToken = vi.spyOn(credentials, 'getToken')
    const result = await vault.get(
      {
        kind: 'workspace',
        workspaceId: 'delete-pending',
      },
      'token',
    )
    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return expect.fail('Expected pending delete block')
    expect(result.failure.messageKey).toBe('ADDON_CREDENTIAL_DELETE_PENDING')
    expect(getToken).not.toHaveBeenCalled()
  })

  it('rejects an active workspace reference whose owner does not match the addon', async () => {
    const { vault, credentials, workspaceReferences } = fixture()
    const logical = CredentialReferenceFactory.createAddonSecret(
      'addon-a',
      { kind: 'workspace', workspaceId: 'workspace-owner-check' },
      'token',
    )
    const foreign = CredentialReferenceFactory.createAddonSecret(
      'addon-b',
      { kind: 'workspace', workspaceId: 'workspace-owner-check' },
      'token',
    )
    workspaceReferences.set(logical.id, {
      workspaceId: 'workspace-owner-check',
      ownerId: 'addon-a',
      logicalReferenceId: logical.id,
      status: 'active',
      activeReferenceId: foreign.id,
      candidateReferenceId: null,
      cleanupReferenceId: null,
    })
    const getToken = vi.spyOn(credentials, 'getToken')
    const result = await vault.get(
      {
        kind: 'workspace',
        workspaceId: 'workspace-owner-check',
      },
      'token',
    )
    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return expect.fail('Expected owner binding failure')
    expect(result.failure.messageKey).toBe('ADDON_CREDENTIAL_REFERENCE_INVALID')
    expect(getToken).not.toHaveBeenCalled()
  })

  it('does not expose a secret sentinel in the settings response', async () => {
    const { vault, records, referenceRegistry } = fixture()
    await vault.set(
      { kind: 'workspace', workspaceId: 'settings-secret' },
      'apiKey',
      'SECRET_SENTINEL',
    )

    const settings = await vault.getSettings({
      kind: 'workspace',
      workspaceId: 'settings-secret',
    })

    expect(settings.isSuccess()).toBe(true)
    if (settings.isFailure()) return expect.fail(settings.failure.messageKey)
    expect(JSON.stringify(settings.success)).not.toContain('SECRET_SENTINEL')
  })

  it('preserves a token rotated after settings were read before saving stale settings', async () => {
    const { vault } = fixture()
    const scope: import('@mr-tick/application').AddonVaultScope = {
      kind: 'workspace',
      workspaceId: 'settings-rotation',
    }

    const staleSettings = await vault.getSettings(scope)
    expect(staleSettings.isSuccess()).toBe(true)
    if (staleSettings.isFailure())
      return expect.fail(staleSettings.failure.messageKey)
    expect(
      (await vault.set(scope, 'token', 'ROTATED_TOKEN_SENTINEL')).isSuccess(),
    ).toBe(true)
    expect(
      (
        await vault.saveSettings(scope, staleSettings.success.revision, {}, [])
      ).isSuccess(),
    ).toBe(true)

    const token = await vault.get(scope, 'token')
    expect(token.isSuccess() && token.success).toBe('ROTATED_TOKEN_SENTINEL')
  })

  it('isolates two connections in the same workspace with the same fieldId', async () => {
    const { vault } = fixture()
    const conn1: import('@mr-tick/application').AddonVaultScope = {
      kind: 'connection',
      workspaceId: 'ws-multi',
      connectionInstanceId: 'conn-1',
    }
    const conn2: import('@mr-tick/application').AddonVaultScope = {
      kind: 'connection',
      workspaceId: 'ws-multi',
      connectionInstanceId: 'conn-2',
    }

    await vault.set(conn1, 'apiKey', 'KEY_CONN_1')
    await vault.set(conn2, 'apiKey', 'KEY_CONN_2')
    await vault.saveSettings(conn1, 0, { endpoint: 'https://server1.local' }, [
      'endpoint',
    ])
    await vault.saveSettings(conn2, 0, { endpoint: 'https://server2.local' }, [
      'endpoint',
    ])

    const secret1 = await vault.get(conn1, 'apiKey')
    const secret2 = await vault.get(conn2, 'apiKey')
    expect(secret1.isSuccess() && secret1.success).toBe('KEY_CONN_1')
    expect(secret2.isSuccess() && secret2.success).toBe('KEY_CONN_2')

    const settings1 = await vault.getSettings(conn1)
    const settings2 = await vault.getSettings(conn2)
    expect(settings1.isSuccess() && settings1.success.values.endpoint).toBe(
      'https://server1.local',
    )
    expect(settings2.isSuccess() && settings2.success.values.endpoint).toBe(
      'https://server2.local',
    )
  })

  it('isolates two capabilities on the same connection with the same fieldId', async () => {
    const { vault } = fixture()
    const cap1: import('@mr-tick/application').AddonVaultScope = {
      kind: 'capability',
      workspaceId: 'ws-multi',
      connectionInstanceId: 'conn-1',
      capabilityId: 'watcher',
    }
    const cap2: import('@mr-tick/application').AddonVaultScope = {
      kind: 'capability',
      workspaceId: 'ws-multi',
      connectionInstanceId: 'conn-1',
      capabilityId: 'calendar',
    }

    await vault.set(cap1, 'secret', 'WATCHER_SECRET')
    await vault.set(cap2, 'secret', 'CALENDAR_SECRET')
    await vault.saveSettings(cap1, 0, { enabled: true }, ['enabled'])
    await vault.saveSettings(cap2, 0, { enabled: false }, ['enabled'])

    const secret1 = await vault.get(cap1, 'secret')
    const secret2 = await vault.get(cap2, 'secret')
    expect(secret1.isSuccess() && secret1.success).toBe('WATCHER_SECRET')
    expect(secret2.isSuccess() && secret2.success).toBe('CALENDAR_SECRET')

    const settings1 = await vault.getSettings(cap1)
    const settings2 = await vault.getSettings(cap2)
    expect(settings1.isSuccess() && settings1.success.values.enabled).toBe(true)
    expect(settings2.isSuccess() && settings2.success.values.enabled).toBe(
      false,
    )
  })
})
