import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  AnalyticsQueryInput,
  IAnalyticsProvider,
  IAnalyticsResolver,
} from '@mr-tick/application'
import { AnalyticsWarehouseService } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DuckDBAnalyticsEngine } from './DuckDBAnalyticsEngine'

const manifest: AnalyticsDatasetManifest = {
  id: 'entries',
  name: 'Entries',
  description: 'Fixture',
  endpoint: '/entries',
  sourceFormat: 'json',
  columns: [
    { name: 'id', label: 'ID', type: 'number' },
    { name: 'team', label: 'Team', type: 'string' },
    { name: 'hours', label: 'Hours', type: 'number' },
  ],
  extraction: {
    modes: ['snapshot'],
    identity: { kind: 'row', columns: ['id'] },
  },
}
const engines: DuckDBAnalyticsEngine[] = []
afterEach(async () => {
  for (const engine of engines) await engine.close()
  engines.length = 0
})

async function fixture() {
  const engine = new DuckDBAnalyticsEngine(
    await mkdtemp(join(tmpdir(), 'metric-warehouse-service-')),
  )
  engines.push(engine)
  const fetch =
    vi.fn<
      (
        query: AnalyticsDatasetQueryInput,
      ) => Promise<Either<AppError, AnalyticsDatasetResult>>
    >()
  const provider: IAnalyticsProvider = {
    listAnalyticsDatasets: async () => Either.success([manifest]),
    fetchAnalyticsDataset: fetch,
    getFilterOptions: async () => Either.success([]),
  }
  let key = 'authorization'
  const resolver: IAnalyticsResolver = {
    resolve: async () => Either.success({ provider, authorizationKey: key }),
  }
  const service = new AnalyticsWarehouseService(resolver, engine)
  const load = () =>
    service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'entries' },
    })
  const query = (
    selectionKey: string,
    extra: Partial<AnalyticsQueryInput> = {},
  ) =>
    service.query({
      workspaceId: 'workspace',
      nodes: [
        {
          id: 'source',
          kind: 'source',
          connectionInstanceId: 'connection',
          selectionKey,
        },
      ],
      targetNodeId: 'source',
      offset: 0,
      limit: 100,
      ...extra,
    })
  return {
    engine,
    provider,
    fetch,
    service,
    load,
    query,
    setKey: (value: string) => {
      key = value
    },
  }
}

function page(
  index: number,
  rows: AnalyticsDatasetResult['rows'],
  continuation?: string,
): AnalyticsDatasetResult {
  const result: AnalyticsDatasetResult = {
    dataset: manifest,
    rows,
    fetchedAt: '2026-11-09T00:00:00Z',
    execution: {
      kind: 'snapshot',
      scope: { datasetId: 'entries' },
      coverage: 'unverified',
      batch: {
        index,
        offset: index * 2,
        finished: continuation === undefined,
        totalRows: 4,
      },
    },
  }
  if (continuation !== undefined && result.execution.kind === 'snapshot')
    result.execution.continuation = { cursor: continuation }
  return result
}

describe('Analytical publication orchestration', () => {
  it('loads every page before publication and queries global totals with a bounded preview', async () => {
    const f = await fixture()
    f.fetch
      .mockResolvedValueOnce(
        Either.success(
          page(
            0,
            [
              { id: 1, team: 'A', hours: 2 },
              { id: 2, team: 'B', hours: 3 },
            ],
            'next',
          ),
        ),
      )
      .mockResolvedValueOnce(
        Either.success(
          page(1, [
            { id: 3, team: 'A', hours: 4 },
            { id: 4, team: 'B', hours: 5 },
          ]),
        ),
      )
    const loaded = await f.load()
    expect(loaded.isSuccess(), JSON.stringify(loaded)).toBe(true)
    expect(loaded.success.publication.rowCount).toBe(4)
    expect(loaded.success.publication.coverage).toBe('unverified')
    expect(
      f.fetch.mock.calls.map(([request]) => request.execution?.cursor),
    ).toEqual([undefined, 'next'])
    const result = await f.query(loaded.success.publication.selectionKey, {
      groupBy: ['team'],
      measures: [{ name: 'total', column: 'hours', operator: 'sum' }],
      limit: 1,
    })
    expect(result.success.totalRows).toBe(2)
    expect(result.success.rows).toEqual([{ team: 'A', total: 6 }])
  })

  it('keeps the previous publication after extraction failure and refuses incomplete EOF', async () => {
    const f = await fixture()
    f.fetch.mockResolvedValue(
      Either.success({
        dataset: manifest,
        rows: [{ id: 1, team: 'A', hours: 2 }],
        fetchedAt: '2026-11-09T00:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'entries' },
          coverage: 'complete',
        },
      }),
    )
    const loaded = await f.load()
    f.fetch.mockResolvedValue(
      Either.failure(AppError.Http(503, 'PROVIDER_UNAVAILABLE')),
    )
    expect((await f.load()).isFailure()).toBe(true)
    expect(
      (await f.query(loaded.success.publication.selectionKey)).success.rows,
    ).toHaveLength(1)
    f.fetch.mockResolvedValue(
      Either.success({
        dataset: manifest,
        rows: [],
        fetchedAt: '2026-11-09T00:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'entries' },
          coverage: 'partial',
        },
      }),
    )
    expect((await f.load()).failure.messageKey).toBe(
      'ANALYTICS_INCOMPLETE_LOAD',
    )
    expect(
      (await f.query(loaded.success.publication.selectionKey)).success.rows,
    ).toHaveLength(1)
  })

  it('rejects repeated cursors and changing authorization before publication', async () => {
    const f = await fixture()
    f.fetch
      .mockResolvedValueOnce(
        Either.success(
          page(
            0,
            [
              { id: 1, team: 'A', hours: 2 },
              { id: 2, team: 'A', hours: 3 },
            ],
            'same',
          ),
        ),
      )
      .mockResolvedValueOnce(
        Either.success(
          page(
            1,
            [
              { id: 3, team: 'A', hours: 4 },
              { id: 4, team: 'B', hours: 5 },
            ],
            'same',
          ),
        ),
      )
    expect((await f.load()).failure.messageKey).toBe(
      'ANALYTICS_CONTINUATION_INVALID',
    )
    f.fetch.mockImplementation(async () => {
      f.setKey('new-authorization')
      return Either.success({
        dataset: manifest,
        rows: [{ id: 1, team: 'A', hours: 2 }],
        fetchedAt: '2026-11-09T00:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'entries' },
          coverage: 'complete',
        },
      })
    })
    expect((await f.load()).failure.messageKey).toBe(
      'ANALYTICS_AUTHORIZATION_CHANGED',
    )
  })

  it('accepts declared remote aggregates without downloading raw rows or regrouping averages', async () => {
    const f = await fixture()
    const remote: AnalyticsDatasetManifest = {
      ...manifest,
      extraction: {
        ...manifest.extraction,
        modes: ['aggregate'],
        aggregation: {
          groupByColumns: ['team'],
          operators: ['average'],
          postProcessing: 'projection-only',
        },
      },
    }
    f.provider.listAnalyticsDatasets = async () => Either.success([remote])
    const aggregate: AnalyticsDatasetManifest = {
      ...remote,
      columns: [
        { name: 'team', label: 'Team', type: 'string' },
        { name: 'mean_hours', label: 'Mean', type: 'number' },
      ],
    }
    f.fetch.mockResolvedValue(
      Either.success({
        dataset: aggregate,
        rows: [{ team: 'A', mean_hours: 3.5 }],
        fetchedAt: '2026-11-09T00:00:00Z',
        execution: {
          kind: 'aggregate',
          scope: { datasetId: 'entries' },
          coverage: 'complete',
        },
      }),
    )
    const loaded = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: {
        datasetId: 'entries',
        execution: {
          kind: 'aggregate',
          groupBy: ['team'],
          measures: [
            { name: 'mean_hours', column: 'hours', operator: 'average' },
          ],
        },
      },
    })
    expect(loaded.isSuccess(), JSON.stringify(loaded)).toBe(true)
    expect(f.fetch).toHaveBeenCalledTimes(1)
    expect(
      (
        await f.query(loaded.success.publication.selectionKey, {
          projection: ['team', 'mean_hours'],
        })
      ).success.rows,
    ).toEqual([{ team: 'A', mean_hours: 3.5 }])
    expect(
      (
        await f.query(loaded.success.publication.selectionKey, {
          groupBy: [],
          measures: [
            { name: 'invalid', column: 'mean_hours', operator: 'avg' },
          ],
        })
      ).failure.messageKey,
    ).toBe('ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY')
  })
  it('coalesces concurrent equal loads and rechecks authorization after a native query', async () => {
    const f = await fixture()
    f.fetch.mockResolvedValue(
      Either.success({
        dataset: manifest,
        rows: [{ id: 1, team: 'A', hours: 2 }],
        fetchedAt: '2026-11-09T00:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'entries' },
          coverage: 'complete',
        },
      }),
    )
    const [first, second] = await Promise.all([f.load(), f.load()])
    expect(first.isSuccess()).toBe(true)
    expect(second.success.publication.generationId).toBe(
      first.success.publication.generationId,
    )
    expect(f.fetch).toHaveBeenCalledTimes(1)
    const native = f.engine.query.bind(f.engine)
    vi.spyOn(f.engine, 'query').mockImplementation(
      async (input, authorizations) => {
        const result = await native(input, authorizations)
        f.setKey('changed-after-native-read')
        return result
      },
    )
    const queried = await f.query(first.success.publication.selectionKey)
    expect(queried.failure.messageKey).toBe('ANALYTICS_AUTHORIZATION_CHANGED')
  })
  it('releases failed staging even when normal query admission is saturated', async () => {
    const f = await fixture()
    f.fetch.mockResolvedValue(
      Either.success({
        dataset: manifest,
        rows: [{ id: 1, team: 'A', hours: 2 }],
        fetchedAt: '2026-11-09T00:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'entries' },
          coverage: 'complete',
        },
      }),
    )
    const published = await f.load()
    expect(published.isSuccess()).toBe(true)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let cleanupReached = () => {}
    const cleanup = new Promise<void>((resolve) => {
      cleanupReached = resolve
    })
    const remove = f.engine.remove.bind(f.engine)
    vi.spyOn(f.engine, 'remove').mockImplementation((generation) => {
      const result = remove(generation)
      cleanupReached()
      return result
    })
    const queued: Promise<void>[] = []
    const queue = f.engine as unknown as {
      execute: (
        workspaceId: string,
        operation: () => Promise<Either<AppError, void>>,
      ) => Promise<Either<AppError, void>>
    }
    const input: AnalyticsQueryInput = {
      workspaceId: 'workspace',
      nodes: [
        {
          id: 'source',
          kind: 'source',
          connectionInstanceId: 'connection',
          selectionKey: published.success.publication.selectionKey,
        },
      ],
      targetNodeId: 'source',
      offset: 0,
      limit: 1,
    }
    f.fetch.mockImplementation(async (request) => {
      if (request.execution?.cursor === undefined)
        return Either.success(
          page(
            0,
            [
              { id: 2, team: 'A', hours: 3 },
              { id: 3, team: 'B', hours: 4 },
            ],
            'next',
          ),
        )
      queued.push(
        queue
          .execute('workspace', async () => {
            await gate
            return Either.success(undefined)
          })
          .then((result) => {
            expect(result.isSuccess()).toBe(true)
          }),
      )
      for (let index = 0; index < 31; index += 1)
        queued.push(
          f.engine
            .query(input, [
              {
                connectionInstanceId: 'connection',
                authorizationKey: 'authorization',
              },
            ])
            .then((result) => {
              expect(result.isSuccess()).toBe(true)
            }),
        )
      return Either.success(
        page(1, [
          { id: 4, team: 'A', hours: 5 },
          { id: 5, team: 'B', hours: 6 },
        ]),
      )
    })
    const loading = f.load()
    await cleanup
    release()
    expect((await loading).isFailure()).toBe(true)
    await Promise.all(queued)
    for (let index = 0; index < 8; index += 1) {
      const generation = await f.engine.create(
        {
          workspaceId: 'workspace',
          connectionInstanceId: 'connection',
          authorizationKey: 'authorization',
          selectionKey: `available-${index}`,
        },
        manifest,
        { datasetId: 'entries' },
      )
      expect(generation.isSuccess(), JSON.stringify(generation)).toBe(true)
    }
  })
})
