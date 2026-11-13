import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DuckDBInstance } from '@duckdb/node-api'
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
import type {
  AnalyticsLoadProgressEvent,
  AnalyticsStorageErrorEvent,
  AnalyticsStorageResetEvent,
  ISystemEventEmitter,
  ISystemEvents,
} from '@mr-tick/shared/transport'
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
  vi.useRealTimers()

  for (const engine of engines) await engine.close()
  engines.length = 0
})

async function fixture(customManifest: AnalyticsDatasetManifest = manifest) {
  const directory = await mkdtemp(join(tmpdir(), 'metric-warehouse-service-'))
  const engine = new DuckDBAnalyticsEngine(directory)
  engines.push(engine)

  const progressEvents: AnalyticsLoadProgressEvent[] = []
  const storageErrors: AnalyticsStorageErrorEvent[] = []
  const storageResets: AnalyticsStorageResetEvent[] = []
  const emitter: ISystemEventEmitter = {
    emit<K extends keyof ISystemEvents>(event: K, payload: ISystemEvents[K]) {
      if (event === 'analytics:load-progress')
        progressEvents.push(payload as AnalyticsLoadProgressEvent)
      if (event === 'analytics:storage-error')
        storageErrors.push(payload as AnalyticsStorageErrorEvent)
      if (event === 'analytics:storage-reset')
        storageResets.push(payload as AnalyticsStorageResetEvent)
    },
  }

  let currentManifest = customManifest
  const fetch =
    vi.fn<
      (
        query: AnalyticsDatasetQueryInput,
      ) => Promise<Either<AppError, AnalyticsDatasetResult>>
    >()
  const provider: IAnalyticsProvider = {
    listAnalyticsDatasets: async () => Either.success([currentManifest]),
    fetchAnalyticsDataset: fetch,
    getFilterOptions: async () => Either.success([]),
  }

  const secondaryFetch =
    vi.fn<
      (
        query: AnalyticsDatasetQueryInput,
      ) => Promise<Either<AppError, AnalyticsDatasetResult>>
    >()
  const secondaryProvider: IAnalyticsProvider = {
    listAnalyticsDatasets: async () => Either.success([currentManifest]),
    fetchAnalyticsDataset: secondaryFetch,
    getFilterOptions: async () => Either.success([]),
  }

  let key = 'authorization'
  const secondaryKey = 'authorization-secondary'
  const resolveSpy = vi.fn<IAnalyticsResolver['resolve']>(
    async (workspaceId: string, connectionInstanceId: string) => {
      void workspaceId
      if (connectionInstanceId === 'secondary')
        return Either.success({
          provider: secondaryProvider,
          authorizationKey: secondaryKey,
        })

      return Either.success({ provider, authorizationKey: key })
    },
  )

  const resolver: IAnalyticsResolver = {
    resolve: resolveSpy,
    resolveWorkspaceAuthorizations: async () =>
      Either.success([
        { connectionInstanceId: 'connection', authorizationKey: key },
        { connectionInstanceId: 'secondary', authorizationKey: secondaryKey },
      ]),
  }

  const service = new AnalyticsWarehouseService(resolver, engine, emitter)
  const load = (extra?: Partial<AnalyticsDatasetQueryInput>) =>
    service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: currentManifest.id, ...extra },
    })
  const query = (
    selectionKey: string,
    extra: Partial<AnalyticsQueryInput> = {},
    connectionInstanceId = 'connection',
  ) =>
    service.query({
      workspaceId: 'workspace',
      nodes: [
        {
          id: 'source',
          kind: 'source',
          connectionInstanceId,
          selectionKey,
        },
      ],
      targetNodeId: 'source',
      offset: 0,
      limit: 100,
      ...extra,
    })

  return {
    directory,
    engine,
    provider,
    secondaryProvider,
    secondaryFetch,
    fetch,
    emitter,
    progressEvents,
    storageErrors,
    storageResets,
    resolveSpy,
    resolver,
    service,
    load,
    query,
    setKey: (value: string) => {
      key = value
    },
    setManifest: (next: AnalyticsDatasetManifest) => {
      currentManifest = next
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
  it('rechecks hydration authorization after native reads and excludes rotated connections', async () => {
    const f = await fixture()
    f.fetch.mockResolvedValue(
      Either.success(
        page(
          0,
          [1, 2, 3, 4].map((id) => ({ id, team: 'A', hours: 2 })),
        ),
      ),
    )
    expect((await f.load()).isSuccess()).toBe(true)
    const read = f.engine.listPublications.bind(f.engine)
    let entered = () => {}
    let release = () => {}
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(f.engine, 'listPublications').mockImplementationOnce(
      async (...args) => {
        const result = await read(...args)
        entered()
        await gate
        return result
      },
    )
    const pending = f.service.hydrate({ workspaceId: 'workspace' })
    await started
    f.setKey('rotated')
    release()
    const hydrated = await pending
    expect(hydrated.isSuccess()).toBe(true)
    expect(hydrated.success.publications).toEqual([])
  })

  it('reports only the rejected connection in a multi-source query authorization error', async () => {
    const f = await fixture()
    f.resolveSpy.mockImplementation(async (workspaceId, connectionId) => {
      void workspaceId
      if (connectionId === 'connection')
        return Either.failure(
          AppError.Http(403, 'DENIED_A', { permission: ['read'] }),
        )
      return Either.success({
        provider: f.secondaryProvider,
        authorizationKey: 'secondary-key',
      })
    })
    const result = await f.service.query({
      workspaceId: 'workspace',
      targetNodeId: 'join',
      offset: 0,
      limit: 100,
      nodes: [
        {
          kind: 'source',
          id: 'a',
          connectionInstanceId: 'connection',
          selectionKey: 'a',
        },
        {
          kind: 'source',
          id: 'b',
          connectionInstanceId: 'secondary',
          selectionKey: 'b',
        },
        {
          kind: 'join',
          id: 'join',
          upstreamNodeIds: ['a', 'b'],
          joinConfig: { joinType: 'union', leftKey: '', rightKey: '' },
        },
      ],
    })
    expect(result.isFailure()).toBe(true)
    expect(result.failure.details).toEqual({
      permission: ['read'],
      connectionInstanceIds: ['connection'],
    })
  })

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

  it('strips windowRescan and changes descriptors when storing declared remote aggregates', async () => {
    const f = await fixture()
    const hybridManifest: AnalyticsDatasetManifest = {
      id: 'entries',
      name: 'Entries',
      description: 'Hybrid dataset with windowRescan, changes and aggregate',
      endpoint: '/entries',
      sourceFormat: 'json',
      selection: { dateRange: true, project: true },
      columns: [
        { name: 'id', label: 'ID', type: 'number' },
        { name: 'team', label: 'Team', type: 'string' },
        { name: 'date', label: 'Date', type: 'date' },
        { name: 'hours', label: 'Hours', type: 'number' },
      ],
      extraction: {
        modes: ['snapshot', 'changes', 'aggregate'],
        identity: { kind: 'row', columns: ['id'] },
        changes: { deletions: 'explicit' },
        windowRescan: { dateColumn: 'date' },
        aggregation: {
          groupByColumns: ['team'],
          operators: ['sum'],
          postProcessing: 'projection-only',
        },
      },
    }
    f.provider.listAnalyticsDatasets = async () =>
      Either.success([hybridManifest])

    const aggregateDataset: AnalyticsDatasetManifest = {
      ...hybridManifest,
      columns: [
        { name: 'team', label: 'Team', type: 'string' },
        { name: 'hours_sum', label: 'hours_sum', type: 'number' },
      ],
    }

    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: aggregateDataset,
        rows: [{ team: 'A', hours_sum: 9 }],
        fetchedAt: '2026-11-10T09:00:00Z',
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
          measures: [{ name: 'hours_sum', column: 'hours', operator: 'sum' }],
        },
      },
    })

    expect(loaded.isSuccess(), JSON.stringify(loaded)).toBe(true)
    expect(loaded.success.publication.remoteAggregate).toBe(true)
    expect(loaded.success.publication.manifest.extraction).toEqual({
      modes: ['aggregate'],
      identity: { kind: 'scope' },
      aggregation: hybridManifest.extraction.aggregation,
    })
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

describe('Phase 3 Dual-Cadence Orchestrator, Hydration & Resilience [F4-01]', () => {
  const changesManifest: AnalyticsDatasetManifest = {
    id: 'issues',
    name: 'Issues',
    description: 'Incremental test dataset',
    endpoint: '/issues',
    sourceFormat: 'json',
    selection: { dateRange: true, project: true },
    columns: [
      { name: 'id', label: 'ID', type: 'number' },
      { name: 'title', label: 'Title', type: 'string' },
      { name: 'status', label: 'Status', type: 'string' },
      { name: 'updated_date', label: 'Updated', type: 'date' },
    ],
    extraction: {
      modes: ['snapshot', 'changes'],
      identity: { kind: 'row', columns: ['id'] },
      changes: { deletions: 'explicit' },
    },
  }

  const windowManifest: AnalyticsDatasetManifest = {
    id: 'entries',
    name: 'Entries',
    description: 'Window rescan test dataset',
    endpoint: '/entries',
    sourceFormat: 'json',
    selection: { dateRange: true, project: true },
    columns: [
      { name: 'id', label: 'ID', type: 'number' },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'hours', label: 'Hours', type: 'number' },
      { name: 'note', label: 'Note', type: 'string' },
    ],
    extraction: {
      modes: ['snapshot'],
      identity: { kind: 'row', columns: ['id'] },
      windowRescan: { dateColumn: 'date' },
    },
  }

  it('persists server checkpoint from snapshot, runs incremental changes upsert/delete and preserves generation on empty delta', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T10:00:00Z'))

    const f = await fixture(changesManifest)
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: changesManifest,
        rows: [
          {
            id: 1,
            title: 'Issue 1',
            status: 'Open',
            updated_date: '2026-11-10T09:00:00Z',
          },
          {
            id: 2,
            title: 'Issue 2',
            status: 'Open',
            updated_date: '2026-11-10T09:30:00Z',
          },
        ],
        fetchedAt: '2026-11-10T10:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'issues' },
          coverage: 'complete',
          checkpoint: '2026-11-10T09:30:00Z',
        },
      }),
    )

    const initial = await f.load()
    expect(initial.isSuccess()).toBe(true)
    expect(initial.success.strategy).toBe('full_replace')
    expect(initial.success.syncState.checkpoint).toBe('2026-11-10T09:30:00Z')
    const initialGen = initial.success.publication.generationId
    const fullReconcileAt = initial.success.syncState.lastFullReconcileAt

    // Multi-page changes delta with timestamp tie, latest-wins row replacement and deletion
    vi.setSystemTime(new Date('2026-11-10T10:05:00Z'))
    f.fetch
      .mockResolvedValueOnce(
        Either.success({
          dataset: changesManifest,
          rows: [
            {
              id: 2,
              title: 'Issue 2 step 1',
              status: 'In Progress',
              updated_date: '2026-11-10T10:01:00Z',
            },
          ],
          fetchedAt: '2026-11-10T10:05:00Z',
          execution: {
            kind: 'changes',
            scope: { datasetId: 'issues' },
            checkpoint: '2026-11-10T10:01:00Z',
            deletedIds: [],
            coverage: 'partial',
            continuation: { cursor: 'p2' },
          },
        }),
      )
      .mockResolvedValueOnce(
        Either.success({
          dataset: changesManifest,
          rows: [
            {
              id: 2,
              title: 'Issue 2 final',
              status: 'Done',
              updated_date: '2026-11-10T10:04:00Z',
            },
            {
              id: 3,
              title: 'Issue 3',
              status: 'Open',
              updated_date: '2026-11-10T10:04:00Z',
            },
          ],
          fetchedAt: '2026-11-10T10:05:00Z',
          execution: {
            kind: 'changes',
            scope: { datasetId: 'issues' },
            checkpoint: '2026-11-10T10:04:00Z',
            deletedIds: ['1'],
            coverage: 'complete',
          },
        }),
      )

    const delta = await f.load()
    expect(delta.isSuccess(), JSON.stringify(delta)).toBe(true)
    expect(delta.success.strategy).toBe('incremental_changes')
    expect(delta.success.publication.generationId).not.toBe(initialGen)
    expect(delta.success.syncState.checkpoint).toBe('2026-11-10T10:04:00Z')
    expect(delta.success.syncState.lastFullReconcileAt).toBe(fullReconcileAt)
    expect(f.fetch.mock.calls[1]?.[0].execution).toEqual({
      kind: 'changes',
      checkpoint: '2026-11-10T09:30:00Z',
      cursor: undefined,
    })

    const queried = await f.query(delta.success.publication.selectionKey)
    expect(queried.success.rows).toEqual([
      {
        id: 2,
        title: 'Issue 2 final',
        status: 'Done',
        updated_date: '2026-11-10T10:04:00Z',
      },
      {
        id: 3,
        title: 'Issue 3',
        status: 'Open',
        updated_date: '2026-11-10T10:04:00Z',
      },
    ])

    // Empty delta keeps generationId identical and updates lastFastSyncAt
    vi.setSystemTime(new Date('2026-11-10T10:10:00Z'))
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: changesManifest,
        rows: [],
        fetchedAt: '2026-11-10T10:10:00Z',
        execution: {
          kind: 'changes',
          scope: { datasetId: 'issues' },
          checkpoint: '2026-11-10T10:04:00Z',
          deletedIds: [],
          coverage: 'complete',
        },
      }),
    )

    const noopDelta = await f.load()
    expect(noopDelta.isSuccess()).toBe(true)
    expect(noopDelta.success.publication.generationId).toBe(
      delta.success.publication.generationId,
    )
    expect(noopDelta.success.syncState.lastFastSyncAt).toBe(
      '2026-11-10T10:10:00.000Z',
    )
    expect(noopDelta.success.syncState.lastFullReconcileAt).toBe(
      fullReconcileAt,
    )
  })

  it('keeps running full_replace when initial 0-row snapshot omits checkpoint until server rows establish one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T10:00:00Z'))

    const f = await fixture(changesManifest)
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: changesManifest,
        rows: [],
        fetchedAt: '2026-11-10T10:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'issues' },
          coverage: 'complete',
        },
      }),
    )

    const first = await f.load()
    expect(first.isSuccess()).toBe(true)
    expect(first.success.syncState.checkpoint).toBeUndefined()

    vi.setSystemTime(new Date('2026-11-10T10:05:00Z'))
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: changesManifest,
        rows: [
          {
            id: 10,
            title: 'First issue',
            status: 'New',
            updated_date: '2026-11-10T10:02:00Z',
          },
        ],
        fetchedAt: '2026-11-10T10:05:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'issues' },
          coverage: 'complete',
          checkpoint: '2026-11-10T10:02:00Z',
        },
      }),
    )

    const second = await f.load()
    expect(second.isSuccess()).toBe(true)
    expect(second.success.strategy).toBe('full_replace')
    expect(second.success.syncState.checkpoint).toBe('2026-11-10T10:02:00Z')
    expect(f.fetch.mock.calls[1]?.[0].execution?.kind).toBe('snapshot')
  })

  it('executes rolling 14-day window_rescan preserving earlier history and performs zero-HTTP no-op on closed past windows', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))

    const f = await fixture(windowManifest)
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [
          { id: 1, date: '2026-10-10', hours: 4, note: 'Historical old' },
          { id: 2, date: '2026-10-15', hours: 5, note: 'Move into window' },
          { id: 3, date: '2026-11-05', hours: 2, note: 'In window old' },
          { id: 4, date: '2026-11-08', hours: 1, note: 'Deleted remotely' },
        ],
        fetchedAt: '2026-11-10T12:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-10-01',
            endDate: '2026-11-10',
          },
          coverage: 'complete',
        },
      }),
    )

    const initial = await f.load({
      startDate: '2026-10-01',
      endDate: '2026-11-10',
    })
    expect(initial.isSuccess()).toBe(true)
    const fullAt = initial.success.syncState.lastFullReconcileAt

    // Fast/auto cycle inside 6h triggers window_rescan [2026-10-28, 2026-11-10]
    vi.setSystemTime(new Date('2026-11-10T12:05:00Z'))
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [
          { id: 2, date: '2026-11-02', hours: 6, note: 'Moved into window' },
          { id: 3, date: '2026-11-05', hours: 3.5, note: 'Updated in window' },
          { id: 5, date: '2026-11-10', hours: 8, note: 'New today' },
        ],
        fetchedAt: '2026-11-10T12:05:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-10-28',
            endDate: '2026-11-10',
          },
          coverage: 'complete',
        },
      }),
    )

    const rescan = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: {
        datasetId: 'entries',
        startDate: '2026-10-01',
        endDate: '2026-11-10',
      },
      policy: { mode: 'auto', rollingWindowDays: 14 },
    })

    expect(rescan.isSuccess(), JSON.stringify(rescan)).toBe(true)
    expect(rescan.success.strategy).toBe('window_rescan')
    expect(rescan.success.syncState.lastWindowStart).toBe('2026-10-28')
    expect(rescan.success.syncState.lastWindowEnd).toBe('2026-11-10')
    expect(rescan.success.syncState.lastFullReconcileAt).toBe(fullAt)

    const rows = (await f.query(rescan.success.publication.selectionKey))
      .success.rows
    expect(rows).toEqual([
      { id: 1, date: '2026-10-10', hours: 4, note: 'Historical old' },
      { id: 2, date: '2026-11-02', hours: 6, note: 'Moved into window' },
      { id: 3, date: '2026-11-05', hours: 3.5, note: 'Updated in window' },
      { id: 5, date: '2026-11-10', hours: 8, note: 'New today' },
    ])

    // Closed historical range (August in November) performs 0-HTTP no-op during fast cycle
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [{ id: 90, date: '2026-08-10', hours: 7, note: 'August' }],
        fetchedAt: '2026-11-10T12:05:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-08-01',
            endDate: '2026-08-31',
          },
          coverage: 'complete',
        },
      }),
    )

    const augInit = await f.load({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    })
    expect(augInit.isSuccess()).toBe(true)

    const fetchCallsBefore = f.fetch.mock.calls.length
    const augFast = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: {
        datasetId: 'entries',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      },
      policy: { mode: 'auto' },
    })

    expect(augFast.isSuccess()).toBe(true)
    expect(augFast.success.reused).toBe(true)
    expect(augFast.success.strategy).toBe('window_rescan')
    expect(f.fetch).toHaveBeenCalledTimes(fetchCallsBefore)

    // When fullReconcileIntervalMinutes expires, auto promotes back to full_replace
    vi.setSystemTime(new Date('2026-11-10T19:00:00Z'))
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [{ id: 1, date: '2026-10-10', hours: 4, note: 'Reconciled' }],
        fetchedAt: '2026-11-10T19:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-10-01',
            endDate: '2026-11-10',
          },
          coverage: 'complete',
        },
      }),
    )

    const reconciled = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: {
        datasetId: 'entries',
        startDate: '2026-10-01',
        endDate: '2026-11-10',
      },
      policy: { mode: 'auto', fullReconcileIntervalMinutes: 360 },
    })
    expect(reconciled.isSuccess()).toBe(true)
    expect(reconciled.success.strategy).toBe('full_replace')
    expect(reconciled.success.syncState.lastFullReconcileAt).toBe(
      '2026-11-10T19:00:00.000Z',
    )
    expect(
      (await f.query(reconciled.success.publication.selectionKey)).success.rows,
    ).toEqual([{ id: 1, date: '2026-10-10', hours: 4, note: 'Reconciled' }])
  })

  it('reconciles recent history without replacing older rows or advancing the full clock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
    const f = await fixture(windowManifest)
    const older = { id: 1, date: '2026-08-20', hours: 3, note: 'Older' }
    const recent = { id: 2, date: '2026-09-26', hours: 4, note: 'Recent' }
    const movedMonth = { id: 3, date: '2026-09-15', hours: 2, note: 'Move' }
    const deletedRecent = { id: 4, date: '2026-10-05', hours: 1, note: 'Gone' }
    const endDate = '2026-11-10'
    const respond = (
      startDate: string,
      targetEndDate: string,
      rows: (typeof recent)[],
    ) =>
      f.fetch.mockResolvedValueOnce(
        Either.success({
          dataset: windowManifest,
          rows,
          fetchedAt: new Date().toISOString(),
          execution: {
            kind: 'snapshot',
            scope: { datasetId: 'entries', startDate, endDate: targetEndDate },
            coverage: 'complete',
          },
        }),
      )

    const selection = { startDate: '2026-08-01', endDate }
    respond(selection.startDate, endDate, [
      older,
      recent,
      movedMonth,
      deletedRecent,
    ])
    const initial = await f.load(selection)
    expect(initial.isSuccess()).toBe(true)

    // Simulate app closed for > 6 hours and reopened
    vi.setSystemTime(new Date('2026-11-10T19:00:00Z'))
    const reopened = new AnalyticsWarehouseService(
      f.resolver,
      f.engine,
      f.emitter,
    )
    const hydrated = await reopened.hydrate({ workspaceId: 'workspace' })
    expect(hydrated.isSuccess()).toBe(true)
    expect(hydrated.success.publications).toHaveLength(1)
    expect(hydrated.success.publications.at(0)?.syncState).toMatchObject({
      lastFullReconcileAt: '2026-11-10T12:00:00.000Z',
    })

    respond('2026-09-01', endDate, [
      { ...recent, hours: 7 },
      { ...movedMonth, date: '2026-10-20', hours: 5 },
    ])

    const reconciled = await reopened.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'entries', ...selection },
    })
    expect(reconciled.isSuccess()).toBe(true)
    expect(reconciled.success.syncState).toMatchObject({
      lastFullReconcileAt: initial.success.syncState.lastFullReconcileAt,
      lastRecentReconcileAt: '2026-11-10T19:00:00.000Z',
      lastRecentStart: '2026-09-01',
      lastRecentEnd: endDate,
    })
    expect(
      (await f.query(reconciled.success.publication.selectionKey)).success.rows,
    ).toEqual([
      older,
      { ...recent, hours: 7 },
      { ...movedMonth, date: '2026-10-20', hours: 5 },
    ])

    // Subsequent fast 14-day rescan preserves the recent reconciliation watermark
    vi.setSystemTime(new Date('2026-11-10T19:05:00Z'))
    respond('2026-10-28', endDate, [
      { id: 5, date: '2026-11-09', hours: 6, note: 'Fast' },
    ])
    const fastAfterRecent = await reopened.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'entries', ...selection },
    })
    expect(fastAfterRecent.isSuccess()).toBe(true)
    expect(fastAfterRecent.success.syncState).toMatchObject({
      lastFullReconcileAt: initial.success.syncState.lastFullReconcileAt,
      lastRecentReconcileAt: '2026-11-10T19:00:00.000Z',
      lastRecentStart: '2026-09-01',
      lastRecentEnd: endDate,
      lastWindowStart: '2026-10-28',
      lastWindowEnd: endDate,
    })
  })

  it('completes one final reconciliation when a month exits the recent range and allows manual historical refresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-30T20:00:00Z'))
    const f = await fixture(windowManifest)
    const selection = { startDate: '2026-09-01', endDate: '2026-09-30' }

    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [{ id: 10, date: '2026-09-12', hours: 4, note: 'Sep initial' }],
        fetchedAt: '2026-11-30T20:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'entries', ...selection },
          coverage: 'complete',
        },
      }),
    )
    const initial = await f.load(selection)
    expect(initial.isSuccess()).toBe(true)

    // Turn of the month into December (recent horizon is now Oct-Dec, Sep just exited)
    vi.setSystemTime(new Date('2026-12-01T03:00:00Z'))
    f.fetch.mockResolvedValueOnce(
      Either.failure(AppError.Http(503, 'TEMPORARY_EXIT_FAILURE')),
    )
    const failedExit = await f.load(selection)
    expect(failedExit.isFailure()).toBe(true)

    // Pending exit reconciliation remains eligible on retry in December
    vi.setSystemTime(new Date('2026-12-01T03:10:00Z'))
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [
          { id: 10, date: '2026-09-12', hours: 8, note: 'Sep final exit' },
        ],
        fetchedAt: '2026-12-01T03:10:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'entries', ...selection },
          coverage: 'complete',
        },
      }),
    )
    const completedExit = await f.load(selection)
    expect(completedExit.isSuccess()).toBe(true)
    expect(completedExit.success.reused).toBeUndefined()
    expect(completedExit.success.syncState).toMatchObject({
      lastRecentReconcileAt: '2026-12-01T03:10:00.000Z',
      lastRecentStart: '2026-09-01',
      lastRecentEnd: '2026-09-30',
    })

    // Next 6h automatic cycle in December performs 0-HTTP no-op for exited historical month
    vi.setSystemTime(new Date('2026-12-01T10:00:00Z'))
    const callsBeforeNoOp = f.fetch.mock.calls.length
    const postExitAuto = await f.load(selection)
    expect(postExitAuto.isSuccess()).toBe(true)
    expect(postExitAuto.success.reused).toBe(true)
    expect(f.fetch).toHaveBeenCalledTimes(callsBeforeNoOp)

    // Manual full refresh still reconciles historical period on demand
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [{ id: 10, date: '2026-09-12', hours: 9, note: 'Sep manual' }],
        fetchedAt: '2026-12-01T10:05:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'entries', ...selection },
          coverage: 'complete',
        },
      }),
    )
    const manualHistorical = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'entries', ...selection },
      policy: { mode: 'full' },
    })
    expect(manualHistorical.isSuccess()).toBe(true)
    expect(manualHistorical.success.strategy).toBe('full_replace')
    expect(
      (await f.query(manualHistorical.success.publication.selectionKey)).success
        .rows,
    ).toEqual([{ id: 10, date: '2026-09-12', hours: 9, note: 'Sep manual' }])
  })

  it('queues manual full load strictly behind an in-flight fast load without losing manual reconcile', async () => {
    const f = await fixture(changesManifest)
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: changesManifest,
        rows: [
          {
            id: 1,
            title: 'Init',
            status: 'Open',
            updated_date: '2026-11-10T09:00:00Z',
          },
        ],
        fetchedAt: '2026-11-10T09:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'issues' },
          coverage: 'complete',
          checkpoint: '2026-11-10T09:00:00Z',
        },
      }),
    )
    await f.load()

    let fastEntered = () => {}
    const waitFastEntered = new Promise<void>((resolve) => {
      fastEntered = resolve
    })
    let releaseFast = () => {}
    const fastGate = new Promise<void>((resolve) => {
      releaseFast = resolve
    })

    const executionSequence: string[] = []
    f.fetch.mockImplementation(async (request) => {
      if (request.execution?.kind === 'changes') {
        executionSequence.push('changes-start')
        fastEntered()
        await fastGate
        executionSequence.push('changes-end')
        return Either.success({
          dataset: changesManifest,
          rows: [
            {
              id: 2,
              title: 'Delta',
              status: 'Open',
              updated_date: '2026-11-10T10:00:00Z',
            },
          ],
          fetchedAt: '2026-11-10T10:00:00Z',
          execution: {
            kind: 'changes',
            scope: { datasetId: 'issues' },
            checkpoint: '2026-11-10T10:00:00Z',
            deletedIds: [],
            coverage: 'complete',
          },
        })
      }

      executionSequence.push('full')
      return Either.success({
        dataset: changesManifest,
        rows: [
          {
            id: 2,
            title: 'Reconciled After Delta',
            status: 'Done',
            updated_date: '2026-11-10T10:01:00Z',
          },
        ],
        fetchedAt: '2026-11-10T10:01:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'issues' },
          coverage: 'complete',
          checkpoint: '2026-11-10T10:01:00Z',
        },
      })
    })

    const fastPromise = f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'issues' },
      policy: { mode: 'fast' },
    })
    await waitFastEntered

    const manualFullPromise = f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'issues' },
      policy: { mode: 'full' },
    })

    expect(executionSequence).toEqual(['changes-start'])
    releaseFast()

    const [fastRes, fullRes] = await Promise.all([
      fastPromise,
      manualFullPromise,
    ])
    expect(fastRes.isSuccess()).toBe(true)
    expect(fullRes.isSuccess()).toBe(true)
    expect(executionSequence).toEqual(['changes-start', 'changes-end', 'full'])
    expect(
      (await f.query(fullRes.success.publication.selectionKey)).success.rows,
    ).toEqual([
      {
        id: 2,
        title: 'Reconciled After Delta',
        status: 'Done',
        updated_date: '2026-11-10T10:01:00Z',
      },
    ])
  })

  it('auto-promotes once to full when base-vs-delta schema drifts incompatibly while keeping mid-load schema drift failing', async () => {
    const f = await fixture(changesManifest)
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: changesManifest,
        rows: [
          {
            id: 1,
            title: 'Init',
            status: 'Open',
            updated_date: '2026-11-10T09:00:00Z',
          },
        ],
        fetchedAt: '2026-11-10T09:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'issues' },
          coverage: 'complete',
          checkpoint: '2026-11-10T09:00:00Z',
        },
      }),
    )
    await f.load()

    const driftedManifest: AnalyticsDatasetManifest = {
      ...changesManifest,
      columns: [
        { name: 'id', label: 'ID', type: 'number' },
        { name: 'title', label: 'Title', type: 'string' },
        { name: 'status', label: 'Status', type: 'number' },
        { name: 'updated_date', label: 'Updated', type: 'date' },
      ],
    }
    f.setManifest(driftedManifest)

    f.fetch
      .mockResolvedValueOnce(
        Either.success({
          dataset: driftedManifest,
          rows: [
            {
              id: 2,
              title: 'Drifted delta',
              status: 42,
              updated_date: '2026-11-10T10:00:00Z',
            },
          ],
          fetchedAt: '2026-11-10T10:00:00Z',
          execution: {
            kind: 'changes',
            scope: { datasetId: 'issues' },
            checkpoint: '2026-11-10T10:00:00Z',
            deletedIds: [],
            coverage: 'complete',
          },
        }),
      )
      .mockResolvedValueOnce(
        Either.success({
          dataset: driftedManifest,
          rows: [
            {
              id: 1,
              title: 'Rebuilt 1',
              status: 10,
              updated_date: '2026-11-10T09:00:00Z',
            },
            {
              id: 2,
              title: 'Rebuilt 2',
              status: 42,
              updated_date: '2026-11-10T10:00:00Z',
            },
          ],
          fetchedAt: '2026-11-10T10:01:00Z',
          execution: {
            kind: 'snapshot',
            scope: { datasetId: 'issues' },
            coverage: 'complete',
            checkpoint: '2026-11-10T10:00:00Z',
          },
        }),
      )

    const promoted = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'issues' },
      policy: { mode: 'fast' },
    })
    expect(promoted.isSuccess(), JSON.stringify(promoted)).toBe(true)
    expect(promoted.success.strategy).toBe('full_replace')
    expect(promoted.success.publication.rowCount).toBe(2)

    // Mid-extraction schema change inside a multi-page full load must still fail immediately
    const midLoadDriftManifest: AnalyticsDatasetManifest = {
      ...driftedManifest,
      columns: [
        { name: 'id', label: 'ID', type: 'number' },
        { name: 'title', label: 'Title', type: 'string' },
        { name: 'status', label: 'Status', type: 'boolean' },
        { name: 'updated_date', label: 'Updated', type: 'date' },
      ],
    }

    f.fetch
      .mockResolvedValueOnce(
        Either.success({
          dataset: driftedManifest,
          rows: [
            {
              id: 3,
              title: 'Page 1',
              status: 1,
              updated_date: '2026-11-10T10:05:00Z',
            },
          ],
          fetchedAt: '2026-11-10T10:06:00Z',
          execution: {
            kind: 'snapshot',
            scope: { datasetId: 'issues' },
            coverage: 'partial',
            continuation: { cursor: 'p2' },
          },
        }),
      )
      .mockResolvedValueOnce(
        Either.success({
          dataset: midLoadDriftManifest,
          rows: [
            {
              id: 4,
              title: 'Page 2',
              status: true,
              updated_date: '2026-11-10T10:06:00Z',
            },
          ],
          fetchedAt: '2026-11-10T10:06:00Z',
          execution: {
            kind: 'snapshot',
            scope: { datasetId: 'issues' },
            coverage: 'unverified',
          },
        }),
      )

    const midLoadFailed = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'issues' },
      policy: { mode: 'full' },
    })
    expect(midLoadFailed.isFailure()).toBe(true)
    expect(midLoadFailed.failure.messageKey).toBe(
      'ANALYTICS_SCHEMA_CHANGED_DURING_LOAD',
    )
  })

  it('records non-destructive errors, isolates 401/403 per connection, emits progress events and hydrates offline', async () => {
    const f = await fixture(changesManifest)
    const primaryBatch = {
      dataset: changesManifest,
      rows: [
        {
          id: 1,
          title: 'Primary',
          status: 'Open',
          updated_date: '2026-11-10T09:00:00Z',
        },
      ],
      fetchedAt: '2026-11-10T09:00:00Z',
      execution: {
        kind: 'snapshot' as const,
        scope: { datasetId: 'issues' },
        coverage: 'complete' as const,
        batch: { index: 0, offset: 0, finished: true, totalRows: 1 },
        checkpoint: '2026-11-10T09:00:00Z',
      },
    }

    f.fetch.mockResolvedValueOnce(Either.success(primaryBatch))
    f.secondaryFetch.mockResolvedValueOnce(
      Either.success({
        ...primaryBatch,
        rows: [
          {
            id: 2,
            title: 'Secondary',
            status: 'Open',
            updated_date: '2026-11-10T09:00:00Z',
          },
        ],
      }),
    )

    const loadedPrimary = await f.load()
    const loadedSecondary = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'secondary',
      query: { datasetId: 'issues' },
    })
    expect(loadedPrimary.isSuccess()).toBe(true)
    expect(loadedSecondary.isSuccess()).toBe(true)

    expect(
      f.progressEvents
        .filter((e) => e.connectionInstanceId === 'connection')
        .map((e) => e.phase),
    ).toEqual(['extracting', 'publishing', 'completed'])

    // Transient failure preserves publication and sets syncState.lastError
    f.fetch.mockResolvedValueOnce(
      Either.failure(AppError.Http(503, 'UPSTREAM_DOWN')),
    )
    const transientFail = await f.load()
    expect(transientFail.isFailure()).toBe(true)

    // Save workspace settings and verify offline hydration (zero provider resolution calls!)
    const savedSettings = await f.service.saveWorkspaceState({
      workspaceId: 'workspace',
      pollingIntervalMinutes: 15,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      spacesJson: JSON.stringify([{ id: 'space-1', name: 'Board' }]),
    })
    expect(savedSettings.isSuccess()).toBe(true)

    f.resolveSpy.mockClear()
    const hydrated = await f.service.hydrate({ workspaceId: 'workspace' })
    expect(hydrated.isSuccess()).toBe(true)
    expect(f.resolveSpy).not.toHaveBeenCalled()
    expect(hydrated.success.settings?.pollingIntervalMinutes).toBe(15)
    expect(hydrated.success.publications).toHaveLength(2)

    const primaryEntry = hydrated.success.publications.find(
      (item) => item.publication.connectionInstanceId === 'connection',
    )
    expect(primaryEntry?.syncState.lastError).toBe('UPSTREAM_DOWN')
    expect(primaryEntry?.publication.rowCount).toBe(1)

    // 401 on primary revokes only primary connection, leaving secondary valid
    f.fetch.mockResolvedValueOnce(
      Either.failure(AppError.Unauthorized('REDMINE_API_KEY_INVALID')),
    )
    const authFail = await f.load()
    expect(authFail.isFailure()).toBe(true)
    expect(f.progressEvents.at(-1)?.phase).toBe('failed')

    const afterRevoke = await f.service.hydrate({ workspaceId: 'workspace' })
    expect(afterRevoke.isSuccess()).toBe(true)
    expect(
      afterRevoke.success.publications.map(
        (item) => item.publication.connectionInstanceId,
      ),
    ).toEqual(['secondary'])
    expect(
      (
        await f.query(
          loadedSecondary.success.publication.selectionKey,
          {},
          'secondary',
        )
      ).success.rows,
    ).toHaveLength(1)
  })

  it('aborts mid-page 503 failure in both incremental_changes and window_rescan while keeping prior publications and watermarks intact', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T10:00:00Z'))

    // 1. Mid-page failure in incremental_changes preserves previous snapshot checkpoint and rows
    const changesFixture = await fixture(changesManifest)
    changesFixture.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: changesManifest,
        rows: [
          {
            id: 1,
            title: 'Stable issue',
            status: 'Open',
            updated_date: '2026-11-10T09:00:00Z',
          },
        ],
        fetchedAt: '2026-11-10T10:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'issues' },
          coverage: 'complete',
          checkpoint: '2026-11-10T09:00:00Z',
        },
      }),
    )

    const initialChanges = await changesFixture.load()
    expect(initialChanges.isSuccess()).toBe(true)

    changesFixture.progressEvents.length = 0
    vi.setSystemTime(new Date('2026-11-10T10:05:00Z'))
    changesFixture.fetch
      .mockResolvedValueOnce(
        Either.success({
          dataset: changesManifest,
          rows: [
            {
              id: 1,
              title: 'Uncommitted page 1 change',
              status: 'Closed',
              updated_date: '2026-11-10T10:01:00Z',
            },
          ],
          fetchedAt: '2026-11-10T10:05:00Z',
          execution: {
            kind: 'changes',
            scope: { datasetId: 'issues' },
            checkpoint: '2026-11-10T10:01:00Z',
            deletedIds: [],
            coverage: 'partial',
            continuation: { cursor: 'changes-p2' },
          },
        }),
      )
      .mockResolvedValueOnce(
        Either.failure(AppError.Http(503, 'UPSTREAM_CHANGES_MID_PAGE_DOWN')),
      )

    const failedChanges = await changesFixture.load()
    expect(failedChanges.isFailure()).toBe(true)
    expect(failedChanges.failure.messageKey).toBe(
      'UPSTREAM_CHANGES_MID_PAGE_DOWN',
    )
    expect(
      changesFixture.progressEvents.map((event) => [event.mode, event.phase]),
    ).toEqual([
      ['changes', 'extracting'],
      ['changes', 'failed'],
    ])

    const hydratedChanges = await changesFixture.service.hydrate({
      workspaceId: 'workspace',
    })
    expect(hydratedChanges.isSuccess()).toBe(true)
    expect(hydratedChanges.success.publications[0]?.syncState.checkpoint).toBe(
      '2026-11-10T09:00:00Z',
    )
    expect(hydratedChanges.success.publications[0]?.syncState.lastError).toBe(
      'UPSTREAM_CHANGES_MID_PAGE_DOWN',
    )
    expect(
      (
        await changesFixture.query(
          initialChanges.success.publication.selectionKey,
        )
      ).success.rows,
    ).toEqual([
      {
        id: 1,
        title: 'Stable issue',
        status: 'Open',
        updated_date: '2026-11-10T09:00:00Z',
      },
    ])

    // 2. Mid-page failure in window_rescan preserves previous rows and window bounds
    const windowFixture = await fixture(windowManifest)
    windowFixture.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [
          { id: 1, date: '2026-10-15', hours: 4, note: 'Historical' },
          { id: 2, date: '2026-11-05', hours: 2, note: 'Window baseline' },
        ],
        fetchedAt: '2026-11-10T10:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-10-01',
            endDate: '2026-11-10',
          },
          coverage: 'complete',
        },
      }),
    )

    const initialWindow = await windowFixture.load({
      startDate: '2026-10-01',
      endDate: '2026-11-10',
    })
    expect(initialWindow.isSuccess()).toBe(true)

    windowFixture.progressEvents.length = 0
    vi.setSystemTime(new Date('2026-11-10T10:05:00Z'))
    windowFixture.fetch
      .mockResolvedValueOnce(
        Either.success({
          dataset: windowManifest,
          rows: [{ id: 2, date: '2026-11-05', hours: 99, note: 'Partial p1' }],
          fetchedAt: '2026-11-10T10:05:00Z',
          execution: {
            kind: 'snapshot',
            scope: {
              datasetId: 'entries',
              startDate: '2026-10-28',
              endDate: '2026-11-10',
            },
            coverage: 'partial',
            continuation: { cursor: 'window-p2' },
          },
        }),
      )
      .mockResolvedValueOnce(
        Either.failure(AppError.Http(503, 'UPSTREAM_WINDOW_MID_PAGE_DOWN')),
      )

    const failedWindow = await windowFixture.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: {
        datasetId: 'entries',
        startDate: '2026-10-01',
        endDate: '2026-11-10',
      },
      policy: { mode: 'auto', rollingWindowDays: 14 },
    })
    expect(failedWindow.isFailure()).toBe(true)
    expect(failedWindow.failure.messageKey).toBe(
      'UPSTREAM_WINDOW_MID_PAGE_DOWN',
    )
    expect(
      windowFixture.progressEvents.map((event) => [event.mode, event.phase]),
    ).toEqual([
      ['window_rescan', 'extracting'],
      ['window_rescan', 'failed'],
    ])

    const hydratedWindow = await windowFixture.service.hydrate({
      workspaceId: 'workspace',
    })
    expect(hydratedWindow.isSuccess()).toBe(true)
    expect(
      hydratedWindow.success.publications[0]?.syncState.lastWindowStart,
    ).toBeUndefined()
    expect(
      hydratedWindow.success.publications[0]?.syncState.lastWindowEnd,
    ).toBeUndefined()
    expect(hydratedWindow.success.publications[0]?.syncState.lastError).toBe(
      'UPSTREAM_WINDOW_MID_PAGE_DOWN',
    )
    expect(
      (
        await windowFixture.query(
          initialWindow.success.publication.selectionKey,
        )
      ).success.rows,
    ).toEqual([
      { id: 1, date: '2026-10-15', hours: 4, note: 'Historical' },
      { id: 2, date: '2026-11-05', hours: 2, note: 'Window baseline' },
    ])
  })

  it('leaves retrospective edits outside the 14-day window untouched on fast window_rescan and reconciles them on manual full', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))

    const f = await fixture(windowManifest)
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [
          {
            id: 1,
            date: '2026-10-16',
            hours: 4,
            note: 'Retrospective outside 14d',
          },
          { id: 2, date: '2026-11-08', hours: 2, note: 'Recent initial' },
        ],
        fetchedAt: '2026-11-10T12:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-10-01',
            endDate: '2026-11-10',
          },
          coverage: 'complete',
        },
      }),
    )

    const initial = await f.load({
      startDate: '2026-10-01',
      endDate: '2026-11-10',
    })
    expect(initial.isSuccess()).toBe(true)

    vi.setSystemTime(new Date('2026-11-10T12:05:00Z'))
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [{ id: 2, date: '2026-11-08', hours: 3, note: 'Recent updated' }],
        fetchedAt: '2026-11-10T12:05:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-10-28',
            endDate: '2026-11-10',
          },
          coverage: 'complete',
        },
      }),
    )

    const fastRescan = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: {
        datasetId: 'entries',
        startDate: '2026-10-01',
        endDate: '2026-11-10',
      },
      policy: { mode: 'fast', rollingWindowDays: 14 },
    })
    expect(fastRescan.isSuccess()).toBe(true)
    expect(fastRescan.success.strategy).toBe('window_rescan')
    expect(
      (await f.query(fastRescan.success.publication.selectionKey)).success.rows,
    ).toEqual([
      {
        id: 1,
        date: '2026-10-16',
        hours: 4,
        note: 'Retrospective outside 14d',
      },
      { id: 2, date: '2026-11-08', hours: 3, note: 'Recent updated' },
    ])

    vi.setSystemTime(new Date('2026-11-10T12:06:00Z'))
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: windowManifest,
        rows: [
          {
            id: 1,
            date: '2026-10-16',
            hours: 7.5,
            note: 'Retrospective edited',
          },
          { id: 2, date: '2026-11-08', hours: 3, note: 'Recent updated' },
        ],
        fetchedAt: '2026-11-10T12:06:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-10-01',
            endDate: '2026-11-10',
          },
          coverage: 'complete',
        },
      }),
    )

    const manualFull = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: {
        datasetId: 'entries',
        startDate: '2026-10-01',
        endDate: '2026-11-10',
      },
      policy: { mode: 'full', rollingWindowDays: 14 },
    })
    expect(manualFull.isSuccess()).toBe(true)
    expect(manualFull.success.strategy).toBe('full_replace')
    expect(
      (await f.query(manualFull.success.publication.selectionKey)).success.rows,
    ).toEqual([
      {
        id: 1,
        date: '2026-10-16',
        hours: 7.5,
        note: 'Retrospective edited',
      },
      { id: 2, date: '2026-11-08', hours: 3, note: 'Recent updated' },
    ])
  })

  it('rejects deletedIds when changes declare deletions none and removes ghosts only on full reconcile', async () => {
    const noDeletesManifest: AnalyticsDatasetManifest = {
      ...changesManifest,
      extraction: {
        modes: ['snapshot', 'changes'],
        identity: { kind: 'row', columns: ['id'] },
        changes: { deletions: 'none' },
      },
    }

    const f = await fixture(noDeletesManifest)
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: noDeletesManifest,
        rows: [
          {
            id: 1,
            title: 'Keep me',
            status: 'Open',
            updated_date: '2026-11-10T09:00:00Z',
          },
          {
            id: 2,
            title: 'Deleted later remotely',
            status: 'Open',
            updated_date: '2026-11-10T09:00:00Z',
          },
        ],
        fetchedAt: '2026-11-10T09:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'issues' },
          coverage: 'complete',
          checkpoint: '2026-11-10T09:00:00Z',
        },
      }),
    )

    const initial = await f.load()
    expect(initial.isSuccess()).toBe(true)

    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: noDeletesManifest,
        rows: [],
        fetchedAt: '2026-11-10T09:05:00Z',
        execution: {
          kind: 'changes',
          scope: { datasetId: 'issues' },
          checkpoint: '2026-11-10T09:05:00Z',
          deletedIds: ['2'],
          coverage: 'complete',
        },
      }),
    )

    const rejectedDeletion = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'issues' },
      policy: { mode: 'fast' },
    })
    expect(rejectedDeletion.isFailure()).toBe(true)
    expect(rejectedDeletion.failure.messageKey).toBe(
      'ANALYTICS_CHANGES_DELETION_NOT_ALLOWED',
    )
    expect(
      (await f.query(initial.success.publication.selectionKey)).success.rows,
    ).toHaveLength(2)

    // Full reconcile purges the remotely removed issue
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: noDeletesManifest,
        rows: [
          {
            id: 1,
            title: 'Keep me',
            status: 'Closed',
            updated_date: '2026-11-10T09:10:00Z',
          },
        ],
        fetchedAt: '2026-11-10T09:10:00Z',
        execution: {
          kind: 'snapshot',
          scope: { datasetId: 'issues' },
          coverage: 'complete',
          checkpoint: '2026-11-10T09:10:00Z',
        },
      }),
    )

    const reconciled = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: { datasetId: 'issues' },
      policy: { mode: 'full' },
    })
    expect(reconciled.isSuccess()).toBe(true)
    expect(reconciled.success.strategy).toBe('full_replace')
    expect(
      (await f.query(reconciled.success.publication.selectionKey)).success.rows,
    ).toEqual([
      {
        id: 1,
        title: 'Keep me',
        status: 'Closed',
        updated_date: '2026-11-10T09:10:00Z',
      },
    ])
  })

  it('isolates distinct secondary filters and completes multi-page window_rescan cursor resumption', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))

    const filteredWindowManifest: AnalyticsDatasetManifest = {
      ...windowManifest,
      supportedFilters: [{ id: 'note', label: 'Note', type: 'select' }],
    }

    const f = await fixture(filteredWindowManifest)
    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: filteredWindowManifest,
        rows: [
          { id: 1, date: '2026-10-12', hours: 4, note: 'Alpha' },
          { id: 2, date: '2026-11-05', hours: 2, note: 'Beta' },
        ],
        fetchedAt: '2026-11-10T12:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-10-01',
            endDate: '2026-11-10',
          },
          coverage: 'complete',
        },
      }),
    )

    const unfiltered = await f.load({
      startDate: '2026-10-01',
      endDate: '2026-11-10',
    })
    expect(unfiltered.isSuccess()).toBe(true)

    f.fetch.mockResolvedValueOnce(
      Either.success({
        dataset: filteredWindowManifest,
        rows: [{ id: 1, date: '2026-10-12', hours: 4, note: 'Alpha' }],
        fetchedAt: '2026-11-10T12:00:00Z',
        execution: {
          kind: 'snapshot',
          scope: {
            datasetId: 'entries',
            startDate: '2026-10-01',
            endDate: '2026-11-10',
            filters: { note: 'Alpha' },
          },
          coverage: 'complete',
        },
      }),
    )

    const filtered = await f.load({
      startDate: '2026-10-01',
      endDate: '2026-11-10',
      filters: { note: 'Alpha' },
    })
    expect(filtered.isSuccess()).toBe(true)
    expect(filtered.success.publication.selectionKey).not.toBe(
      unfiltered.success.publication.selectionKey,
    )

    // Multi-page window_rescan on unfiltered scope does not disturb filtered scope
    vi.setSystemTime(new Date('2026-11-10T12:05:00Z'))
    f.fetch
      .mockResolvedValueOnce(
        Either.success({
          dataset: filteredWindowManifest,
          rows: [{ id: 2, date: '2026-11-05', hours: 3, note: 'Beta p1' }],
          fetchedAt: '2026-11-10T12:05:00Z',
          execution: {
            kind: 'snapshot',
            scope: {
              datasetId: 'entries',
              startDate: '2026-10-28',
              endDate: '2026-11-10',
            },
            coverage: 'partial',
            batch: { index: 0, offset: 0, finished: false, totalRows: 2 },
            continuation: { cursor: 'win-p2' },
          },
        }),
      )
      .mockResolvedValueOnce(
        Either.success({
          dataset: filteredWindowManifest,
          rows: [{ id: 3, date: '2026-11-09', hours: 5, note: 'Gamma p2' }],
          fetchedAt: '2026-11-10T12:05:00Z',
          execution: {
            kind: 'snapshot',
            scope: {
              datasetId: 'entries',
              startDate: '2026-10-28',
              endDate: '2026-11-10',
            },
            coverage: 'unverified',
            batch: { index: 1, offset: 1, finished: true, totalRows: 2 },
          },
        }),
      )

    const rescanMultiPage = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      query: {
        datasetId: 'entries',
        startDate: '2026-10-01',
        endDate: '2026-11-10',
      },
      policy: { mode: 'fast', rollingWindowDays: 14 },
    })
    expect(rescanMultiPage.isSuccess(), JSON.stringify(rescanMultiPage)).toBe(
      true,
    )
    expect(rescanMultiPage.success.strategy).toBe('window_rescan')
    expect(f.fetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: '2026-10-28',
        endDate: '2026-11-10',
        execution: { kind: 'snapshot', cursor: 'win-p2' },
      }),
    )

    expect(
      (await f.query(unfiltered.success.publication.selectionKey)).success.rows,
    ).toEqual([
      { id: 1, date: '2026-10-12', hours: 4, note: 'Alpha' },
      { id: 2, date: '2026-11-05', hours: 3, note: 'Beta p1' },
      { id: 3, date: '2026-11-09', hours: 5, note: 'Gamma p2' },
    ])
    expect(
      (await f.query(filtered.success.publication.selectionKey)).success.rows,
    ).toEqual([{ id: 1, date: '2026-10-12', hours: 4, note: 'Alpha' }])
  })

  it('aborts commit and revokes only the affected connection when authorization rotates mid-load', async () => {
    const f = await fixture(changesManifest)
    const seedResult = {
      dataset: changesManifest,
      rows: [
        {
          id: 1,
          title: 'Primary',
          status: 'Open',
          updated_date: '2026-11-10T09:00:00Z',
        },
      ],
      fetchedAt: '2026-11-10T09:00:00Z',
      execution: {
        kind: 'snapshot' as const,
        scope: { datasetId: 'issues' },
        coverage: 'complete' as const,
        checkpoint: '2026-11-10T09:00:00Z',
      },
    }

    f.fetch.mockResolvedValueOnce(Either.success(seedResult))
    f.secondaryFetch.mockResolvedValueOnce(Either.success(seedResult))

    const primaryInit = await f.load()
    const secondaryInit = await f.service.load({
      workspaceId: 'workspace',
      connectionInstanceId: 'secondary',
      query: { datasetId: 'issues' },
    })
    expect(primaryInit.isSuccess()).toBe(true)
    expect(secondaryInit.isSuccess()).toBe(true)

    // Mid-load key rotation invalidates before publish
    f.fetch
      .mockResolvedValueOnce(
        Either.success({
          ...seedResult,
          execution: {
            kind: 'changes',
            scope: { datasetId: 'issues' },
            checkpoint: '2026-11-10T09:00:00Z',
            deletedIds: [],
            coverage: 'partial',
            continuation: { cursor: 'auth-p2' },
          },
        }),
      )
      .mockImplementationOnce(async () => {
        f.setKey('authorization-rotated')
        return Either.success({
          ...seedResult,
          execution: {
            kind: 'changes',
            scope: { datasetId: 'issues' },
            checkpoint: '2026-11-10T09:05:00Z',
            deletedIds: [],
            coverage: 'unverified',
          },
        })
      })

    const rotatedFail = await f.load()
    expect(rotatedFail.isFailure()).toBe(true)
    expect(rotatedFail.failure.messageKey).toBe(
      'ANALYTICS_AUTHORIZATION_CHANGED',
    )

    const hydrated = await f.service.hydrate({ workspaceId: 'workspace' })
    expect(hydrated.isSuccess()).toBe(true)
    expect(
      hydrated.success.publications.map(
        (item) => item.publication.connectionInstanceId,
      ),
    ).toEqual(['secondary'])
    expect(
      (
        await f.query(
          secondaryInit.success.publication.selectionKey,
          {},
          'secondary',
        )
      ).success.rows,
    ).toHaveLength(1)
  })

  it('[F4-02] never blocks or degrades personal operations while analytics loads stall, fail with 503, or revoke with 401', async () => {
    const f = await fixture(changesManifest)
    let enteredLoad = () => {}
    const loadEntered = new Promise<void>((resolve) => {
      enteredLoad = resolve
    })
    let releaseBlockedLoad = () => {}
    const blockedGate = new Promise<void>((resolve) => {
      releaseBlockedLoad = resolve
    })

    const personalEvents: string[] = []
    const runPersonalOperation = async (
      name: string,
    ): Promise<Either<AppError, string>> => {
      personalEvents.push(name)
      return Either.success(`${name}:ok`)
    }

    f.fetch.mockImplementationOnce(async () => {
      enteredLoad()
      await blockedGate
      return Either.failure(AppError.Http(503, 'UPSTREAM_503'))
    })

    const analyticsInFlight = f.load()
    await loadEntered

    // Personal operation executes and finishes immediately while analytics fetch is still blocked
    let personalResolvedDuringBlock = false
    const personalDuringBlock = runPersonalOperation('personal-create').then(
      (result) => {
        personalResolvedDuringBlock = true
        return result
      },
    )
    expect((await personalDuringBlock).isSuccess()).toBe(true)
    expect(personalResolvedDuringBlock).toBe(true)

    releaseBlockedLoad()
    const analytics503 = await analyticsInFlight
    expect(analytics503.isFailure()).toBe(true)
    expect(analytics503.failure.statusCode).toBe(503)

    // Personal operation remains healthy immediately after analytics 503
    expect((await runPersonalOperation('personal-update')).success).toBe(
      'personal-update:ok',
    )

    // Personal operation remains healthy after analytics triggers 401 revocation
    f.fetch.mockResolvedValueOnce(
      Either.failure(AppError.Unauthorized('ANALYTICS_REVOKED')),
    )
    const analytics401 = await f.load()
    expect(analytics401.isFailure()).toBe(true)
    expect(analytics401.failure.statusCode).toBe(401)
    expect((await runPersonalOperation('personal-sync')).success).toBe(
      'personal-sync:ok',
    )
    expect(personalEvents).toEqual([
      'personal-create',
      'personal-update',
      'personal-sync',
    ])
  })

  it('emits storage errors on hydrate failures and resets storage safely while guarding active loads', async () => {
    const f = await fixture()

    // Seed v1 database inside directory
    const v1Path = join(
      f.directory,
      `${createHash('sha256').update('workspace-v1').digest('hex')}.duckdb`,
    )
    const v1Instance = await DuckDBInstance.create(v1Path)
    const v1Conn = await v1Instance.connect()
    await v1Conn.run('CREATE TABLE analytics_format(version INTEGER NOT NULL)')
    await v1Conn.run('INSERT INTO analytics_format VALUES (1)')
    v1Conn.closeSync()
    v1Instance.closeSync()

    const v1Hydrate = await f.service.hydrate({ workspaceId: 'workspace-v1' })
    expect(v1Hydrate.isFailure()).toBe(true)
    expect(v1Hydrate.failure.messageKey).toBe(
      'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
    )
    expect(f.storageErrors).toContainEqual(
      expect.objectContaining({
        workspaceId: 'workspace-v1',
        operation: 'hydrate',
        messageKey: 'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
      }),
    )

    // Invalid spacesJson emits storage error too
    await f.service.saveWorkspaceState({
      workspaceId: 'workspace-invalid',
      pollingIntervalMinutes: 5,
      spacesJson: '{bad-json',
    })
    await f.service.hydrate({ workspaceId: 'workspace-invalid' })
    expect(f.storageErrors).toContainEqual(
      expect.objectContaining({
        workspaceId: 'workspace-invalid',
        operation: 'hydrate',
        messageKey: 'ANALYTICS_SPACES_STATE_INVALID',
      }),
    )

    // Active load returns 409 on resetStorage, then reset succeeds and emits analytics:storage-reset
    let releaseFetch:
      ((value: Either<AppError, AnalyticsDatasetResult>) => void) | undefined
    f.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFetch = resolve
        }),
    )
    const inflightLoad = f.load()
    await vi.waitFor(() => expect(releaseFetch).toBeDefined())

    const busyReset = await f.service.resetStorage({ workspaceId: 'workspace' })
    expect(busyReset.isFailure()).toBe(true)
    expect(busyReset.failure.statusCode).toBe(409)
    expect(busyReset.failure.messageKey).toBe('ANALYTICS_RESET_ACTIVE_LOAD')

    releaseFetch?.(Either.success(page(0, [{ id: 1, team: 'A', hours: 2 }])))
    await inflightLoad

    const v1Reset = await f.service.resetStorage({
      workspaceId: 'workspace-v1',
    })
    expect(v1Reset.isSuccess()).toBe(true)
    expect(v1Reset.success).toEqual({
      workspaceId: 'workspace-v1',
      removed: true,
    })
    expect(existsSync(v1Path)).toBe(false)
    expect(f.storageResets).toContainEqual({
      workspaceId: 'workspace-v1',
      removed: true,
    })

    const recovered = await f.service.hydrate({ workspaceId: 'workspace-v1' })
    expect(recovered.isSuccess()).toBe(true)
  })

  it('persists execution consumption metrics (requests, pages, durationMs, retries, bytes) in syncState across reopen', async () => {
    const f = await fixture()
    const batch0 = page(
      0,
      [
        { id: 1, team: 'A', hours: 2 },
        { id: 2, team: 'B', hours: 3 },
      ],
      'next',
    )
    if (batch0.execution.kind === 'snapshot')
      batch0.execution.metrics = { requests: 4, retries: 1 }

    const batch1 = page(1, [
      { id: 3, team: 'A', hours: 4 },
      { id: 4, team: 'B', hours: 5 },
    ])
    if (batch1.execution.kind === 'snapshot')
      batch1.execution.metrics = { requests: 1, retries: 0 }

    f.fetch
      .mockResolvedValueOnce(Either.success(batch0))
      .mockResolvedValueOnce(Either.success(batch1))

    const loaded = await f.load()
    expect(loaded.isSuccess()).toBe(true)
    expect(loaded.success.syncState.lastRunRequests).toBe(5)
    expect(loaded.success.syncState.lastRunPages).toBe(2)
    expect(loaded.success.syncState.lastRunRetries).toBe(1)
    expect(loaded.success.syncState.lastRunDurationMs).toBeGreaterThanOrEqual(0)
    expect(loaded.success.syncState.lastRunBytes).toBeGreaterThan(0)

    const hydrated = await f.service.hydrate({ workspaceId: 'workspace' })
    expect(hydrated.isSuccess()).toBe(true)
    expect(hydrated.success.publications[0]?.syncState).toMatchObject({
      lastRunRequests: 5,
      lastRunPages: 2,
      lastRunRetries: 1,
      lastRunBytes: loaded.success.syncState.lastRunBytes,
    })
  })
})
