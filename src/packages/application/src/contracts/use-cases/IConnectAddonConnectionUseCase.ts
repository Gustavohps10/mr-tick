import type { ConnectionIdentity } from '@mr-tick/domain'
import type { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  ConnectionConfigPayload,
  OAuthTokenExchangeParameters,
} from '../core/IAddonConnectionAuthenticator'

export interface OAuthAttemptCorrelation {
  readonly connectionGeneration: number
  readonly authorizationGeneration: number
  readonly authorizationId?: string
}

export type AddonConnectionAuthenticationInput =
  | {
      method: 'none'
      configuration: ConnectionConfigPayload
    }
  | {
      method: 'credentials' | 'authorized'
      authorizationRole: string
      authProfileId: string
      credentials: ConnectionConfigPayload
      configuration: ConnectionConfigPayload
    }
  | {
      method: 'oauth'
      authorizationRole: string
      authProfileId: string
      response: OAuthTokenExchangeParameters
      configuration?: ConnectionConfigPayload
      correlation?: OAuthAttemptCorrelation
    }

export interface ConnectAddonConnectionInput {
  workspaceId: string
  connectionInstanceId: string
  addonId?: string
  authenticationInput: AddonConnectionAuthenticationInput
}

export interface ConnectAddonConnectionResult {
  identity?: ConnectionIdentity
}

export interface IConnectAddonConnectionUseCase {
  execute(
    input: ConnectAddonConnectionInput,
  ): Promise<Either<AppError, ConnectAddonConnectionResult>>
}
