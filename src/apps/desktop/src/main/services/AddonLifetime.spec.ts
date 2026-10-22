import {
  AddonAuthenticatorRegistry,
  AddonConnectionProfilesResolver,
  type ILocalRuntimeAPI,
  OAuthAttemptCoordinator,
} from '@mr-tick/application'
import type { AddonContext, IAddon, IDataSource } from '@mr-tick/sdk'
import { describe, expect, it, vi } from 'vitest'

import {
  permissiveAddonAccessService,
  unavailableCore,
} from './addon-core-test-fixture'
import {
  emptyAddonCredentialsVault,
  emptyAddonSettingsRepository,
  emptyWorkspaceReferenceRegistry,
} from './addon-workspace-reference-test-fixture'
import { AddonLifetime } from './AddonLifetime'
import { AddonLoader } from './AddonLoader'
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}))
const credentials = emptyAddonCredentialsVault()
const authenticatorRegistry = new AddonAuthenticatorRegistry()
const profilesResolver = new AddonConnectionProfilesResolver()
const oauthAttemptCoordinator = new OAuthAttemptCoordinator()
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
      () => unavailableCore,
      permissiveAddonAccessService,
      emptyWorkspaceReferenceRegistry,
      emptyAddonSettingsRepository,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
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
      () => unavailableCore,
      permissiveAddonAccessService,
      emptyWorkspaceReferenceRegistry,
      emptyAddonSettingsRepository,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
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
  const core: import('@mr-tick/application').ICoreAddonCapabilities = {
    ...unavailableCore,
    runtime: { getState: () => 'starting', onStateChanged },
  }
  const loader = new AddonLoader(
    credentials,
    runtime,
    '1.0.0',
    () => core,
    permissiveAddonAccessService,
    emptyWorkspaceReferenceRegistry,
    emptyAddonSettingsRepository,
    authenticatorRegistry,
    profilesResolver,
    oauthAttemptCoordinator,
  )
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
  const loader = new AddonLoader(
    credentials,
    runtime,
    '1.0.0',
    () => unavailableCore,
    permissiveAddonAccessService,
    emptyWorkspaceReferenceRegistry,
    emptyAddonSettingsRepository,
    authenticatorRegistry,
    profilesResolver,
    oauthAttemptCoordinator,
  )
  const source: IDataSource = {
    getConnectionProfiles: () => [
      {
        connectionProfileId: 'primary',
        cardinality: 'multi',
        default: true,
      },
    ],
    getConnectionSchema: () => [],
    createInstance: vi.fn<IDataSource['createInstance']>(),
  }
  const dsCapabilities: import('@mr-tick/sdk').AddonCapability[] = [
    'dataSource',
  ]
  loader.registerManifestCapabilities('first', dsCapabilities)
  loader.registerManifestCapabilities('second', dsCapabilities)
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
  const loader = new AddonLoader(
    credentials,
    runtime,
    '1.0.0',
    () => unavailableCore,
    permissiveAddonAccessService,
    emptyWorkspaceReferenceRegistry,
    emptyAddonSettingsRepository,
    authenticatorRegistry,
    profilesResolver,
    oauthAttemptCoordinator,
  )
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
  const loader = new AddonLoader(
    credentials,
    runtime,
    '1.0.0',
    () => unavailableCore,
    permissiveAddonAccessService,
    emptyWorkspaceReferenceRegistry,
    emptyAddonSettingsRepository,
    authenticatorRegistry,
    profilesResolver,
    oauthAttemptCoordinator,
  )
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

describe('AddonBindingLifetime granular lifecycle', () => {
  it('controls start, stop, cancellation and subscriptions per binding without affecting others', () => {
    const parent = new AddonLifetime()
    const binding1 = parent.getBinding('conn-1')
    const binding2 = parent.getBinding('conn-2')

    const cleanup1 = vi.fn()
    const cleanup2 = vi.fn()

    binding1.track(cleanup1)
    binding2.track(cleanup2)

    expect(binding1.isActive()).toBe(true)
    expect(binding2.isActive()).toBe(true)

    parent.stopBinding('conn-1')

    expect(binding1.isActive()).toBe(false)
    expect(cleanup1).toHaveBeenCalledOnce()
    expect(binding2.isActive()).toBe(true)
    expect(cleanup2).not.toHaveBeenCalled()

    parent.dispose()
    expect(binding2.isActive()).toBe(false)
    expect(cleanup2).toHaveBeenCalledOnce()
  })

  it('increments generation on restart and invalidates callbacks from older generations', () => {
    const parent = new AddonLifetime()
    const binding = parent.getBinding('cap-watcher')

    expect(binding.getGeneration()).toBe(1)
    expect(binding.isCurrentGeneration(1)).toBe(true)
    expect(binding.isCurrentGeneration(2)).toBe(false)

    const prevCleanup = vi.fn()
    binding.track(prevCleanup)

    const nextGen = binding.startNextGeneration()
    expect(nextGen).toBe(2)
    expect(binding.getGeneration()).toBe(2)
    expect(prevCleanup).toHaveBeenCalledOnce()

    expect(binding.isCurrentGeneration(1)).toBe(false)
    expect(binding.isCurrentGeneration(2)).toBe(true)

    binding.stop()
    expect(binding.isCurrentGeneration(2)).toBe(false)
  })

  it('scoped binding events remove subscriptions on binding restart to prevent duplicate listeners', () => {
    const parent = new AddonLifetime()
    const binding = parent.getBinding('conn-events')

    const listeners = new Map<string, Array<(data?: unknown) => void>>()
    const rawEvents: import('@mr-tick/sdk').IAddonEventsAPI = {
      on: (channel: string, handler: (data: unknown) => void) => {
        const list = listeners.get(channel) ?? []
        list.push(handler)
        listeners.set(channel, list)
        return () => {
          const updated = listeners.get(channel)?.filter((h) => h !== handler)
          listeners.set(channel, updated ?? [])
        }
      },
      emit: (channel: string, data?: unknown) => {
        listeners.get(channel)?.forEach((h) => h(data))
      },
    }

    const scopedEvents = binding.events(rawEvents)
    const listenerMock = vi.fn()

    scopedEvents.on('workspace:changed', listenerMock)
    expect(listeners.get('workspace:changed')?.length).toBe(1)

    binding.startNextGeneration()
    expect(listeners.get('workspace:changed')?.length).toBe(0)

    scopedEvents.on('workspace:changed', listenerMock)
    expect(listeners.get('workspace:changed')?.length).toBe(0)

    const restartedScopedEvents = binding.events(rawEvents)
    restartedScopedEvents.on('workspace:changed', listenerMock)
    expect(listeners.get('workspace:changed')?.length).toBe(1)

    rawEvents.emit('workspace:changed', { currentWorkspaceId: 'ws-1' })
    expect(listenerMock).toHaveBeenCalledTimes(1)
  })
})
