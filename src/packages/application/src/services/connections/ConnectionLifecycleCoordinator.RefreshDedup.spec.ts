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

describe('ConnectionLifecycleCoordinator.refresh - Dedup & Concurrency', () => {
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

  it('shares a single in-flight renewal when two concurrent calls target the exact same authorization', async () => {
    const { workspace } = await createConnectedWorkspace()
    let refreshCalls = 0

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async () => {
        refreshCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 30))
        return Either.success({
          credentials: {
            accessToken: 'renewed-token',
            refreshToken: 'renewed-refresh-token',
          },
        })
      }),
    }
    authenticatorRegistry.register('discord-addon', authenticator)

    const [call1, call2] = await Promise.all([
      coordinator.refresh({
        addonId: 'discord-addon',
        scope: {
          workspaceId: workspace.id,
          connectionInstanceId: 'conn-1',
          authorizationRole: 'primary',
        },
      }),
      coordinator.refresh({
        addonId: 'discord-addon',
        scope: {
          workspaceId: workspace.id,
          connectionInstanceId: 'conn-1',
          authorizationRole: 'primary',
        },
      }),
    ])

    expect(call1.isSuccess()).toBe(true)
    expect(call2.isSuccess()).toBe(true)
    expect(refreshCalls).toBe(1)
  })

  it('allows different authorizations to execute renewal independently and concurrently', async () => {
    const wsResult1 = await createConnectedWorkspace({
      connectionId: 'conn-1',
      authorizationId: 'auth-1',
    })
    const wsResult2 = await createConnectedWorkspace({
      connectionId: 'conn-2',
      authorizationId: 'auth-2',
    })
    let callCount = 0

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async () => {
        callCount += 1
        return Either.success({
          credentials: {
            accessToken: 'token-refreshed',
            refreshToken: 'refresh-refreshed',
          },
        })
      }),
    }
    authenticatorRegistry.register('discord-addon', authenticator)

    const [call1, call2] = await Promise.all([
      coordinator.refresh({
        addonId: 'discord-addon',
        scope: {
          workspaceId: wsResult1.workspace.id,
          connectionInstanceId: 'conn-1',
          authorizationRole: 'primary',
        },
      }),
      coordinator.refresh({
        addonId: 'discord-addon',
        scope: {
          workspaceId: wsResult2.workspace.id,
          connectionInstanceId: 'conn-2',
          authorizationRole: 'primary',
        },
      }),
    ])

    expect(call1.isSuccess()).toBe(true)
    expect(call2.isSuccess()).toBe(true)
    expect(callCount).toBe(2)
  })

  it('discards the renewal result when the connection is disconnected during the network call', async () => {
    const { workspace } = await createConnectedWorkspace()

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async () => {
        // Simula desconexão concorrente durante a chamada remota
        workspace.disconnectConnection('conn-1')
        await workspacesRepository.update(workspace)
        return Either.success({
          credentials: {
            accessToken: 'stale-token',
            refreshToken: 'stale-refresh',
          },
        })
      }),
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
    expect(result.failure.statusCode).toBe(409)
    expect(result.failure.messageKey).toBe('CONNECTION_DISCONNECTED_OR_CHANGED')

    // Confirma que nenhuma credencial nova foi persistida no workspace desconectado
    const updatedWs = (await workspacesRepository.getById(workspace.id)).success
    const updatedConn = updatedWs?.connections.find((c) => c.id === 'conn-1')
    expect(updatedConn?.status).toBe('disconnected')
  })

  it('preserves the previous refresh token when the provider response omits it', async () => {
    const { workspace } = await createConnectedWorkspace()

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async (_scope, currentCredentials) => {
        // Provedor retorna novo accessToken mas omite refreshToken (RFC 6749 §6)
        return Either.success({
          credentials: {
            ...currentCredentials,
            accessToken: 'brand-new-access-token',
          },
        })
      }),
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

    expect(result.isSuccess()).toBe(true)

    const updatedWs = (await workspacesRepository.getById(workspace.id)).success
    const updatedConn = updatedWs?.connections.find((c) => c.id === 'conn-1')
    const updatedAuth = updatedConn?.authorizations.find(
      (a) => a.authorizationRole === 'primary',
    )
    expect(updatedAuth?.credentialReferenceId).toBeDefined()

    const targetRef = CredentialReferenceFactory.fromId(
      updatedAuth?.credentialReferenceId ?? '',
    )
    if (!targetRef) throw new Error('Ref inválido')
    const readBack = await credentialsVault.readCredential(targetRef)
    expect(readBack.kind).toBe('present')
    if (readBack.kind === 'present') {
      const parsed = JSON.parse(readBack.token)
      expect(parsed.accessToken).toBe('brand-new-access-token')
      expect(parsed.refreshToken).toBe('initial-refresh-token')
    }
  })

  it('forwards network error without falsely logging out or erasing stored credentials', async () => {
    const { workspace, initialRefId } = await createConnectedWorkspace()

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async () => {
        return Either.failure(
          TokenRefreshError.transient('REMOTE_NETWORK_TIMEOUT', 504),
        )
      }),
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
    expect(result.failure.messageKey).toBe('REMOTE_NETWORK_TIMEOUT')

    // Conexão continua connected e credencial original permanece intacta no cofre
    const checkWs = (await workspacesRepository.getById(workspace.id)).success
    const checkConn = checkWs?.connections.find((c) => c.id === 'conn-1')
    expect(checkConn?.status).toBe('connected')

    const initialRef = CredentialReferenceFactory.fromId(initialRefId)
    if (!initialRef) throw new Error('Ref inicial inválido')
    const vaultCheck = await credentialsVault.readCredential(initialRef)
    expect(vaultCheck.kind).toBe('present')
  })

  it('discards renewal result when authorization generation changes concurrently even if connection generation is untouched', async () => {
    const { workspace } = await createConnectedWorkspace()

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: true,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn(),
      refreshToken: vi.fn(async () => {
        // Simula reautorização que altera a geração da autorização durante a chamada de rede
        workspace.connectAuthorization(
          'conn-1',
          {
            authorizationRole: 'primary',
            authProfileId: 'discord-oauth',
            identity,
            authorizationId: 'auth-1',
            credentialReferenceId: 'concurrent-candidate-ref',
          },
          { channelId: 'general' },
        )
        await workspacesRepository.update(workspace)
        return Either.success({
          credentials: {
            accessToken: 'stale-token-race',
            refreshToken: 'stale-refresh-race',
          },
        })
      }),
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
    expect(result.failure.statusCode).toBe(409)
    expect(result.failure.messageKey).toBe(
      'AUTHORIZATION_DISCONNECTED_OR_CHANGED',
    )
  })
})
