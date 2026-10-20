import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { Workspace } from '@mr-tick/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteWorkspacesRepository } from './SQLiteWorkspaceRepository'

describe('Deterministic Workspace Read-Modify-Write Concurrency', () => {
  let temporaryDirectory: string
  let repository: SQLiteWorkspacesRepository

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ws-concurrent-rmw-'),
    )
    repository = new SQLiteWorkspacesRepository(temporaryDirectory)
  })

  afterEach(async () => {
    await repository.close()
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('RED 1 (Hypothesis): preserves concurrently modified connection A and newly added connection B from stale snapshot', async () => {
    // 1. Setup workspace with initial connection A
    const created = Workspace.create({ name: 'Concurrent Test Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const initialWorkspace = created.success

    const linkResult = initialWorkspace.createConnection(
      'connection-A',
      'test-addon',
      {
        connectionProfileId: 'multi-profile',
        cardinality: 'multi',
        default: true,
      },
    )
    expect(linkResult.isSuccess()).toBe(true)

    const createResult = await repository.create(initialWorkspace)
    expect(createResult.isSuccess()).toBe(true)

    // 2. Flow 1 and Flow 2 both read the workspace (both hold snapshot with connection A)
    const readFlow1 = await repository.getById(initialWorkspace.id)
    const readFlow2 = await repository.getById(initialWorkspace.id)
    expect(readFlow1.isSuccess()).toBe(true)
    expect(readFlow2.isSuccess()).toBe(true)
    if (readFlow1.isFailure() || readFlow2.isFailure()) return

    const ws1 = readFlow1.success
    const ws2 = readFlow2.success
    expect(ws1).toBeDefined()
    expect(ws2).toBeDefined()
    if (!ws1 || !ws2) return

    // 3. Flow 1 modifies connection A (e.g. connects authorization, incrementing generation and adding auth record)
    const authResult = ws1.connectAuthorization(
      'connection-A',
      {
        authorizationId: 'auth-A-1',
        authorizationRole: 'primary',
        authProfileId: 'primary-profile',
        identity: {
          kind: 'human',
          providerId: 'test-addon',
          tenantId: 'tenant-1',
          providerSubjectId: 'user-1',
          displayName: 'User Flow 1',
        },
      },
      { token: 'secret-token-A' },
    )
    expect(authResult.isSuccess()).toBe(true)

    const saveFlow1 = await repository.update(ws1)
    expect(saveFlow1.isSuccess()).toBe(true)

    // Verify DB has connection A with authorization
    const checkAfterFlow1 = await repository.getById(initialWorkspace.id)
    expect(checkAfterFlow1.isSuccess()).toBe(true)
    const connAAfterFlow1 = checkAfterFlow1.success?.connections.find(
      (c) => c.id === 'connection-A',
    )
    expect(connAAfterFlow1?.status).toBe('connected')
    expect(connAAfterFlow1?.authorizations).toHaveLength(1)

    // 4. Flow 2 adds connection B using its older snapshot (ws2 still has connection A in disconnected status with 0 auths)
    const linkBResult = ws2.createConnection('connection-B', 'test-addon', {
      connectionProfileId: 'multi-profile',
      cardinality: 'multi',
      default: false,
    })
    expect(linkBResult.isSuccess()).toBe(true)

    const saveFlow2 = await repository.update(ws2)
    if (saveFlow2.isFailure()) {
      expect(saveFlow2.failure.statusCode).toBe(409)
      const freshResult = await repository.getById(initialWorkspace.id)
      expect(freshResult.isSuccess()).toBe(true)
      if (freshResult.isFailure() || !freshResult.success) return
      const freshWs2 = freshResult.success
      freshWs2.createConnection('connection-B', 'test-addon', {
        connectionProfileId: 'multi-profile',
        cardinality: 'multi',
        default: false,
      })
      const retry = await repository.update(freshWs2)
      expect(retry.isSuccess()).toBe(true)
    }

    // 5. Audit: Connection A (modified by Flow 1) must preserve its updated authorizations/status,
    // and Connection B (added by Flow 2) must exist!
    const finalRead = await repository.getById(initialWorkspace.id)
    expect(finalRead.isSuccess()).toBe(true)
    const finalWs = finalRead.success
    expect(finalWs).toBeDefined()
    if (!finalWs) return

    const finalConnA = finalWs.connections.find((c) => c.id === 'connection-A')
    const finalConnB = finalWs.connections.find((c) => c.id === 'connection-B')

    expect(finalConnB).toBeDefined()
    expect(finalConnA).toBeDefined()

    // EXPECTATION: Connection A must NOT have been overwritten by ws2's stale snapshot!
    expect(finalConnA?.status).toBe('connected')
    expect(finalConnA?.authorizations).toHaveLength(1)
    expect(finalConnA?.authorizations[0]?.authorizationId).toBe('auth-A-1')
  })

  it('RED 2 (Hypothesis): does not resurrect connection A when stale snapshot adds connection B after A was removed', async () => {
    // 1. Setup workspace with initial connection A
    const created = Workspace.create({ name: 'Resurrection Test Workspace' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const initialWorkspace = created.success

    initialWorkspace.createConnection('connection-A', 'test-addon', {
      connectionProfileId: 'multi-profile',
      cardinality: 'multi',
      default: true,
    })

    const createResult = await repository.create(initialWorkspace)
    expect(createResult.isSuccess()).toBe(true)

    // 2. Flow 1 and Flow 2 both read the workspace (both see connection A)
    const readFlow1 = await repository.getById(initialWorkspace.id)
    const readFlow2 = await repository.getById(initialWorkspace.id)
    if (readFlow1.isFailure() || readFlow2.isFailure()) return

    const ws1 = readFlow1.success
    const ws2 = readFlow2.success
    if (!ws1 || !ws2) return

    // 3. Flow 1 removes connection A and updates
    const removeResult = ws1.removeConnection('connection-A')
    expect(removeResult.isSuccess()).toBe(true)
    const saveFlow1 = await repository.update(ws1)
    expect(saveFlow1.isSuccess()).toBe(true)

    // Verify A is deleted from DB
    const checkAfterFlow1 = await repository.getById(initialWorkspace.id)
    expect(checkAfterFlow1.success?.connections).toHaveLength(0)

    // 4. Flow 2 (which still holds connection A in its snapshot) adds connection B and updates
    ws2.createConnection('connection-B', 'test-addon', {
      connectionProfileId: 'multi-profile',
      cardinality: 'multi',
      default: false,
    })
    const saveFlow2 = await repository.update(ws2)
    if (saveFlow2.isFailure()) {
      expect(saveFlow2.failure.statusCode).toBe(409)
      const freshResult = await repository.getById(initialWorkspace.id)
      expect(freshResult.isSuccess()).toBe(true)
      if (freshResult.isFailure() || !freshResult.success) return
      const freshWs2 = freshResult.success
      freshWs2.createConnection('connection-B', 'test-addon', {
        connectionProfileId: 'multi-profile',
        cardinality: 'multi',
        default: false,
      })
      const retry = await repository.update(freshWs2)
      expect(retry.isSuccess()).toBe(true)
    }

    // 5. Audit: Connection B must exist, but Connection A must NOT be resurrected!
    const finalRead = await repository.getById(initialWorkspace.id)
    expect(finalRead.isSuccess()).toBe(true)
    const finalWs = finalRead.success
    expect(finalWs).toBeDefined()
    if (!finalWs) return

    const connIds = finalWs.connections.map((c) => c.id)
    expect(connIds).toContain('connection-B')
    expect(connIds).not.toContain('connection-A')
  })

  it('detects concurrent modification conflict when two mutations start from the same revision', async () => {
    // 1. Setup workspace with an already connected connection
    const created = Workspace.create({ name: 'Initial Workspace Name' })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) return
    const initialWorkspace = created.success

    initialWorkspace.createConnection('connection-A', 'test-addon', {
      connectionProfileId: 'multi-profile',
      cardinality: 'multi',
      default: true,
    })
    initialWorkspace.connectAuthorization('connection-A', {
      authorizationId: 'auth-A',
      authorizationRole: 'primary',
      authProfileId: 'primary-profile',
      identity: {
        kind: 'human',
        providerId: 'test-addon',
        tenantId: 'tenant-1',
        providerSubjectId: 'user-1',
        displayName: 'User Initial',
      },
    })

    const createResult = await repository.create(initialWorkspace)
    expect(createResult.isSuccess()).toBe(true)

    // 2. Both Flow 1 and Flow 2 read the workspace at the exact same revision
    const readFlow1 = await repository.getById(initialWorkspace.id)
    const readFlow2 = await repository.getById(initialWorkspace.id)
    expect(readFlow1.isSuccess()).toBe(true)
    expect(readFlow2.isSuccess()).toBe(true)
    if (readFlow1.isFailure() || readFlow2.isFailure()) return
    const ws1 = readFlow1.success
    const ws2 = readFlow2.success
    expect(ws1).toBeDefined()
    expect(ws2).toBeDefined()
    if (!ws1 || !ws2) return

    // 3. Flow 1 modifies metadata and re-authorizes, then saves successfully
    ws1.updateName('Name Updated by Flow 1')
    ws1.connectAuthorization('connection-A', {
      authorizationId: 'auth-A',
      authorizationRole: 'primary',
      authProfileId: 'primary-profile',
      identity: {
        kind: 'human',
        providerId: 'test-addon',
        tenantId: 'tenant-1',
        providerSubjectId: 'user-1',
        displayName: 'User Updated Flow 1',
      },
    })
    const saveFlow1 = await repository.update(ws1)
    expect(saveFlow1.isSuccess()).toBe(true)

    // 4. Flow 2 attempts to save from its stale base snapshot (trying to overwrite with Flow 2's data)
    ws2.updateName('Stale Name by Flow 2')
    ws2.connectAuthorization('connection-A', {
      authorizationId: 'auth-A',
      authorizationRole: 'primary',
      authProfileId: 'primary-profile',
      identity: {
        kind: 'human',
        providerId: 'test-addon',
        tenantId: 'tenant-1',
        providerSubjectId: 'user-1',
        displayName: 'User Stale Flow 2',
      },
    })
    const saveFlow2 = await repository.update(ws2)

    // MUST NOT RETURN FALSE SUCCESS! It must return an explicit conflict failure.
    expect(saveFlow2.isFailure()).toBe(true)
    if (saveFlow2.isFailure()) {
      expect(saveFlow2.failure.statusCode).toBe(409)
    }

    // 5. Verification: Flow 1's committed data is preserved in DB and not corrupted/overwritten
    const readFinal = await repository.getById(initialWorkspace.id)
    expect(readFinal.isSuccess()).toBe(true)
    if (readFinal.isSuccess() && readFinal.success) {
      expect(readFinal.success.name).toBe('Name Updated by Flow 1')
      const connA = readFinal.success.connections.find(
        (c) => c.id === 'connection-A',
      )
      expect(connA?.authorizations[0]?.identity.displayName).toBe(
        'User Updated Flow 1',
      )
    }
  })
})
