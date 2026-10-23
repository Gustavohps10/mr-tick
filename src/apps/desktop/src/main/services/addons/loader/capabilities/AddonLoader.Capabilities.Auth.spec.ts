import {
  AddonAuthenticatorRegistry,
  type AddonConnectionAuthenticator,
  AddonConnectionProfilesResolver,
} from '@mr-tick/application'
import type { ConnectionProfileDescriptor } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLoader } from './AddonLoader.Capabilities.fixture'

const profiles: ConnectionProfileDescriptor[] = [
  { connectionProfileId: 'account', cardinality: 'single', default: true },
]

const authenticator = {
  method: 'credentials',
  authProfileId: 'account',
  supportsRefresh: false,
  supportsRevocation: false,
  authenticate: async () =>
    Either.failure(AppError.Unauthorized('TEST_AUTHENTICATOR')),
} as const

afterEach(() => vi.restoreAllMocks())

describe('Auth capability contributions', () => {
  it('rejects unsupported methods and empty profile IDs at the addon boundary', () => {
    const register = vi.spyOn(AddonAuthenticatorRegistry.prototype, 'register')
    const loader = createLoader()
    loader.registerManifestCapabilities('addon', ['auth'])
    const context = loader.createContext('addon')
    const unsupported = {
      ...authenticator,
      method: 'none',
    } as unknown as AddonConnectionAuthenticator

    expect(
      context.contributions.connections
        .registerAuthenticator(unsupported)
        .isFailure(),
    ).toBe(true)
    expect(
      context.contributions.connections
        .registerAuthenticator({ ...authenticator, authProfileId: ' ' })
        .isFailure(),
    ).toBe(true)
    expect(register).not.toHaveBeenCalled()
  })

  it('rejects profiles and authenticators without auth, even for datasources', () => {
    const registerProfiles = vi.spyOn(
      AddonConnectionProfilesResolver.prototype,
      'registerProfiles',
    )
    const registerAuthenticator = vi.spyOn(
      AddonAuthenticatorRegistry.prototype,
      'register',
    )
    const loader = createLoader()
    loader.registerManifestCapabilities('addon', ['dataSource'])
    const context = loader.createContext('addon')

    const profileResult =
      context.contributions.connections.registerProfiles(profiles)
    const authResult =
      context.contributions.connections.registerAuthenticator(authenticator)

    expect(profileResult.isFailure()).toBe(true)
    expect(authResult.isFailure()).toBe(true)
    if (profileResult.isFailure())
      expect(profileResult.failure.messageKey).toBe('AUTH_CAPABILITY_REQUIRED')
    expect(registerProfiles).not.toHaveBeenCalled()
    expect(registerAuthenticator).not.toHaveBeenCalled()
  })

  it('registers auth without a datasource and cleans up only its own contributions', async () => {
    const registerProfiles = vi.spyOn(
      AddonConnectionProfilesResolver.prototype,
      'registerProfiles',
    )
    const unregisterProfiles = vi.spyOn(
      AddonConnectionProfilesResolver.prototype,
      'unregisterProfiles',
    )
    const unregisterAuthenticator = vi.spyOn(
      AddonAuthenticatorRegistry.prototype,
      'unregister',
    )
    const loader = createLoader()
    loader.registerManifestCapabilities('addon', ['auth', 'watcher'])
    const context = loader.createContext('addon')

    expect(
      context.contributions.connections.registerProfiles(profiles).isSuccess(),
    ).toBe(true)
    expect(
      context.contributions.connections
        .registerAuthenticator(authenticator)
        .isSuccess(),
    ).toBe(true)
    expect(registerProfiles).toHaveBeenCalledWith('addon', profiles)
    expect(loader.getDataSource('addon')).toBeUndefined()

    context.contributions.dataSources.unregister('addon')
    expect(unregisterProfiles).not.toHaveBeenCalled()

    await loader.deactivateAddon('addon')
    expect(unregisterProfiles).toHaveBeenCalledWith('addon')
    expect(unregisterAuthenticator).toHaveBeenCalledWith('addon', 'account')
    expect(
      context.contributions.connections.registerProfiles(profiles).isFailure(),
    ).toBe(true)
  })

  it('refuses disabled auth and invalid profiles without publishing them', () => {
    const registerProfiles = vi.spyOn(
      AddonConnectionProfilesResolver.prototype,
      'registerProfiles',
    )
    const loader = createLoader()
    loader.registerManifestCapabilities('addon', ['auth'])
    const context = loader.createContext('addon')

    expect(
      context.contributions.connections.registerProfiles([]).isFailure(),
    ).toBe(true)
    loader.disableCapability('addon', 'auth')
    expect(
      context.contributions.connections.registerProfiles(profiles).isFailure(),
    ).toBe(true)
    expect(
      context.contributions.connections
        .registerAuthenticator(authenticator)
        .isFailure(),
    ).toBe(true)
    expect(registerProfiles).not.toHaveBeenCalled()
  })
})
