import type { AppError, Either } from '@mr-tick/shared/helpers'

export interface OAuthAttemptParameters {
  readonly state: string
  readonly codeChallenge: string
  readonly codeChallengeMethod: 'S256'
  readonly redirectUri: string
}

export interface ConsumedOAuthAttempt {
  readonly state: string
  readonly codeVerifier: string
  readonly redirectUri: string
  readonly addonId: string
  readonly workspaceId: string
  readonly connectionInstanceId: string
  readonly authProfileId: string
  readonly authorizationRole: string
  readonly generation: number
  readonly authorizationGeneration: number
  readonly authorizationId?: string
}

export interface StartOAuthAttemptInput {
  readonly addonId: string
  readonly workspaceId: string
  readonly connectionInstanceId: string
  readonly authProfileId: string
  readonly authorizationRole: string
  readonly generation: number
  readonly authorizationGeneration: number
  readonly authorizationId?: string
  readonly redirectUri: string
  readonly timeoutMs?: number
}

export interface ConsumeOAuthAttemptInput {
  readonly state: string
  readonly addonId: string
  readonly workspaceId: string
  readonly connectionInstanceId: string
  readonly authProfileId?: string
  readonly authorizationRole: string
  readonly generation: number
  readonly authorizationGeneration: number
  readonly authorizationId?: string
}

export interface IOAuthAttemptCoordinator {
  startAttempt(
    input: StartOAuthAttemptInput,
  ): Promise<Either<AppError, OAuthAttemptParameters>>

  consumeAttempt(
    input: ConsumeOAuthAttemptInput,
  ): Promise<Either<AppError, ConsumedOAuthAttempt>>

  cancelAttempt(state: string): void
  invalidateForAddon(addonId: string): void
  invalidateForConnection(
    workspaceId: string,
    connectionInstanceId: string,
  ): void
  getActiveAttemptsCount(): number
}
