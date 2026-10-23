import { AppError, Either } from '@mr-tick/shared/helpers'
import { describe, expect, it } from 'vitest'

import { AddonConnectionAuthenticator } from '@/contracts/core/IAddonConnectionAuthenticator'

import { AddonAuthenticatorRegistry } from './AddonAuthenticatorRegistry'

describe('AddonAuthenticatorRegistry', () => {
  it('registers, resolves, and unregisters authenticators per addon and profile', () => {
    const sut = new AddonAuthenticatorRegistry()
    const authenticator: AddonConnectionAuthenticator = {
      method: 'credentials',
      authProfileId: 'credentials',
      supportsRefresh: false,
      supportsRevocation: false,
      authenticate: async () =>
        Either.failure(AppError.Unauthorized('TEST_AUTHENTICATOR')),
    }

    expect(sut.getAuthenticator('addon-1', 'credentials')).toBeUndefined()
    expect(sut.getAuthenticatorsForAddon('addon-1')).toEqual([])

    sut.register('addon-1', authenticator)
    expect(sut.getAuthenticator('addon-1', 'credentials')).toBe(authenticator)
    expect(sut.getAuthenticatorsForAddon('addon-1')).toEqual([authenticator])

    sut.unregister('addon-1', 'credentials')
    expect(sut.getAuthenticator('addon-1', 'credentials')).toBeUndefined()
    expect(sut.getAuthenticatorsForAddon('addon-1')).toEqual([])
  })
})
