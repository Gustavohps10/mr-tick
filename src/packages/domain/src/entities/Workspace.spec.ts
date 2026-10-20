import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConnectionIdentity, Workspace } from './Workspace'

function multiProfile(profileId: string): {
  connectionProfileId: string
  cardinality: 'multi'
  default: boolean
} {
  return {
    connectionProfileId: profileId,
    cardinality: 'multi',
    default: true,
  }
}

function singleProfile(profileId: string): {
  connectionProfileId: string
  cardinality: 'single'
  default: boolean
} {
  return {
    connectionProfileId: profileId,
    cardinality: 'single',
    default: true,
  }
}

const memberIdentity: ConnectionIdentity = {
  kind: 'human',
  providerId: 'jira',
  tenantId: 'jira.example.test',
  providerSubjectId: 'user-1',
  displayName: 'Alex Example',
}

describe('Workspace Entity', () => {
  it('archives and restores a connection without changing its profile or ID', () => {
    const workspace = Workspace.create({ name: 'Discord Workspace' }).success
    const linked = workspace.createConnection(
      'connection-1',
      'discord-addon',
      singleProfile('discord-watcher'),
    )
    expect(linked.isSuccess()).toBe(true)
    const connected = workspace.connectAuthorization('connection-1', {
      authorizationRole: 'watcher',
      authProfileId: 'discord-auth',
      identity: {
        kind: 'bot',
        providerId: 'discord',
        tenantId: 'discord-guild-1',
        providerSubjectId: 'discord-user-1',
        displayName: 'Discord User',
      },
      authorizationId: 'authorization-1',
    })
    expect(connected.isSuccess()).toBe(true)

    const archived = workspace.archiveConnection('connection-1')
    expect(archived.isSuccess()).toBe(true)
    expect(workspace.connections[0].status).toBe('archived')
    expect(
      workspace
        .connectAuthorization('connection-1', {
          authorizationRole: 'watcher',
          authProfileId: 'discord-auth',
          identity: {
            kind: 'bot',
            providerId: 'discord',
            tenantId: 'discord-guild-1',
            providerSubjectId: 'discord-user-2',
            displayName: 'Late callback',
          },
          authorizationId: 'authorization-2',
        })
        .isFailure(),
    ).toBe(true)

    const restored = workspace.restoreConnection('connection-1')
    expect(restored.isSuccess()).toBe(true)
    expect(workspace.connections[0]).toMatchObject({
      id: 'connection-1',
      addonId: 'discord-addon',
      connectionProfileId: 'discord-watcher',
      cardinality: 'single',
      status: 'disconnected',
      generation: 3,
    })
    expect(workspace.connections[0].identity).toEqual({
      kind: 'bot',
      providerId: 'discord',
      tenantId: 'discord-guild-1',
      providerSubjectId: 'discord-user-1',
      displayName: 'Discord User',
    })
    expect(workspace.connections[0].authorizationId).toBeUndefined()
    expect(
      workspace
        .connectAuthorization('connection-1', {
          authorizationRole: 'watcher',
          authProfileId: 'discord-auth',
          identity: {
            kind: 'bot',
            providerId: 'discord',
            tenantId: 'discord-guild-1',
            providerSubjectId: 'discord-other-user',
            displayName: 'Different User',
          },
          authorizationId: 'authorization-3',
        })
        .isFailure(),
    ).toBe(true)
  })

  const LOCAL_AVATAR_URL =
    'mr-tick-app://C:\\Users\\Gustavo\\AppData\\Roaming\\mr-tick\\workspaces\\avatars\\ws-9ef4bd92-e595-478f-b150-976d5c38372a.png'

  const BLOB_URL = 'blob:http://localhost:3000/mock-uuid'

  beforeEach(() => {
    vi.useFakeTimers()

    vi.stubGlobal('crypto', {
      randomUUID: () => 'mock-uuid-1234',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('Creation', () => {
    it('should create a workspace with correct initial state', () => {
      const now = new Date('2024-06-01T10:00:00Z')
      vi.setSystemTime(now)

      const result = Workspace.create({
        name: 'My Mr-tick Workspace',
        description: 'desc',
        avatarUrl: 'https://avatar.com/img.png',
      })

      expect(result.isSuccess()).toBe(true)

      const workspace = result.success

      expect(workspace.id).toBe('ws-mock-uuid-1234')
      expect(workspace.name).toBe('My Mr-tick Workspace')
      expect(workspace.description).toBe('desc')
      expect(workspace.avatarUrl).toBe('https://avatar.com/img.png')
      expect(workspace.status).toBe('draft')
      expect(workspace.createdAt).toEqual(now)
      expect(workspace.updatedAt).toEqual(now)
      expect(workspace.connections).toEqual([])
    })

    it('should trim incoming values on creation', () => {
      const result = Workspace.create({
        name: '   My Workspace   ',
        description: '   desc   ',
        avatarUrl: 'https://avatar.com/img.png',
      })

      expect(result.isSuccess()).toBe(true)

      const workspace = result.success

      expect(workspace.name).toBe('My Workspace')
      expect(workspace.description).toBe('desc')
    })

    it('should allow creation with local app protocol avatar', () => {
      const result = Workspace.create({
        name: 'Local Workspace',
        avatarUrl: LOCAL_AVATAR_URL,
      })

      expect(result.isSuccess()).toBe(true)
      expect(result.success.avatarUrl).toBe(LOCAL_AVATAR_URL)
    })

    it('should allow creation with blob protocol avatar', () => {
      const result = Workspace.create({
        name: 'Blob Workspace',
        avatarUrl: BLOB_URL,
      })

      expect(result.isSuccess()).toBe(true)
      expect(result.success.avatarUrl).toBe(BLOB_URL)
    })

    it('should allow creation without description and avatar', () => {
      const result = Workspace.create({
        name: 'Simple Workspace',
      })

      expect(result.isSuccess()).toBe(true)

      const workspace = result.success

      expect(workspace.description).toBeUndefined()
      expect(workspace.avatarUrl).toBeUndefined()
    })

    it('should fail creation with invalid name', () => {
      const result = Workspace.create({
        name: 'Ab',
      })

      expect(result.isFailure()).toBe(true)
      expect(result.failure.messageKey).toBe('WORKSPACE_INVALIDO')
      expect(result.failure.details).toHaveProperty('name')
    })

    it('should fail creation with invalid avatar protocol', () => {
      const result = Workspace.create({
        name: 'Invalid Avatar',
        avatarUrl: 'ftp://files.com/img.png',
      })

      expect(result.isFailure()).toBe(true)
      expect(result.failure.details).toHaveProperty('avatarUrl')
    })

    it('should fail creation with invalid avatar extension', () => {
      const result = Workspace.create({
        name: 'Invalid Avatar',
        avatarUrl: 'https://site.com/file.pdf',
      })

      expect(result.isFailure()).toBe(true)
      expect(result.failure.details).toHaveProperty('avatarUrl')
    })
  })

  describe('Granular mutations', () => {
    let workspace: Workspace
    const initialTime = new Date('2024-06-01T10:00:00Z')

    beforeEach(() => {
      vi.setSystemTime(initialTime)
      workspace = Workspace.create({ name: 'Initial Name' }).success
    })

    it('should update name and touch updatedAt', () => {
      const updateTime = new Date('2024-06-01T11:00:00Z')
      vi.setSystemTime(updateTime)

      const result = workspace.updateName('New Workspace Name')

      expect(result.isSuccess()).toBe(true)
      expect(workspace.name).toBe('New Workspace Name')
      expect(workspace.updatedAt).toEqual(updateTime)
    })

    it('should trim updated name', () => {
      const result = workspace.updateName('   New Name   ')

      expect(result.isSuccess()).toBe(true)
      expect(workspace.name).toBe('New Name')
    })

    it('should fail update name when invalid', () => {
      const result = workspace.updateName('A')

      expect(result.isFailure()).toBe(true)
      expect(result.failure.messageKey).toBe('NOME_INVALIDO')
      expect(result.failure.details).toHaveProperty('name')
    })

    it('should update description', () => {
      const result = workspace.updateDescription('My Description')

      expect(result.isSuccess()).toBe(true)
      expect(workspace.description).toBe('My Description')
    })

    it('should update description with empty string', () => {
      const result = workspace.updateDescription('')

      expect(result.isSuccess()).toBe(true)
      expect(workspace.description).toBe('')
    })

    it('should update description with undefined', () => {
      const result = workspace.updateDescription(undefined)

      expect(result.isSuccess()).toBe(true)
      expect(workspace.description).toBeUndefined()
    })

    it('should trim description', () => {
      const result = workspace.updateDescription('   hello   ')

      expect(result.isSuccess()).toBe(true)
      expect(workspace.description).toBe('hello')
    })

    it('should fail update description when invalid', () => {
      const result = workspace.updateDescription('a'.repeat(501))

      expect(result.isFailure()).toBe(true)
      expect(result.failure.messageKey).toBe('DESCRICAO_INVALIDA')
      expect(result.failure.details).toHaveProperty('description')
    })

    it('should update avatarUrl with local protocol and touch updatedAt', () => {
      const updateTime = new Date('2024-06-01T13:00:00Z')
      vi.setSystemTime(updateTime)

      const result = workspace.updateAvatarUrl(LOCAL_AVATAR_URL)

      expect(result.isSuccess()).toBe(true)
      expect(workspace.avatarUrl).toBe(LOCAL_AVATAR_URL)
      expect(workspace.updatedAt).toEqual(updateTime)
    })

    it('should allow clearing avatarUrl with empty string', () => {
      const result = workspace.updateAvatarUrl('')

      expect(result.isSuccess()).toBe(true)
      expect(workspace.avatarUrl).toBe('')
    })

    it('should allow clearing avatarUrl with undefined', () => {
      const result = workspace.updateAvatarUrl(undefined)

      expect(result.isSuccess()).toBe(true)
      expect(workspace.avatarUrl).toBeUndefined()
    })

    it('should fail update avatarUrl when invalid', () => {
      const result = workspace.updateAvatarUrl('ftp://invalid.com/img.png')

      expect(result.isFailure()).toBe(true)
      expect(result.failure.messageKey).toBe('AVATAR_INVALIDO')
      expect(result.failure.details).toHaveProperty('avatarUrl')
    })
  })

  describe('updateIdentity', () => {
    let workspace: Workspace

    beforeEach(() => {
      workspace = Workspace.create({ name: 'Original Name' }).success
    })

    it('should update all identity fields', () => {
      const result = workspace.updateIdentity({
        name: 'Updated Name',
        description: 'Updated Desc',
        avatarUrl: LOCAL_AVATAR_URL,
      })

      expect(result.isSuccess()).toBe(true)

      expect(workspace.name).toBe('Updated Name')
      expect(workspace.description).toBe('Updated Desc')
      expect(workspace.avatarUrl).toBe(LOCAL_AVATAR_URL)
    })

    it('should fail when one or more fields are invalid', () => {
      const result = workspace.updateIdentity({
        name: 'A',
        description: 'valid',
        avatarUrl: 'not-a-url',
      })

      expect(result.isFailure()).toBe(true)
      expect(result.failure.messageKey).toBe('CAMPOS_INVALIDOS')
      expect(result.failure.details).toHaveProperty('name')
      expect(result.failure.details).toHaveProperty('avatarUrl')
    })
  })

  describe('Data source connections', () => {
    let workspace: Workspace

    beforeEach(() => {
      workspace = Workspace.create({ name: 'Test Workspace' }).success
    })

    it('should return false when there are no connections', () => {
      expect(workspace.isLinked()).toBe(false)
    })

    it('should link a data source', () => {
      const result = workspace.createConnection(
        'conn-1',
        'jira',
        multiProfile('jira-main'),
      )

      expect(result.isSuccess()).toBe(true)

      expect(workspace.connections).toHaveLength(1)
      expect(workspace.connections[0]).toEqual({
        id: 'conn-1',
        addonId: 'jira',
        connectionProfileId: 'jira-main',
        cardinality: 'multi',
        status: 'disconnected',
        authorizationId: undefined,
        generation: 0,
        config: undefined,
        authorizations: [],
        identity: undefined,
      })

      expect(workspace.isLinked()).toBe(true)
    })

    it('should fail when trying to link local datasource', () => {
      const result = workspace.createConnection(
        'local',
        'local',
        multiProfile('local'),
      )

      expect(result.isFailure()).toBe(true)
      expect(result.failure.messageKey).toBe('DATASOURCE_INVALIDO')
    })

    it('should not duplicate existing connection id', () => {
      workspace.createConnection('conn-1', 'jira', multiProfile('jira-main'))
      workspace.createConnection(
        'conn-1',
        'trello',
        multiProfile('trello-main'),
      )

      expect(workspace.connections).toHaveLength(1)
      expect(workspace.connections[0].addonId).toBe('jira')
    })

    it('keeps a disconnected single-profile connection in the occupied slot', () => {
      const profile = singleProfile('primary')
      const first = workspace.createConnection('first', 'addon', profile)
      const second = workspace.createConnection('second', 'addon', profile)
      expect(first.isSuccess()).toBe(true)
      expect(second.isFailure()).toBe(true)
      expect(second.failure.messageKey).toBe('CONNECTION_CARDINALITY_REACHED')
    })

    it('should connect an existing data source', () => {
      workspace.createConnection('conn-1', 'jira', multiProfile('jira-main'))

      const config = {
        token: 'abc',
      }

      const result = workspace.connectAuthorization(
        'conn-1',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: memberIdentity,
          authorizationId: 'authorization-1',
        },
        config,
      )

      expect(result.isSuccess()).toBe(true)

      const connection = workspace.connections[0]

      expect(connection.status).toBe('connected')
      expect(connection.identity).toEqual(memberIdentity)
      expect(connection.config).toEqual(config)
    })

    it('preserves the prior authorization when a different provider tenant reconnects', () => {
      workspace.createConnection(
        'conn-identity',
        'jira',
        multiProfile('jira-main'),
      )
      const originalIdentity: ConnectionIdentity = {
        kind: 'human',
        providerId: 'jira',
        tenantId: 'tenant-a',
        providerSubjectId: 'user-1',
        displayName: 'Alex',
      }
      workspace.connectAuthorization(
        'conn-identity',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: originalIdentity,
          authorizationId: 'authorization-old',
        },
        { token: 'old-token' },
      )

      const result = workspace.connectAuthorization(
        'conn-identity',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: {
            ...originalIdentity,
            tenantId: 'tenant-b',
            providerSubjectId: 'user-2',
          },
          authorizationId: 'authorization-new',
        },
        { token: 'new-token' },
      )

      expect(result.isFailure()).toBe(true)
      expect(result.failure.messageKey).toBe('CONNECTION_IDENTITY_MISMATCH')
      expect(workspace.connections[0].authorizationId).toBe('authorization-old')
      expect(workspace.connections[0].identity).toEqual(originalIdentity)
      expect(workspace.connections[0].config).toEqual({ token: 'old-token' })
    })

    it('should fail when connecting a missing data source', () => {
      const result = workspace.connectAuthorization(
        'missing',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: memberIdentity,
          authorizationId: 'authorization-1',
        },
        {
          token: 'abc',
        },
      )

      expect(result.isFailure()).toBe(true)
      expect(result.failure.messageKey).toBe('CONEXAO_NAO_ENCONTRADA')
    })

    it('should disconnect a data source and preserve identity', () => {
      workspace.createConnection('conn-1', 'jira', multiProfile('jira-main'))

      workspace.connectAuthorization(
        'conn-1',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: memberIdentity,
          authorizationId: 'authorization-1',
        },
        { token: 'abc' },
      )

      const result = workspace.disconnectConnection('conn-1')

      expect(result.isSuccess()).toBe(true)

      const connection = workspace.connections[0]

      expect(connection.status).toBe('disconnected')
      expect(connection.config).toEqual({ token: 'abc' })
      expect(connection.identity).toEqual(memberIdentity)

      const reconnected = workspace.connectAuthorization(
        'conn-1',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: memberIdentity,
          authorizationId: 'authorization-2',
        },
        { token: 'new-token' },
      )
      expect(reconnected.isSuccess()).toBe(true)
      expect(workspace.connections[0].status).toBe('connected')
      expect(workspace.connections[0].identity).toEqual(memberIdentity)
    })

    it('should fail to disconnect non-existent connection', () => {
      const result = workspace.disconnectConnection('ghost-id')

      expect(result.isFailure()).toBe(true)
      expect(result.failure.messageKey).toBe('CONEXAO_NAO_ENCONTRADA')
    })

    it('archives preserving non-secret configuration and historical principal', () => {
      workspace.createConnection(
        'conn-archive',
        'jira',
        multiProfile('jira-main'),
      )
      const nonSecretConfig = {
        baseUrl: 'https://jira.example.test',
        projectKey: 'MR',
      }
      workspace.connectAuthorization(
        'conn-archive',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: memberIdentity,
          authorizationId: 'authorization-archive',
        },
        nonSecretConfig,
      )

      const result = workspace.archiveConnection('conn-archive')

      expect(result.isSuccess()).toBe(true)
      expect(workspace.connections[0]).toMatchObject({
        id: 'conn-archive',
        connectionProfileId: 'jira-main',
        cardinality: 'multi',
        status: 'archived',
        generation: 2,
        identity: memberIdentity,
        config: nonSecretConfig,
      })
      expect(workspace.connections[0]).not.toHaveProperty('authorizationId')
    })

    it('releases a single-profile slot when the connection is archived', () => {
      workspace.createConnection(
        'single-archived',
        'jira',
        singleProfile('jira-single'),
      )
      expect(workspace.archiveConnection('single-archived').isSuccess()).toBe(
        true,
      )

      const replacement = workspace.createConnection(
        'single-replacement',
        'jira',
        singleProfile('jira-single'),
      )

      expect(replacement.isSuccess()).toBe(true)
    })

    it('restores archived principal and non-secret configuration while requiring authentication', () => {
      workspace.createConnection(
        'conn-restore',
        'jira',
        multiProfile('jira-main'),
      )
      const nonSecretConfig = {
        baseUrl: 'https://jira.example.test',
        projectKey: 'MR',
      }
      workspace.connectAuthorization(
        'conn-restore',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: memberIdentity,
          authorizationId: 'authorization-archive',
        },
        nonSecretConfig,
      )
      workspace.archiveConnection('conn-restore')

      const result = workspace.restoreConnection('conn-restore')

      expect(result.isSuccess()).toBe(true)
      expect(workspace.connections[0]).toMatchObject({
        id: 'conn-restore',
        connectionProfileId: 'jira-main',
        cardinality: 'multi',
        status: 'disconnected',
        generation: 3,
        identity: memberIdentity,
        config: nonSecretConfig,
      })
      expect(workspace.connections[0]).not.toHaveProperty('authorizationId')
      expect(
        workspace
          .connectAuthorization(
            'conn-restore',
            {
              authorizationRole: 'primary',
              authProfileId: 'jira-main',
              identity: {
                ...memberIdentity,
                providerSubjectId: 'different-user',
              },
              authorizationId: 'authorization-new',
            },
            nonSecretConfig,
          )
          .isFailure(),
      ).toBe(true)
    })

    it('should unlink a specific connection', () => {
      workspace.createConnection('conn-1', 'jira', multiProfile('jira-main'))
      workspace.createConnection(
        'conn-2',
        'trello',
        multiProfile('trello-main'),
      )

      const result = workspace.removeConnection('conn-1')

      expect(result.isSuccess()).toBe(true)

      expect(workspace.connections).toHaveLength(1)
      expect(workspace.connections[0].id).toBe('conn-2')
    })

    it('should unlink all connections', () => {
      workspace.createConnection('conn-1', 'jira', multiProfile('jira-main'))
      workspace.createConnection(
        'conn-2',
        'trello',
        multiProfile('trello-main'),
      )

      const result = workspace.removeConnection()

      expect(result.isSuccess()).toBe(true)
      expect(workspace.connections).toHaveLength(0)
    })

    it('should expose frozen connection snapshots', () => {
      workspace.createConnection('conn-1', 'jira', multiProfile('jira-main'))
      workspace.connectAuthorization(
        'conn-1',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: memberIdentity,
          authorizationId: 'authorization-1',
        },
        { token: 'abc' },
      )

      const connection = workspace.connections[0]

      expect(Object.isFrozen(connection)).toBe(true)
      expect(Object.isFrozen(connection.identity!)).toBe(true)
      expect(Object.isFrozen(connection.config!)).toBe(true)
    })

    it('keeps the primary principal when another role authorizes a different identity', () => {
      workspace.createConnection('conn-1', 'jira', multiProfile('jira-main'))
      workspace.connectAuthorization(
        'conn-1',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: memberIdentity,
          authorizationId: 'authorization-primary',
        },
        { token: 'abc' },
      )
      const otherIdentity: ConnectionIdentity = {
        ...memberIdentity,
        providerSubjectId: 'user-2',
        displayName: 'Other Person',
      }

      const result = workspace.connectAuthorization('conn-1', {
        authorizationRole: 'secondary',
        authProfileId: 'jira-main',
        identity: otherIdentity,
        authorizationId: 'authorization-secondary',
        credentialReferenceId: 'reference-secondary',
      })

      expect(result.isSuccess()).toBe(true)
      const connection = workspace.connections[0]
      expect(connection.identity).toEqual(memberIdentity)
      expect(connection.authorizationId).toBe('authorization-primary')
    })

    it('updates authorization when the primary role is reauthorized with matching identity', () => {
      workspace.createConnection('conn-1', 'jira', multiProfile('jira-main'))
      workspace.connectAuthorization(
        'conn-1',
        {
          authorizationRole: 'primary',
          authProfileId: 'jira-main',
          identity: memberIdentity,
          authorizationId: 'authorization-1',
        },
        { token: 'abc' },
      )

      const result = workspace.connectAuthorization('conn-1', {
        authorizationRole: 'primary',
        authProfileId: 'jira-main',
        identity: { ...memberIdentity, displayName: 'Alex Renamed' },
        authorizationId: 'authorization-2',
        credentialReferenceId: 'reference-2',
      })

      expect(result.isSuccess()).toBe(true)
      expect(workspace.connections[0].identity?.displayName).toBe(
        'Alex Renamed',
      )
      expect(workspace.connections[0].authorizationId).toBe('authorization-2')
    })
  })

  describe('Other behavior', () => {
    it('should mark workspace as configured', () => {
      const workspace = Workspace.create({
        name: 'Workspace',
      }).success

      workspace.markAsConfigured()

      expect(workspace.status).toBe('configured')
    })

    it('should handle zod field mapping', () => {
      const result = Workspace.create({} as any)

      expect(result.isFailure()).toBe(true)
      expect(result.failure.details).toHaveProperty('name')
    })
  })
})
