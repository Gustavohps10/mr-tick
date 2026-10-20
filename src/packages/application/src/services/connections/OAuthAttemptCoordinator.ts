import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'
import crypto from 'crypto'

import type {
  ConsumedOAuthAttempt,
  ConsumeOAuthAttemptInput,
  IOAuthAttemptCoordinator,
  OAuthAttemptParameters,
  StartOAuthAttemptInput,
} from '@/contracts/core/IOAuthAttemptCoordinator'

interface InternalOAuthAttempt {
  readonly state: string
  readonly addonId: string
  readonly workspaceId: string
  readonly connectionInstanceId: string
  readonly authProfileId: string
  readonly authorizationRole: string
  readonly generation: number
  readonly authorizationGeneration: number
  readonly authorizationId?: string
  readonly codeVerifier: string
  readonly redirectUri: string
  readonly createdAt: number
  readonly timeoutMs: number
  readonly timeoutHandle: NodeJS.Timeout
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generatePKCEPair(): {
  codeVerifier: string
  codeChallenge: string
} {
  const verifierBytes = crypto.randomBytes(32)
  const codeVerifier = base64UrlEncode(verifierBytes)
  const hash = crypto.createHash('sha256').update(codeVerifier).digest()
  const codeChallenge = base64UrlEncode(hash)
  return { codeVerifier, codeChallenge }
}

export class OAuthAttemptCoordinator implements IOAuthAttemptCoordinator {
  private readonly attempts = new Map<string, InternalOAuthAttempt>()

  public async startAttempt(
    input: StartOAuthAttemptInput,
  ): Promise<Either<AppError, OAuthAttemptParameters>> {
    if (!isNonEmptyString(input.addonId)) {
      return Either.failure(AppError.ValidationError('ADDON_ID_REQUIRED'))
    }
    if (!isNonEmptyString(input.workspaceId)) {
      return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))
    }
    if (!isNonEmptyString(input.connectionInstanceId)) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_INSTANCE_ID_REQUIRED'),
      )
    }
    if (!isNonEmptyString(input.authProfileId)) {
      return Either.failure(
        AppError.ValidationError('AUTH_PROFILE_ID_REQUIRED'),
      )
    }
    if (!isNonEmptyString(input.authorizationRole)) {
      return Either.failure(
        AppError.ValidationError('AUTHORIZATION_ROLE_REQUIRED'),
      )
    }
    if (!isNonEmptyString(input.redirectUri)) {
      return Either.failure(AppError.ValidationError('REDIRECT_URI_REQUIRED'))
    }

    const { codeVerifier, codeChallenge } = generatePKCEPair()
    const state = `${input.addonId}_${crypto.randomUUID()}`
    const timeoutMs =
      input.timeoutMs !== undefined && input.timeoutMs > 0
        ? input.timeoutMs
        : 120000

    const timeoutHandle = setTimeout(() => {
      this.attempts.delete(state)
    }, timeoutMs)

    const attempt: InternalOAuthAttempt = {
      state,
      addonId: input.addonId,
      workspaceId: input.workspaceId,
      connectionInstanceId: input.connectionInstanceId,
      authProfileId: input.authProfileId,
      authorizationRole: input.authorizationRole,
      generation: input.generation,
      authorizationGeneration: input.authorizationGeneration,
      authorizationId: input.authorizationId,
      codeVerifier,
      redirectUri: input.redirectUri,
      createdAt: Date.now(),
      timeoutMs,
      timeoutHandle,
    }

    this.attempts.set(state, attempt)

    return Either.success({
      state,
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: input.redirectUri,
    })
  }

  public async consumeAttempt(
    input: ConsumeOAuthAttemptInput,
  ): Promise<Either<AppError, ConsumedOAuthAttempt>> {
    if (!isNonEmptyString(input.state)) {
      return Either.failure(AppError.ValidationError('STATE_REQUIRED'))
    }

    const attempt = this.attempts.get(input.state)
    if (attempt === undefined) {
      return Either.failure(
        AppError.ValidationError('OAUTH_ATTEMPT_NOT_FOUND_OR_EXPIRED'),
      )
    }

    // Immediately consume to prevent replay
    clearTimeout(attempt.timeoutHandle)
    this.attempts.delete(input.state)

    if (attempt.addonId !== input.addonId) {
      return Either.failure(AppError.Http(409, 'OAUTH_ATTEMPT_ADDON_MISMATCH'))
    }
    if (attempt.workspaceId !== input.workspaceId) {
      return Either.failure(
        AppError.Http(409, 'OAUTH_ATTEMPT_WORKSPACE_MISMATCH'),
      )
    }
    if (attempt.connectionInstanceId !== input.connectionInstanceId) {
      return Either.failure(
        AppError.Http(409, 'OAUTH_ATTEMPT_CONNECTION_MISMATCH'),
      )
    }
    if (
      input.authProfileId !== undefined &&
      attempt.authProfileId !== input.authProfileId
    ) {
      return Either.failure(
        AppError.Http(409, 'OAUTH_ATTEMPT_PROFILE_MISMATCH'),
      )
    }
    if (attempt.authorizationRole !== input.authorizationRole) {
      return Either.failure(AppError.Http(409, 'OAUTH_ATTEMPT_ROLE_MISMATCH'))
    }
    if (attempt.generation !== input.generation) {
      return Either.failure(
        AppError.Http(409, 'OAUTH_ATTEMPT_GENERATION_MISMATCH'),
      )
    }
    if (attempt.authorizationGeneration !== input.authorizationGeneration) {
      return Either.failure(
        AppError.Http(409, 'OAUTH_ATTEMPT_AUTH_GENERATION_MISMATCH'),
      )
    }
    if (attempt.authorizationId !== input.authorizationId) {
      return Either.failure(
        AppError.Http(409, 'OAUTH_ATTEMPT_AUTH_ID_MISMATCH'),
      )
    }

    const consumed: ConsumedOAuthAttempt = {
      state: attempt.state,
      codeVerifier: attempt.codeVerifier,
      redirectUri: attempt.redirectUri,
      addonId: attempt.addonId,
      workspaceId: attempt.workspaceId,
      connectionInstanceId: attempt.connectionInstanceId,
      authProfileId: attempt.authProfileId,
      authorizationRole: attempt.authorizationRole,
      generation: attempt.generation,
      authorizationGeneration: attempt.authorizationGeneration,
      authorizationId: attempt.authorizationId,
    }

    return Either.success(consumed)
  }

  public cancelAttempt(state: string): void {
    const attempt = this.attempts.get(state)
    if (attempt === undefined) return
    clearTimeout(attempt.timeoutHandle)
    this.attempts.delete(state)
  }

  public invalidateForAddon(addonId: string): void {
    for (const [state, attempt] of this.attempts.entries()) {
      if (attempt.addonId === addonId) {
        clearTimeout(attempt.timeoutHandle)
        this.attempts.delete(state)
      }
    }
  }

  public invalidateForConnection(
    workspaceId: string,
    connectionInstanceId: string,
  ): void {
    for (const [state, attempt] of this.attempts.entries()) {
      if (
        attempt.workspaceId === workspaceId &&
        attempt.connectionInstanceId === connectionInstanceId
      ) {
        clearTimeout(attempt.timeoutHandle)
        this.attempts.delete(state)
      }
    }
  }

  public getActiveAttemptsCount(): number {
    return this.attempts.size
  }
}
