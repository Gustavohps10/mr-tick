import { describe, expect, it } from 'vitest'

import type { ConnectionProfileDescriptor } from './ConnectionProfileDescriptor'
import {
  ConnectionAuthorizationRecord,
  ConnectionIdentity,
  Workspace,
} from './Workspace'

function createWorkspace(): Workspace {
  const result = Workspace.create({ name: 'Authorization workspace' })
  expect(result.isSuccess()).toBe(true)
  if (result.isFailure()) return expect.fail(result.failure.messageKey)
  return result.success
}

function profileWithRoles(): ConnectionProfileDescriptor {
  return {
    connectionProfileId: 'service-connection',
    cardinality: 'multi',
    default: true,
    roles: [
      {
        authorizationRole: 'read',
        allowedAuthProfileIds: ['read-api-key'],
        defaultAuthProfileId: 'read-api-key',
        required: true,
      },
      {
        authorizationRole: 'write',
        allowedAuthProfileIds: ['write-oauth'],
        defaultAuthProfileId: 'write-oauth',
        required: false,
      },
    ],
  }
}

function anonymousProfile(): ConnectionProfileDescriptor {
  return {
    connectionProfileId: 'public-connection',
    cardinality: 'multi',
    default: true,
    roles: [],
  }
}

const readIdentity: ConnectionIdentity = {
  kind: 'human',
  providerId: 'service',
  tenantId: 'tenant-a',
  providerSubjectId: 'user-read',
  displayName: 'Read User',
}

const writeIdentity: ConnectionIdentity = {
  kind: 'bot',
  providerId: 'service',
  tenantId: 'tenant-a',
  providerSubjectId: 'bot-write',
  displayName: 'Write Bot',
}

function findAuthorization(
  authorizations: ReadonlyArray<ConnectionAuthorizationRecord>,
  role: string,
): ConnectionAuthorizationRecord {
  const authorization = authorizations.find(
    (candidate) => candidate.authorizationRole === role,
  )
  expect(authorization).toBeDefined()
  if (authorization === undefined) return expect.fail(`Missing role: ${role}`)
  return authorization
}

describe('Workspace authorization roles', () => {
  it('keeps two declared authorization roles and rotates only the target role', () => {
    const workspace = createWorkspace()
    const linked = workspace.createConnection(
      'connection-1',
      'service-addon',
      profileWithRoles(),
    )
    expect(linked.isSuccess()).toBe(true)

    const readConnected = workspace.connectAuthorization(
      'connection-1',
      {
        authorizationRole: 'read',
        authProfileId: 'read-api-key',
        authorizationId: 'authorization-read',
        identity: readIdentity,
      },
      { endpoint: 'https://service.example' },
    )
    const writeConnected = workspace.connectAuthorization('connection-1', {
      authorizationRole: 'write',
      authProfileId: 'write-oauth',
      authorizationId: 'authorization-write',
      identity: writeIdentity,
    })
    expect(readConnected.isSuccess()).toBe(true)
    expect(writeConnected.isSuccess()).toBe(true)

    const connectionBeforeRotation = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(connectionBeforeRotation).toBeDefined()
    if (connectionBeforeRotation === undefined) return
    const writeBeforeRotation = findAuthorization(
      connectionBeforeRotation.authorizations,
      'write',
    )
    const lifecycleGenerationBeforeRotation =
      connectionBeforeRotation.generation

    const rotated = workspace.connectAuthorization(
      'connection-1',
      {
        authorizationRole: 'read',
        authProfileId: 'read-api-key',
        authorizationId: 'authorization-read-new',
        identity: readIdentity,
      },
      { endpoint: 'https://service.example' },
    )
    expect(rotated.isSuccess()).toBe(true)

    const connectionAfterRotation = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(connectionAfterRotation).toBeDefined()
    if (connectionAfterRotation === undefined) return
    const readAfterRotation = findAuthorization(
      connectionAfterRotation.authorizations,
      'read',
    )
    const writeAfterRotation = findAuthorization(
      connectionAfterRotation.authorizations,
      'write',
    )

    expect(readAfterRotation.authorizationId).toBe('authorization-read')
    expect(readAfterRotation.generation).toBe(2)
    expect(writeAfterRotation).toEqual(writeBeforeRotation)
    expect(connectionAfterRotation.generation).toBe(
      lifecycleGenerationBeforeRotation,
    )
  })

  it('rejects a conflicting identity only for the target role and preserves every authorization', () => {
    const workspace = createWorkspace()
    expect(
      workspace
        .createConnection('connection-1', 'service-addon', profileWithRoles())
        .isSuccess(),
    ).toBe(true)
    expect(
      workspace
        .connectAuthorization('connection-1', {
          authorizationRole: 'read',
          authProfileId: 'read-api-key',
          authorizationId: 'authorization-read',
          identity: readIdentity,
        })
        .isSuccess(),
    ).toBe(true)
    expect(
      workspace
        .connectAuthorization('connection-1', {
          authorizationRole: 'write',
          authProfileId: 'write-oauth',
          authorizationId: 'authorization-write',
          identity: writeIdentity,
        })
        .isSuccess(),
    ).toBe(true)

    const before = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(before).toBeDefined()
    if (before === undefined) return

    const result = workspace.connectAuthorization('connection-1', {
      authorizationRole: 'read',
      authProfileId: 'read-api-key',
      authorizationId: 'authorization-intruder',
      identity: {
        ...readIdentity,
        providerSubjectId: 'user-intruder',
      },
    })

    expect(result.isFailure()).toBe(true)
    if (result.isFailure())
      expect(result.failure.messageKey).toBe('CONNECTION_IDENTITY_MISMATCH')
    expect(
      workspace.connections.find(
        (candidate) => candidate.id === 'connection-1',
      ),
    ).toEqual(before)
  })

  it('preserves non-secret config while archive and restore require disconnected reauthentication', () => {
    const workspace = createWorkspace()
    expect(
      workspace
        .createConnection('connection-1', 'service-addon', profileWithRoles())
        .isSuccess(),
    ).toBe(true)
    expect(
      workspace
        .connectAuthorization(
          'connection-1',
          {
            authorizationRole: 'read',
            authProfileId: 'read-api-key',
            authorizationId: 'authorization-read',
            identity: readIdentity,
          },
          { endpoint: 'https://service.example', project: 'alpha' },
        )
        .isSuccess(),
    ).toBe(true)

    expect(workspace.archiveConnection('connection-1').isSuccess()).toBe(true)
    expect(workspace.restoreConnection('connection-1').isSuccess()).toBe(true)

    const restored = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(restored).toBeDefined()
    if (restored === undefined) return
    expect(restored.status).toBe('disconnected')
    expect(restored.config).toEqual({
      endpoint: 'https://service.example',
      project: 'alpha',
    })
    const restoredAuthorization = findAuthorization(
      restored.authorizations,
      'read',
    )
    expect(restoredAuthorization.authorizationId).toBe('authorization-read')
    expect(restoredAuthorization.identity).toEqual(readIdentity)
    expect(['revoked', 'expired']).toContain(restoredAuthorization.status)
    expect(
      workspace
        .connectAuthorization('connection-1', {
          authorizationRole: 'read',
          authProfileId: 'read-api-key',
          authorizationId: 'authorization-new-principal',
          identity: {
            ...readIdentity,
            providerSubjectId: 'user-after-archive',
          },
        })
        .isFailure(),
    ).toBe(true)
    const afterMismatch = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(afterMismatch).toBeDefined()
    if (afterMismatch === undefined) return
    expect(
      findAuthorization(afterMismatch.authorizations, 'read').identity,
    ).toEqual(readIdentity)
  })

  it('connects an anonymous declared profile without authorization, identity, or member', () => {
    const workspace = createWorkspace()
    expect(
      workspace
        .createConnection(
          'public-connection-1',
          'public-addon',
          anonymousProfile(),
        )
        .isSuccess(),
    ).toBe(true)

    const result = workspace.connectNone('public-connection-1', {
      endpoint: 'https://public.example',
    })

    expect(result.isSuccess()).toBe(true)
    const connection = workspace.connections.find(
      (candidate) => candidate.id === 'public-connection-1',
    )
    expect(connection).toBeDefined()
    if (connection === undefined) return
    expect(connection.authorizations).toEqual([])
    expect(connection.identity).toBeUndefined()
    expect(connection.authorizationId).toBeUndefined()
  })

  it('does not erase real authorizations when converting a connected profile to anonymous', () => {
    const workspace = createWorkspace()
    expect(
      workspace
        .createConnection('connection-1', 'service-addon', profileWithRoles())
        .isSuccess(),
    ).toBe(true)
    expect(
      workspace
        .connectAuthorization('connection-1', {
          authorizationRole: 'read',
          authProfileId: 'read-api-key',
          authorizationId: 'authorization-read',
          identity: readIdentity,
        })
        .isSuccess(),
    ).toBe(true)

    const before = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(before).toBeDefined()
    if (before === undefined) return

    const result = workspace.connectNone('connection-1')

    expect(result.isFailure()).toBe(true)
    expect(
      workspace.connections.find(
        (candidate) => candidate.id === 'connection-1',
      ),
    ).toEqual(before)
  })

  it('preserves anonymous configuration through archive and restore', () => {
    const workspace = createWorkspace()
    expect(
      workspace
        .createConnection(
          'public-connection-1',
          'public-addon',
          anonymousProfile(),
        )
        .isSuccess(),
    ).toBe(true)
    expect(
      workspace
        .connectNone('public-connection-1', {
          endpoint: 'https://public.example',
          project: 'public',
        })
        .isSuccess(),
    ).toBe(true)

    expect(workspace.archiveConnection('public-connection-1').isSuccess()).toBe(
      true,
    )
    expect(workspace.restoreConnection('public-connection-1').isSuccess()).toBe(
      true,
    )

    const restored = workspace.connections.find(
      (candidate) => candidate.id === 'public-connection-1',
    )
    expect(restored).toBeDefined()
    if (restored === undefined) return
    expect(restored.status).toBe('disconnected')
    expect(restored.config).toEqual({
      endpoint: 'https://public.example',
      project: 'public',
    })
    expect(restored.authorizations).toEqual([])
    expect(restored.identity).toBeUndefined()
  })

  it('preserves an inactive principal after disconnect and rejects a different reauthentication principal', () => {
    const workspace = createWorkspace()
    expect(
      workspace
        .createConnection('connection-1', 'service-addon', profileWithRoles())
        .isSuccess(),
    ).toBe(true)
    expect(
      workspace
        .connectAuthorization('connection-1', {
          authorizationRole: 'read',
          authProfileId: 'read-api-key',
          authorizationId: 'authorization-read',
          identity: readIdentity,
        })
        .isSuccess(),
    ).toBe(true)
    expect(workspace.disconnectConnection('connection-1').isSuccess()).toBe(
      true,
    )

    const disconnected = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(disconnected).toBeDefined()
    if (disconnected === undefined) return
    const historicalAuthorization = findAuthorization(
      disconnected.authorizations,
      'read',
    )
    expect(['revoked', 'expired']).toContain(historicalAuthorization.status)

    const reauthenticated = workspace.connectAuthorization('connection-1', {
      authorizationRole: 'read',
      authProfileId: 'read-api-key',
      authorizationId: 'authorization-new-principal',
      identity: {
        ...readIdentity,
        providerSubjectId: 'user-after-disconnect',
      },
    })

    expect(reauthenticated.isFailure()).toBe(true)
    if (reauthenticated.isFailure())
      expect(reauthenticated.failure.messageKey).toBe(
        'CONNECTION_IDENTITY_MISMATCH',
      )
    const afterMismatch = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(afterMismatch).toBeDefined()
    if (afterMismatch === undefined) return
    expect(
      findAuthorization(afterMismatch.authorizations, 'read').identity,
    ).toEqual(readIdentity)
  })

  it('does not let an authorization snapshot mutate the persisted principal', () => {
    const workspace = createWorkspace()
    const inputIdentity: ConnectionIdentity = {
      kind: 'installation',
      providerId: 'service',
      tenantId: 'tenant-local',
      providerSubjectId: 'installation-local',
      displayName: 'Local Installation',
    }
    expect(
      workspace
        .createConnection('connection-1', 'service-addon', profileWithRoles())
        .isSuccess(),
    ).toBe(true)
    expect(
      workspace
        .connectAuthorization('connection-1', {
          authorizationRole: 'read',
          authProfileId: 'read-api-key',
          authorizationId: 'authorization-read',
          identity: inputIdentity,
        })
        .isSuccess(),
    ).toBe(true)

    const snapshot = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(snapshot).toBeDefined()
    if (snapshot === undefined) return
    const snapshotAuthorization = findAuthorization(
      snapshot.authorizations,
      'read',
    )

    expect(() =>
      Object.assign(snapshotAuthorization.identity, {
        displayName: 'Mutated Snapshot',
      }),
    ).toThrow()

    const persisted = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(persisted).toBeDefined()
    if (persisted === undefined) return
    expect(
      findAuthorization(persisted.authorizations, 'read').identity.displayName,
    ).toBe('Local Installation')
  })

  it('copies the principal when connecting an authorization', () => {
    const workspace = createWorkspace()
    const inputIdentity: ConnectionIdentity = {
      kind: 'installation',
      providerId: 'service',
      tenantId: 'tenant-local',
      providerSubjectId: 'installation-local',
      displayName: 'Local Installation',
    }
    expect(
      workspace
        .createConnection('connection-1', 'service-addon', profileWithRoles())
        .isSuccess(),
    ).toBe(true)
    expect(
      workspace
        .connectAuthorization('connection-1', {
          authorizationRole: 'read',
          authProfileId: 'read-api-key',
          authorizationId: 'authorization-read',
          identity: inputIdentity,
        })
        .isSuccess(),
    ).toBe(true)

    inputIdentity.displayName = 'Mutated Input'

    const persisted = workspace.connections.find(
      (candidate) => candidate.id === 'connection-1',
    )
    expect(persisted).toBeDefined()
    if (persisted === undefined) return
    expect(
      findAuthorization(persisted.authorizations, 'read').identity.displayName,
    ).toBe('Local Installation')
  })

  it('marks authorization as reauth_required and recovers back to active upon reconnection', () => {
    const workspace = createWorkspace()
    const inputIdentity: ConnectionIdentity = {
      kind: 'installation',
      providerId: 'service',
      tenantId: 'tenant-local',
      providerSubjectId: 'installation-local',
      displayName: 'Local Installation',
    }
    workspace.createConnection(
      'connection-1',
      'service-addon',
      profileWithRoles(),
    )
    workspace.connectAuthorization('connection-1', {
      authorizationRole: 'read',
      authProfileId: 'read-api-key',
      authorizationId: 'authorization-read',
      identity: inputIdentity,
    })

    const initialConn = workspace.connections.find(
      (c) => c.id === 'connection-1',
    )!
    const initialAuth = findAuthorization(initialConn.authorizations, 'read')
    expect(initialAuth.status).toBe('active')
    expect(initialAuth.generation).toBe(1)
    expect(initialConn.status).toBe('connected')

    const markResult = workspace.markAuthorizationReauthRequired(
      'connection-1',
      'authorization-read',
    )
    expect(markResult.isSuccess()).toBe(true)

    const updatedConn = workspace.connections.find(
      (c) => c.id === 'connection-1',
    )!
    const updatedAuth = findAuthorization(updatedConn.authorizations, 'read')
    expect(updatedAuth.status).toBe('reauth_required')
    expect(updatedAuth.generation).toBe(2)
    expect(updatedConn.status).toBe('connected') // Sem falso logout

    // Reautenticação restaura active e avança geração
    const reconnected = workspace.connectAuthorization('connection-1', {
      authorizationRole: 'read',
      authProfileId: 'read-api-key',
      authorizationId: 'authorization-read',
      identity: inputIdentity,
    })
    expect(reconnected.isSuccess()).toBe(true)

    const restoredConn = workspace.connections.find(
      (c) => c.id === 'connection-1',
    )!
    const restoredAuth = findAuthorization(restoredConn.authorizations, 'read')
    expect(restoredAuth.status).toBe('active')
    expect(restoredAuth.generation).toBe(3)
  })
})
