import {
  AppError,
  AuthenticationResult,
  Either,
  IAuthenticationStrategy,
} from '@mr-tick/sdk'

import { FAKE_MEMBER } from './fakeData'

export class FakeAuthenticationStrategy implements IAuthenticationStrategy {
  async authenticate(): Promise<Either<AppError, AuthenticationResult>> {
    return Either.success({
      member: FAKE_MEMBER,
      credentials: { apiKey: 'fake-api-key' },
    })
  }
}
