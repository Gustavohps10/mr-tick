import { Workspace } from '@mr-tick/domain'
import { Either, TokenRefreshError } from '@mr-tick/shared/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AddonConnectionAuthenticator } from '@/contracts'
import { CredentialReferenceFactory } from '@/utils/credential-reference'

import { ConnectionLifecycleCoordinator } from './ConnectionLifecycleCoordinator'
import {
  createRefreshTestSetup,
  FakeAuthenticatorRegistry,
  identity,
  InMemoryCredentialsVault,
  InMemoryLifecycleRepository,
  InMemoryReservationRepository,
  InMemoryWorkspacesRepository,
} from './ConnectionLifecycleCoordinator.refresh.fixture'

describe('ConnectionLifecycleCoordinator.refresh - Reauth & Error Classification', () => {
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

  it('returns ValidationError when refresh is attempted on an authenticator that does not support it', async () => {
    const { workspace } = await createConnectedWorkspace()

    const staticAuthenticator: AddonConnectionAuthenticator = {
      method: 'credentials',
      authProfileId: 'discord-oauth',
      supportsRefresh: false,
      supportsRevocation: false,
      authenticate: vi.fn(),
    }
    authenticatorRegistry.register('discord-addon', staticAuthenticator)

    const result = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('REFRESH_NOT_SUPPORTED')
  })

  it('marks authorization as reauth_required on remoteOutcomeUncertain and rejects subsequent calls without retrying remote request', async () => {
    const { workspace } = await createConnectedWorkspace()

    let shouldSucceedRenewal = false
    const refreshTokenMock = vi.fn(async () => {
      // Verifica que o journal foi registrado duravelmente no repository ANTES da chamada de rede
      expect(lifecycleRepository.operations.length).toBeGreaterThan(0)
      const lastOp =
        lifecycleRepository.operations[
          lifecycleRepository.operations.length - 1
        ]
      expect(lastOp.intent).toBe('connection.refresh')

      if (!shouldSucceedRenewal) {
        return Either.failure(
          TokenRefreshError.remoteOutcomeUncertain(
            'REMOTE_TIMEOUT_UNCERTAIN',
            504,
          ),
        )
      }
      return Either.success({
        credentials: {
          accessToken: 'fresh-recovered-access-token',
          refreshToken: 'fresh-recovered-refresh-token',
        },
      })
    })

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

    const firstResult = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })

    expect(firstResult.isFailure()).toBe(true)
    expect(firstResult.failure.statusCode).toBe(504)
    expect(firstResult.failure.messageKey).toBe('REMOTE_TIMEOUT_UNCERTAIN')
    expect(refreshTokenMock).toHaveBeenCalledTimes(1)

    // Recarrega do repositório para confirmar persistência do estado reauth_required
    const reload1 = (await workspacesRepository.getById(workspace.id)).success!
    const conn1 = reload1.connections.find((c) => c.id === 'conn-1')!
    expect(conn1.status).toBe('connected') // Sem falso logout!
    const auth1 = conn1.authorizations.find(
      (a) => a.authorizationId === 'auth-1',
    )!
    expect(auth1.status).toBe('reauth_required')

    // Segunda chamada DEVE ser recusada localmente com REAUTH_REQUIRED sem chamar rede
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
    expect(refreshTokenMock).toHaveBeenCalledTimes(1) // Zero novas chamadas!

    // Reautenticação bem-sucedida limpa reauth_required para active
    const freshCandidate = CredentialReferenceFactory.createConnectionCandidate(
      {
        ownerId: 'discord-addon',
        workspaceId: workspace.id,
        connectionId: 'conn-1',
        authorizationId: 'auth-1',
        operationId: 'op-reauth',
      },
    )
    await credentialsVault.writeCredential(
      freshCandidate,
      JSON.stringify({
        accessToken: 'fresh-reauth-token',
        refreshToken: 'fresh-reauth-refresh',
      }),
    )

    workspace.connectAuthorization(
      'conn-1',
      {
        authorizationRole: 'primary',
        authProfileId: 'discord-oauth',
        identity,
        authorizationId: 'auth-1',
        credentialReferenceId: freshCandidate.id,
      },
      { channelId: 'general' },
    )
    await workspacesRepository.update(workspace)

    const reload2 = (await workspacesRepository.getById(workspace.id)).success!
    const conn2 = reload2.connections.find((c) => c.id === 'conn-1')!
    const auth2 = conn2.authorizations.find(
      (a) => a.authorizationId === 'auth-1',
    )!
    expect(auth2.status).toBe('active')

    // Próximo refresh agora prossegue
    shouldSucceedRenewal = true

    const thirdResult = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })

    expect(thirdResult.isSuccess()).toBe(true)
    expect(refreshTokenMock).toHaveBeenCalledTimes(2)
  })

  it('marks authorization as reauth_required on reauthRequired error (e.g. invalid_grant) and blocks subsequent calls', async () => {
    const { workspace } = await createConnectedWorkspace()

    const refreshTokenMock = vi.fn(async () =>
      Either.failure(TokenRefreshError.reauthRequired('REAUTH_REQUIRED', 400)),
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

    const firstResult = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })

    expect(firstResult.isFailure()).toBe(true)
    expect(firstResult.failure.statusCode).toBe(400)
    expect(firstResult.failure.messageKey).toBe('REAUTH_REQUIRED')

    // Status marcado como reauth_required sem falso logout
    const reload = (await workspacesRepository.getById(workspace.id)).success!
    const conn = reload.connections.find((c) => c.id === 'conn-1')!
    expect(conn.status).toBe('connected')
    const auth = conn.authorizations.find(
      (a) => a.authorizationId === 'auth-1',
    )!
    expect(auth.status).toBe('reauth_required')

    // Nova chamada bloqueada
    const secondResult = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })
    expect(secondResult.isFailure()).toBe(true)
    expect(secondResult.failure.messageKey).toBe('REAUTH_REQUIRED')
    expect(refreshTokenMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT mark authorization as reauth_required on generic 401 client error', async () => {
    const { workspace } = await createConnectedWorkspace()

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async () =>
        Either.failure(
          TokenRefreshError.clientError('DISCORD_UNAUTHORIZED', 401),
        ),
      ),
    }
    authenticatorRegistry.register('discord-addon', authenticator)

    const result = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(401)
    expect(result.failure.messageKey).toBe('DISCORD_UNAUTHORIZED')

    // Status da autorização DEVE permanecer 'active' (sem falso reauth_required em 401 genérico)
    const reload = (await workspacesRepository.getById(workspace.id)).success!
    const conn = reload.connections.find((c) => c.id === 'conn-1')!
    const auth = conn.authorizations.find(
      (a) => a.authorizationId === 'auth-1',
    )!
    expect(auth.status).toBe('active')
  })

  it('does NOT mark authorization as reauth_required on transient 504 gateway error (non-uncertain)', async () => {
    const { workspace } = await createConnectedWorkspace()

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async () =>
        Either.failure(TokenRefreshError.transient('GATEWAY_TIMEOUT', 504)),
      ),
    }
    authenticatorRegistry.register('discord-addon', authenticator)

    const result = await coordinator.refresh({
      addonId: 'discord-addon',
      scope: {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-1',
        authorizationRole: 'primary',
      },
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(504)
    expect(result.failure.messageKey).toBe('GATEWAY_TIMEOUT')

    // Status da autorização permanece 'active' sem falso logout
    const reload = (await workspacesRepository.getById(workspace.id)).success!
    const conn = reload.connections.find((c) => c.id === 'conn-1')!
    const auth = conn.authorizations.find(
      (a) => a.authorizationId === 'auth-1',
    )!
    expect(auth.status).toBe('active')
  })
})
