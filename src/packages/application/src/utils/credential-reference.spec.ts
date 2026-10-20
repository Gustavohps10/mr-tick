import { describe, expect, it } from 'vitest'

import { CredentialReferenceFactory } from './credential-reference'

describe('CredentialReferenceFactory', () => {
  it('encodes tuple components without collisions', () => {
    const first = CredentialReferenceFactory.create({
      ownerId: 'owner::workspace',
      workspaceId: 'workspace',
      connectionId: 'connection',
      authorizationId: 'authorization',
    })
    const second = CredentialReferenceFactory.create({
      ownerId: 'owner',
      workspaceId: 'workspace::connection',
      connectionId: 'connection',
      authorizationId: 'authorization',
    })

    expect(first).not.toBe(second)
  })

  it('validates addon reference owner and workspace binding', () => {
    const canonical = CredentialReferenceFactory.createAddonWorkspace(
      'addon-owner',
      'workspace-a',
    )
    const candidate = CredentialReferenceFactory.createAddonWorkspaceCandidate(
      'addon-owner',
      'workspace-a',
      'operation-1',
    )

    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        canonical.id,
        'addon-owner',
        'workspace-a',
      ),
    ).toBe(true)
    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        candidate.id,
        'addon-owner',
        'workspace-a',
      ),
    ).toBe(true)
    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        candidate.id,
        'different-owner',
        'workspace-a',
      ),
    ).toBe(false)
    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        candidate.id,
        'addon-owner',
        'workspace-b',
      ),
    ).toBe(false)
  })

  it('isolates candidate operations from stable references and each other', () => {
    const stable = CredentialReferenceFactory.create({
      ownerId: 'owner::A',
      workspaceId: 'workspace::A',
      connectionId: 'connection::A',
      authorizationId: 'authorization::A',
    })
    const candidateA = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'owner::A',
      workspaceId: 'workspace::A',
      connectionId: 'connection::A',
      authorizationId: 'authorization::A',
      operationId: 'operation::A',
    })
    const candidateB = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'owner::A',
      workspaceId: 'workspace::A',
      connectionId: 'connection::A',
      authorizationId: 'authorization::A',
      operationId: 'operation::B',
    })

    expect(candidateA.id).not.toBe(stable.id)
    expect(candidateB.id).not.toBe(stable.id)
    expect(candidateA.id).not.toBe(candidateB.id)
  })

  it('separates candidate references when owner, workspace, or connection changes', () => {
    const base = {
      ownerId: 'owner::base',
      workspaceId: 'workspace::base',
      connectionId: 'connection::base',
      authorizationId: 'authorization::same',
      operationId: 'operation::same',
    }
    const ownerVariant = CredentialReferenceFactory.createConnectionCandidate({
      ...base,
      ownerId: 'owner::variant',
    })
    const workspaceVariant =
      CredentialReferenceFactory.createConnectionCandidate({
        ...base,
        workspaceId: 'workspace::variant',
      })
    const connectionVariant =
      CredentialReferenceFactory.createConnectionCandidate({
        ...base,
        connectionId: 'connection::variant',
      })
    const baseReference =
      CredentialReferenceFactory.createConnectionCandidate(base)

    expect(ownerVariant.id).not.toBe(baseReference.id)
    expect(workspaceVariant.id).not.toBe(baseReference.id)
    expect(connectionVariant.id).not.toBe(baseReference.id)
    expect(
      new Set([
        baseReference.id,
        ownerVariant.id,
        workspaceVariant.id,
        connectionVariant.id,
      ]).size,
    ).toBe(4)
  })

  it('round-trips candidate references without changing service or account', () => {
    const candidate = CredentialReferenceFactory.createConnectionCandidate({
      ownerId: 'owner::roundtrip',
      workspaceId: 'workspace::roundtrip',
      connectionId: 'connection::roundtrip',
      authorizationId: 'authorization::roundtrip',
      operationId: 'operation::roundtrip',
    })

    const decoded = CredentialReferenceFactory.fromId(candidate.id)

    expect(decoded).toEqual({
      service: candidate.service,
      account: candidate.account,
      id: candidate.id,
    })
  })

  it('isolates connection and capability addon secrets and candidates without collisions', () => {
    const conn1 = CredentialReferenceFactory.createAddonSecret(
      'my-addon',
      {
        kind: 'connection',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
      },
      'apiKey',
    )
    const conn2 = CredentialReferenceFactory.createAddonSecret(
      'my-addon',
      {
        kind: 'connection',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-2',
      },
      'apiKey',
    )
    const cap1 = CredentialReferenceFactory.createAddonSecret(
      'my-addon',
      {
        kind: 'capability',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        capabilityId: 'watcher',
      },
      'apiKey',
    )
    const cap2 = CredentialReferenceFactory.createAddonSecret(
      'my-addon',
      {
        kind: 'capability',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        capabilityId: 'calendar',
      },
      'apiKey',
    )

    expect(conn1.id).not.toBe(conn2.id)
    expect(cap1.id).not.toBe(cap2.id)
    expect(conn1.id).not.toBe(cap1.id)

    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        conn1.id,
        'my-addon',
        'ws-1',
      ),
    ).toBe(true)
    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        conn1.id,
        'my-addon',
        'ws-2',
      ),
    ).toBe(false)
    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        cap1.id,
        'my-addon',
        'ws-1',
      ),
    ).toBe(true)
    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        cap1.id,
        'other-addon',
        'ws-1',
      ),
    ).toBe(false)

    const connCandidate = CredentialReferenceFactory.createAddonSecretCandidate(
      'my-addon',
      {
        kind: 'connection',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
      },
      'apiKey',
      'op-1',
    )
    const capCandidate = CredentialReferenceFactory.createAddonSecretCandidate(
      'my-addon',
      {
        kind: 'capability',
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        capabilityId: 'watcher',
      },
      'apiKey',
      'op-2',
    )

    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        connCandidate.id,
        'my-addon',
        'ws-1',
      ),
    ).toBe(true)
    expect(
      CredentialReferenceFactory.isAddonWorkspaceReference(
        capCandidate.id,
        'my-addon',
        'ws-1',
      ),
    ).toBe(true)
  })
})
