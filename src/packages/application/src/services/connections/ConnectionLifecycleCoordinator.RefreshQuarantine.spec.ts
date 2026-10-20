import { Workspace } from '@mr-tick/domain'
import { AppError, Either, TokenRefreshError } from '@mr-tick/shared/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AddonConnectionAuthenticator } from '@/contracts'

import { ConnectionLifecycleCoordinator } from './ConnectionLifecycleCoordinator'
import {
  createRefreshTestSetup,
  FakeAuthenticatorRegistry,
  InMemoryCredentialsVault,
  InMemoryLifecycleRepository,
  InMemoryReservationRepository,
  InMemoryWorkspacesRepository,
} from './ConnectionLifecycleCoordinator.refresh.fixture'

describe('ConnectionLifecycleCoordinator.refresh - Quarantine & Persistence', () => {
  let credentialsVault: InMemoryCredentialsVault
  let workspacesRepository: InMemoryWorkspacesRepository
  let lifecycleRepository: InMemoryLifecycleRepository
  let reservationRepository: InMemoryReservationRepository
  let authenticatorRegistry: FakeAuthenticatorRegistry
  let coordinator: ConnectionLifecycleCoordinator
  let createConnectedWorkspace: (opts?: {
    workspaceId?: string
    connectionId?: string
    addonId?: string
    authorizationId?: string
  }) => Promise<{ workspace: Workspace; initialRefId: string }>

  beforeEach(() => {
    const setup = createRefreshTestSetup()
    credentialsVault = setup.credentialsVault
    workspacesRepository = setup.workspacesRepository
    lifecycleRepository = setup.lifecycleRepository
    reservationRepository = setup.reservationRepository
    authenticatorRegistry = setup.authenticatorRegistry
    coordinator = setup.coordinator
    createConnectedWorkspace = setup.createConnectedWorkspace
  })

  it('propagates repository write failure when persisting reauth_required state and prevents retry in memory', async () => {
    const { workspace } = await createConnectedWorkspace()

    const refreshTokenMock = vi.fn(async () =>
      Either.failure(
        TokenRefreshError.remoteOutcomeUncertain(
          'REMOTE_TIMEOUT_UNCERTAIN',
          504,
        ),
      ),
    )

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: refreshTokenMock,
    }
    authenticatorRegistry.register('discord-addon', authenticator)

    // Simula falha do repositório ao salvar no banco
    vi.spyOn(workspacesRepository, 'update').mockResolvedValueOnce(
      Either.failure(AppError.Internal('DB_PERSISTENCE_FAILED')),
    )

    const firstResult = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })

    // A falha do banco DEVE ser propagada e NÃO silenciada!
    expect(firstResult.isFailure()).toBe(true)
    expect(firstResult.failure.messageKey).toBe('DB_PERSISTENCE_FAILED')

    // Mesmo com falha ao persistir no DB, nova chamada na mesma sessão DEVE ser barrada pela quarentena em memória sem chamar rede
    const secondResult = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })

    expect(secondResult.isFailure()).toBe(true)
    expect(secondResult.failure.statusCode).toBe(401)
    expect(secondResult.failure.messageKey).toBe('REAUTH_REQUIRED')
    expect(refreshTokenMock).toHaveBeenCalledTimes(1) // Token consumido NÃO é repetido!
  })

  it('proves full scope isolation in quarantine (workspace A quarantined does not affect workspace B with same authId)', async () => {
    const ws1Result = await createConnectedWorkspace({
      connectionId: 'conn-1',
      authorizationId: 'auth-1',
    })
    const ws2Result = await createConnectedWorkspace({
      connectionId: 'conn-1',
      authorizationId: 'auth-1',
    })

    const ws1 = ws1Result.workspace
    const ws2 = ws2Result.workspace

    let callCount = 0
    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async (scope) => {
        callCount++
        if (scope.workspaceId === ws1.id) {
          return Either.failure(
            TokenRefreshError.remoteOutcomeUncertain(
              'REMOTE_TIMEOUT_UNCERTAIN',
              504,
            ),
          )
        }
        return Either.success({
          credentials: {
            accessToken: 'token-ws2-renewed',
            refreshToken: 'refresh-ws2-renewed',
          },
        })
      }),
    }
    authenticatorRegistry.register('discord-addon', authenticator)

    // 1. Refresh no workspace 1 falha com incerteza e entra em quarentena
    const res1 = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: ws1.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })
    expect(res1.isFailure()).toBe(true)
    expect(res1.failure.messageKey).toBe('REMOTE_TIMEOUT_UNCERTAIN')

    // Workspace 1 está em quarentena
    const res1Retry = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: ws1.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })
    expect(res1Retry.isFailure()).toBe(true)
    expect(res1Retry.failure.messageKey).toBe('REAUTH_REQUIRED')

    // 2. Workspace 2 (mesmo authId: 'auth-1', escopo diferente) NÃO é afetado pela quarentena do workspace 1!
    const res2 = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: ws2.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })
    expect(res2.isSuccess()).toBe(true)

    // Workspace 2 foi atualizado com o novo token
    const reloadedWs2 = (await workspacesRepository.getById(ws2.id)).success!
    const conn2 = reloadedWs2.connections.find((c) => c.id === 'conn-1')!
    const auth2 = conn2.authorizations.find(
      (a) => a.authorizationId === 'auth-1',
    )!
    expect(auth2.status).toBe('active')
    expect(credentialsVault.storage.has(auth2.credentialReferenceId!)).toBe(
      true,
    )
  })

  it('puts authorization in quarantine and marks reauth_required when local post-network persistence fails after successful remote renewal', async () => {
    const { workspace } = await createConnectedWorkspace()

    let refreshCallCount = 0
    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async () => {
        refreshCallCount++
        return Either.success({
          credentials: {
            accessToken: 'new-token-after-rotation',
            refreshToken: 'new-refresh-after-rotation',
          },
        })
      }),
    }
    authenticatorRegistry.register('discord-addon', authenticator)

    // Simula falha do cofre ao gravar o candidato após o sucesso remoto
    vi.spyOn(credentialsVault, 'writeCredential').mockResolvedValueOnce({
      kind: 'unavailable',
    })

    const refreshResult = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })

    // Falha local é propagada
    expect(refreshResult.isFailure()).toBe(true)
    expect(refreshResult.failure.messageKey).toBe(
      'CREDENTIALS_VAULT_UNAVAILABLE',
    )

    // A autorização deve ter sido colocada em quarentena em memória e marcada como reauth_required
    const reload = (await workspacesRepository.getById(workspace.id)).success!
    const conn = reload.connections.find((c) => c.id === 'conn-1')!
    const auth = conn.authorizations.find(
      (a) => a.authorizationId === 'auth-1',
    )!
    expect(auth.status).toBe('reauth_required')

    // Próxima chamada na mesma sessão é bloqueada e NÃO chama a rede de novo (token antigo já rotacionado)
    const secondResult = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })
    expect(secondResult.isFailure()).toBe(true)
    expect(secondResult.failure.statusCode).toBe(401)
    expect(secondResult.failure.messageKey).toBe('REAUTH_REQUIRED')
    expect(refreshCallCount).toBe(1)
  })
})
