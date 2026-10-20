import type {
  ConnectionIdentity,
  ConnectionProfileDescriptor,
} from '@mr-tick/domain'
import { Workspace } from '@mr-tick/domain'
import { AppError, Either, TokenRefreshError } from '@mr-tick/shared/helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AddonConnectionAuthenticator,
  CredentialVaultMutationResult,
  CredentialVaultReadResult,
  IAddonAuthenticatorRegistry,
  IConnectionCredentialsVault,
  IConnectionLifecycleRepository,
  IConnectionLifecycleTransactionBoundary,
  IConnectionPendingWorkGuard,
  IConnectionReservationRepository,
  IWorkspacesRepository,
  WorkspaceJournalEntry,
  WorkspaceLifecycleOperation,
} from '@/contracts'
import type { PagedResultDTO } from '@/dtos'
import type { CredentialReference } from '@/utils/credential-reference'
import { CredentialReferenceFactory } from '@/utils/credential-reference'

import { ConnectionLifecycleCoordinator } from './ConnectionLifecycleCoordinator'

class InMemoryCredentialsVault implements IConnectionCredentialsVault {
  public storage = new Map<string, string>()

  public async writeCredential(
    reference: CredentialReference,
    payload: string,
  ): Promise<CredentialVaultMutationResult> {
    this.storage.set(reference.id, payload)
    return { kind: 'completed' }
  }

  public async readCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultReadResult> {
    const val = this.storage.get(reference.id)
    if (val === undefined) return { kind: 'absent' }
    return { kind: 'present', token: val }
  }

  public async removeCredential(
    reference: CredentialReference,
  ): Promise<CredentialVaultMutationResult> {
    this.storage.delete(reference.id)
    return { kind: 'completed' }
  }
}

class InMemoryWorkspacesRepository implements IWorkspacesRepository {
  public workspaces = new Map<string, Workspace>()

  public async getById(
    id: string,
  ): Promise<Either<AppError, Workspace | undefined>> {
    const ws = this.workspaces.get(id)
    if (ws === undefined) return Either.success(undefined)
    return Either.success(ws)
  }

  public async list(): Promise<Either<AppError, PagedResultDTO<Workspace>>> {
    return Either.success({
      items: Array.from(this.workspaces.values()),
      total: this.workspaces.size,
      page: 1,
      pageSize: 10,
    })
  }

  public async create(workspace: Workspace): Promise<Either<AppError, void>> {
    this.workspaces.set(workspace.id, workspace)
    return Either.success(undefined)
  }

  public async update(workspace: Workspace): Promise<Either<AppError, void>> {
    this.workspaces.set(workspace.id, workspace)
    return Either.success(undefined)
  }

  public async remove(id: string): Promise<Either<AppError, void>> {
    this.workspaces.delete(id)
    return Either.success(undefined)
  }
}

class InMemoryLifecycleRepository implements IConnectionLifecycleRepository {
  public operations: WorkspaceLifecycleOperation[] = []
  public advancedPhases: Array<{ operationId: string; phase: string }> = []
  public finished: string[] = []

  public async beginLifecycle(
    operation: WorkspaceLifecycleOperation,
  ): Promise<Either<AppError, void>> {
    this.operations.push(operation)
    return Either.success(undefined)
  }

  public async advanceLifecycle(
    operationId: string,
    phase:
      | 'candidate_written'
      | 'cleanup_pending'
      | 'candidate_cleanup_pending'
      | 'metadata_committed',
  ): Promise<Either<AppError, void>> {
    this.advancedPhases.push({ operationId, phase })
    return Either.success(undefined)
  }

  public async finishLifecycle(
    operationId: string,
  ): Promise<Either<AppError, void>> {
    this.finished.push(operationId)
    return Either.success(undefined)
  }

  public async abortPending(): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }

  public async inspectRecovery(): Promise<
    Either<AppError, WorkspaceJournalEntry[]>
  > {
    return Either.success([])
  }
}

class InMemoryReservationRepository implements IConnectionReservationRepository {
  public async reserveConnectionSlot(): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }
  public async releaseConnectionSlot(): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }
  public async findConnectionReservation(): Promise<
    Either<AppError, undefined>
  > {
    return Either.success(undefined)
  }
  public async recoverPendingConnectionReservations(): Promise<
    Either<AppError, void>
  > {
    return Either.success(undefined)
  }
}

class FakeAuthenticatorRegistry implements IAddonAuthenticatorRegistry {
  private authenticators = new Map<string, AddonConnectionAuthenticator>()

  public register(
    addonId: string,
    authenticator: AddonConnectionAuthenticator,
  ): void {
    this.authenticators.set(
      `${addonId}:${authenticator.authProfileId}`,
      authenticator,
    )
  }

  public unregister(addonId: string, authProfileId: string): void {
    this.authenticators.delete(`${addonId}:${authProfileId}`)
  }

  public getAuthenticator(
    addonId: string,
    authProfileId: string,
  ): AddonConnectionAuthenticator | undefined {
    return this.authenticators.get(`${addonId}:${authProfileId}`)
  }

  public getAuthenticatorsForAddon(
    addonId: string,
  ): readonly AddonConnectionAuthenticator[] {
    const result: AddonConnectionAuthenticator[] = []
    for (const [key, auth] of this.authenticators.entries()) {
      if (key.startsWith(`${addonId}:`)) {
        result.push(auth)
      }
    }
    return result
  }
}

describe('ConnectionLifecycleCoordinator.refresh', () => {
  let credentialsVault: InMemoryCredentialsVault
  let workspacesRepository: InMemoryWorkspacesRepository
  let lifecycleRepository: InMemoryLifecycleRepository
  let reservationRepository: InMemoryReservationRepository
  let authenticatorRegistry: FakeAuthenticatorRegistry
  let coordinator: ConnectionLifecycleCoordinator

  const profile: ConnectionProfileDescriptor = {
    connectionProfileId: 'discord-profile',
    cardinality: 'single',
    default: true,
    roles: [
      {
        authorizationRole: 'primary',
        allowedAuthProfileIds: ['discord-oauth'],
        defaultAuthProfileId: 'discord-oauth',
      },
    ],
  }

  const identity: Extract<ConnectionIdentity, { kind: 'human' }> = {
    kind: 'human',
    providerId: 'discord',
    tenantId: '123',
    providerSubjectId: 'user-123',
    displayName: 'Discord User',
  }

  beforeEach(() => {
    credentialsVault = new InMemoryCredentialsVault()
    workspacesRepository = new InMemoryWorkspacesRepository()
    lifecycleRepository = new InMemoryLifecycleRepository()
    reservationRepository = new InMemoryReservationRepository()
    authenticatorRegistry = new FakeAuthenticatorRegistry()

    const pendingWorkGuard: IConnectionPendingWorkGuard = {
      withNoPendingWrites: async (_w, _c, op) => op(),
    }
    const transactionBoundary: IConnectionLifecycleTransactionBoundary = {
      runInTransaction: async (cb) =>
        cb({
          workspaces: workspacesRepository,
          lifecycle: lifecycleRepository,
        }),
    }

    coordinator = new ConnectionLifecycleCoordinator(
      credentialsVault,
      workspacesRepository,
      lifecycleRepository,
      reservationRepository,
      pendingWorkGuard,
      transactionBoundary,
      authenticatorRegistry,
    )
  })

  async function createConnectedWorkspace(opts?: {
    workspaceId?: string
    connectionId?: string
    addonId?: string
    authorizationId?: string
  }): Promise<{ workspace: Workspace; initialRefId: string }> {
    const wsResult = Workspace.create({ name: 'Workspace Test' })
    const workspace = wsResult.success
    const wsId =
      opts?.workspaceId !== undefined ? opts.workspaceId : workspace.id
    const connId =
      opts?.connectionId !== undefined ? opts.connectionId : 'conn-1'
    const addonId = opts?.addonId !== undefined ? opts.addonId : 'discord-addon'
    const authId =
      opts?.authorizationId !== undefined ? opts.authorizationId : 'auth-1'

    workspace.createConnection(connId, addonId, profile)

    const initialCandidate =
      CredentialReferenceFactory.createConnectionCandidate({
        ownerId: addonId,
        workspaceId: wsId,
        connectionId: connId,
        authorizationId: authId,
        operationId: 'op-init',
      })
    await credentialsVault.writeCredential(
      initialCandidate,
      JSON.stringify({
        accessToken: 'initial-access-token',
        refreshToken: 'initial-refresh-token',
      }),
    )

    workspace.connectAuthorization(
      connId,
      {
        authorizationRole: 'primary',
        authProfileId: 'discord-oauth',
        identity,
        authorizationId: authId,
        credentialReferenceId: initialCandidate.id,
      },
      { channelId: 'general' },
    )

    await workspacesRepository.create(workspace)
    return { workspace, initialRefId: initialCandidate.id }
  }

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
