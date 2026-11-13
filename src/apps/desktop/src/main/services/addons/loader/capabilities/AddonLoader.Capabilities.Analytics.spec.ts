import type {
  AnalyticsDatasetManifest,
  AnalyticsProviderContext,
  IAnalyticsProvider,
} from '@mr-tick/application'
import type { IAddonManifest } from '@mr-tick/sdk'
import { Either } from '@mr-tick/shared/helpers'
import { describe, expect, it, vi } from 'vitest'

import {
  createLoader,
  fakeHttpClient,
} from './AddonLoader.Capabilities.fixture'

const manifest: IAddonManifest = {
  id: 'analytics-only',
  name: 'Analytics Only',
  version: '1.0.0',
  author: 'Tests',
  shortDescription: '',
  description: '',
  capabilities: ['auth', 'analytics'],
}
const dataset: AnalyticsDatasetManifest = {
  id: 'measurements',
  name: 'Measurements',
  description: 'Independent provider',
  sourceFormat: 'json',
  endpoint: '/measurements',
  extraction: {
    modes: ['snapshot'],
    identity: { kind: 'row', columns: ['id'] },
  },
  columns: [{ name: 'id', label: 'ID', type: 'string' }],
}
function context(connectionInstanceId: string): AnalyticsProviderContext {
  return {
    httpClient: fakeHttpClient,
    scope: { workspaceId: 'workspace', connectionInstanceId },
    identity: {
      kind: 'human',
      providerId: 'measurements',
      tenantId: 'tenant',
      providerSubjectId: connectionInstanceId,
      displayName: 'Reader',
    },
  }
}
function provider(): IAnalyticsProvider {
  return {
    listAnalyticsDatasets: async () => Either.success([dataset]),
    fetchAnalyticsDataset: async (input) =>
      Either.success({
        dataset,
        rows: [{ id: 'record' }],
        fetchedAt: '2026-11-09T00:00:00Z',
        execution: { kind: 'snapshot', coverage: 'complete', scope: input },
      }),
    getFilterOptions: async () =>
      Either.success([{ value: 'project', label: 'Project' }]),
  }
}
function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('Independent analytics contribution', () => {
  it('registers and queries auth + analytics without creating a datasource', async () => {
    const loader = createLoader()
    await loader.activateAddon(
      manifest.id,
      {
        activate: (ctx) => {
          expect(
            ctx.contributions.analytics
              .register({ createInstance: provider })
              .isSuccess(),
          ).toBe(true)
        },
        deactivate: () => {},
      },
      manifest,
    )
    expect(loader.getDataSource(manifest.id)).toBeUndefined()
    const instance = loader
      .getAnalytics(manifest.id)
      ?.createInstance(context('a'))
    expect(instance).toBeDefined()
    if (!instance) return
    expect((await instance.listAnalyticsDatasets()).success).toEqual([dataset])
    expect(
      (await instance.fetchAnalyticsDataset({ datasetId: dataset.id })).success
        .execution.kind,
    ).toBe('snapshot')
    expect((await instance.getFilterOptions('projects')).success).toEqual([
      { value: 'project', label: 'Project' },
    ])
    await loader.deactivateAddon(manifest.id)
    expect(loader.getAnalytics(manifest.id)).toBeUndefined()
    expect((await instance.listAnalyticsDatasets()).isFailure()).toBe(true)
  })

  it('rejects registration without the declared capability', () => {
    const loader = createLoader()
    loader.registerManifestCapabilities('datasource-only', ['dataSource'])
    const result = loader
      .createContext('datasource-only')
      .contributions.analytics.register({ createInstance: provider })
    expect(result.isFailure()).toBe(true)
    expect(loader.getAnalytics('datasource-only')).toBeUndefined()
  })

  it('discards a delayed response from a disconnected connection while another succeeds', async () => {
    const loader = createLoader()
    const entered = deferred()
    const release = deferred()
    await loader.activateAddon(
      manifest.id,
      {
        activate: (ctx) => {
          ctx.contributions.analytics.register({
            createInstance: (input) => {
              const instance = provider()
              if (input.scope.connectionInstanceId === 'a')
                instance.listAnalyticsDatasets = async () => {
                  entered.resolve()
                  await release.promise
                  return Either.success([dataset])
                }
              return instance
            },
          })
        },
        deactivate: () => {},
      },
      manifest,
    )
    const source = loader.getAnalytics(manifest.id)
    expect(source).toBeDefined()
    if (!source) return
    const a = source.createInstance(context('a'))
    const b = source.createInstance(context('b'))
    const pending = a.listAnalyticsDatasets()
    await entered.promise
    loader.notifyConnectionBindingChanged('workspace', 'a', 'stop')
    release.resolve()
    expect((await pending).isFailure()).toBe(true)
    expect((await b.listAnalyticsDatasets()).isSuccess()).toBe(true)
  })

  it('invalidates previous providers when unregistered and never revives them after re-registration', async () => {
    const loader = createLoader()
    loader.registerManifestCapabilities(manifest.id, manifest.capabilities)
    const contribution = loader.createContext(manifest.id).contributions
      .analytics
    expect(
      contribution.register({ createInstance: provider }).isSuccess(),
    ).toBe(true)
    const old = loader.getAnalytics(manifest.id)?.createInstance(context('a'))
    contribution.unregister()
    expect(loader.getAnalytics(manifest.id)).toBeUndefined()
    expect(
      contribution.register({ createInstance: provider }).isSuccess(),
    ).toBe(true)
    expect(old).toBeDefined()
    if (!old) return
    expect((await old.listAnalyticsDatasets()).isFailure()).toBe(true)
  })

  it('rejects results when the capability is disabled during execution', async () => {
    const loader = createLoader()
    const entered = deferred()
    const release = deferred()
    const inner = provider()
    inner.listAnalyticsDatasets = vi.fn(async () => {
      entered.resolve()
      await release.promise
      return Either.success([dataset])
    })
    loader.registerManifestCapabilities(manifest.id, manifest.capabilities)
    loader
      .createContext(manifest.id)
      .contributions.analytics.register({ createInstance: () => inner })
    const instance = loader
      .getAnalytics(manifest.id)
      ?.createInstance(context('a'))
    expect(instance).toBeDefined()
    if (!instance) return
    const pending = instance.listAnalyticsDatasets()
    await entered.promise
    loader.disableCapability(manifest.id, 'analytics')
    release.resolve()
    expect((await pending).isFailure()).toBe(true)
    expect(loader.getAnalytics(manifest.id)).toBeUndefined()
  })
})
