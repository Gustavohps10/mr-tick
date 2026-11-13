import {
  type AnalyticsProviderContext,
  AnalyticsService,
  CredentialReferenceFactory,
  type CredentialVaultReadResult,
  type IAnalyticsProvider,
  type ICredentialsVault,
  type IWorkspacesRepository,
} from '@mr-tick/application'
import { Workspace } from '@mr-tick/domain'
import { Either } from '@mr-tick/shared/helpers'
import { describe, expect, it, vi } from 'vitest'

import {
  ElectronHttpClientFactory,
  NodeFetchTransport,
} from '@/main/adapters/ElectronHttpClient'

import { createLoader } from '../services/addons/loader/capabilities/AddonLoader.Capabilities.fixture'
import { AnalyticsResolver } from './analytics-resolver'

function fixture() {
  const workspace = Workspace.create({ name: 'Analytics workspace' }).success
  const tokens = new Map<string, string>()

  for (const id of ['a', 'b']) {
    expect(
      workspace
        .createConnection(id, 'analytics-only', {
          connectionProfileId: 'reader',
          cardinality: 'multi',
          default: true,
        })
        .isSuccess(),
    ).toBe(true)
    const reference = CredentialReferenceFactory.create({
      ownerId: 'analytics-only',
      workspaceId: workspace.id,
      connectionId: id,
      authorizationId: `authorization-${id}`,
    })
    tokens.set(reference.account, JSON.stringify({ apiKey: `secret-${id}` }))
    expect(
      workspace
        .connectAuthorization(
          id,
          {
            authorizationRole: 'primary',
            authorizationId: `authorization-${id}`,
            credentialReferenceId: reference.id,
            authProfileId: 'reader',
            identity: {
              kind: 'human',
              providerId: 'analytics-only',
              tenantId: id,
              providerSubjectId: `user-${id}`,
              displayName: id,
            },
          },
          { apiUrl: `https://${id}.example.com` },
        )
        .isSuccess(),
    ).toBe(true)
  }

  const repository = {
    getById: vi.fn(async (id: string) =>
      Either.success(id === workspace.id ? workspace : undefined),
    ),
  } as unknown as IWorkspacesRepository
  const vault: ICredentialsVault = {
    getToken: vi.fn(
      async (
        service: string,
        account: string,
      ): Promise<CredentialVaultReadResult> => {
        void service
        const token = tokens.get(account)
        if (token === undefined) return { kind: 'absent' }
        return { kind: 'present', token }
      },
    ),
    saveToken: async () => {},
    deleteToken: async () => {},
    replaceToken: async () => {},
    hasToken: async () => ({ kind: 'present' }),
  }
  const loader = createLoader()
  loader.registerManifestCapabilities('analytics-only', ['auth', 'analytics'])
  const contexts: AnalyticsProviderContext[] = []
  const createInstance = vi.fn(
    (context: AnalyticsProviderContext): IAnalyticsProvider => {
      contexts.push(context)
      return {
        listAnalyticsDatasets: async () => Either.success([]),
        getFilterOptions: async () =>
          Either.success([
            {
              value: context.scope.connectionInstanceId,
              label: context.identity.displayName,
            },
          ]),
        fetchAnalyticsDataset: async (input) =>
          Either.success({
            dataset: {
              id: input.datasetId,
              name: 'Readings',
              description: '',
              sourceFormat: 'json',
              endpoint: '/readings',
              extraction: {
                modes: ['snapshot'],
                identity: { kind: 'row', columns: ['id'] },
              },
              columns: [{ name: 'id', label: 'ID', type: 'string' }],
            },
            rows: [{ id: context.scope.connectionInstanceId }],
            fetchedAt: '2026-11-09T00:00:00Z',
            execution: { kind: 'snapshot', coverage: 'complete', scope: input },
          }),
      }
    },
  )
  loader
    .createContext('analytics-only')
    .contributions.analytics.register({ createInstance })
  const resolver = new AnalyticsResolver(
    repository,
    vault,
    new ElectronHttpClientFactory({}, new NodeFetchTransport()),
    loader,
  )
  return {
    workspace,
    repository,
    vault,
    loader,
    contexts,
    createInstance,
    resolver,
    service: new AnalyticsService(resolver),
  }
}

describe('Analytics connection resolution and application path', () => {
  it('resolves auth + analytics directly and isolates credentials, HTTP clients and datasets per connection', async () => {
    const f = fixture()
    const a = await f.service.fetchAnalyticsDataset({
      workspaceId: f.workspace.id,
      connectionInstanceId: 'a',
      query: { datasetId: 'readings' },
    })
    const b = await f.service.fetchAnalyticsDataset({
      workspaceId: f.workspace.id,
      connectionInstanceId: 'b',
      query: { datasetId: 'readings' },
    })
    expect(a.success.rows).toEqual([{ id: 'a' }])
    expect(b.success.rows).toEqual([{ id: 'b' }])
    expect(f.loader.getDataSource('analytics-only')).toBeUndefined()
    expect(
      f.contexts.find((context) => context.scope.connectionInstanceId === 'a')
        ?.credentials,
    ).toEqual({ apiKey: 'secret-a' })
    expect(
      f.contexts.find((context) => context.scope.connectionInstanceId === 'b')
        ?.credentials,
    ).toEqual({ apiKey: 'secret-b' })
    expect(new Set(f.contexts.map((context) => context.httpClient)).size).toBe(
      2,
    )
    expect(
      (
        await f.service.getFilterOptions({
          workspaceId: f.workspace.id,
          connectionInstanceId: 'a',
          source: 'projects',
        })
      ).success,
    ).toEqual([{ value: 'a', label: 'a' }])
    const first = await f.resolver.resolve(f.workspace.id, 'a')
    const second = await f.resolver.resolve(f.workspace.id, 'a')
    expect(first.success.provider).toBe(second.success.provider)
    expect(first.success.authorizationKey).toBe(second.success.authorizationKey)
    expect(f.createInstance).toHaveBeenCalledTimes(2)
  })

  it('does not create a provider when the connection or vault is unavailable', async () => {
    const f = fixture()
    vi.mocked(f.vault.getToken).mockResolvedValue({ kind: 'unavailable' })
    expect((await f.resolver.resolve(f.workspace.id, 'a')).isFailure()).toBe(
      true,
    )
    expect(f.createInstance).not.toHaveBeenCalled()
    expect((await f.resolver.resolve('missing', 'a')).isFailure()).toBe(true)
    expect(
      (await f.resolver.resolve(f.workspace.id, 'missing')).isFailure(),
    ).toBe(true)
    expect((await f.resolver.resolve('', 'a')).isFailure()).toBe(true)
  })

  it('rejects authorization revoked while credentials are being read', async () => {
    const f = fixture()
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered = () => {}
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    vi.mocked(f.vault.getToken).mockImplementation(async () => {
      entered()
      await gate
      return { kind: 'present', token: JSON.stringify({ apiKey: 'secret-a' }) }
    })
    const pending = f.resolver.resolve(f.workspace.id, 'a')
    await started
    f.workspace.disconnectConnection('a')
    release()
    expect((await pending).isFailure()).toBe(true)
    expect(f.createInstance).not.toHaveBeenCalled()
  })

  it.each([1, 2])(
    'excludes authorization revoked during vault read %i while keeping other connections',
    async (blockedRead) => {
      const f = fixture()
      let release = () => {}
      let entered = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const started = new Promise<void>((resolve) => {
        entered = resolve
      })
      let reads = 0
      vi.mocked(f.vault.getToken).mockImplementation(async () => {
        reads += 1
        if (reads === blockedRead) {
          entered()
          await gate
        }
        return {
          kind: 'present',
          token: JSON.stringify({ apiKey: 'secret-a' }),
        }
      })
      const pending = f.resolver.resolveWorkspaceAuthorizations(f.workspace.id)
      await started
      f.workspace.disconnectConnection('a')
      release()
      const result = await pending
      expect(result.isSuccess()).toBe(true)
      expect(result.success.map((item) => item.connectionInstanceId)).toEqual([
        'b',
      ])
      expect(f.createInstance).not.toHaveBeenCalled()
    },
  )

  it('resolves workspace authorizations offline without instantiating providers and respects disconnections', async () => {
    const f = fixture()
    const resolvedA = await f.resolver.resolve(f.workspace.id, 'a')
    expect(resolvedA.isSuccess()).toBe(true)
    const fresh = new AnalyticsResolver(
      f.repository,
      f.vault,
      new ElectronHttpClientFactory({}, new NodeFetchTransport()),
      f.loader,
    )
    const auths = await fresh.resolveWorkspaceAuthorizations(f.workspace.id)
    expect(auths.isSuccess()).toBe(true)
    expect(auths.success).toHaveLength(2)
    expect(auths.success).toContainEqual({
      connectionInstanceId: 'a',
      authorizationKey: resolvedA.success.authorizationKey,
    })
    expect(f.createInstance).toHaveBeenCalledTimes(1)

    f.workspace.disconnectConnection('b')
    const afterDisconnect = await fresh.resolveWorkspaceAuthorizations(
      f.workspace.id,
    )
    expect(afterDisconnect.isSuccess()).toBe(true)
    expect(afterDisconnect.success).toEqual([
      {
        connectionInstanceId: 'a',
        authorizationKey: resolvedA.success.authorizationKey,
      },
    ])

    vi.mocked(f.vault.getToken).mockResolvedValueOnce({ kind: 'unavailable' })
    expect(
      (await fresh.resolveWorkspaceAuthorizations(f.workspace.id)).isFailure(),
    ).toBe(true)
  })
})
