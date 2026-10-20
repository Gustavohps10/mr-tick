import type {
  ConnectionIdentity,
  ConnectionProfileDescriptor,
} from '@mr-tick/domain'
import { Workspace } from '@mr-tick/domain'
import { Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AddonConnectionAuthenticator,
  ConnectAddonConnectionInput,
  IAddonAuthenticatorRegistry,
  IAddonConnectionProfilesResolver,
  IConnectionLifecycleCoordinator,
  IWorkspacesRepository,
} from '@/contracts'

import { ConnectAddonConnectionService } from './ConnectAddonConnectionService'

describe('ConnectAddonConnectionService', () => {
  let sut: ConnectAddonConnectionService
  let workspacesRepositoryMock: Mocked<IWorkspacesRepository>
  let coordinatorMock: Mocked<IConnectionLifecycleCoordinator>
  let profilesResolverMock: Mocked<IAddonConnectionProfilesResolver>
  let authenticatorRegistryMock: Mocked<IAddonAuthenticatorRegistry>

  const fakeProfile: ConnectionProfileDescriptor = {
    connectionProfileId: 'primary',
    cardinality: 'multi',
    default: true,
    roles: [
      {
        authorizationRole: 'primary',
        allowedAuthProfileIds: ['primary-auth'],
        defaultAuthProfileId: 'primary-auth',
      },
    ],
  }

  const fakeIdentity: Extract<ConnectionIdentity, { kind: 'human' }> = {
    kind: 'human',
    providerId: 'discord',
    tenantId: 'guild-1',
    providerSubjectId: 'user-1',
    displayName: 'Test User',
  }

  let fakeWorkspace: Workspace

  beforeEach(() => {
    vi.clearAllMocks()

    const workspaceResult = Workspace.create({ name: 'Test Workspace' })
    fakeWorkspace = workspaceResult.success
    fakeWorkspace.createConnection('conn-1', 'discord-addon', fakeProfile)

    workspacesRepositoryMock = {
      getById: vi.fn().mockResolvedValue(Either.success(fakeWorkspace)),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    }

    coordinatorMock = {
      create: vi.fn(),
      connect: vi.fn().mockResolvedValue(
        Either.success({
          kind: 'identity',
          identity: fakeIdentity,
        }),
      ),
      disconnect: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
      refresh: vi.fn(),
      withCredentials: vi.fn(),
    }

    profilesResolverMock = {
      getConnectionProfiles: vi
        .fn()
        .mockResolvedValue(Either.success([fakeProfile])),
    }

    const authenticator: AddonConnectionAuthenticator = {
      method: 'credentials',
      authProfileId: 'primary-auth',
      supportsRefresh: false,
      supportsRevocation: false,
      authenticate: vi.fn().mockResolvedValue(
        Either.success({
          kind: 'authorized',
          identity: fakeIdentity,
          credentials: { token: 'secret' },
        }),
      ),
    }

    authenticatorRegistryMock = {
      register: vi.fn(),
      unregister: vi.fn(),
      getAuthenticator: vi.fn().mockReturnValue(authenticator),
      getAuthenticatorsForAddon: vi.fn().mockReturnValue([authenticator]),
    }

    sut = new ConnectAddonConnectionService(
      workspacesRepositoryMock,
      coordinatorMock,
      profilesResolverMock,
      authenticatorRegistryMock,
    )
  })

  it('connects an authorized credentials connection successfully', async () => {
    const input: ConnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      authenticationInput: {
        method: 'authorized',
        authorizationRole: 'primary',
        authProfileId: 'primary-auth',
        credentials: { token: 'secret' },
        configuration: { guildId: 'guild-1' },
      },
    }

    const result = await sut.execute(input)
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual({
      identity: fakeIdentity,
    })

    expect(coordinatorMock.connect).toHaveBeenCalledWith({
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      profile: fakeProfile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'primary-auth',
      configuration: { guildId: 'guild-1' },
      authenticate: expect.any(Function),
    })
  })

  it('connects a method: none connection successfully without authenticator', async () => {
    coordinatorMock.connect.mockResolvedValueOnce(
      Either.success({ kind: 'none' }),
    )

    const input: ConnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      authenticationInput: {
        method: 'none',
        configuration: { channelId: 'general' },
      },
    }

    const result = await sut.execute(input)
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual({})

    expect(coordinatorMock.connect).toHaveBeenCalledWith({
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      profile: fakeProfile,
      method: 'none',
      configuration: { channelId: 'general' },
    })
  })

  it('returns NotFound when workspace does not exist', async () => {
    workspacesRepositoryMock.getById.mockResolvedValueOnce(
      Either.success(undefined),
    )

    const input: ConnectAddonConnectionInput = {
      workspaceId: 'missing-ws',
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      authenticationInput: {
        method: 'none',
        configuration: {},
      },
    }

    const result = await sut.execute(input)
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('WORKSPACE_NAO_ENCONTRADO')
  })

  it('returns NotFound when connection does not exist in workspace', async () => {
    const input: ConnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'missing-conn',
      addonId: 'discord-addon',
      authenticationInput: {
        method: 'none',
        configuration: {},
      },
    }

    const result = await sut.execute(input)
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CONEXAO_NAO_ENCONTRADA')
  })

  it('returns 409 conflict when addonId does not match connection ownership', async () => {
    const input: ConnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'other-addon',
      authenticationInput: {
        method: 'none',
        configuration: {},
      },
    }

    const result = await sut.execute(input)
    expect(result.isFailure()).toBe(true)
    expect(result.failure.statusCode).toBe(409)
    expect(result.failure.messageKey).toBe(
      'CONNECTION_PROFILE_OWNERSHIP_CONFLICT',
    )
  })

  it('returns ValidationError when profile is not declared for addon', async () => {
    profilesResolverMock.getConnectionProfiles.mockResolvedValueOnce(
      Either.success([]),
    )

    const input: ConnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      authenticationInput: {
        method: 'none',
        configuration: {},
      },
    }

    const result = await sut.execute(input)
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CONNECTION_PROFILE_NOT_DECLARED')
  })

  it('fails when authorizationRole is missing or empty', async () => {
    const input: ConnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      authenticationInput: {
        method: 'credentials',
        authorizationRole: '',
        authProfileId: 'primary-auth',
        credentials: { token: 'secret' },
        configuration: {},
      },
    }

    const result = await sut.execute(input)
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('AUTHORIZATION_ROLE_REQUIRED')
  })

  it('fails when authorizationRole is not declared in profile.roles', async () => {
    const input: ConnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      authenticationInput: {
        method: 'credentials',
        authorizationRole: 'non-existent-role',
        authProfileId: 'primary-auth',
        credentials: { token: 'secret' },
        configuration: {},
      },
    }

    const result = await sut.execute(input)
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('AUTHORIZATION_ROLE_NOT_DECLARED')
  })

  it('fails when authProfileId is not allowed for the specified authorizationRole', async () => {
    const input: ConnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      authenticationInput: {
        method: 'credentials',
        authorizationRole: 'primary',
        authProfileId: 'disallowed-auth-profile',
        credentials: { token: 'secret' },
        configuration: {},
      },
    }

    const result = await sut.execute(input)
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('AUTH_PROFILE_NOT_ALLOWED_FOR_ROLE')
  })

  it('connects via oauth successfully through the canonical use case', async () => {
    const oauthAuthenticator: AddonConnectionAuthenticator = {
      method: 'oauth',
      authProfileId: 'primary-auth',
      supportsRefresh: false,
      supportsRevocation: false,
      createAuthorizationRequest: vi.fn(),
      completeAuthentication: vi.fn().mockResolvedValue(
        Either.success({
          kind: 'authorized',
          identity: fakeIdentity,
          credentials: { accessToken: 'oauth-token' },
        }),
      ),
    }
    authenticatorRegistryMock.getAuthenticator.mockReturnValueOnce(
      oauthAuthenticator,
    )

    const input: ConnectAddonConnectionInput = {
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      authenticationInput: {
        method: 'oauth',
        authorizationRole: 'primary',
        authProfileId: 'primary-auth',
        response: {
          code: 'code-123',
          state: 'state-abc',
          codeVerifier: 'verifier-123',
          redirectUri: 'http://localhost:3000/oauth/callback',
        },
        configuration: {},
      },
    }

    const result = await sut.execute(input)
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toEqual({
      identity: fakeIdentity,
    })

    expect(coordinatorMock.connect).toHaveBeenCalledWith({
      workspaceId: fakeWorkspace.id,
      connectionInstanceId: 'conn-1',
      addonId: 'discord-addon',
      profile: fakeProfile,
      method: 'authorized',
      authorizationRole: 'primary',
      authProfileId: 'primary-auth',
      configuration: {},
      authenticate: expect.any(Function),
    })
  })
})
