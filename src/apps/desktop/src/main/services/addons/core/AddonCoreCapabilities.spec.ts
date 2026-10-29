import {
  AddonAuthenticatorRegistry,
  type AddonConnectionAuthenticator,
  type ConnectAddonConnectionInput,
  type ConnectAddonConnectionResult,
  type CoreCacheQuery,
  type CoreCacheResponse,
  type IAddonConnectionProfilesResolver,
  type IConnectAddonConnectionUseCase,
  type IConnectionLifecycleCoordinator,
  type ICoreCacheTransport,
  type IDisconnectAddonConnectionUseCase,
  type IGetCurrentUserUseCase,
  type ILinkConnectionUseCase,
  type IUnlinkConnectionUseCase,
  type IWorkspacesRepository,
  OAuthAttemptCoordinator,
} from '@mr-tick/application'
import type { ConnectionProfileDescriptor } from '@mr-tick/domain'
import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { NoOpSystemEventEmitter } from '@mr-tick/shared/transport'
import { describe, expect, it, vi } from 'vitest'

import { AddonCoreCapabilities } from './AddonCoreCapabilities'

function fixture() {
  const created = Workspace.create({ name: 'SDK fixture' })
  if (created.isFailure()) return expect.fail(created.failure.messageKey)
  const workspace = created.success
  workspace.createConnection('connection', 'provider', {
    connectionProfileId: 'primary',
    cardinality: 'multi',
    default: true,
  })
  workspace.connectAuthorization(
    'connection',
    {
      authorizationRole: 'primary',
      authProfileId: 'primary',
      authorizationId: 'authorization-fixture',
      identity: {
        kind: 'human',
        providerId: 'provider',
        tenantId: 'provider.example',
        providerSubjectId: 'member',
        displayName: 'Name Test',
      },
    },
    { privateToken: 'secret' },
  )
  workspace.createConnection('foreign-connection', 'other-addon', {
    connectionProfileId: 'foreign-profile',
    cardinality: 'multi',
    default: false,
  })
  const repository: IWorkspacesRepository = {
    getById: async (id) => {
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
  const profile: ConnectionProfileDescriptor = {
    connectionProfileId: 'primary',
    cardinality: 'multi',
    default: true,
    roles: [
      {
        authorizationRole: 'primary',
        allowedAuthProfileIds: ['primary'],
        defaultAuthProfileId: 'primary',
      },
    ],
  }
  type OAuthAuthenticator = Extract<
    AddonConnectionAuthenticator,
    { method: 'oauth' }
  >
  const createLifecycle = vi.fn(
    async (input: Parameters<IConnectionLifecycleCoordinator['create']>[0]) =>
      Either.success(workspace),
  )
  const completeAuthentication = vi.fn<
    OAuthAuthenticator['completeAuthentication']
  >(async () =>
    Either.success({
      kind: 'authorized',
      identity: {
        kind: 'bot',
        providerId: 'provider',
        tenantId: 'provider.example',
        providerSubjectId: 'bot-1',
        displayName: 'Watcher',
      },
      credentials: { accessToken: 'private-token-sentinel' },
    }),
  )
  const disconnectLifecycle = vi.fn(
    async (
      input: Parameters<IConnectionLifecycleCoordinator['disconnect']>[0],
    ) => Either.success(),
  )
  const withCredentialsLifecycle = vi.fn(
    async (
      input: Parameters<IConnectionLifecycleCoordinator['withCredentials']>[0],
    ) => input.operation({ privateToken: 'private-token-sentinel' }),
  )
  const authenticator: OAuthAuthenticator = {
    method: 'oauth',
    authProfileId: 'primary',
    supportsRefresh: false,
    supportsRevocation: false,
    createAuthorizationRequest: vi.fn(async (_scope, params) =>
      Either.success({
        authUrl: `https://provider.example/authorize?state=${params.state}&redirect_uri=${encodeURIComponent(params.redirectUri)}&code_challenge=${params.codeChallenge}&code_challenge_method=${params.codeChallengeMethod}`,
        timeoutMs: 1000,
      }),
    ),
    completeAuthentication,
  }
  const lifecycle: IConnectionLifecycleCoordinator = {
    create: createLifecycle,
    connect: async (input) => {
      const authentication = await input.authenticate()
      if (authentication.isFailure()) return authentication.forwardFailure()
      return Either.success({
        kind: 'identity',
        identity: authentication.success.identity,
      })
    },
    withCredentials: withCredentialsLifecycle,
    refresh: async () => Either.success(),
    disconnect: disconnectLifecycle,
    archive: async () => Either.success(),
    restore: async () => Either.success(workspace),
  }
  const unlinkService: IUnlinkConnectionUseCase = {
    execute: vi.fn(async () =>
      Either.success({
        id: workspace.id,
        name: workspace.name,
        status: workspace.status,
        connections: [],
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      }),
    ),
  }
  const linkService: ILinkConnectionUseCase = {
    execute: vi.fn(async (input) => {
      createLifecycle({
        workspaceId: input.workspaceId,
        connectionInstanceId: input.connectionInstanceId,
        addonId: input.addonId,
        profile,
      })
      return Either.failure(AppError.Internal('CREATE_REJECTED'))
    }),
  }
  const connectService: IConnectAddonConnectionUseCase = {
    execute: vi.fn(
      async (
        input: ConnectAddonConnectionInput,
      ): Promise<Either<AppError, ConnectAddonConnectionResult>> => {
        if (input.authenticationInput.method === 'oauth') {
          const auth = await completeAuthentication(
            {
              workspaceId: input.workspaceId,
              connectionInstanceId: input.connectionInstanceId,
            },
            input.authenticationInput.response,
          )
          if (auth.isFailure()) return auth.forwardFailure()
          return Either.success({
            identity: auth.success.identity,
          })
        }
        if (
          input.authenticationInput.method === 'credentials' ||
          input.authenticationInput.method === 'authorized'
        ) {
          if (input.authenticationInput.authProfileId !== 'primary') {
            return Either.failure(
              AppError.ValidationError('AUTH_PROFILE_NOT_ALLOWED'),
            )
          }
        }
        return Either.success({
          identity: {
            kind: 'human',
            providerId: 'provider',
            tenantId: 'provider.example',
            providerSubjectId: 'member',
            displayName: 'Name Test',
          },
        })
      },
    ),
  }
  const disconnectService: IDisconnectAddonConnectionUseCase = {
    execute: vi.fn(async (input) => {
      return disconnectLifecycle(input)
    }),
  }
  const authenticatorRegistry = new AddonAuthenticatorRegistry()
  authenticatorRegistry.register('provider', authenticator)
  const profilesResolver: IAddonConnectionProfilesResolver = {
    getConnectionSchema: vi.fn(async () => Either.success([])),
    getConnectionProfiles: async () => Either.success([profile]),
  }
  const oauthAttemptCoordinator = new OAuthAttemptCoordinator()
  const fakeGetCurrentUserService: IGetCurrentUserUseCase = {
    execute: vi.fn<IGetCurrentUserUseCase['execute']>(async () =>
      Either.success({
        id: 'member-1',
        login: 'fixture-member',
        firstname: 'Fixture',
        lastname: 'Member',
        customFields: [],
      }),
    ),
  }

  return {
    workspace,
    repository,
    queryCore,
    createLifecycle,
    disconnectLifecycle,
    withCredentialsLifecycle,
    completeAuthentication,
    authenticator,
    authenticatorRegistry,
    profile,
    oauthAttemptCoordinator,
    getCurrentUserService: fakeGetCurrentUserService,
    core: new AddonCoreCapabilities(
      repository,
      transport,
      'provider',
      lifecycle,
      linkService,
      connectService,
      disconnectService,
      unlinkService,
      authenticatorRegistry,
      profilesResolver,
      oauthAttemptCoordinator,
      new NoOpSystemEventEmitter(),
      fakeGetCurrentUserService,
    ),
  }
}
describe('Public core read capabilities', () => {
  it('exposes safe identity DTOs and never grants repository or transport access', async () => {
    const { workspace, core } = fixture()
    const result = await core.workspaces.list()
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return expect.fail(result.failure.messageKey)
    expect(result.success).toEqual([
      { id: workspace.id, name: workspace.name, status: workspace.status },
    ])
    const connections = await core.connections.list(workspace.id)
    expect(connections.isSuccess()).toBe(true)
    if (connections.isFailure())
      return expect.fail(connections.failure.messageKey)
    expect(connections.success).toEqual([
      {
        workspaceId: workspace.id,
        connectionInstanceId: 'connection',
        addonId: 'provider',
        connectionProfileId: 'primary',
        cardinality: 'multi',
        status: 'connected',
        identity: {
          kind: 'human',
          displayName: 'Name Test',
          avatarUrl: null,
        },
      },
    ])
    expect(core.runtime).not.toHaveProperty('queryCore')
  })
  it('rejects cross-workspace connections and invalid limits before transport and preserves provider errors', async () => {
    const { core, queryCore, workspace } = fixture()
    const scope = {
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
    }
    expect((await core.tasks.list({ ...scope, limit: 0 })).isFailure()).toBe(
      true,
    )
    expect(
      (
        await core.tasks.get({
          ...scope,
          connectionInstanceId: 'wrong',
          taskId: 'task',
        })
      ).isFailure(),
    ).toBe(true)
    expect(
      (
        await core.tasks.get({
          ...scope,
          workspaceId: 'another-workspace',
          taskId: 'task',
        })
      ).isFailure(),
    ).toBe(true)
    expect(queryCore).not.toHaveBeenCalled()
    queryCore.mockResolvedValue({
      ok: false,
      error: { messageKey: 'DATABASE_CLOSED', statusCode: 503 },
    })
    const result = await core.tasks.get({ ...scope, taskId: 'task' })
    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return expect.fail('Expected cache failure')
    expect(result.failure.messageKey).toBe('DATABASE_CLOSED')
    expect(queryCore).toHaveBeenCalledWith({
      action: 'task',
      ...scope,
      taskId: 'task',
    })
  })
  it('filters connections by the addon owner bound by the host', async () => {
    const { core, workspace } = fixture()
    const listed = await core.connections.list(workspace.id)
    expect(listed.isSuccess()).toBe(true)
    if (listed.isFailure()) return expect.fail(listed.failure.messageKey)
    expect(listed.success.map((connection) => connection.addonId)).toEqual([
      'provider',
    ])
    const foreign = await core.connections.get({
      workspaceId: workspace.id,
      connectionInstanceId: 'foreign-connection',
    })
    expect(foreign.isFailure()).toBe(true)
  })
  it('delegates members.getCurrentUser to getCurrentUserService with validated scope', async () => {
    const { core, getCurrentUserService, workspace } = fixture()
    const scope = {
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
    }
    const result = await core.members.getCurrentUser(scope)
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return expect.fail(result.failure.messageKey)
    expect(result.success).toEqual({
      id: 'member-1',
      name: 'Fixture Member',
    })
    expect(getCurrentUserService.execute).toHaveBeenCalledWith(scope)
  })
  it('propagates tasks.list pagination with nextCursor and hasMore', async () => {
    const { core, queryCore, workspace } = fixture()
    const scope = {
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
    }
    queryCore.mockResolvedValue({
      ok: true,
      value: {
        kind: 'tasks',
        tasks: [
          {
            workspaceId: workspace.id,
            connectionInstanceId: 'connection',
            taskId: 'task-1',
            dataSourceId: 'provider',
            title: 'Task One',
            status: { id: 'open', name: 'Open' },
            createdAt: '2026-10-28T09:00:00.000Z',
            updatedAt: '2026-10-28T09:00:00.000Z',
          },
        ],
        hasMore: true,
        nextCursor: 'cursor-token-page-2',
      },
    })
    const result = await core.tasks.list({
      ...scope,
      limit: 10,
      cursor: 'start',
    })
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return expect.fail(result.failure.messageKey)
    expect(result.success.hasMore).toBe(true)
    expect(result.success.nextCursor).toBe('cursor-token-page-2')
    expect(result.success.tasks).toHaveLength(1)
  })
  it('derives connection ownership from the addon capability', async () => {
    const { core, createLifecycle, workspace } = fixture()
    const connectionCapabilityKeys = Object.keys(core.connections)
    expect(connectionCapabilityKeys).toContain('create')
    const created = await core.connections.create({
      workspaceId: workspace.id,
      connectionProfileId: 'primary',
    })
    expect(created.isFailure()).toBe(true)
    expect(createLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspace.id,
        addonId: 'provider',
        profile: expect.objectContaining({ connectionProfileId: 'primary' }),
      }),
    )
  })
  it('completes authentication in the host and returns no credential payload', async () => {
    const { core, completeAuthentication, workspace } = fixture()
    const request = await core.connections.createAuthorizationRequest({
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
    })
    expect(request.isSuccess()).toBe(true)
    if (request.isFailure()) return expect.fail(request.failure.messageKey)
    const url = new URL(request.success.authUrl)
    const state = url.searchParams.get('state')!
    const result = await core.connections.completeAuthentication(
      {
        workspaceId: workspace.id,
        connectionInstanceId: 'connection',
        authorizationRole: 'primary',
      },
      { code: 'auth-code', state },
    )
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return expect.fail(result.failure.messageKey)
    expect(result.success).not.toHaveProperty('credentials')
    expect(JSON.stringify(result.success)).not.toContain(
      'private-token-sentinel',
    )
    expect(completeAuthentication).toHaveBeenCalledWith(
      { workspaceId: workspace.id, connectionInstanceId: 'connection' },
      expect.objectContaining({ code: 'auth-code', state }),
    )
  })
  it('rejects completeAuthentication when authorizationRole is omitted', async () => {
    const { core, workspace } = fixture()
    const result = await core.connections.completeAuthentication(
      { workspaceId: workspace.id, connectionInstanceId: 'connection' },
      { code: 'auth-code', state: 'state' },
    )
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('AUTHORIZATION_ROLE_REQUIRED')
  })
  it('runs a credential operation only inside the owner-scoped core capability', async () => {
    const { core, workspace, withCredentialsLifecycle } = fixture()
    const operation = vi.fn(async () => Either.success())
    const result = await core.connections.withCredentials(
      { workspaceId: workspace.id, connectionInstanceId: 'connection' },
      operation,
    )

    expect(result.isSuccess()).toBe(true)
    expect(operation).toHaveBeenCalledWith({
      privateToken: 'private-token-sentinel',
    })
    expect(withCredentialsLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        addonId: 'provider',
        scope: {
          workspaceId: workspace.id,
          connectionInstanceId: 'connection',
          authorizationRole: 'primary',
        },
      }),
    )
    expect(JSON.stringify(result)).not.toContain('private-token-sentinel')
  })
  it('denies disconnected and foreign-owned connections before requesting credentials', async () => {
    const { core, workspace, withCredentialsLifecycle } = fixture()
    workspace.createConnection('disconnected', 'provider', {
      connectionProfileId: 'primary',
      cardinality: 'multi',
      default: false,
    })
    const operation = vi.fn(async () => Either.success())

    const disconnected = await core.connections.withCredentials(
      {
        workspaceId: workspace.id,
        connectionInstanceId: 'disconnected',
      },
      operation,
    )
    const foreign = await core.connections.withCredentials(
      {
        workspaceId: workspace.id,
        connectionInstanceId: 'foreign-connection',
      },
      operation,
    )

    expect(disconnected.isFailure()).toBe(true)
    expect(disconnected.isFailure() && disconnected.failure.messageKey).toBe(
      'CONNECTION_NOT_CONNECTED',
    )
    expect(foreign.isFailure()).toBe(true)
    expect(withCredentialsLifecycle).not.toHaveBeenCalled()
    expect(operation).not.toHaveBeenCalled()
  })
  it('denies cross-addon disconnect before reaching the lifecycle coordinator', async () => {
    const { core, disconnectLifecycle, workspace } = fixture()
    const result = await core.connections.disconnect({
      workspaceId: workspace.id,
      connectionInstanceId: 'foreign-connection',
    })
    expect(result.isFailure()).toBe(true)
    expect(disconnectLifecycle).not.toHaveBeenCalled()
  })
  it('requires the submitted authProfileId to match the persisted connection profile', async () => {
    const { core, workspace } = fixture()
    const result = await core.connections.submitCredentials(
      { workspaceId: workspace.id, connectionInstanceId: 'connection' },
      {
        kind: 'credentials',
        authProfileId: 'different-profile',
        credentials: { apiKey: 'new-secret' },
        configuration: { apiUrl: 'https://provider.example' },
      },
    )
    expect(result.isFailure()).toBe(true)
  })
  it('converts repository read failures at the adapter boundary', async () => {
    const { core, repository } = fixture()
    vi.spyOn(repository, 'list').mockRejectedValue(
      new Error('WORKSPACES_READ_DENIED'),
    )
    const result = await core.workspaces.list()
    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return expect.fail('Expected repository failure')
    expect(result.failure.messageKey).toBe('WORKSPACES_READ_DENIED')
  })

  it('recusa createAuthorizationRequest quando code_challenge esta ausente ou divergente na authUrl e cancela tentativa', async () => {
    const { core, workspace, authenticator, oauthAttemptCoordinator } =
      fixture()
    vi.mocked(authenticator.createAuthorizationRequest).mockImplementationOnce(
      async (_scope, params) =>
        Either.success({
          authUrl: `https://provider.example/authorize?state=${params.state}&redirect_uri=${encodeURIComponent(params.redirectUri)}&code_challenge=tampered-challenge&code_challenge_method=S256`,
          timeoutMs: 1000,
        }),
    )

    const result = await core.connections.createAuthorizationRequest({
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
      authorizationRole: 'primary',
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess())
      return expect.fail('Esperada falha de code_challenge')
    expect(result.failure.messageKey).toBe(
      'OAUTH_CODE_CHALLENGE_MISMATCH_IN_AUTH_URL',
    )
    expect(oauthAttemptCoordinator.getActiveAttemptsCount()).toBe(0)
  })

  it('recusa createAuthorizationRequest quando code_challenge_method nao for S256 e cancela tentativa', async () => {
    const { core, workspace, authenticator, oauthAttemptCoordinator } =
      fixture()
    vi.mocked(authenticator.createAuthorizationRequest).mockImplementationOnce(
      async (_scope, params) =>
        Either.success({
          authUrl: `https://provider.example/authorize?state=${params.state}&redirect_uri=${encodeURIComponent(params.redirectUri)}&code_challenge=${params.codeChallenge}&code_challenge_method=plain`,
          timeoutMs: 1000,
        }),
    )

    const result = await core.connections.createAuthorizationRequest({
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
      authorizationRole: 'primary',
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return expect.fail('Esperada falha de method')
    expect(result.failure.messageKey).toBe(
      'OAUTH_CODE_CHALLENGE_METHOD_INVALID_IN_AUTH_URL',
    )
    expect(oauthAttemptCoordinator.getActiveAttemptsCount()).toBe(0)
  })

  it('recusa createAuthorizationRequest quando redirect_uri estiver ausente ou divergente e cancela tentativa', async () => {
    const { core, workspace, authenticator, oauthAttemptCoordinator } =
      fixture()
    vi.mocked(authenticator.createAuthorizationRequest).mockImplementationOnce(
      async (_scope, params) =>
        Either.success({
          authUrl: `https://provider.example/authorize?state=${params.state}&redirect_uri=https://attacker.example/cb&code_challenge=${params.codeChallenge}&code_challenge_method=S256`,
          timeoutMs: 1000,
        }),
    )

    const result = await core.connections.createAuthorizationRequest({
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
      authorizationRole: 'primary',
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return expect.fail('Esperada falha de redirect')
    expect(result.failure.messageKey).toBe(
      'OAUTH_REDIRECT_URI_MISMATCH_IN_AUTH_URL',
    )
    expect(oauthAttemptCoordinator.getActiveAttemptsCount()).toBe(0)
  })

  it('recusa createAuthorizationRequest quando protocolo da URL for invalido e cancela tentativa', async () => {
    const { core, workspace, authenticator, oauthAttemptCoordinator } =
      fixture()
    vi.mocked(authenticator.createAuthorizationRequest).mockImplementationOnce(
      async (_scope, params) =>
        Either.success({
          authUrl: `javascript:alert(1)?state=${params.state}&redirect_uri=${encodeURIComponent(params.redirectUri)}&code_challenge=${params.codeChallenge}&code_challenge_method=S256`,
          timeoutMs: 1000,
        }),
    )

    const result = await core.connections.createAuthorizationRequest({
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
      authorizationRole: 'primary',
    })

    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return expect.fail('Esperada falha de protocolo')
    expect(result.failure.messageKey).toBe('OAUTH_ENDPOINT_PROTOCOL_INVALID')
    expect(oauthAttemptCoordinator.getActiveAttemptsCount()).toBe(0)
  })
})

describe('OAuth profile ownership', () => {
  it('rejects an unknown role without calling the registered OAuth authenticator', async () => {
    const { core, workspace, authenticator } = fixture()
    const result = await core.connections.createAuthorizationRequest({
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
      authorizationRole: 'other',
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure())
      expect(result.failure.messageKey).toBe('AUTHORIZATION_ROLE_NOT_ALLOWED')
    expect(authenticator.createAuthorizationRequest).not.toHaveBeenCalled()
  })

  it('never substitutes another OAuth authenticator when the profile authenticator is missing', async () => {
    const { core, workspace, authenticator, authenticatorRegistry } = fixture()
    authenticatorRegistry.unregister('provider', 'primary')
    authenticatorRegistry.register('provider', {
      ...authenticator,
      authProfileId: 'other',
    })

    const result = await core.connections.createAuthorizationRequest({
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure())
      expect(result.failure.messageKey).toBe(
        'CONNECTION_AUTHENTICATOR_NOT_FOUND',
      )
    expect(authenticator.createAuthorizationRequest).not.toHaveBeenCalled()
  })
})
