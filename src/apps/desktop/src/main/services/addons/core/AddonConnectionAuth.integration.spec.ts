import { EMPTY_HTTP_CONFIG } from '@mr-tick/adapters/contracts'
import {
  AddonAuthenticatorRegistry,
  type AddonConnectionAuthenticator,
  AddonConnectionProfilesResolver,
  ConnectAddonConnectionService,
  type ConnectionLifecycleAuthentication,
  type CoreCacheQuery,
  type CoreCacheResponse,
  type IAddonConnectionProfilesResolver,
  type IConnectionLifecycleCoordinator,
  type ICoreCacheTransport,
  type IDisconnectAddonConnectionUseCase,
  type IGetCurrentUserUseCase,
  type ILinkConnectionUseCase,
  type ILocalRuntimeAPI,
  type IUnlinkConnectionUseCase,
  type IWorkspacesRepository,
  LinkConnectionService,
  OAuthAttemptCoordinator,
  toWorkspaceConnectionDTO,
  type WorkspaceDTO,
} from '@mr-tick/application'
import type { ConnectionProfileDescriptor } from '@mr-tick/domain'
import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { NoOpSystemEventEmitter } from '@mr-tick/shared/transport'
import { describe, expect, it, vi } from 'vitest'

import {
  ElectronHttpClientFactory,
  NodeFetchTransport,
} from '../../../adapters/ElectronHttpClient'
import { AddonLoader } from '../loader/AddonLoader'
import { permissiveAddonAccessService } from './addon-core-test-fixture'
import {
  emptyAddonCredentialsVault,
  emptyAddonSettingsRepository,
  emptyAddonStorageRepository,
  emptyWorkspaceReferenceRegistry,
} from './addon-workspace-reference-test-fixture'
import { AddonCoreCapabilities } from './AddonCoreCapabilities'

const fakeGetCurrentUserService: IGetCurrentUserUseCase = {
  execute: async () =>
    Either.success({
      id: 'user-1',
      login: 'test-user',
      firstname: 'Test',
      lastname: 'User',
      customFields: [],
    }),
}

function setupIntegrationFixture() {
  const created = Workspace.create({ name: 'Integration Fixture Workspace' })
  expect(created.isSuccess()).toBe(true)
  if (created.isFailure()) return expect.fail(created.failure.messageKey)
  const workspace = created.success

  const profile: ConnectionProfileDescriptor = {
    connectionProfileId: 'custom-service',
    cardinality: 'multi',
    default: true,
    allowedAuthProfileIds: ['custom-service', 'api-key-auth'],
    roles: [
      {
        authorizationRole: 'primary',
        allowedAuthProfileIds: ['custom-service', 'api-key-auth'],
        defaultAuthProfileId: 'custom-service',
      },
    ],
  }

  workspace.createConnection('conn-primary', 'test-addon', profile)

  const repository: IWorkspacesRepository = {
    getById: async (id: string) => {
      if (id === workspace.id) return Either.success(workspace)
      return Either.success(undefined)
    },
    list: async () =>
      Either.success({
        items: [workspace],
        total: 1,
        page: 1,
        pageSize: 1,
      }),
    create: async () => Either.success(undefined),
    update: async () => Either.success(undefined),
    remove: async () => Either.success(undefined),
  }

  const queryCore = vi.fn<
    (query: CoreCacheQuery) => Promise<CoreCacheResponse>
  >(async () => ({
    ok: true,
    value: { kind: 'tasks', tasks: [], hasMore: false },
  }))

  const transport: ICoreCacheTransport = {
    queryCore,
    getState: () => 'ready',
    onStateChanged: (listener) => {
      listener('ready')
      return () => {}
    },
  }

  type OAuthAuthenticator = Extract<
    AddonConnectionAuthenticator,
    { method: 'oauth'; supportsRefresh: false }
  >

  const completeAuthentication = vi.fn<
    OAuthAuthenticator['completeAuthentication']
  >(async () =>
    Either.success({
      kind: 'authorized',
      identity: {
        kind: 'human',
        providerId: 'test-addon',
        tenantId: 'tenant.example',
        providerSubjectId: 'user-original',
        displayName: 'Original User',
      },
      credentials: { token: 'valid-secret-token' },
    }),
  )

  const authenticator: OAuthAuthenticator = {
    method: 'oauth',
    authProfileId: 'custom-service',
    supportsRefresh: false,
    supportsRevocation: false,
    createAuthorizationRequest: vi.fn(async () =>
      Either.success({
        authUrl: 'https://test-addon.example/auth',
        timeoutMs: 5000,
      }),
    ),
    completeAuthentication,
  }

  const coordinatorConnect = vi.fn(
    async (
      input: Parameters<IConnectionLifecycleCoordinator['connect']>[0],
    ): Promise<Either<AppError, ConnectionLifecycleAuthentication>> => {
      const authResult = await input.authenticate()
      if (authResult.isFailure()) {
        return Either.failure(authResult.failure)
      }
      const auth = authResult.success
      const lifecycleIdentityAuth: ConnectionLifecycleAuthentication = {
        kind: 'identity',
        identity: auth.identity,
      }
      return Either.success(lifecycleIdentityAuth)
    },
  )

  const coordinator: IConnectionLifecycleCoordinator = {
    create: async () => Either.success(workspace),
    connect: coordinatorConnect,
    withCredentials: async () => Either.success(),
    refresh: async () => Either.success(),
    disconnect: async () => Either.success(),
    archive: async () => Either.success(),
    restore: async () => Either.success(workspace),
  }

  const workspaceDTO: WorkspaceDTO = {
    id: workspace.id,
    name: workspace.name,
    status: workspace.status,
    description: workspace.description,
    avatarUrl: workspace.avatarUrl,
    connections: [],
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }

  const unlinkService: IUnlinkConnectionUseCase = {
    execute: async () => Either.success(workspaceDTO),
  }

  const authenticatorRegistry = new AddonAuthenticatorRegistry()
  authenticatorRegistry.register('test-addon', {
    method: 'credentials',
    authProfileId: 'custom-service',
    supportsRefresh: false,
    supportsRevocation: false,
    authenticate: async () =>
      Either.success({
        kind: 'authorized',
        identity: {
          kind: 'human',
          providerId: 'test-addon',
          tenantId: 'tenant.example',
          providerSubjectId: 'user-original',
          displayName: 'Original User',
        },
        credentials: { token: 'valid-secret-token' },
      }),
  })
  authenticatorRegistry.register('test-addon', {
    method: 'credentials',
    authProfileId: 'api-key-auth',
    supportsRefresh: false,
    supportsRevocation: false,
    authenticate: async () =>
      Either.success({
        kind: 'authorized',
        identity: {
          kind: 'human',
          providerId: 'test-addon',
          tenantId: 'tenant.example',
          providerSubjectId: 'api-key-user',
          displayName: 'Api Key User',
        },
        credentials: { apiKey: 'secret-api-key' },
      }),
  })

  const profilesResolver: IAddonConnectionProfilesResolver = {
    getConnectionSchema: vi.fn(async () => Either.success([])),
    getConnectionProfiles: async () => Either.success([profile]),
  }
  const connectService = new ConnectAddonConnectionService(
    repository,
    coordinator,
    profilesResolver,
    authenticatorRegistry,
  )
  const linkService: ILinkConnectionUseCase = {
    execute: async () => Either.success(workspaceDTO),
  }
  const disconnectService: IDisconnectAddonConnectionUseCase = {
    execute: async () => Either.success(),
  }

  const core = new AddonCoreCapabilities(
    repository,
    transport,
    'test-addon',
    coordinator,
    linkService,
    connectService,
    disconnectService,
    unlinkService,
    authenticatorRegistry,
    profilesResolver,
    new OAuthAttemptCoordinator(),
    new NoOpSystemEventEmitter(),
    fakeGetCurrentUserService,
  )

  return {
    workspace,
    core,
    authenticator,
    coordinatorConnect,
  }
}

describe('M07 host unit: addon connection auth via registry', () => {
  it('RED 1: allows authentication when connectionProfileId differs from authProfileId (dissociating connection slot from auth method)', async () => {
    const { core, workspace } = setupIntegrationFixture()

    // O descritor da conexão na entidade é 'custom-service'
    // O método de autenticação sendo submetido é 'api-key-auth'
    const result = await core.connections.submitCredentials(
      {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-primary',
      },
      {
        kind: 'credentials',
        authorizationRole: 'primary',
        authProfileId: 'api-key-auth',
        credentials: { apiKey: 'secret-api-key' },
        configuration: { host: 'https://api.example.com' },
      },
    )

    // COMPORTAMENTO ESPERADO (ALVO): Deve aceitar authProfileId sem forçar igualdade com connectionProfileId
    // COMPORTAMENTO ATUAL (RED): Falha com AUTH_PROFILE_MISMATCH (linha 244 do AddonCoreCapabilities.ts)
    expect(
      result.isSuccess(),
      result.isFailure() ? result.failure.messageKey : 'success',
    ).toBe(true)
  })

  it('RED 2: authenticates via the registered authenticator without resolving or instantiating DataSource', async () => {
    const { core, workspace } = setupIntegrationFixture()

    const result = await core.connections.submitCredentials(
      {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-primary',
      },
      {
        kind: 'credentials',
        authorizationRole: 'primary',
        authProfileId: 'custom-service',
        credentials: { apiKey: 'secret-api-key' },
        configuration: { host: 'https://api.example.com' },
      },
    )

    // COMPORTAMENTO ESPERADO (ALVO): A autenticação deve usar o authenticator do registry sem chamar getDataSource
    // COMPORTAMENTO ATUAL (RED): Chama dataSourceResolver.getDataSource e falha com DATASOURCE_MUST_NOT_BE_RESOLVED_FOR_AUTH
    expect(result.isSuccess()).toBe(true)
  })

  it('rejects submitCredentials when authorizationRole is omitted', async () => {
    const { core, workspace } = setupIntegrationFixture()

    const result = await core.connections.submitCredentials(
      {
        workspaceId: workspace.id,
        connectionInstanceId: 'conn-primary',
      },
      {
        kind: 'credentials',
        authProfileId: 'custom-service',
        credentials: { apiKey: 'secret-api-key' },
        configuration: { host: 'https://api.example.com' },
      },
    )

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('AUTHORIZATION_ROLE_REQUIRED')
  })

  it('integrates an auth+watcher addon with real AddonLoader and real core without any DataSource', async () => {
    const created = Workspace.create({ name: 'Watcher Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return expect.fail(created.failure.messageKey)
    const workspace = created.success

    const repository: IWorkspacesRepository = {
      getById: async (id: string) => {
        if (id === workspace.id) return Either.success(workspace)
        return Either.success(undefined)
      },
      list: async () =>
        Either.success({
          items: [workspace],
          total: 1,
          page: 1,
          pageSize: 1,
        }),
      create: async () => Either.success(undefined),
      update: async () => Either.success(undefined),
      remove: async () => Either.success(undefined),
    }

    const profilesResolver = new AddonConnectionProfilesResolver()
    const authenticatorRegistry = new AddonAuthenticatorRegistry()

    type CoordinatorState = {
      connected: boolean
      auth: ConnectionLifecycleAuthentication | null
    }
    const coordinatorState: CoordinatorState = {
      connected: false,
      auth: null,
    }
    const coordinator: IConnectionLifecycleCoordinator = {
      create: async (reservation) => {
        workspace.createConnection(
          reservation.connectionInstanceId,
          reservation.addonId,
          reservation.profile,
        )
        return Either.success(workspace)
      },
      connect: async (connectInput) => {
        coordinatorState.connected = true
        const authResult = await connectInput.authenticate()
        if (authResult.isFailure()) return authResult.forwardFailure()
        coordinatorState.auth = {
          kind: 'identity',
          identity: authResult.success.identity,
        }
        return Either.success({
          kind: 'identity',
          identity: authResult.success.identity,
        })
      },
      withCredentials: async () => Either.success(),
      refresh: async () => Either.success(),
      disconnect: async () => Either.success(),
      archive: async () => Either.success(),
      restore: async () => Either.success(workspace),
    }

    const connectService = new ConnectAddonConnectionService(
      repository,
      coordinator,
      profilesResolver,
      authenticatorRegistry,
    )
    const linkService = new LinkConnectionService(
      repository,
      profilesResolver,
      coordinator,
    )
    const disconnectService: IDisconnectAddonConnectionUseCase = {
      execute: async () => Either.success(),
    }
    const unlinkService: IUnlinkConnectionUseCase = {
      execute: async () =>
        Either.success({
          id: workspace.id,
          name: workspace.name,
          status: workspace.status,
          description: workspace.description,
          avatarUrl: workspace.avatarUrl,
          connections: [],
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        }),
    }

    const transport: ICoreCacheTransport = {
      queryCore: async () => ({
        ok: true,
        value: { kind: 'tasks', tasks: [], hasMore: false },
      }),
      getState: () => 'ready',
      onStateChanged: () => () => {},
    }

    const oauthAttemptCoordinator = new OAuthAttemptCoordinator()

    const core = new AddonCoreCapabilities(
      repository,
      transport,
      'mistertick-discord',
      coordinator,
      linkService,
      connectService,
      disconnectService,
      unlinkService,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
      new NoOpSystemEventEmitter(),
      fakeGetCurrentUserService,
    )

    const fakeCredentialsVault = emptyAddonCredentialsVault()
    const unavailableRuntime: ILocalRuntimeAPI = {
      request: async () => ({
        ok: false,
        error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
      }),
    }

    const addonLoader = new AddonLoader(
      fakeCredentialsVault,
      unavailableRuntime,
      '1.4.0',
      () => core,
      permissiveAddonAccessService,
      emptyWorkspaceReferenceRegistry,
      emptyAddonSettingsRepository,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
      new ElectronHttpClientFactory(
        EMPTY_HTTP_CONFIG,
        new NodeFetchTransport(),
      ),
      emptyAddonStorageRepository,
    )

    addonLoader.registerManifestCapabilities('mistertick-discord', ['auth'])
    const addonContext = addonLoader.createContext('mistertick-discord')

    addonContext.contributions.connections.registerProfiles([
      {
        connectionProfileId: 'discord-presence',
        cardinality: 'single',
        default: true,
        roles: [
          {
            authorizationRole: 'primary',
            allowedAuthProfileIds: ['discord-oauth'],
            defaultAuthProfileId: 'discord-oauth',
            label: 'Conta Principal',
          },
        ],
      },
    ])

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: false,
      supportsRevocation: false,
      createAuthorizationRequest: async (scope, params) => {
        void scope
        return Either.success({
          authUrl: `https://discord.com/oauth2/authorize?conn=${scope.connectionInstanceId}&state=${params.state}&code_challenge=${params.codeChallenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(params.redirectUri)}`,
          timeoutMs: 120000,
        })
      },
      completeAuthentication: async (scope, response) => {
        void scope
        return Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: '1372352088457220126',
            displayName: 'Discord User',
          },
          credentials: {
            accessToken: `access-${response.code}`,
          },
        })
      },
    }

    addonContext.contributions.connections.registerAuthenticator(authenticator)

    const resolvedProfiles =
      await profilesResolver.getConnectionProfiles('mistertick-discord')
    expect(resolvedProfiles.isSuccess()).toBe(true)
    if (resolvedProfiles.isFailure()) {
      return expect.fail(resolvedProfiles.failure.messageKey)
    }
    expect(resolvedProfiles.success).toHaveLength(1)
    expect(resolvedProfiles.success[0]?.connectionProfileId).toBe(
      'discord-presence',
    )

    const createResult = await core.connections.create({
      workspaceId: workspace.id,
      connectionProfileId: 'discord-presence',
    })
    expect(createResult.isSuccess()).toBe(true)
    if (createResult.isFailure()) {
      return expect.fail(createResult.failure.messageKey)
    }
    const createdConn = createResult.success
    expect(createdConn.connectionProfileId).toBe('discord-presence')
    expect(createdConn.addonId).toBe('mistertick-discord')

    const authScope = {
      workspaceId: workspace.id,
      connectionInstanceId: createdConn.connectionInstanceId,
      authorizationRole: 'primary',
    }
    const authReqResult =
      await core.connections.createAuthorizationRequest(authScope)
    expect(authReqResult.isSuccess()).toBe(true)
    if (authReqResult.isFailure()) {
      return expect.fail(authReqResult.failure.messageKey)
    }
    const url = new URL(authReqResult.success.authUrl)
    const returnedState = url.searchParams.get('state')!
    expect(returnedState).toBeDefined()

    const oauthConnect = vi.spyOn(connectService, 'execute')
    const completeResult = await core.connections.completeAuthentication(
      authScope,
      {
        code: 'auth-code-test',
        state: returnedState,
        configuration: { projectKey: 'SCRUM', syncStartDate: '2026-10-01' },
      },
    )
    expect(completeResult.isSuccess()).toBe(true)
    expect(oauthConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticationInput: expect.objectContaining({
          method: 'oauth',
          configuration: { projectKey: 'SCRUM', syncStartDate: '2026-10-01' },
        }),
      }),
    )
    expect(coordinatorState.connected).toBe(true)
    const authSnapshot = coordinatorState.auth
    if (!authSnapshot) {
      return expect.fail('coordinatorState.auth não registrado')
    }
    if (authSnapshot.kind !== 'identity') {
      return expect.fail('connectedAuth deve ter kind identity')
    }
    expect(authSnapshot.identity.displayName).toBe('Discord User')

    addonContext.contributions.connections.unregisterProfiles()
    const afterUnregister =
      await profilesResolver.getConnectionProfiles('mistertick-discord')
    expect(afterUnregister.isFailure()).toBe(true)
    if (afterUnregister.isSuccess()) {
      return expect.fail('esperava falha após desregistro')
    }
    expect(afterUnregister.failure.messageKey).toBe(
      'ADDON_CONNECTION_PROFILES_NOT_FOUND',
    )
  })

  it('recusa callback apos desativacao do addon compartilhando coordenador entre loader e core', async () => {
    const created = Workspace.create({
      name: 'Deactivate Integration Workspace',
    })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const repository: IWorkspacesRepository = {
      getById: async (id: string) => {
        if (id === workspace.id) return Either.success(workspace)
        return Either.success(undefined)
      },
      list: async () =>
        Either.success({
          items: [workspace],
          total: 1,
          page: 1,
          pageSize: 1,
        }),
      create: async () => Either.success(undefined),
      update: async () => Either.success(undefined),
      remove: async () => Either.success(undefined),
    }

    const transport: ICoreCacheTransport = {
      queryCore: async () => ({
        ok: true,
        value: { kind: 'tasks', tasks: [], hasMore: false },
      }),
      getState: () => 'ready',
      onStateChanged: () => () => {},
    }

    const authenticatorRegistry = new AddonAuthenticatorRegistry()
    const profilesResolver = new AddonConnectionProfilesResolver()
    const oauthAttemptCoordinator = new OAuthAttemptCoordinator()

    const coordinator: IConnectionLifecycleCoordinator = {
      create: async (reservation) => {
        workspace.createConnection(
          reservation.connectionInstanceId,
          reservation.addonId,
          reservation.profile,
        )
        return Either.success(workspace)
      },
      connect: async () =>
        Either.failure(AppError.Internal('UNUSED_AUTHENTICATION')),
      withCredentials: async () => Either.success(),
      refresh: async () => Either.success(),
      disconnect: async () => Either.success(),
      archive: async () => Either.success(),
      restore: async () => Either.success(workspace),
    }

    const connectService = new ConnectAddonConnectionService(
      repository,
      coordinator,
      profilesResolver,
      authenticatorRegistry,
    )
    const linkService = new LinkConnectionService(
      repository,
      profilesResolver,
      coordinator,
    )
    const disconnectService: IDisconnectAddonConnectionUseCase = {
      execute: async () => Either.success(),
    }
    const unlinkService: IUnlinkConnectionUseCase = {
      execute: async () =>
        Either.success({
          id: workspace.id,
          name: workspace.name,
          status: workspace.status,
          connections: workspace.connections.map(toWorkspaceConnectionDTO),
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        }),
    }

    const core = new AddonCoreCapabilities(
      repository,
      transport,
      'mistertick-discord',
      coordinator,
      linkService,
      connectService,
      disconnectService,
      unlinkService,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
      new NoOpSystemEventEmitter(),
      fakeGetCurrentUserService,
    )

    const fakeCredentialsVault = emptyAddonCredentialsVault()
    const unavailableRuntime: ILocalRuntimeAPI = {
      request: async () => ({
        ok: false,
        error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
      }),
    }

    const addonLoader = new AddonLoader(
      fakeCredentialsVault,
      unavailableRuntime,
      '1.4.0',
      () => core,
      permissiveAddonAccessService,
      emptyWorkspaceReferenceRegistry,
      emptyAddonSettingsRepository,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
      new ElectronHttpClientFactory(
        EMPTY_HTTP_CONFIG,
        new NodeFetchTransport(),
      ),
      emptyAddonStorageRepository,
    )

    addonLoader.registerManifestCapabilities('mistertick-discord', ['auth'])
    const addonContext = addonLoader.createContext('mistertick-discord')
    addonContext.contributions.connections.registerProfiles([
      {
        connectionProfileId: 'discord-presence',
        cardinality: 'single',
        default: true,
        roles: [
          {
            authorizationRole: 'primary',
            allowedAuthProfileIds: ['discord-oauth'],
            defaultAuthProfileId: 'discord-oauth',
            label: 'Conta Principal',
          },
        ],
      },
    ])

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: false,
      supportsRevocation: false,
      createAuthorizationRequest: async (scope, params) =>
        Either.success({
          authUrl: `https://discord.com/oauth2/authorize?conn=${scope.connectionInstanceId}&state=${params.state}&code_challenge=${params.codeChallenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(params.redirectUri)}`,
          timeoutMs: 120000,
        }),
      completeAuthentication: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: '1372352088457220126',
            displayName: 'Discord User',
          },
          credentials: { accessToken: 'token-abc' },
        }),
    }
    addonContext.contributions.connections.registerAuthenticator(authenticator)

    const createResult = await core.connections.create({
      workspaceId: workspace.id,
      connectionProfileId: 'discord-presence',
    })
    expect(createResult.isSuccess()).toBe(true)
    if (createResult.isFailure()) return

    const authScope = {
      workspaceId: workspace.id,
      connectionInstanceId: createResult.success.connectionInstanceId,
      authorizationRole: 'primary',
    }
    const authReqResult =
      await core.connections.createAuthorizationRequest(authScope)
    expect(authReqResult.isSuccess()).toBe(true)
    if (authReqResult.isFailure()) return

    const url = new URL(authReqResult.success.authUrl)
    const returnedState = url.searchParams.get('state')!

    // AddonLoader desativa o addon (deactivateAddon)
    await addonLoader.deactivateAddon('mistertick-discord')

    // Callback recebido apos deactivate DEVE ser recusado porque o coordenador compartilhado foi invalidado
    const completeResult = await core.connections.completeAuthentication(
      authScope,
      {
        code: 'auth-code-late',
        state: returnedState,
      },
    )
    expect(completeResult.isFailure()).toBe(true)
    if (completeResult.isSuccess()) return
    expect(completeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_NOT_FOUND_OR_EXPIRED',
    )
  })

  it('recusa callback defasado se reauth concorrente incrementou a geracao de autorizacao', async () => {
    const created = Workspace.create({ name: 'Interleaved Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const repository: IWorkspacesRepository = {
      getById: async (id: string) => {
        if (id === workspace.id) return Either.success(workspace)
        return Either.success(undefined)
      },
      list: async () =>
        Either.success({
          items: [workspace],
          total: 1,
          page: 1,
          pageSize: 1,
        }),
      create: async () => Either.success(undefined),
      update: async () => Either.success(undefined),
      remove: async () => Either.success(undefined),
    }

    const transport: ICoreCacheTransport = {
      queryCore: async () => ({
        ok: true,
        value: { kind: 'tasks', tasks: [], hasMore: false },
      }),
      getState: () => 'ready',
      onStateChanged: () => () => {},
    }

    const authenticatorRegistry = new AddonAuthenticatorRegistry()
    const profilesResolver = new AddonConnectionProfilesResolver()
    const oauthAttemptCoordinator = new OAuthAttemptCoordinator()

    const coordinator: IConnectionLifecycleCoordinator = {
      create: async (reservation) => {
        workspace.createConnection(
          reservation.connectionInstanceId,
          reservation.addonId,
          reservation.profile,
        )
        return Either.success(workspace)
      },
      connect: async () =>
        Either.failure(AppError.Internal('UNUSED_AUTHENTICATION')),
      withCredentials: async () => Either.success(),
      refresh: async () => Either.success(),
      disconnect: async () => Either.success(),
      archive: async () => Either.success(),
      restore: async () => Either.success(workspace),
    }

    const connectService = new ConnectAddonConnectionService(
      repository,
      coordinator,
      profilesResolver,
      authenticatorRegistry,
    )
    const linkService = new LinkConnectionService(
      repository,
      profilesResolver,
      coordinator,
    )
    const disconnectService: IDisconnectAddonConnectionUseCase = {
      execute: async () => Either.success(),
    }
    const unlinkService: IUnlinkConnectionUseCase = {
      execute: async () =>
        Either.success({
          id: workspace.id,
          name: workspace.name,
          status: workspace.status,
          connections: workspace.connections.map(toWorkspaceConnectionDTO),
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        }),
    }

    const core = new AddonCoreCapabilities(
      repository,
      transport,
      'mistertick-discord',
      coordinator,
      linkService,
      connectService,
      disconnectService,
      unlinkService,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
      new NoOpSystemEventEmitter(),
      fakeGetCurrentUserService,
    )

    const fakeCredentialsVault = emptyAddonCredentialsVault()
    const unavailableRuntime: ILocalRuntimeAPI = {
      request: async () => ({
        ok: false,
        error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
      }),
    }

    const addonLoader = new AddonLoader(
      fakeCredentialsVault,
      unavailableRuntime,
      '1.4.0',
      () => core,
      permissiveAddonAccessService,
      emptyWorkspaceReferenceRegistry,
      emptyAddonSettingsRepository,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
      new ElectronHttpClientFactory(
        EMPTY_HTTP_CONFIG,
        new NodeFetchTransport(),
      ),
      emptyAddonStorageRepository,
    )

    addonLoader.registerManifestCapabilities('mistertick-discord', ['auth'])
    const addonContext = addonLoader.createContext('mistertick-discord')
    addonContext.contributions.connections.registerProfiles([
      {
        connectionProfileId: 'discord-presence',
        cardinality: 'single',
        default: true,
        roles: [
          {
            authorizationRole: 'primary',
            allowedAuthProfileIds: ['discord-oauth'],
            defaultAuthProfileId: 'discord-oauth',
            label: 'Conta Principal',
          },
        ],
      },
    ])

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: false,
      supportsRevocation: false,
      createAuthorizationRequest: async (scope, params) =>
        Either.success({
          authUrl: `https://discord.com/oauth2/authorize?conn=${scope.connectionInstanceId}&state=${params.state}&code_challenge=${params.codeChallenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(params.redirectUri)}`,
          timeoutMs: 120000,
        }),
      completeAuthentication: async () =>
        Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: '1372352088457220126',
            displayName: 'Discord User',
          },
          credentials: { accessToken: 'token-abc' },
        }),
    }
    addonContext.contributions.connections.registerAuthenticator(authenticator)

    const createResult = await core.connections.create({
      workspaceId: workspace.id,
      connectionProfileId: 'discord-presence',
    })
    expect(createResult.isSuccess()).toBe(true)
    if (createResult.isFailure()) return

    const connInstanceId = createResult.success.connectionInstanceId

    // Estabelece uma primeira autorização com generation 1
    const connection = workspace.connections.find(
      (c) => c.id === connInstanceId,
    )!
    workspace.connectAuthorization(
      connInstanceId,
      {
        authorizationRole: 'primary',
        authProfileId: 'discord-oauth',
        identity: {
          kind: 'human',
          providerId: 'discord',
          tenantId: '1372352088457220126',
          providerSubjectId: '1372352088457220126',
          displayName: 'Initial Auth',
        },
        authorizationId: 'auth-stable-id',
        credentialReferenceId: 'cred-1',
      },
      {},
    )

    const authScope = {
      workspaceId: workspace.id,
      connectionInstanceId: connInstanceId,
      authorizationRole: 'primary',
    }

    // Inicia fluxo 1 de re-autenticação (esperando generation 1)
    const authReqResult1 =
      await core.connections.createAuthorizationRequest(authScope)
    expect(authReqResult1.isSuccess()).toBe(true)
    if (authReqResult1.isFailure()) return

    const url1 = new URL(authReqResult1.success.authUrl)
    const state1 = url1.searchParams.get('state')!

    // Uma reauth concorrente conclui antes e incrementa authorizationGeneration para 2
    workspace.connectAuthorization(
      connInstanceId,
      {
        authorizationRole: 'primary',
        authProfileId: 'discord-oauth',
        identity: {
          kind: 'human',
          providerId: 'discord',
          tenantId: '1372352088457220126',
          providerSubjectId: '1372352088457220126',
          displayName: 'Concurrent Auth',
        },
        authorizationId: 'auth-stable-id',
        credentialReferenceId: 'cred-2',
      },
      {},
    )

    // Agora o callback atrasado de state1 chega:
    const completeResult = await core.connections.completeAuthentication(
      authScope,
      {
        code: 'auth-code-1',
        state: state1,
      },
    )

    // DEVE ser recusado porque a geração atual de autorização na conexão não bate com a tentativa iniciada!
    expect(completeResult.isFailure()).toBe(true)
    if (completeResult.isSuccess()) return
    expect(completeResult.failure.statusCode).toBe(409)
    expect(completeResult.failure.messageKey).toBe(
      'OAUTH_ATTEMPT_AUTH_GENERATION_MISMATCH',
    )
  })

  it('blocks commit when reauth occurs during authenticator completion via correlation pre-commit check', async () => {
    const created = Workspace.create({
      name: 'Integration Pre-commit Workspace',
    })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const workspace = created.success

    const repository: IWorkspacesRepository = {
      getById: async (id: string) => {
        if (id === workspace.id) return Either.success(workspace)
        return Either.success(undefined)
      },
      list: async () =>
        Either.success({
          items: [workspace],
          total: 1,
          page: 1,
          pageSize: 1,
        }),
      create: async () => Either.success(undefined),
      update: async () => Either.success(undefined),
      remove: async () => Either.success(undefined),
    }

    const transport: ICoreCacheTransport = {
      queryCore: async () => ({
        ok: true,
        value: { kind: 'tasks', tasks: [], hasMore: false },
      }),
      getState: () => 'ready',
      onStateChanged: () => () => {},
    }

    const authenticatorRegistry = new AddonAuthenticatorRegistry()
    const profilesResolver = new AddonConnectionProfilesResolver()
    const oauthAttemptCoordinator = new OAuthAttemptCoordinator()

    const coordinator: IConnectionLifecycleCoordinator = {
      create: async (reservation) => {
        workspace.createConnection(
          reservation.connectionInstanceId,
          reservation.addonId,
          reservation.profile,
        )
        return Either.success(workspace)
      },
      connect: async (input) => {
        const conn = workspace.connections.find(
          (c) => c.id === input.connectionInstanceId,
        )
        if (conn === undefined) {
          return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
        }
        const authResult = await input.authenticate()
        if (authResult.isFailure()) return authResult.forwardFailure()

        // Verificação pré-commit após a chamada de autenticação
        const postConn = workspace.connections.find(
          (c) => c.id === input.connectionInstanceId,
        )
        if (postConn === undefined) {
          return Either.failure(AppError.NotFound('CONEXAO_NAO_ENCONTRADA'))
        }
        const postAuth = postConn.authorizations.find(
          (a) => a.authorizationRole === input.authorizationRole,
        )
        const postAuthGen = postAuth !== undefined ? postAuth.generation : 0
        if (input.correlation !== undefined) {
          if (postConn.generation !== input.correlation.connectionGeneration) {
            return Either.failure(
              AppError.Http(409, 'CONNECTION_DISCONNECTED_OR_CHANGED'),
            )
          }
          if (postAuthGen !== input.correlation.authorizationGeneration) {
            return Either.failure(
              AppError.Http(409, 'AUTHORIZATION_DISCONNECTED_OR_CHANGED'),
            )
          }
        }
        return Either.success({
          kind: 'identity' as const,
          identity: authResult.success.identity,
        })
      },
      withCredentials: async () => Either.success(),
      refresh: async () => Either.success(),
      disconnect: async () => Either.success(),
      archive: async () => Either.success(),
      restore: async () => Either.success(workspace),
    }

    const connectService = new ConnectAddonConnectionService(
      repository,
      coordinator,
      profilesResolver,
      authenticatorRegistry,
    )
    const linkService = new LinkConnectionService(
      repository,
      profilesResolver,
      coordinator,
    )
    const disconnectService: IDisconnectAddonConnectionUseCase = {
      execute: async () => Either.success(),
    }
    const unlinkService: IUnlinkConnectionUseCase = {
      execute: async () =>
        Either.success({
          id: workspace.id,
          name: workspace.name,
          status: workspace.status,
          connections: workspace.connections.map(toWorkspaceConnectionDTO),
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        }),
    }

    const core = new AddonCoreCapabilities(
      repository,
      transport,
      'mistertick-discord',
      coordinator,
      linkService,
      connectService,
      disconnectService,
      unlinkService,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
      new NoOpSystemEventEmitter(),
      fakeGetCurrentUserService,
    )

    const fakeCredentialsVault = emptyAddonCredentialsVault()
    const unavailableRuntime: ILocalRuntimeAPI = {
      request: async () => ({
        ok: false,
        error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
      }),
    }

    const addonLoader = new AddonLoader(
      fakeCredentialsVault,
      unavailableRuntime,
      '1.4.0',
      () => core,
      permissiveAddonAccessService,
      emptyWorkspaceReferenceRegistry,
      emptyAddonSettingsRepository,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
      new ElectronHttpClientFactory(
        EMPTY_HTTP_CONFIG,
        new NodeFetchTransport(),
      ),
      emptyAddonStorageRepository,
    )

    addonLoader.registerManifestCapabilities('mistertick-discord', ['auth'])
    const addonContext = addonLoader.createContext('mistertick-discord')
    addonContext.contributions.connections.registerProfiles([
      {
        connectionProfileId: 'discord-presence',
        cardinality: 'single',
        default: true,
        roles: [
          {
            authorizationRole: 'primary',
            allowedAuthProfileIds: ['discord-oauth'],
            defaultAuthProfileId: 'discord-oauth',
            label: 'Conta Principal',
          },
        ],
      },
    ])

    let triggerConcurrentReauth = false
    let connInstanceId = ''

    const authenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'discord-oauth',
      supportsRefresh: false,
      supportsRevocation: false,
      createAuthorizationRequest: async (scope, params) =>
        Either.success({
          authUrl: `https://discord.com/oauth2/authorize?conn=${scope.connectionInstanceId}&state=${params.state}&code_challenge=${params.codeChallenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(params.redirectUri)}`,
          timeoutMs: 120000,
        }),
      completeAuthentication: async () => {
        if (triggerConcurrentReauth) {
          // Reautorização intercalada conclui antes do commit do primeiro callback
          workspace.connectAuthorization(
            connInstanceId,
            {
              authorizationRole: 'primary',
              authProfileId: 'discord-oauth',
              identity: {
                kind: 'human',
                providerId: 'discord',
                tenantId: '1372352088457220126',
                providerSubjectId: '1372352088457220126',
                displayName: 'Concurrent Intercalated Auth',
              },
              authorizationId: 'auth-stable-id',
              credentialReferenceId: 'cred-concurrent-intercalated',
            },
            {},
          )
        }
        return Either.success({
          kind: 'authorized',
          identity: {
            kind: 'human',
            providerId: 'discord',
            tenantId: '1372352088457220126',
            providerSubjectId: '1372352088457220126',
            displayName: 'Stale Delayed Auth',
          },
          credentials: { accessToken: 'stale-token-xyz' },
        })
      },
    }
    addonContext.contributions.connections.registerAuthenticator(authenticator)

    const createResult = await core.connections.create({
      workspaceId: workspace.id,
      connectionProfileId: 'discord-presence',
    })
    expect(createResult.isSuccess()).toBe(true)
    if (createResult.isFailure()) return

    connInstanceId = createResult.success.connectionInstanceId

    // Estabelece autorização inicial com generation 1
    workspace.connectAuthorization(
      connInstanceId,
      {
        authorizationRole: 'primary',
        authProfileId: 'discord-oauth',
        identity: {
          kind: 'human',
          providerId: 'discord',
          tenantId: '1372352088457220126',
          providerSubjectId: '1372352088457220126',
          displayName: 'Initial Auth',
        },
        authorizationId: 'auth-stable-id',
        credentialReferenceId: 'cred-1',
      },
      {},
    )

    const authScope = {
      workspaceId: workspace.id,
      connectionInstanceId: connInstanceId,
      authorizationRole: 'primary',
    }

    // Inicia fluxo 1 de autenticação esperando generation 1
    const authReqResult1 =
      await core.connections.createAuthorizationRequest(authScope)
    expect(authReqResult1.isSuccess()).toBe(true)
    if (authReqResult1.isFailure()) return

    const url1 = new URL(authReqResult1.success.authUrl)
    const state1 = url1.searchParams.get('state')!

    // Ativa barreira determinística no completeAuthentication
    triggerConcurrentReauth = true

    const completeResult = await core.connections.completeAuthentication(
      authScope,
      {
        code: 'auth-code-1',
        state: state1,
      },
    )

    // O consume foi bem-sucedido, mas o pré-commit barrou porque correlation.authorizationGeneration !== currentAuthGen
    expect(completeResult.isFailure()).toBe(true)
    if (completeResult.isSuccess()) return
    expect(completeResult.failure.statusCode).toBe(409)
    expect(completeResult.failure.messageKey).toBe(
      'AUTHORIZATION_DISCONNECTED_OR_CHANGED',
    )

    // O baseline novo estabelecido pela reauth intercalada permaneceu intacto!
    const connection = workspace.connections.find(
      (c) => c.id === connInstanceId,
    )!
    const currentAuth = connection.authorizations.find(
      (a) => a.authorizationId === 'auth-stable-id',
    )!
    expect(currentAuth.generation).toBe(2)
    expect(currentAuth.identity.displayName).toBe(
      'Concurrent Intercalated Auth',
    )
    expect(currentAuth.credentialReferenceId).toBe(
      'cred-concurrent-intercalated',
    )
  })
})
