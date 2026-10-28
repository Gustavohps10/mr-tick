import type { ConnectionIdentity } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

export type { ConnectionIdentity } from '@mr-tick/domain'

export type ConnectionCredentialPayload = Readonly<
  Record<string, string | number | boolean>
>

export interface AuthenticationResult {
  identity: ConnectionIdentity
  credentials: ConnectionCredentialPayload
}

export interface DataSourceAuthenticationInput {
  configuration: ConnectionCredentialPayload
  credentials: ConnectionCredentialPayload
}

export interface IAuthenticationStrategy<
  AuthCredentials = DataSourceAuthenticationInput,
> {
  authenticate(
    credentials: AuthCredentials,
  ): Promise<Either<AppError, AuthenticationResult>>
}
