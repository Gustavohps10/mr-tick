import type { ICredentialsVault, ILocalRuntimeAPI } from '@mr-tick/application'
import type { AddonContext, IAddon, IDataSource } from '@mr-tick/sdk'
import { describe, expect, it, vi } from 'vitest'

import { unavailableCore } from './addon-core-test-fixture'
import { AddonLoader } from './AddonLoader'
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}))
const credentials: ICredentialsVault = {
  getToken: async () => undefined,
  saveToken: async () => {},
  deleteToken: async () => {},
  hasToken: async () => false,
  replaceToken: async () => {},
}
const runtime: ILocalRuntimeAPI = {
  request: async () => ({
    ok: false,
    error: { messageKey: 'NOT_READY', statusCode: 503 },
  }),
}
class ProbeAddon implements IAddon {
  constructor(private readonly commandResult: string) {}
  context: AddonContext | null = null
  readonly listener = vi.fn()
  readonly deactivate = vi.fn(async () => {})
  activate(context: AddonContext): void {
    this.context = context
    context.contributions.commands.register('probe', () => this.commandResult)
    context.host.events.on('timer:update', this.listener)
    context.core.runtime.onStateChanged(this.listener)
    context.contributions.menus.sidebar.register({ id: 'menu', label: 'Probe' })
    context.contributions.themes.register({
      id: 'theme',
      name: 'Probe',
      css: '',
    })
    context.contributions.settings.register([])
    context.contributions.menus.timerbar.register({
      id: 'button',
      label: 'Probe',
      icon: 'Clock',
      type: 'action',
    })
  }
}
describe('Addon ownership and lifecycle', () => {
  it('isolates colliding command/menu/theme names and removes only the deactivated owner', async () => {
    const loader = new AddonLoader(
      credentials,
      runtime,
      '1.0.0',
      unavailableCore,
    )
    const first = new ProbeAddon('first')
    const second = new ProbeAddon('second')
    expect(await loader.activateAddon('first', first)).toBe(true)
    expect(await loader.activateAddon('second', second)).toBe(true)
    expect(loader.commandRegistry.has('probe')).toBe(false)
    expect(await loader.executeCommand('first:probe')).toBe('first')
    expect(await loader.executeCommand('second:probe')).toBe('second')
    expect(loader.sidebarRegistry.getItems().map((item) => item.id)).toEqual([
      'first:menu',
      'second:menu',
    ])
    await loader.deactivateAddon('first')
    const callCount = first.listener.mock.calls.length
    loader.systemEventEmitter.emit('timer:update', {})
    expect(first.listener).toHaveBeenCalledTimes(callCount)
    expect(loader.commandRegistry.has('first:probe')).toBe(false)
    expect(await loader.executeCommand('probe')).toBe('second')
    expect(loader.themesRegistry.getItems().map((item) => item.id)).toEqual([
      'second:theme',
    ])
    first.context?.contributions.commands.register('late', () => 'late')
    expect(loader.commandRegistry.has('first:late')).toBe(false)
    await loader.deactivateAddon('second')
    expect(loader.sidebarRegistry.getItems()).toEqual([])
    expect(loader.getTimerbarMenus()).toEqual([])
  })
  it('rolls back partial activation and returns failure without marking the addon active', async () => {
    const loader = new AddonLoader(
      credentials,
      runtime,
      '1.0.0',
      unavailableCore,
    )
    const addon = new ProbeAddon('probe')
    vi.spyOn(addon, 'activate').mockImplementation((context) => {
      context.contributions.commands.register('partial', () => true)
      context.host.events.on('timer:update', addon.listener)
      return Promise.reject(new Error('ACTIVATION_FAILED'))
    })
    expect(await loader.activateAddon('broken', addon)).toBe(false)
    expect(addon.deactivate).toHaveBeenCalledOnce()
    expect(loader.hasActiveAddon('broken')).toBe(false)
    expect(loader.commandRegistry.has('broken:partial')).toBe(false)
    loader.systemEventEmitter.emit('timer:update', {})
    expect(addon.listener).not.toHaveBeenCalled()
  })
})

it('releases availability subscriptions and registrations even when deactivate fails', async () => {
  const unsubscribe = vi.fn()
  const onStateChanged = vi.fn<
    import('@mr-tick/application').ICoreRuntimeAPI['onStateChanged']
  >((listener) => {
    listener('starting')
    return unsubscribe
  })
  const core: import('@mr-tick/application').ICoreReadAPI = {
    ...unavailableCore,
    runtime: { getState: () => 'starting', onStateChanged },
  }
  const loader = new AddonLoader(credentials, runtime, '1.0.0', core)
  const addon = new ProbeAddon('probe')
  await loader.activateAddon('probe', addon)
  addon.deactivate.mockRejectedValue(new Error('EXTERNAL_CLEANUP_FAILED'))
  await expect(loader.deactivateAddon('probe')).rejects.toThrow(
    'EXTERNAL_CLEANUP_FAILED',
  )
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect(loader.hasActiveAddon('probe')).toBe(false)
  expect(loader.sidebarRegistry.getItems()).toEqual([])
  expect(loader.commandRegistry.has('probe:probe')).toBe(false)
})
it('keeps reused datasource definitions owned by distinct addons without mutating them', async () => {
  const loader = new AddonLoader(credentials, runtime, '1.0.0', unavailableCore)
  const source: IDataSource = {
    getConnectionSchema: () => [],
    createInstance: vi.fn<IDataSource['createInstance']>(),
  }
  const first = loader.createContext('first')
  const second = loader.createContext('second')
  first.contributions.dataSources.register(source)
  second.contributions.dataSources.register(source)
  expect(source).not.toHaveProperty('id')
  expect(loader.getDataSource('first')?.getConnectionSchema()).toEqual([])
  expect(loader.getDataSource('second')?.getConnectionSchema()).toEqual([])
  await loader.deactivateAddon('first')
  expect(loader.getDataSource('first')).toBeUndefined()
  expect(loader.getDataSource('second')).toBeDefined()
  first.contributions.dataSources.unregister('second')
  expect(loader.getDataSource('second')).toBeDefined()
})

it('preserves the built-in theme command while resolving addon themes by their owner', async () => {
  const loader = new AddonLoader(credentials, runtime, '1.0.0', unavailableCore)
  const first = new ProbeAddon('first')
  const second = new ProbeAddon('second')
  await loader.activateAddon('first', first)
  await loader.activateAddon('second', second)
  expect(first.context?.contributions.commands.has?.('theme:set')).toBe(true)
  await first.context?.contributions.commands.execute('theme:set', 'theme')
  expect(loader.getActiveTheme()?.id).toBe('first:theme')
  await second.context?.contributions.commands.execute('theme:set', 'theme')
  expect(loader.getActiveTheme()?.id).toBe('second:theme')
})

it('never resolves another addon alias when the selected addon has no such action', async () => {
  const loader = new AddonLoader(credentials, runtime, '1.0.0', unavailableCore)
  const first = new ProbeAddon('first')
  const second = new ProbeAddon('second')
  await loader.activateAddon('first', first)
  await loader.activateAddon('second', second)
  const foreignAction = vi.fn(() => ({ isSuccess: true }))
  second.context?.contributions.commands.register('exclusive', foreignAction)
  expect(await loader.executeAction('first', 'exclusive')).toEqual({
    isSuccess: false,
    error: 'ACTION_NOT_FOUND',
  })
  expect(foreignAction).not.toHaveBeenCalled()
  expect(await loader.executeAction('second', 'exclusive')).toEqual({
    isSuccess: true,
  })
  expect(foreignAction).toHaveBeenCalledOnce()
})
