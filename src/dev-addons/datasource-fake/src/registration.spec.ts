import { type AddonContext, AppError, Either } from '@mr-tick/sdk'
import { describe, expect, it, vi } from 'vitest'

import FakeDataSourceAddon from './index'

describe('Development addon connection registration failures', () => {
  it.each(['profiles', 'schema', 'authenticator'])(
    'stops activation after rejected %s',
    (stage) => {
      const connections = {
        registerProfiles: vi.fn((): Either<AppError, void> => Either.success()),
        registerSchema: vi.fn((): Either<AppError, void> => Either.success()),
        registerAuthenticator: vi.fn((): Either<AppError, void> =>
          Either.success(),
        ),
        unregisterProfiles: vi.fn(),
      }
      if (stage === 'profiles')
        connections.registerProfiles.mockReturnValue(
          Either.failure(AppError.Unauthorized('AUTH_CAPABILITY_REQUIRED')),
        )
      if (stage === 'schema')
        connections.registerSchema.mockReturnValue(
          Either.failure(AppError.NotFound('CONNECTION_PROFILE_NOT_FOUND')),
        )
      if (stage === 'authenticator')
        connections.registerAuthenticator.mockReturnValue(
          Either.failure(AppError.ValidationError('AUTH_PROFILE_ID_REQUIRED')),
        )

      const registerDataSource = vi.fn()
      const notifyError = vi.fn(async () => 'notification')
      const context = {
        contributions: {
          connections,
          dataSources: { register: registerDataSource },
        },
        host: { notifications: { error: notifyError } },
      } as unknown as AddonContext

      new FakeDataSourceAddon().activate(context)

      expect(registerDataSource).not.toHaveBeenCalled()
      expect(notifyError).toHaveBeenCalledOnce()
      if (stage !== 'profiles')
        expect(connections.unregisterProfiles).toHaveBeenCalledOnce()
      if (stage === 'profiles') {
        expect(connections.registerSchema).not.toHaveBeenCalled()
        expect(connections.registerAuthenticator).not.toHaveBeenCalled()
      }
      if (stage === 'schema')
        expect(connections.registerAuthenticator).not.toHaveBeenCalled()
    },
  )
})
