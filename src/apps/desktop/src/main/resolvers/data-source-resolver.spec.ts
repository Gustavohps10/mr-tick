import { createServer, Server } from 'node:http'

import {
  CredentialReferenceFactory,
  EMPTY_HTTP_CONFIG,
  HttpResponseValidator,
  ICredentialsVault,
  IWorkspacesRepository,
  PagedResultDTO,
} from '@mr-tick/application'
import { ConnectionIdentity, Workspace } from '@mr-tick/domain'
import {
  DataSourceContext,
  Either,
  IDataSource,
  IDataSourceInstance,
} from '@mr-tick/sdk'
import { AppError } from '@mr-tick/shared/helpers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ElectronHttpClientFactory,
  NodeFetchTransport,
} from '@/main/adapters/ElectronHttpClient'
import {
  DataSourceResolver,
  IAddonDataSourceLoader,
} from '@/main/resolvers/data-source-resolver'

const taskResponseValidator: HttpResponseValidator<{
  source: string
  status: string
}> = (value): value is { source: string; status: string } => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  return typeof value.source === 'string' && typeof value.status === 'string'
}

function authorizationReference(
  workspace: Workspace,
  connectionId: string,
  authorizationId: string,
): string {
  return CredentialReferenceFactory.create({
    ownerId: 'test-addon',
    workspaceId: workspace.id,
    connectionId,
    authorizationId,
  }).id
}

function connectRole(
  workspace: Workspace,
  connectionId: string,
  authorizationRole: string,
  identity: ConnectionIdentity,
  config: Record<string, string | number | boolean>,
  authorizationId: string,
  credentialReferenceId: string | undefined,
): void {
  const connected = workspace.connectAuthorization(
    connectionId,
    {
      authorizationRole,
      authProfileId: 'primary',
      identity,
      authorizationId,
      credentialReferenceId,
    },
    config,
  )
  expect(connected.isSuccess()).toBe(true)
}

function connectPrimary(
  workspace: Workspace,
  connectionId: string,
  identity: ConnectionIdentity,
  config: Record<string, string | number | boolean>,
  authorizationId: string,
): void {
  connectRole(
    workspace,
    connectionId,
    'primary',
    identity,
    config,
    authorizationId,
    authorizationReference(workspace, connectionId, authorizationId),
  )
}

function testIdentity(
  tenantId: string,
  providerSubjectId: string,
): Extract<import('@mr-tick/domain').ConnectionIdentity, { kind: 'human' }> {
  return {
    kind: 'human',
    providerId: 'test-addon',
    tenantId,
    providerSubjectId,
    displayName: 'Test Member',
  }
}

class FakeWorkspacesRepository implements IWorkspacesRepository {
  constructor(private readonly workspace: Workspace) {}

  async getById(id: string): Promise<Either<AppError, Workspace | undefined>> {
    if (this.workspace.id === id) {
      return Either.success(this.workspace)
    }
    return Either.success(undefined)
  }

  async list(): Promise<Either<AppError, PagedResultDTO<Workspace>>> {
    return Either.success({
      items: [this.workspace],
      total: 1,
      page: 1,
      pageSize: 10,
    })
  }

  async create(): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }

  async update(): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }

  async remove(): Promise<Either<AppError, void>> {
    return Either.success(undefined)
  }
}

class FakeCredentialsVault implements ICredentialsVault {
  token = JSON.stringify({ apiKey: 'fake-secret' })
  outcome: 'present' | 'absent' | 'unavailable' = 'present'
  readonly requested: { service: string; account: string }[] = []
  async saveToken(): Promise<void> {}
  async getToken(
    service: string,
    account: string,
  ): Promise<
    | { kind: 'present'; token: string }
    | { kind: 'absent' }
    | { kind: 'unavailable' }
  > {
    this.requested.push({ service, account })
    if (this.outcome === 'absent') return { kind: 'absent' }
    if (this.outcome === 'unavailable') return { kind: 'unavailable' }
    return {
      kind: 'present',
      token: this.token,
    }
  }
  async deleteToken(): Promise<void> {}
  async hasToken(): Promise<{ kind: 'present' }> {
    return { kind: 'present' }
  }
  async replaceToken(): Promise<void> {}
}

class TestAddonDataSource implements IDataSource {
  createInstance(context: DataSourceContext): IDataSourceInstance {
    let client = context.httpClient
    if (context.config && typeof context.config['apiUrl'] === 'string') {
      client = context.httpClient.withConfig({
        baseURL: context.config['apiUrl'],
      })
    }
    return {
      tasksProvider: {
        async pull() {
          return Either.success([])
        },
        async findAll() {
          const result = await client.get('/tasks', {
            responseValidator: taskResponseValidator,
          })
          if (result.isFailure()) {
            return Either.failure(result.failure)
          }
          return Either.success({
            items: [],
            total: 0,
            page: 1,
            pageSize: 10,
          })
        },
        async findById() {
          return Either.success(null)
        },
        async create() {
          return Either.success({ id: 'task-1' })
        },
        async update() {
          return Either.success({ id: 'task-1' })
        },
        async delete() {
          return Either.success()
        },
      },
      timeEntriesProvider: {
        async pull() {
          return Either.success({
            items: [],
            checkpoint: { updatedAt: new Date(0), id: '' },
            hasMore: false,
            snapshotId: 'test-snapshot',
          })
        },
        async findByMemberId() {
          return Either.success({ items: [], total: 0, page: 1, pageSize: 10 })
        },
        async findAll() {
          return Either.success({ items: [], total: 0, page: 1, pageSize: 10 })
        },
        async findById() {
          return Either.success(null)
        },
        async create() {
          return Either.success({ id: 'te-1' })
        },
        async update() {
          return Either.success({ id: 'te-1' })
        },
        async delete() {
          return Either.success()
        },
      },
      membersProvider: {
        async getCurrentUser() {
          return Either.success(null)
        },
        async findById() {
          return Either.success(null)
        },
        async findByCredentials() {
          return Either.success({
            id: 1,
            login: 'member',
            firstname: 'Test',
            lastname: 'Member',
            admin: false,
            createdOn: '',
            lastLoginOn: '',
            customFields: [],
          })
        },
        async findAll() {
          return Either.success({ items: [], total: 0, page: 1, pageSize: 10 })
        },
      },
      metadataProvider: {
        async getMetadata() {
          return Either.success({
            taskStatuses: [],
            taskPriorities: [],
            activities: [],
            trackStatuses: [],
            participantRoles: [],
            estimationTypes: [],
          })
        },
      },
    }
  }
}

function testConnectionProfile(): {
  connectionProfileId: string
  cardinality: 'multi'
  default: boolean
} {
  return {
    connectionProfileId: 'primary',
    cardinality: 'multi',
    default: true,
  }
}

describe('T01 Host Path: DataSourceResolver com ElectronHttpClientFactory e Providers', () => {
  const testTransport = new NodeFetchTransport()
  let serverA: Server
  let serverB: Server
  let portA = 0
  let portB = 0
  const requestsA: string[] = []
  const requestsB: string[] = []

  beforeEach(async () => {
    requestsA.length = 0
    requestsB.length = 0

    serverA = createServer((req, res) => {
      let url = ''
      if (req.url) {
        url = req.url
      }
      requestsA.push(url)
      res.setHeader('Content-Type', 'application/json')
      res
        .writeHead(200)
        .end(JSON.stringify({ source: 'serverA', status: 'ok' }))
    })

    serverB = createServer((req, res) => {
      let url = ''
      if (req.url) {
        url = req.url
      }
      requestsB.push(url)
      res.setHeader('Content-Type', 'application/json')
      res
        .writeHead(200)
        .end(JSON.stringify({ source: 'serverB', status: 'ok' }))
    })

    await new Promise<void>((resolve) =>
      serverA.listen(0, '127.0.0.1', resolve),
    )
    await new Promise<void>((resolve) =>
      serverB.listen(0, '127.0.0.1', resolve),
    )

    const addrA = serverA.address()
    const addrB = serverB.address()
    if (addrA && typeof addrA !== 'string') {
      portA = addrA.port
    }
    if (addrB && typeof addrB !== 'string') {
      portB = addrB.port
    }
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => serverA.close(() => resolve()))
    await new Promise<void>((resolve) => serverB.close(() => resolve()))
  })

  it('deve resolver conexões independentes e garantir isolamento HTTP nos providers no caminho do host (T01)', async () => {
    const wsResult = Workspace.create({ name: 'Workspace Host Test' })
    expect(wsResult.isSuccess()).toBe(true)
    if (wsResult.isFailure()) {
      return
    }

    const workspace = wsResult.success
    workspace.createConnection('conn-A', 'test-addon', testConnectionProfile())
    connectPrimary(
      workspace,
      'conn-A',
      testIdentity('tenant-A', 'member-1'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-A',
    )

    workspace.createConnection('conn-B', 'test-addon', testConnectionProfile())
    connectPrimary(
      workspace,
      'conn-B',
      testIdentity('tenant-B', 'member-2'),
      { apiUrl: `http://127.0.0.1:${portB}` },
      'authorization-B',
    )

    const repo = new FakeWorkspacesRepository(workspace)
    const vault = new FakeCredentialsVault()
    const factory = new ElectronHttpClientFactory(
      EMPTY_HTTP_CONFIG,
      testTransport,
    )

    const addonInstance = new TestAddonDataSource()
    const addonLoader: IAddonDataSourceLoader = {
      getDataSource() {
        return addonInstance
      },
    }

    const resolver = new DataSourceResolver(
      repo,
      vault,
      { addonsBasePath: '', addonLoader },
      factory,
    )

    // Resolve conexão A e invoca o provider
    const adapterAResult = await resolver.getDataSource(workspace.id, 'conn-A')
    expect(adapterAResult.isSuccess()).toBe(true)
    const adapterA = adapterAResult.success
    const resultA = await adapterA.tasksProvider.findAll()
    expect(resultA.isSuccess()).toBe(true)

    // Resolve conexão B e invoca o provider
    const adapterBResult = await resolver.getDataSource(workspace.id, 'conn-B')
    expect(adapterBResult.isSuccess()).toBe(true)
    const adapterB = adapterBResult.success
    const resultB = await adapterB.tasksProvider.findAll()
    expect(resultB.isSuccess()).toBe(true)

    // Prova de isolamento: conexão A atingiu serverA, conexão B atingiu serverB
    expect(requestsA).toHaveLength(1)
    expect(requestsA[0]).toBe('/tasks')

    expect(requestsB).toHaveLength(1)
    expect(requestsB[0]).toBe('/tasks')
  })

  it('deve respeitar contextOverride tipado sem httpClient e redirecionar para a nova URL de destino (T01)', async () => {
    const wsResult = Workspace.create({ name: 'Workspace Override Test' })
    expect(wsResult.isSuccess()).toBe(true)
    if (wsResult.isFailure()) {
      return
    }

    const workspace = wsResult.success
    workspace.createConnection(
      'conn-default',
      'test-addon',
      testConnectionProfile(),
    )
    connectPrimary(
      workspace,
      'conn-default',
      testIdentity('tenant-A', 'member-1'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-default',
    )

    const repo = new FakeWorkspacesRepository(workspace)
    const vault = new FakeCredentialsVault()
    const factory = new ElectronHttpClientFactory(
      EMPTY_HTTP_CONFIG,
      testTransport,
    )
    const addonInstance = new TestAddonDataSource()
    const addonLoader: IAddonDataSourceLoader = {
      getDataSource() {
        return addonInstance
      },
    }

    const resolver = new DataSourceResolver(
      repo,
      vault,
      { addonsBasePath: '', addonLoader },
      factory,
    )

    // Requisita com override apontando para serverB
    const adapterOverriddenResult = await resolver.getDataSource(
      workspace.id,
      'conn-default',
      {
        config: { apiUrl: `http://127.0.0.1:${portB}` },
      },
    )
    expect(adapterOverriddenResult.isSuccess()).toBe(true)
    const adapterOverridden = adapterOverriddenResult.success

    const result = await adapterOverridden.tasksProvider.findAll()
    expect(result.isSuccess()).toBe(true)

    // Como o contextOverride apontou para serverB, serverB recebeu a requisição e serverA ficou intocado
    expect(requestsA).toHaveLength(0)
    expect(requestsB).toHaveLength(1)
    expect(requestsB[0]).toBe('/tasks')
  })

  it('rejeita shape de credenciais incompatível mesmo quando o JSON é válido', async () => {
    const wsResult = Workspace.create({
      name: 'Workspace Invalid Credential Shape',
    })
    expect(wsResult.isSuccess()).toBe(true)
    if (wsResult.isFailure()) return

    const workspace = wsResult.success
    workspace.createConnection(
      'conn-invalid',
      'test-addon',
      testConnectionProfile(),
    )
    connectPrimary(
      workspace,
      'conn-invalid',
      testIdentity('tenant-A', 'member-1'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-invalid',
    )
    const vault = new FakeCredentialsVault()
    vault.token = JSON.stringify({ credentials: [] })
    const addonInstance = new TestAddonDataSource()
    const resolver = new DataSourceResolver(
      new FakeWorkspacesRepository(workspace),
      vault,
      {
        addonsBasePath: '',
        addonLoader: { getDataSource: () => addonInstance },
      },
      new ElectronHttpClientFactory(EMPTY_HTTP_CONFIG, testTransport),
    )

    const result = await resolver.getDataSource(workspace.id, 'conn-invalid')
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CREDENTIAL_PAYLOAD_INVALID')
  })

  it('rejeita JSON sintaticamente inválido com código determinístico', async () => {
    const wsResult = Workspace.create({
      name: 'Workspace Invalid Credential JSON',
    })
    expect(wsResult.isSuccess()).toBe(true)
    if (wsResult.isFailure()) return

    const workspace = wsResult.success
    workspace.createConnection(
      'conn-invalid-json',
      'test-addon',
      testConnectionProfile(),
    )
    connectPrimary(
      workspace,
      'conn-invalid-json',
      testIdentity('tenant-A', 'member-1'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-invalid-json',
    )
    const vault = new FakeCredentialsVault()
    vault.token = '{invalid'
    const addonInstance = new TestAddonDataSource()
    const resolver = new DataSourceResolver(
      new FakeWorkspacesRepository(workspace),
      vault,
      {
        addonsBasePath: '',
        addonLoader: { getDataSource: () => addonInstance },
      },
      new ElectronHttpClientFactory(EMPTY_HTTP_CONFIG, testTransport),
    )

    const result = await resolver.getDataSource(
      workspace.id,
      'conn-invalid-json',
    )
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CREDENTIAL_PAYLOAD_INVALID')
  })

  it('fails closed when the canonical credential is absent', async () => {
    const workspaceResult = Workspace.create({ name: 'Absent credential' })
    expect(workspaceResult.isSuccess()).toBe(true)
    if (workspaceResult.isFailure()) return
    const workspace = workspaceResult.success
    workspace.createConnection(
      'conn-absent',
      'test-addon',
      testConnectionProfile(),
    )
    connectPrimary(
      workspace,
      'conn-absent',
      testIdentity('tenant-A', 'member-1'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-absent',
    )
    const vault = new FakeCredentialsVault()
    vault.outcome = 'absent'
    const resolver = new DataSourceResolver(
      new FakeWorkspacesRepository(workspace),
      vault,
      {
        addonsBasePath: '',
        addonLoader: { getDataSource: () => new TestAddonDataSource() },
      },
      new ElectronHttpClientFactory(EMPTY_HTTP_CONFIG, testTransport),
    )

    const result = await resolver.getDataSource(workspace.id, 'conn-absent')

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CONNECTION_CREDENTIAL_ABSENT')
  })

  it('rejects a connection disconnected while its addon module is loading', async () => {
    const workspaceResult = Workspace.create({
      name: 'Resolver disconnect race',
    })
    expect(workspaceResult.isSuccess()).toBe(true)
    if (workspaceResult.isFailure()) return
    const workspace = workspaceResult.success
    workspace.createConnection(
      'conn-race',
      'test-addon',
      testConnectionProfile(),
    )
    connectPrimary(
      workspace,
      'conn-race',
      testIdentity('tenant-A', 'member-1'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-race',
    )
    const addon = new TestAddonDataSource()
    const resolver = new DataSourceResolver(
      new FakeWorkspacesRepository(workspace),
      new FakeCredentialsVault(),
      {
        addonsBasePath: '',
        addonLoader: {
          getDataSource: () => {
            workspace.disconnectConnection('conn-race')
            return addon
          },
        },
      },
      new ElectronHttpClientFactory(EMPTY_HTTP_CONFIG, testTransport),
    )

    const result = await resolver.getDataSource(workspace.id, 'conn-race')

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CONNECTION_AUTHORIZATION_CHANGED')
  })

  function resolverFor(
    workspace: Workspace,
    vault: FakeCredentialsVault,
    getDataSource: () => IDataSource = () => new TestAddonDataSource(),
  ): DataSourceResolver {
    return new DataSourceResolver(
      new FakeWorkspacesRepository(workspace),
      vault,
      { addonsBasePath: '', addonLoader: { getDataSource } },
      new ElectronHttpClientFactory(EMPTY_HTTP_CONFIG, testTransport),
    )
  }

  function newWorkspace(connectionId: string): Workspace {
    const created = Workspace.create({ name: `Workspace ${connectionId}` })
    expect(created.isSuccess()).toBe(true)
    if (created.isFailure()) throw new Error('WORKSPACE_FIXTURE_FAILED')
    created.success.createConnection(
      connectionId,
      'test-addon',
      testConnectionProfile(),
    )
    return created.success
  }

  it('reads only the primary authorization reference when several are active', async () => {
    const workspace = newWorkspace('conn-multi')
    const config = { apiUrl: `http://127.0.0.1:${portA}` }
    const identity = testIdentity('tenant-A', '1')
    connectRole(
      workspace,
      'conn-multi',
      'secondary',
      identity,
      config,
      'authorization-secondary',
      authorizationReference(
        workspace,
        'conn-multi',
        'authorization-secondary',
      ),
    )
    connectPrimary(
      workspace,
      'conn-multi',
      identity,
      config,
      'authorization-primary',
    )
    const vault = new FakeCredentialsVault()

    const result = await resolverFor(workspace, vault).getDataSource(
      workspace.id,
      'conn-multi',
    )

    expect(result.isSuccess()).toBe(true)
    const expected = CredentialReferenceFactory.create({
      ownerId: 'test-addon',
      workspaceId: workspace.id,
      connectionId: 'conn-multi',
      authorizationId: 'authorization-primary',
    })
    expect(vault.requested).toEqual([
      { service: expected.service, account: expected.account },
    ])
  })

  it('fails closed when the persisted credential reference is missing', async () => {
    const workspace = newWorkspace('conn-no-reference')
    connectRole(
      workspace,
      'conn-no-reference',
      'primary',
      testIdentity('tenant-A', '1'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-no-reference',
      undefined,
    )
    const vault = new FakeCredentialsVault()

    const result = await resolverFor(workspace, vault).getDataSource(
      workspace.id,
      'conn-no-reference',
    )

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe(
      'CONNECTION_CREDENTIAL_REFERENCE_MISSING',
    )
    expect(vault.requested).toEqual([])
  })

  it('preserves an alphanumeric provider subject exactly as string id', async () => {
    const workspace = newWorkspace('conn-opaque-subject')
    connectPrimary(
      workspace,
      'conn-opaque-subject',
      testIdentity('tenant-A', 'usr_abc-123'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-opaque',
    )

    const adapter = await resolverFor(
      workspace,
      new FakeCredentialsVault(),
    ).getDataSource(workspace.id, 'conn-opaque-subject')

    expect(adapter.isSuccess()).toBe(true)
    const member = adapter.success.getAuthenticatedMemberData()
    expect(member.isSuccess()).toBe(true)
    expect(member.success).toEqual({
      id: 'usr_abc-123',
      firstname: 'Test Member',
      lastname: '',
    })
  })

  it('preserves a provider subject with leading zeros without numeric coercion', async () => {
    const workspace = newWorkspace('conn-leading-zeros')
    connectPrimary(
      workspace,
      'conn-leading-zeros',
      testIdentity('tenant-A', '00123'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-zeros',
    )

    const adapter = await resolverFor(
      workspace,
      new FakeCredentialsVault(),
    ).getDataSource(workspace.id, 'conn-leading-zeros')

    expect(adapter.isSuccess()).toBe(true)
    const member = adapter.success.getAuthenticatedMemberData()
    expect(member.isSuccess()).toBe(true)
    expect(member.success).toEqual({
      id: '00123',
      firstname: 'Test Member',
      lastname: '',
    })
  })

  it('preserves a provider subject exceeding MAX_SAFE_INTEGER without precision loss', async () => {
    const workspace = newWorkspace('conn-large-id')
    connectPrimary(
      workspace,
      'conn-large-id',
      testIdentity('tenant-A', '9007199254740993'),
      { apiUrl: `http://127.0.0.1:${portA}` },
      'authorization-large',
    )

    const adapter = await resolverFor(
      workspace,
      new FakeCredentialsVault(),
    ).getDataSource(workspace.id, 'conn-large-id')

    expect(adapter.isSuccess()).toBe(true)
    const member = adapter.success.getAuthenticatedMemberData()
    expect(member.isSuccess()).toBe(true)
    expect(member.success).toEqual({
      id: '9007199254740993',
      firstname: 'Test Member',
      lastname: '',
    })
  })

  it('adapts canonical connection identity to authenticated member data at the boundary', async () => {
    const credRefId = CredentialReferenceFactory.create({
      ownerId: 'test-addon',
      workspaceId: 'ws-legacy',
      connectionId: 'conn-legacy-member',
      authorizationId: 'auth-legacy',
    }).id
    const workspace = Workspace.hydrate({
      id: 'ws-legacy',
      name: 'Workspace Legacy',
      description: undefined,
      avatarUrl: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'configured',
      revision: 1,
      connections: [
        {
          id: 'conn-legacy-member',
          addonId: 'test-addon',
          connectionProfileId: 'test-profile',
          cardinality: 'single',
          status: 'connected',
          generation: 1,
          authorizations: [
            {
              authorizationId: 'auth-legacy',
              authorizationRole: 'primary',
              authProfileId: 'primary',
              credentialReferenceId: credRefId,
              identity: testIdentity('tenant-A', '42'),
              generation: 1,
              status: 'active',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          authorizationId: 'auth-legacy',
          config: { apiUrl: `http://127.0.0.1:${portA}` },
        },
      ],
    })

    const adapter = await resolverFor(
      workspace,
      new FakeCredentialsVault(),
    ).getDataSource(workspace.id, 'conn-legacy-member')

    expect(adapter.isSuccess()).toBe(true)
    const member = adapter.success.getAuthenticatedMemberData()
    expect(member.isSuccess()).toBe(true)
    expect(member.success).toEqual({
      id: '42',
      firstname: 'Test Member',
      lastname: '',
    })
  })

  it('rejects an authorization reauthorized while the addon module loads', async () => {
    const workspace = newWorkspace('conn-reauth')
    const config = { apiUrl: `http://127.0.0.1:${portA}` }
    const identity = testIdentity('tenant-A', '1')
    connectPrimary(
      workspace,
      'conn-reauth',
      identity,
      config,
      'authorization-1',
    )
    const vault = new FakeCredentialsVault()
    const addon = new TestAddonDataSource()

    const result = await resolverFor(workspace, vault, () => {
      connectPrimary(
        workspace,
        'conn-reauth',
        identity,
        config,
        'authorization-1',
      )
      return addon
    }).getDataSource(workspace.id, 'conn-reauth')

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('CONNECTION_AUTHORIZATION_CHANGED')
  })
})
