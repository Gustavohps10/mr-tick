import type { ConnectionIdentity } from '@mr-tick/domain'
import type {
  AppError,
  Either,
  TokenRefreshError,
} from '@mr-tick/shared/helpers'

import type { CoreConnectionScope } from './CoreContext'

export type ConnectionConfigPayload = Readonly<
  Record<string, string | number | boolean>
>

export interface AuthenticationResult {
  readonly kind: 'authorized'
  readonly identity: ConnectionIdentity
  readonly credentials: ConnectionConfigPayload
}

export interface ConnectionAuthorizationRequest {
  readonly authUrl: string
  readonly timeoutMs: number
}

export interface ConnectionAuthorizationResponse {
  readonly code: string
  readonly state: string
}

export interface OAuthAuthorizationParameters {
  readonly state: string
  readonly codeChallenge: string
  readonly codeChallengeMethod: 'S256'
  readonly redirectUri: string
}

export interface OAuthTokenExchangeParameters {
  readonly code: string
  readonly state: string
  readonly codeVerifier: string
  readonly redirectUri: string
}

export interface OAuthRenewalResult {
  readonly credentials: ConnectionConfigPayload
}

export type OAuthRevocationCapability =
  | {
      readonly supportsRevocation: true
      revokeToken(
        scope: CoreConnectionScope,
        currentCredentials: ConnectionConfigPayload,
      ): Promise<Either<AppError, void>>
    }
  | {
      readonly supportsRevocation: false
      readonly revokeToken?: never
    }

export type AddonConnectionAuthenticator =
  | {
      readonly method: 'credentials'
      readonly authProfileId: string
      readonly supportsRefresh: false
      readonly supportsRevocation: false
      readonly revokeToken?: never
      authenticate(
        credentials: ConnectionConfigPayload,
        configuration: ConnectionConfigPayload,
      ): Promise<Either<AppError, AuthenticationResult>>
    }
  | ({
      readonly method: 'oauth'
      readonly authProfileId: string
      readonly supportsRefresh: true
      readonly redirectUri?: string
      createAuthorizationRequest(
        scope: CoreConnectionScope,
        parameters: OAuthAuthorizationParameters,
      ): Promise<Either<AppError, ConnectionAuthorizationRequest>>
      completeAuthentication(
        scope: CoreConnectionScope,
        parameters: OAuthTokenExchangeParameters,
      ): Promise<Either<AppError, AuthenticationResult>>
      refreshToken(
        scope: CoreConnectionScope,
        currentCredentials: ConnectionConfigPayload,
      ): Promise<Either<TokenRefreshError, OAuthRenewalResult>>
    } & OAuthRevocationCapability)
  | ({
      readonly method: 'oauth'
      readonly authProfileId: string
      readonly supportsRefresh: false
      readonly redirectUri?: string
      createAuthorizationRequest(
        scope: CoreConnectionScope,
        parameters: OAuthAuthorizationParameters,
      ): Promise<Either<AppError, ConnectionAuthorizationRequest>>
      completeAuthentication(
        scope: CoreConnectionScope,
        parameters: OAuthTokenExchangeParameters,
      ): Promise<Either<AppError, AuthenticationResult>>
    } & OAuthRevocationCapability)

export interface IAddonAuthenticatorRegistry {
  register(addonId: string, authenticator: AddonConnectionAuthenticator): void
  unregister(addonId: string, authProfileId: string): void
  getAuthenticator(
    addonId: string,
    authProfileId: string,
  ): AddonConnectionAuthenticator | undefined
  getAuthenticatorsForAddon(
    addonId: string,
  ): readonly AddonConnectionAuthenticator[]
}
