import { describe, expect, it, vi } from 'vitest'

import { OAuthAttemptCoordinator } from './OAuthAttemptCoordinator'

describe('OAuthAttemptCoordinator', () => {
  const baseInput = {
    addonId: 'discord-addon',
    workspaceId: 'ws-1',
    connectionInstanceId: 'conn-1',
    authProfileId: 'oauth-primary',
    authorizationRole: 'primary',
    generation: 1,
    authorizationGeneration: 1,
    redirectUri: 'mr-tick-app://oauth/callback',
    timeoutMs: 60000,
  }

  it('inicia tentativa gerando state, PKCE S256 e redirectUri preservada', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const result = await coordinator.startAttempt(baseInput)

    expect(result.isSuccess()).toBe(true)
    if (!result.isSuccess()) return
    expect(result.success.state).toContain('discord-addon_')
    expect(result.success.codeChallengeMethod).toBe('S256')
    expect(result.success.codeChallenge.length).toBeGreaterThan(10)
    expect(result.success.redirectUri).toBe(baseInput.redirectUri)
  })

  it('consome tentativa com sucesso correlacionando escopo e geracao', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt(baseInput)
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    const consumeResult = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
    })

    expect(consumeResult.isSuccess()).toBe(true)
    if (!consumeResult.isSuccess()) return
    expect(consumeResult.success.codeVerifier.length).toBeGreaterThan(20)
    expect(consumeResult.success.redirectUri).toBe(baseInput.redirectUri)
    expect(consumeResult.success.authProfileId).toBe('oauth-primary')
    expect(consumeResult.success.authorizationGeneration).toBe(1)
  })

  it('rejeita tentativa repetida (protecao anti-replay)', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt(baseInput)
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    const firstConsume = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
    })
    expect(firstConsume.isSuccess()).toBe(true)

    const secondConsume = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
    })
    expect(secondConsume.isFailure()).toBe(true)
    if (!secondConsume.isFailure()) return
    expect(secondConsume.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_NOT_FOUND_OR_EXPIRED',
    )
  })

  it('rejeita callback com mismatch de geracao da conexao', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt(baseInput)
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    const consumeResult = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 2, // generation incremented in workspace
      authorizationGeneration: 1,
    })

    expect(consumeResult.isFailure()).toBe(true)
    if (!consumeResult.isFailure()) return
    expect(consumeResult.failure.statusCode).toBe(409)
    expect(consumeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_GENERATION_MISMATCH',
    )
  })

  it('rejeita callback com mismatch de authorizationGeneration (reauth concorrente)', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt({
      ...baseInput,
      authorizationGeneration: 1,
    })
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    const consumeResult = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 2, // reauth concorrente mudou a geracao
    })

    expect(consumeResult.isFailure()).toBe(true)
    if (!consumeResult.isFailure()) return
    expect(consumeResult.failure.statusCode).toBe(409)
    expect(consumeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_AUTH_GENERATION_MISMATCH',
    )
  })

  it('rejeita callback com mismatch de authProfileId', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt({
      ...baseInput,
      authProfileId: 'profile-a',
    })
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    const consumeResult = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'profile-b',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
    })

    expect(consumeResult.isFailure()).toBe(true)
    if (!consumeResult.isFailure()) return
    expect(consumeResult.failure.statusCode).toBe(409)
    expect(consumeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_PROFILE_MISMATCH',
    )
  })

  it('rejeita callback com mismatch de authorizationId', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt({
      ...baseInput,
      authorizationId: 'auth-1',
    })
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    const consumeResult = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
      authorizationId: 'auth-2',
    })

    expect(consumeResult.isFailure()).toBe(true)
    if (!consumeResult.isFailure()) return
    expect(consumeResult.failure.statusCode).toBe(409)
    expect(consumeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_AUTH_ID_MISMATCH',
    )
  })

  it('rejeita callback com mismatch de addon ou workspace', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt(baseInput)
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    const crossAddon = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'other-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
    })
    expect(crossAddon.isFailure()).toBe(true)
    if (!crossAddon.isFailure()) return
    expect(crossAddon.failure.messageKey).toBe('OAUTH_ATTEMPT_ADDON_MISMATCH')
  })

  it('invalida tentativas quando o addon eh desativado', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt(baseInput)
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    coordinator.invalidateForAddon('discord-addon')

    const consumeResult = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
    })
    expect(consumeResult.isFailure()).toBe(true)
    if (!consumeResult.isFailure()) return
    expect(consumeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_NOT_FOUND_OR_EXPIRED',
    )
  })

  it('invalida tentativas quando a conexao eh desconectada ou removida', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt(baseInput)
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    coordinator.invalidateForConnection('ws-1', 'conn-1')

    const consumeResult = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
    })
    expect(consumeResult.isFailure()).toBe(true)
    if (!consumeResult.isFailure()) return
    expect(consumeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_NOT_FOUND_OR_EXPIRED',
    )
  })

  it('invalida tentativas no cancelamento explicito', async () => {
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt(baseInput)
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    coordinator.cancelAttempt(startResult.success.state)

    const consumeResult = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
    })
    expect(consumeResult.isFailure()).toBe(true)
    if (!consumeResult.isFailure()) return
    expect(consumeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_NOT_FOUND_OR_EXPIRED',
    )
  })

  it('invalida tentativas no timeout', async () => {
    vi.useFakeTimers()
    const coordinator = new OAuthAttemptCoordinator()
    const startResult = await coordinator.startAttempt({
      ...baseInput,
      timeoutMs: 1000,
    })
    expect(startResult.isSuccess()).toBe(true)
    if (!startResult.isSuccess()) return

    vi.advanceTimersByTime(1500)

    const consumeResult = await coordinator.consumeAttempt({
      state: startResult.success.state,
      addonId: 'discord-addon',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      authProfileId: 'oauth-primary',
      authorizationRole: 'primary',
      generation: 1,
      authorizationGeneration: 1,
    })
    expect(consumeResult.isFailure()).toBe(true)
    if (!consumeResult.isFailure()) return
    expect(consumeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_NOT_FOUND_OR_EXPIRED',
    )
    vi.useRealTimers()
  })
})
