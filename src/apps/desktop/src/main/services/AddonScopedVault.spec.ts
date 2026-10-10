import type { ICredentialsVault } from '@mr-tick/application'
import { describe, expect, it, vi } from 'vitest'

import { AddonScopedVault } from './AddonScopedVault'

function fixture() {
  const records = new Map<string, string>()
  const credentials: ICredentialsVault = {
    getToken: async (service, account) => records.get(`${service}/${account}`),
    saveToken: vi.fn(async (service, account, value) => {
      records.set(`${service}/${account}`, value)
    }),
    deleteToken: vi.fn(async (service, account) => {
      records.delete(`${service}/${account}`)
    }),
    hasToken: async (service, account) => records.has(`${service}/${account}`),
    replaceToken: async (service, account, value) => {
      records.set(`${service}/${account}`, value)
    },
  }
  return {
    records,
    credentials,
    vault: new AddonScopedVault('addon-a', credentials),
  }
}
describe('Explicit addon vault scopes', () => {
  it('preserves existing workspace settings and merges concurrent addon/UI updates', async () => {
    const { vault, records } = fixture()
    records.set(
      'addon-a/ws_workspace-a_config',
      JSON.stringify({ token: 'existing', enabled: true, quantity: 5 }),
    )
    const scope: import('@mr-tick/application').AddonVaultScope = {
      kind: 'workspace',
      workspaceId: 'workspace-a',
    }
    const results = await Promise.all([
      vault.set(scope, 'channel', 'channel-a'),
      vault.saveSettings(scope, { locale: 'pt-BR' }),
      vault.set(
        { kind: 'workspace', workspaceId: 'workspace-b' },
        'channel',
        'channel-b',
      ),
    ])
    expect(results.every((result) => result.isSuccess())).toBe(true)
    const settings = await vault.getSettings(scope)
    expect(settings.isSuccess()).toBe(true)
    if (settings.isFailure()) return expect.fail(settings.failure.messageKey)
    expect(settings.success).toEqual({
      token: 'existing',
      enabled: true,
      quantity: 5,
      channel: 'channel-a',
      locale: 'pt-BR',
    })
    const other = await vault.get(
      { kind: 'workspace', workspaceId: 'workspace-b' },
      'channel',
    )
    expect(other.isSuccess() && other.success).toBe('channel-b')
  })
  it('isolates addon/global scope and never clears corrupted persisted values', async () => {
    const { vault, records, credentials } = fixture()
    records.set('addon-a/ws_broken_config', '{broken')
    const broken: import('@mr-tick/application').AddonVaultScope = {
      kind: 'workspace',
      workspaceId: 'broken',
    }
    expect((await vault.set(broken, 'token', 'new')).isFailure()).toBe(true)
    expect((await vault.delete(broken, 'token')).isFailure()).toBe(true)
    expect(records.get('addon-a/ws_broken_config')).toBe('{broken')
    expect(credentials.saveToken).not.toHaveBeenCalled()
    expect(credentials.deleteToken).not.toHaveBeenCalled()
    expect((await vault.set({ kind: 'addon' }, 'key', 'own')).isSuccess()).toBe(
      true,
    )
    const isolated = new AddonScopedVault('addon-b', credentials)
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
    vi.spyOn(credentials, 'getToken').mockRejectedValueOnce(
      new Error('KEYCHAIN_LOCKED'),
    )
    const failure = await vault.get({ kind: 'addon' }, 'key')
    expect(failure.isFailure()).toBe(true)
    if (failure.isSuccess()) return expect.fail('Expected keychain failure')
    expect(failure.failure.messageKey).toBe('KEYCHAIN_LOCKED')
  })
})
