import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ListWorkspacesService } from '@mr-tick/application'
import { Workspace } from '@mr-tick/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SQLiteWorkspacesRepository } from './SQLiteWorkspaceRepository'

let temporaryDirectory: string | undefined
const activeRepositories: SQLiteWorkspacesRepository[] = []

function registerRepository(
  repo: SQLiteWorkspacesRepository,
): SQLiteWorkspacesRepository {
  activeRepositories.push(repo)
  return repo
}

async function createRepository(): Promise<SQLiteWorkspacesRepository> {
  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'sqlite-workspaces-'),
  )
  return registerRepository(new SQLiteWorkspacesRepository(temporaryDirectory))
}

function createWorkspace(name: string = 'Test Workspace'): Workspace {
  const result = Workspace.create({ name })
  expect(result.isSuccess()).toBe(true)
  return result.success
}

describe('SQLiteWorkspacesRepository (Pure CRUD per Rule 37)', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    for (const repo of activeRepositories) {
      await repo.close()
    }
    activeRepositories.length = 0
    if (temporaryDirectory === undefined) return
    const resolvedDirectory = path.resolve(temporaryDirectory)
    const temporaryPrefix = path.resolve(os.tmpdir(), 'sqlite-workspaces-')
    expect(path.isAbsolute(resolvedDirectory)).toBe(true)
    expect(resolvedDirectory.startsWith(temporaryPrefix)).toBe(true)
    if (!path.isAbsolute(resolvedDirectory)) return
    if (!resolvedDirectory.startsWith(temporaryPrefix)) return
    await fs.rm(resolvedDirectory, { recursive: true, force: true })
    temporaryDirectory = undefined
  })

  it('creates and finds a workspace with its connections and authorizations', async () => {
    const repository = await createRepository()
    const workspace = createWorkspace('Workspace Alpha')

    const createConnResult = workspace.createConnection('conn-1', 'addon-1', {
      connectionProfileId: 'primary',
      cardinality: 'single',
      default: true,
    })
    expect(createConnResult.isSuccess()).toBe(true)

    const createResult = await repository.create(workspace)
    expect(createResult.isSuccess()).toBe(true)

    const findResult = await repository.getById(workspace.id)
    expect(findResult.isSuccess()).toBe(true)
    expect(findResult.success).toBeDefined()
    expect(findResult.success?.id).toBe(workspace.id)
    expect(findResult.success?.name).toBe('Workspace Alpha')
    expect(findResult.success?.connections).toHaveLength(1)
    expect(findResult.success?.connections[0].id).toBe('conn-1')
    expect(findResult.success?.connections[0].addonId).toBe('addon-1')
  })

  it('fails to create duplicate workspace with Conflict error', async () => {
    const repository = await createRepository()
    const workspace = createWorkspace('Duplicate Workspace')

    const firstResult = await repository.create(workspace)
    expect(firstResult.isSuccess()).toBe(true)

    const secondResult = await repository.create(workspace)
    expect(secondResult.isFailure()).toBe(true)
    expect(secondResult.failure.statusCode).toBe(409)
  })

  it('returns undefined when workspace is not found', async () => {
    const repository = await createRepository()
    const result = await repository.getById('non-existent-id')
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toBeUndefined()
  })

  it('lists workspaces with database-level pagination', async () => {
    const repository = await createRepository()
    const ws1 = createWorkspace('Workspace 1')
    const ws2 = createWorkspace('Workspace 2')
    const ws3 = createWorkspace('Workspace 3')

    await repository.create(ws1)
    await repository.create(ws2)
    await repository.create(ws3)

    const page1 = await repository.list(undefined, { page: 1, pageSize: 2 })
    expect(page1.isSuccess()).toBe(true)
    expect(page1.success.items).toHaveLength(2)
    expect(page1.success.total).toBe(3)
    expect(page1.success.page).toBe(1)
    expect(page1.success.pageSize).toBe(2)

    const page2 = await repository.list(undefined, { page: 2, pageSize: 2 })
    expect(page2.isSuccess()).toBe(true)
    expect(page2.success.items).toHaveLength(1)
    expect(page2.success.total).toBe(3)
  })

  it('updates workspace and its connections', async () => {
    const repository = await createRepository()
    const workspace = createWorkspace('Original Workspace')
    await repository.create(workspace)

    workspace.updateIdentity({ name: 'Updated Workspace' })
    workspace.createConnection('conn-2', 'addon-2', {
      connectionProfileId: 'secondary',
      cardinality: 'multi',
      default: false,
    })

    const updateResult = await repository.update(workspace)
    expect(updateResult.isSuccess()).toBe(true)

    const found = await repository.getById(workspace.id)
    expect(found.isSuccess()).toBe(true)
    expect(found.success?.name).toBe('Updated Workspace')
    expect(found.success?.connections).toHaveLength(1)
    expect(found.success?.connections[0].id).toBe('conn-2')
  })

  it('deletes workspace and cascades to child tables using remove', async () => {
    const repository = await createRepository()
    const workspace = createWorkspace('Workspace to Delete')
    workspace.createConnection('conn-to-del', 'addon-del', {
      connectionProfileId: 'primary',
      cardinality: 'single',
      default: true,
    })

    await repository.create(workspace)

    const removeResult = await repository.remove(workspace.id)
    expect(removeResult.isSuccess()).toBe(true)

    const found = await repository.getById(workspace.id)
    expect(found.isSuccess()).toBe(true)
    expect(found.success).toBeUndefined()
  })

  it('filters workspaces by status and name in list', async () => {
    const repository = await createRepository()
    const ws1 = createWorkspace('Engineering Team')
    const ws2 = createWorkspace('Design Studio')
    const ws3 = createWorkspace('Marketing Hub')

    await repository.create(ws1)
    await repository.create(ws2)
    await repository.create(ws3)

    const nameFiltered = await repository.list({ name: 'Design' })
    expect(nameFiltered.isSuccess()).toBe(true)
    expect(nameFiltered.success.items).toHaveLength(1)
    expect(nameFiltered.success.items[0].name).toBe('Design Studio')

    const statusFiltered = await repository.list({ status: 'draft' })
    expect(statusFiltered.isSuccess()).toBe(true)
    expect(statusFiltered.success.total).toBe(3)
  })

  it('preserves authorization status accurately from database without blind active fallback', async () => {
    const repository = await createRepository()
    const workspace = createWorkspace('Auth Status Workspace')

    const createConnResult = workspace.createConnection(
      'conn-auth',
      'addon-auth',
      {
        connectionProfileId: 'primary',
        cardinality: 'single',
        default: true,
      },
    )
    expect(createConnResult.isSuccess()).toBe(true)

    const connectResult = workspace.connectAuthorization(
      'conn-auth',
      {
        authorizationRole: 'primary',
        authProfileId: 'auth-prof-1',
        authorizationId: 'auth-rec-1',
        credentialReferenceId: 'cred-ref-1',
        identity: {
          kind: 'human',
          providerId: 'addon-auth',
          tenantId: 'tenant-1',
          providerSubjectId: 'sub-1',
          displayName: 'Subject One',
        },
      },
      {},
    )
    expect(connectResult.isSuccess()).toBe(true)

    const createResult = await repository.create(workspace)
    expect(createResult.isSuccess()).toBe(true)

    // Manually update status in database to 'revoked' to test that hydration reads it faithfully
    await repository
      .db('connection_authorizations')
      .where('id', 'auth-rec-1')
      .update({ status: 'revoked' })

    const found = await repository.getById(workspace.id)
    expect(found.isSuccess()).toBe(true)
    expect(found.success).toBeDefined()
    const conn = found.success?.connections[0]
    expect(conn?.authorizations[0].status).toBe('revoked')
  })

  it('preserves full connection and authorization state in roundtrip without losing data or defaulting', async () => {
    const repository = await createRepository()
    const workspace = createWorkspace('Roundtrip Workspace')

    const createConn1 = workspace.createConnection(
      'conn-bot',
      'addon-external',
      {
        connectionProfileId: 'custom-profile',
        cardinality: 'multi',
        default: false,
      },
    )
    expect(createConn1.isSuccess()).toBe(true)

    const botIdentity = {
      kind: 'bot' as const,
      providerId: 'provider-service',
      tenantId: 'tenant-enterprise-99',
      providerSubjectId: 'bot-agent-007',
      displayName: 'Service Bot Agent',
      avatarUrl: 'https://example.com/avatar.png',
    }
    const config = {
      apiUrl: 'https://custom.service.internal/api',
      rateLimit: 50,
      enableSync: true,
    }

    // Connect with secondary role
    const connect1 = workspace.connectAuthorization(
      'conn-bot',
      {
        authorizationRole: 'secondary',
        authProfileId: 'prof-oauth2',
        authorizationId: 'auth-sec-1',
        credentialReferenceId: 'cred-vault-ref-1',
        identity: botIdentity,
      },
      config,
    )
    expect(connect1.isSuccess()).toBe(true)

    // Re-connect same authorization role to increment auth generation to 2 while conn generation is 1
    const reconnect1 = workspace.connectAuthorization(
      'conn-bot',
      {
        authorizationRole: 'secondary',
        authProfileId: 'prof-oauth2',
        authorizationId: 'auth-sec-1',
        credentialReferenceId: 'cred-vault-ref-1',
        identity: botIdentity,
      },
      config,
    )
    expect(reconnect1.isSuccess()).toBe(true)

    // Check pre-condition on memory domain entity
    const memConn = workspace.connections.find((c) => c.id === 'conn-bot')
    expect(memConn?.generation).toBe(1)
    expect(memConn?.authorizations[0].generation).toBe(2)
    expect(memConn?.config).toEqual(config)

    // Create second connection with installation identity
    const createConn2 = workspace.createConnection(
      'conn-inst',
      'addon-github',
      {
        connectionProfileId: 'app-profile',
        cardinality: 'single',
        default: true,
      },
    )
    expect(createConn2.isSuccess()).toBe(true)

    const installationIdentity = {
      kind: 'installation' as const,
      providerId: 'github-enterprise',
      tenantId: 'org-engineering',
      providerSubjectId: 'inst-9876',
      displayName: 'GitHub App Installation',
    }

    const connect2 = workspace.connectAuthorization('conn-inst', {
      authorizationRole: 'primary',
      authProfileId: 'app-auth',
      authorizationId: 'auth-inst-1',
      identity: installationIdentity,
    })
    expect(connect2.isSuccess()).toBe(true)

    // Persist to SQLite
    const createResult = await repository.create(workspace)
    expect(createResult.isSuccess()).toBe(true)

    // Hydrate back from SQLite
    const getResult = await repository.getById(workspace.id)
    expect(getResult.isSuccess()).toBe(true)
    const hydrated = getResult.success
    expect(hydrated).toBeDefined()

    const hydratedConn1 = hydrated?.connections.find((c) => c.id === 'conn-bot')
    expect(hydratedConn1).toBeDefined()
    expect(hydratedConn1?.config).toEqual(config)
    expect(hydratedConn1?.generation).toBe(1)
    expect(hydratedConn1?.authorizations).toHaveLength(1)

    const hydratedAuth1 = hydratedConn1?.authorizations[0]
    expect(hydratedAuth1?.authorizationRole).toBe('secondary')
    expect(hydratedAuth1?.identity).toEqual(botIdentity)
    expect(hydratedAuth1?.generation).toBe(2)
    expect(hydratedAuth1?.authProfileId).toBe('prof-oauth2')
    expect(hydratedAuth1?.credentialReferenceId).toBe('cred-vault-ref-1')

    const hydratedConn2 = hydrated?.connections.find(
      (c) => c.id === 'conn-inst',
    )
    expect(hydratedConn2).toBeDefined()
    expect(hydratedConn2?.authorizations).toHaveLength(1)
    const hydratedAuth2 = hydratedConn2?.authorizations[0]
    expect(hydratedAuth2?.identity).toEqual(installationIdentity)
  })

  it('fails with integrity error when authorization identity is absent from database', async () => {
    const repository = await createRepository()
    const workspace = createWorkspace('Missing Identity Workspace')

    const createConnResult = workspace.createConnection(
      'conn-auth',
      'addon-auth',
      {
        connectionProfileId: 'primary',
        cardinality: 'single',
        default: true,
      },
    )
    expect(createConnResult.isSuccess()).toBe(true)

    const connectResult = workspace.connectAuthorization(
      'conn-auth',
      {
        authorizationRole: 'primary',
        authProfileId: 'auth-prof-1',
        authorizationId: 'auth-rec-1',
        credentialReferenceId: 'cred-ref-1',
        identity: {
          kind: 'human',
          providerId: 'addon-auth',
          tenantId: 'tenant-1',
          providerSubjectId: 'sub-1',
          displayName: 'Subject One',
        },
      },
      {},
    )
    expect(connectResult.isSuccess()).toBe(true)

    const createResult = await repository.create(workspace)
    expect(createResult.isSuccess()).toBe(true)

    // Clear identity in database to simulate missing mandatory data
    await repository
      .db('connection_authorizations')
      .where('id', 'auth-rec-1')
      .update({ identity: null })

    const found = await repository.getById(workspace.id)
    expect(found.isFailure()).toBe(true)
    if (found.isFailure()) {
      expect(found.failure.messageKey).toBe('AUTHORIZATION_IDENTITY_REQUIRED')
    }
  })

  it('fails with integrity error when connection has multiple authorizations but missing authorization_id', async () => {
    const repository = await createRepository()
    const workspace = createWorkspace('Multiple Auths Workspace')

    const createConnResult = workspace.createConnection(
      'conn-multi',
      'addon-multi',
      {
        connectionProfileId: 'multi-profile',
        cardinality: 'multi',
        default: true,
      },
    )
    expect(createConnResult.isSuccess()).toBe(true)

    const auth1Result = workspace.connectAuthorization(
      'conn-multi',
      {
        authorizationRole: 'read',
        authProfileId: 'prof-read',
        authorizationId: 'auth-read-1',
        credentialReferenceId: 'cred-read-1',
        identity: {
          kind: 'human',
          providerId: 'addon-multi',
          tenantId: 'tenant-multi',
          providerSubjectId: 'sub-read',
          displayName: 'Read Subject',
        },
      },
      {},
    )
    expect(auth1Result.isSuccess()).toBe(true)

    const auth2Result = workspace.connectAuthorization(
      'conn-multi',
      {
        authorizationRole: 'write',
        authProfileId: 'prof-write',
        authorizationId: 'auth-write-1',
        credentialReferenceId: 'cred-write-1',
        identity: {
          kind: 'human',
          providerId: 'addon-multi',
          tenantId: 'tenant-multi',
          providerSubjectId: 'sub-read',
          displayName: 'Read Subject',
        },
      },
      {},
    )
    expect(auth2Result.isSuccess()).toBe(true)

    const createResult = await repository.create(workspace)
    expect(createResult.isSuccess()).toBe(true)

    // Clear authorization_id on connection row in database
    await repository
      .db('connections')
      .where('id', 'conn-multi')
      .update({ authorization_id: null })

    const found = await repository.getById(workspace.id)
    expect(found.isFailure()).toBe(true)
    if (found.isFailure()) {
      expect(found.failure.messageKey).toBe(
        'CONNECTION_AUTHORIZATION_ID_REQUIRED',
      )
    }
  })

  it('paginates over 50 workspaces end-to-end and makes the 55th workspace accessible', async () => {
    const repository = await createRepository()
    for (let i = 1; i <= 55; i += 1) {
      const ws = createWorkspace(`Workspace ${i}`)
      const saved = await repository.create(ws)
      expect(saved.isSuccess()).toBe(true)
    }

    const service = new ListWorkspacesService(repository)
    const result = await service.execute()

    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return

    expect(result.success.total).toBe(55)
    expect(result.success.items).toHaveLength(55)
    const lastWorkspace = result.success.items[54]
    expect(lastWorkspace).toBeDefined()
    expect(lastWorkspace?.name).toBe('Workspace 55')
  })
})
