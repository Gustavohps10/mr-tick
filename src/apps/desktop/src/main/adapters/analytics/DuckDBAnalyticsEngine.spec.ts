import { createHash } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DuckDBInstance } from '@duckdb/node-api'
import type {
  AnalyticsDatasetManifest,
  AnalyticsDatasetResult,
  AnalyticsGeneration,
  AnalyticsQueryInput,
  AnalyticsSyncMetadata,
} from '@mr-tick/application'
import { afterEach, describe, expect, it } from 'vitest'

import { DuckDBAnalyticsEngine } from './DuckDBAnalyticsEngine'

const fullSyncMeta: AnalyticsSyncMetadata = {
  strategy: 'full_replace',
}

const manifest: AnalyticsDatasetManifest = {
  id: 'entries',
  name: 'Entries',
  description: 'Contract fixture',
  sourceFormat: 'json',
  endpoint: '/entries',
  extraction: {
    modes: ['snapshot'],
    identity: { kind: 'row', columns: ['id'] },
  },
  columns: [
    { name: 'id', label: 'ID', type: 'number' },
    { name: 'team', label: 'Team', type: 'string' },
    { name: 'hours', label: 'Hours', type: 'number' },
  ],
}

const datedManifest: AnalyticsDatasetManifest = {
  id: 'entries',
  name: 'Entries',
  description: 'Window rescan fixture',
  sourceFormat: 'json',
  endpoint: '/entries',
  selection: { dateRange: true, project: false },
  extraction: {
    modes: ['snapshot'],
    identity: { kind: 'row', columns: ['id'] },
    windowRescan: { dateColumn: 'date' },
  },
  columns: [
    { name: 'id', label: 'ID', type: 'number' },
    { name: 'team', label: 'Team', type: 'string' },
    { name: 'hours', label: 'Hours', type: 'number' },
    { name: 'date', label: 'Date', type: 'date' },
  ],
}

const deltaManifest: AnalyticsDatasetManifest = {
  id: 'issues',
  name: 'Issues',
  description: 'Changes fixture',
  sourceFormat: 'json',
  endpoint: '/issues',
  extraction: {
    modes: ['snapshot', 'changes'],
    identity: { kind: 'row', columns: ['id'] },
    changes: { deletions: 'explicit' },
  },
  columns: [
    { name: 'id', label: 'ID', type: 'number' },
    { name: 'title', label: 'Title', type: 'string' },
    { name: 'points', label: 'Points', type: 'number' },
  ],
}

const engines: DuckDBAnalyticsEngine[] = []

async function engine() {
  const directory = await mkdtemp(join(tmpdir(), 'metric-analytics-phase2-'))
  const value = new DuckDBAnalyticsEngine(directory)
  engines.push(value)
  return { value, directory }
}

afterEach(async () => {
  for (const value of engines) await value.close()
  engines.length = 0
})

function batch(
  rows: AnalyticsDatasetResult['rows'],
  schema = manifest,
  kind: 'snapshot' | 'changes' = 'snapshot',
): AnalyticsDatasetResult {
  if (kind === 'changes')
    return {
      dataset: schema,
      rows,
      fetchedAt: '2026-11-09T00:00:00Z',
      execution: {
        kind: 'changes',
        scope: { datasetId: schema.id },
        checkpoint: '2026-11-09T00:00:00Z',
        deletedIds: [],
        coverage: 'complete',
      },
    }

  return {
    dataset: schema,
    rows,
    fetchedAt: '2026-11-09T00:00:00Z',
    execution: {
      kind: 'snapshot',
      scope: { datasetId: schema.id },
      coverage: 'complete',
    },
  }
}

function query(extra: Partial<AnalyticsQueryInput> = {}): AnalyticsQueryInput {
  return {
    workspaceId: 'workspace',
    nodes: [
      {
        id: 'source',
        kind: 'source',
        connectionInstanceId: 'connection',
        selectionKey: 'selection',
      },
    ],
    targetNodeId: 'source',
    offset: 0,
    limit: 100,
    ...extra,
  }
}

const authorizations = [
  { connectionInstanceId: 'connection', authorizationKey: 'authorization' },
]

const defaultOwner = {
  workspaceId: 'workspace',
  connectionInstanceId: 'connection',
  authorizationKey: 'authorization',
  selectionKey: 'selection',
}

async function create(
  value: DuckDBAnalyticsEngine,
  schema = manifest,
  queryInput: AnalyticsDatasetResult['execution']['scope'] & {
    execution?: { kind: 'snapshot' } | { kind: 'changes'; checkpoint: string }
  } = { datasetId: schema.id },
  owner = defaultOwner,
): Promise<AnalyticsGeneration> {
  const result = await value.create(owner, schema, queryInput)
  expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
  return result.success
}

describe('Native analytical generations', () => {
  it('ingests multiple batches and aggregates the full generation before pagination', async () => {
    const { value } = await engine()
    const generation = await create(value)
    expect(
      (
        await value.append(
          generation,
          batch([
            { id: 1, team: 'A', hours: 2 },
            { id: 2, team: 'B', hours: 4 },
          ]),
        )
      ).isSuccess(),
    ).toBe(true)
    expect(
      (
        await value.append(
          generation,
          batch([
            { id: 3, team: 'A', hours: 3 },
            { id: 4, team: 'B', hours: 5 },
          ]),
        )
      ).isSuccess(),
    ).toBe(true)
    expect(
      (
        await value.publish(
          generation,
          'complete',
          '2026-11-09T00:00:00Z',
          fullSyncMeta,
        )
      ).isSuccess(),
    ).toBe(true)
    const result = await value.query(
      query({
        groupBy: ['team'],
        measures: [{ name: 'hours', column: 'hours', operator: 'sum' }],
        limit: 1,
      }),
      authorizations,
    )
    expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
    expect(result.success.rows).toEqual([{ team: 'A', hours: 5 }])
    expect(result.success.totalRows).toBe(2)
    expect(result.success.hasMore).toBe(true)
    const next = await value.query(
      query({
        groupBy: ['team'],
        measures: [{ name: 'hours', column: 'hours', operator: 'sum' }],
        limit: 1,
        offset: 1,
        version: result.success.version,
      }),
      authorizations,
    )
    expect(next.success.rows).toEqual([{ team: 'B', hours: 9 }])
  })

  it('persists publication across reopening and isolates connection/authorization/workspace', async () => {
    const { value, directory } = await engine()
    const generation = await create(value)
    await value.append(generation, batch([{ id: 1, team: 'A', hours: 2 }]))
    await value.publish(generation, 'unverified', '2026-11-09T00:00:00Z', {
      strategy: 'full_replace',
      coverageReason: 'MULTI_PAGE',
    })
    await value.close()
    const reopened = new DuckDBAnalyticsEngine(directory)
    engines.push(reopened)
    const result = await reopened.query(query(), authorizations)
    expect(result.success.rows).toEqual([{ id: 1, team: 'A', hours: 2 }])
    expect(result.success.coverage).toBe('unverified')
    expect(result.success.coverageReason).toBe('MULTI_PAGE')
    expect(
      (
        await reopened.query(query(), [
          { connectionInstanceId: 'connection', authorizationKey: 'another' },
        ])
      ).isFailure(),
    ).toBe(true)
    expect(
      (
        await reopened.query(
          query({ workspaceId: 'other-workspace' }),
          authorizations,
        )
      ).isFailure(),
    ).toBe(true)
    expect(
      (
        await reopened.query(
          query({
            nodes: [
              {
                id: 'source',
                kind: 'source',
                connectionInstanceId: 'other-connection',
                selectionKey: 'selection',
              },
            ],
          }),
          authorizations,
        )
      ).isFailure(),
    ).toBe(true)
  })

  it('keeps the published generation when a staged batch fails and invalidates old pagination after publication', async () => {
    const { value } = await engine()
    const first = await create(value)
    await value.append(
      first,
      batch([
        { id: 1, team: 'A', hours: 2 },
        { id: 2, team: 'B', hours: 3 },
      ]),
    )
    await value.publish(first, 'complete', '2026-11-09T00:00:00Z', fullSyncMeta)
    const old = await value.query(query({ limit: 1 }), authorizations)
    const second = await create(value)
    await value.append(second, batch([{ id: 3, team: 'C', hours: 7 }]))
    expect(
      (
        await value.append(second, batch([{ id: 3, team: 'D', hours: 8 }]))
      ).isFailure(),
    ).toBe(true)
    expect((await value.query(query(), authorizations)).success.totalRows).toBe(
      2,
    )
    await value.publish(
      second,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    expect(
      (
        await value.query(
          query({ offset: 1, limit: 1, version: old.success.version }),
          authorizations,
        )
      ).isFailure(),
    ).toBe(true)
    expect((await value.query(query(), authorizations)).success.rows).toEqual([
      { id: 3, team: 'C', hours: 7 },
    ])
  })

  it('adds nullable columns and refuses incompatible schema changes without coercion', async () => {
    const { value } = await engine()
    const generation = await create(value)
    await value.append(generation, batch([{ id: 1, team: 'A', hours: 2 }]))
    const expanded: AnalyticsDatasetManifest = {
      ...manifest,
      columns: [
        ...manifest.columns,
        {
          name: 'custom_field_42',
          label: 'Native field',
          type: 'string',
          origin: 'custom',
          providerFieldId: '42',
        },
      ],
    }
    expect(
      (
        await value.append(
          generation,
          batch(
            [{ id: 2, team: 'B', hours: 3, custom_field_42: 'yes' }],
            expanded,
          ),
        )
      ).isSuccess(),
    ).toBe(true)
    const incompatible: AnalyticsDatasetManifest = {
      ...expanded,
      columns: expanded.columns.map((column) => {
        if (column.name === 'hours') return { ...column, type: 'string' }
        return column
      }),
    }
    expect(
      (
        await value.append(
          generation,
          batch([{ id: 3, team: 'C', hours: '4' }], incompatible),
        )
      ).isFailure(),
    ).toBe(true)
    await value.publish(
      generation,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    expect((await value.query(query(), authorizations)).success.rows).toEqual([
      { id: 1, team: 'A', hours: 2, custom_field_42: null },
      { id: 2, team: 'B', hours: 3, custom_field_42: 'yes' },
    ])
  })

  it('executes real SQL using only authorized inputs and rejects wildcard/external/internal table access', async () => {
    const { value } = await engine()
    const generation = await create(value)
    await value.append(
      generation,
      batch([
        { id: 1, team: 'A', hours: 2 },
        { id: 2, team: 'A', hours: 3 },
      ]),
    )
    await value.publish(
      generation,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    const nodes: AnalyticsQueryInput['nodes'] = [
      ...query().nodes,
      {
        id: 'sql',
        kind: 'sql',
        upstreamNodeIds: ['source'],
        sqlConfig: {
          sqlQuery: 'SELECT team, sum(hours) AS total FROM input GROUP BY team',
        },
      },
    ]
    const result = await value.query(
      query({ nodes, targetNodeId: 'sql' }),
      authorizations,
    )
    expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
    expect(result.success.rows).toEqual([{ team: 'A', total: 5 }])
    for (const sqlQuery of [
      'SELECT * FROM input',
      "SELECT content FROM read_text('private.txt')",
      'SELECT generation_id FROM analytics_generations',
      'SELECT checkpoint FROM analytics_sync_states',
      'SELECT spaces_json FROM analytics_workspace_settings',
      'DELETE FROM input',
      'SELECT 1; SELECT 2',
    ]) {
      const bad = await value.query(
        query({
          nodes: [
            ...query().nodes,
            {
              id: 'sql',
              kind: 'sql',
              upstreamNodeIds: ['source'],
              sqlConfig: { sqlQuery },
            },
          ],
          targetNodeId: 'sql',
        }),
        authorizations,
      )
      expect(bad.isFailure(), sqlQuery).toBe(true)
    }
  })

  it('executes typed filters, CASE, arithmetic, pivot and native rollups over every batch', async () => {
    const { value } = await engine()
    const generation = await create(value)
    await value.append(
      generation,
      batch([
        { id: 1, team: 'A', hours: 2 },
        { id: 2, team: 'A', hours: 4 },
        { id: 3, team: 'B', hours: 4 },
      ]),
    )
    await value.publish(
      generation,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    const nodes: AnalyticsQueryInput['nodes'] = [
      ...query().nodes,
      {
        id: 'transform',
        kind: 'transform',
        upstreamNodeIds: ['source'],
        transformConfig: {
          filterColumn: 'hours',
          filterOperator: 'gte',
          filterValue: '4',
          formulaColumnName: 'doubled',
          formulaLeftColumn: 'hours',
          formulaOperator: 'multiply',
          formulaRightColumn: '2',
          caseColumnName: 'tier',
          caseRules: [
            {
              whenColumn: 'team',
              operator: 'eq',
              whenValue: 'A',
              thenMode: 'literal',
              thenValue: 'alpha',
            },
          ],
          caseElseMode: 'literal',
          caseElseValue: 'beta',
        },
      },
    ]
    const transformed = await value.query(
      query({ nodes, targetNodeId: 'transform' }),
      authorizations,
    )
    expect(transformed.isSuccess(), JSON.stringify(transformed)).toBe(true)
    expect(transformed.success.rows).toEqual([
      { id: 2, team: 'A', hours: 4, doubled: 8, tier: 'alpha' },
      { id: 3, team: 'B', hours: 4, doubled: 8, tier: 'beta' },
    ])
    const rollup = await value.query(
      query({
        groupBy: ['team'],
        measures: [{ name: 'sum_hours', column: 'hours', operator: 'sum' }],
        rollup: true,
      }),
      authorizations,
    )
    expect(rollup.isSuccess(), JSON.stringify(rollup)).toBe(true)
    expect(rollup.success.rows).toEqual([
      { team: 'A', sum_hours: 6, analytics_grouping_level: 0 },
      { team: 'B', sum_hours: 4, analytics_grouping_level: 0 },
      { team: null, sum_hours: 10, analytics_grouping_level: 1 },
    ])
    const pivot = await value.query(
      query({
        pivot: {
          rowColumn: 'team',
          pivotColumn: 'hours',
          valueColumn: 'hours',
          operator: 'count_distinct',
        },
      }),
      authorizations,
    )
    expect(pivot.isSuccess(), JSON.stringify(pivot)).toBe(true)
    expect(pivot.success.rows.map((row) => row.total)).toEqual([2, 1])
    const ratio = await value.query(
      query({
        groupBy: [],
        measures: [
          { name: 'total', column: 'hours', operator: 'sum' },
          { name: 'count', operator: 'count' },
        ],
        calculation: {
          formulaColumnName: 'mean',
          formulaLeftColumn: 'total',
          formulaOperator: 'divide',
          formulaRightColumn: 'count',
        },
      }),
      authorizations,
    )
    expect(ratio.success.rows).toEqual([{ total: 10, count: 3, mean: 10 / 3 }])
  })

  it('respects explicit join input roles and performs native union with nullable missing fields', async () => {
    const { value } = await engine()
    const generation = await create(value)
    await value.append(
      generation,
      batch([
        { id: 1, team: 'A', hours: 2 },
        { id: 2, team: 'B', hours: 4 },
      ]),
    )
    await value.publish(
      generation,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    const nodes: AnalyticsQueryInput['nodes'] = [
      ...query().nodes,
      {
        id: 'right',
        kind: 'source',
        connectionInstanceId: 'connection',
        selectionKey: 'selection',
        columns: ['id', 'team'],
      },
      {
        id: 'join',
        kind: 'join',
        upstreamNodeIds: ['right', 'source'],
        joinConfig: {
          joinType: 'left',
          leftNodeId: 'source',
          rightNodeId: 'right',
          leftKey: 'id',
          rightKey: 'id',
        },
      },
    ]
    const joined = await value.query(
      query({ nodes, targetNodeId: 'join' }),
      authorizations,
    )
    expect(joined.isSuccess(), JSON.stringify(joined)).toBe(true)
    expect(joined.success.rows).toHaveLength(2)
    expect(
      joined.success.columns.some((column) => column.name === 'hours'),
    ).toBe(true)
    const union = await value.query(
      query({
        nodes: [
          ...nodes.filter((node) => node.id !== 'join'),
          {
            id: 'union',
            kind: 'join',
            upstreamNodeIds: ['right', 'source'],
            joinConfig: {
              joinType: 'union',
              leftNodeId: 'source',
              rightNodeId: 'right',
              leftKey: 'id',
              rightKey: 'id',
            },
          },
        ],
        targetNodeId: 'union',
      }),
      authorizations,
    )
    expect(union.isSuccess(), JSON.stringify(union)).toBe(true)
    expect(union.success.rows).toHaveLength(4)
    expect(union.success.rows.filter((row) => row.hours === null)).toHaveLength(
      2,
    )
  })

  it('retains active staging across workspace eviction and discards abandoned staging after restart', async () => {
    const { value, directory } = await engine()
    const generation = await create(value)
    await value.append(generation, batch([{ id: 1, team: 'A', hours: 2 }]))
    for (const workspaceId of ['second', 'third'])
      await value.create(
        {
          workspaceId,
          connectionInstanceId: 'connection',
          authorizationKey: 'authorization',
          selectionKey: 'selection',
        },
        manifest,
        { datasetId: 'entries' },
      )
    expect(
      (
        await value.append(generation, batch([{ id: 2, team: 'B', hours: 3 }]))
      ).isSuccess(),
    ).toBe(true)
    await value.close()
    const reopened = new DuckDBAnalyticsEngine(directory)
    engines.push(reopened)
    expect(
      (
        await reopened.publish(
          generation,
          'complete',
          '2026-11-09T00:00:00Z',
          fullSyncMeta,
        )
      ).isFailure(),
    ).toBe(true)
    const fresh = await create(reopened)
    expect(
      (
        await reopened.append(fresh, batch([{ id: 1, team: 'C', hours: 7 }]))
      ).isSuccess(),
    ).toBe(true)
  })

  it('preserves explicit SQL ordering with deterministic pagination', async () => {
    const { value } = await engine()
    const generation = await create(value)
    await value.append(
      generation,
      batch([
        { id: 1, team: 'A', hours: 2 },
        { id: 2, team: 'B', hours: 9 },
        { id: 3, team: 'C', hours: 9 },
      ]),
    )
    await value.publish(
      generation,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    const nodes: AnalyticsQueryInput['nodes'] = [
      ...query().nodes,
      {
        id: 'ordered',
        kind: 'sql',
        upstreamNodeIds: ['source'],
        sqlConfig: {
          sqlQuery: 'SELECT team, hours FROM input ORDER BY hours DESC',
        },
      },
    ]
    const first = await value.query(
      query({ nodes, targetNodeId: 'ordered', limit: 1 }),
      authorizations,
    )
    expect(first.isSuccess(), JSON.stringify(first)).toBe(true)
    expect(first.success.rows).toEqual([{ team: 'B', hours: 9 }])
    const next = await value.query(
      query({
        nodes,
        targetNodeId: 'ordered',
        limit: 1,
        offset: 1,
        version: first.success.version,
      }),
      authorizations,
    )
    expect(next.success.rows).toEqual([{ team: 'C', hours: 9 }])
  })

  it('rebuilds the projection on a new load and preserves explicit nulls and native field identity', async () => {
    const { value } = await engine()
    const generation = await create(value)
    await value.append(generation, batch([{ id: 1, team: 'A', hours: 2 }]))
    await value.publish(
      generation,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    const rebuilt: AnalyticsDatasetManifest = {
      ...manifest,
      columns: [
        { name: 'id', label: 'ID', type: 'number' },
        { name: 'hours', label: 'Text hours', type: 'string' },
        {
          name: 'custom_42',
          label: 'Custom',
          type: 'string',
          origin: 'custom',
          providerFieldId: '42',
        },
      ],
    }
    const second = await create(value, rebuilt)
    await value.append(
      second,
      batch([{ id: 2, hours: 'native text', custom_42: null }], rebuilt),
    )
    const wrongId: AnalyticsDatasetManifest = {
      ...rebuilt,
      columns: rebuilt.columns.map((column) => {
        if (column.name === 'custom_42')
          return { ...column, providerFieldId: '43' }
        return column
      }),
    }
    expect(
      (
        await value.append(
          second,
          batch([{ id: 3, hours: 'other', custom_42: 'value' }], wrongId),
        )
      ).isFailure(),
    ).toBe(true)
    await value.publish(
      second,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    const result = await value.query(query(), authorizations)
    expect(result.success.columns.map((column) => column.name)).toEqual([
      'id',
      'hours',
      'custom_42',
    ])
    expect(result.success.rows).toEqual([
      { id: 2, hours: 'native text', custom_42: null },
    ])
  })

  it('rejects repeated remote aggregate groups, including null, across batches', async () => {
    const { value } = await engine()
    const aggregate: AnalyticsDatasetManifest = {
      ...manifest,
      columns: [
        { name: 'team', label: 'Team', type: 'string' },
        { name: 'mean_hours', label: 'Mean', type: 'number' },
      ],
      extraction: { modes: ['aggregate'], identity: { kind: 'scope' } },
    }
    const created = await value.create(defaultOwner, aggregate, {
      datasetId: 'entries',
      execution: {
        kind: 'aggregate',
        groupBy: ['team'],
        measures: [
          { name: 'mean_hours', column: 'hours', operator: 'average' },
        ],
      },
    })
    expect(created.isSuccess(), JSON.stringify(created)).toBe(true)
    const first = await value.append(
      created.success,
      batch(
        [
          { team: null, mean_hours: 3 },
          { team: 'A', mean_hours: 2 },
        ],
        aggregate,
      ),
    )
    expect(first.isSuccess(), JSON.stringify(first)).toBe(true)
    expect(
      (
        await value.append(
          created.success,
          batch([{ team: null, mean_hours: 5 }], aggregate),
        )
      ).isFailure(),
    ).toBe(true)
    expect(
      (
        await value.append(
          created.success,
          batch([{ team: 'A', mean_hours: 7 }], aggregate),
        )
      ).isFailure(),
    ).toBe(true)
  })

  it('types CASE literals from an explicit numeric ELSE column', async () => {
    const { value } = await engine()
    const generation = await create(value)
    await value.append(
      generation,
      batch([
        { id: 1, team: 'A', hours: 2 },
        { id: 2, team: 'B', hours: 4 },
      ]),
    )
    await value.publish(
      generation,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    const nodes: AnalyticsQueryInput['nodes'] = [
      ...query().nodes,
      {
        id: 'case',
        kind: 'transform',
        upstreamNodeIds: ['source'],
        transformConfig: {
          caseColumnName: 'adjusted',
          caseRules: [
            {
              whenColumn: 'team',
              operator: 'eq',
              whenValue: 'A',
              thenMode: 'literal',
              thenValue: '0',
            },
          ],
          caseElseMode: 'column',
          caseElseValue: 'hours',
        },
      },
    ]
    const result = await value.query(
      query({ nodes, targetNodeId: 'case' }),
      authorizations,
    )
    expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
    expect(result.success.rows).toEqual([
      { id: 1, team: 'A', hours: 2, adjusted: 0 },
      { id: 2, team: 'B', hours: 4, adjusted: 4 },
    ])
  })

  it('counts pivot records without depending on a nullable measure column', async () => {
    const { value } = await engine()
    const generation = await create(value)
    await value.append(
      generation,
      batch([
        { id: 1, team: 'A', hours: null },
        { id: 2, team: 'A', hours: 2 },
        { id: 3, team: 'B', hours: 3 },
      ]),
    )
    await value.publish(
      generation,
      'complete',
      '2026-11-09T00:00:00Z',
      fullSyncMeta,
    )
    const result = await value.query(
      query({
        pivot: { rowColumn: 'team', pivotColumn: 'hours', operator: 'count' },
      }),
      authorizations,
    )
    expect(result.isSuccess(), JSON.stringify(result)).toBe(true)
    expect(result.success.rows.map((row) => row.total)).toEqual([2, 1])
    const nullColumn = result.success.columns.find(
      (column) => column.label === 'null',
    )
    expect(nullColumn).toBeDefined()
    if (nullColumn === undefined) return
    expect(
      result.success.rows.find((row) => row.team === 'A')?.[nullColumn.name],
    ).toBe(1)
  })
})

describe('Phase 3 DuckDB v2 durable sync, merge & workspace settings', () => {
  it('refuses legacy v1 databases without wiping or auto-migrating user files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'metric-analytics-legacy-'))
    const file = join(
      directory,
      `${createHash('sha256').update('workspace').digest('hex')}.duckdb`,
    )
    const instance = await DuckDBInstance.create(file)
    const conn = await instance.connect()
    await conn.run('CREATE TABLE analytics_format(version INTEGER NOT NULL)')
    await conn.run('INSERT INTO analytics_format VALUES (1)')
    conn.closeSync()
    instance.closeSync()

    const legacyEngine = new DuckDBAnalyticsEngine(directory)
    engines.push(legacyEngine)
    const attempt = await legacyEngine.getWorkspaceState('workspace')
    expect(attempt.isFailure()).toBe(true)
    expect(attempt.failure.messageKey).toBe(
      'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
    )
  })

  it('merges a rolling window atomically including moves across boundaries, additive columns and incompatible drift signal', async () => {
    const { value } = await engine()
    const baseGen = await create(value, datedManifest, { datasetId: 'entries' })
    await value.append(
      baseGen,
      batch(
        [
          { id: 1, team: 'OldKeep', hours: 2, date: '2026-10-01' },
          { id: 2, team: 'MoveIntoWindow', hours: 3, date: '2026-10-15' },
          { id: 3, team: 'DeletedInWindow', hours: 4, date: '2026-11-05' },
          { id: 4, team: 'UpdatedInWindow', hours: 5, date: '2026-11-08' },
        ],
        datedManifest,
      ),
    )
    const initialPub = await value.publish(
      baseGen,
      'complete',
      '2026-11-09T00:00:00Z',
      { strategy: 'full_replace', lastFullReconcileAt: '2026-11-09T00:00:00Z' },
    )
    expect(initialPub.isSuccess()).toBe(true)

    const expandedManifest: AnalyticsDatasetManifest = {
      ...datedManifest,
      columns: [
        ...datedManifest.columns,
        {
          name: 'custom_billable',
          label: 'Billable',
          type: 'boolean',
          origin: 'custom',
          providerFieldId: '99',
        },
      ],
    }
    const windowGen = await create(value, expandedManifest, {
      datasetId: 'entries',
      startDate: '2026-11-01',
      endDate: '2026-11-10',
    })
    await value.append(
      windowGen,
      batch(
        [
          {
            id: 2,
            team: 'MovedHere',
            hours: 3.5,
            date: '2026-11-03',
            custom_billable: true,
          },
          {
            id: 4,
            team: 'UpdatedInWindow',
            hours: 6,
            date: '2026-11-08',
            custom_billable: false,
          },
          {
            id: 5,
            team: 'CreatedInWindow',
            hours: 1,
            date: '2026-11-10',
            custom_billable: true,
          },
        ],
        expandedManifest,
      ),
    )

    const merged = await value.publishWindowMerge(
      defaultOwner,
      initialPub.success.generationId,
      windowGen,
      { dateColumn: 'date', startDate: '2026-11-01', endDate: '2026-11-10' },
      'unverified',
      '2026-11-10T01:00:00Z',
      {
        strategy: 'window_rescan',
        coverageReason: 'REDMINE_MULTI_PAGE',
      },
    )
    expect(merged.isSuccess(), JSON.stringify(merged)).toBe(true)
    expect(merged.success.coverage).toBe('unverified')
    expect(merged.success.coverageReason).toBe('REDMINE_MULTI_PAGE')
    expect(merged.success.rowCount).toBe(4)

    const queried = await value.query(query(), authorizations)
    expect(queried.isSuccess()).toBe(true)
    expect(queried.success.rows).toEqual([
      {
        id: 1,
        team: 'OldKeep',
        hours: 2,
        date: '2026-10-01',
        custom_billable: null,
      },
      {
        id: 2,
        team: 'MovedHere',
        hours: 3.5,
        date: '2026-11-03',
        custom_billable: true,
      },
      {
        id: 4,
        team: 'UpdatedInWindow',
        hours: 6,
        date: '2026-11-08',
        custom_billable: false,
      },
      {
        id: 5,
        team: 'CreatedInWindow',
        hours: 1,
        date: '2026-11-10',
        custom_billable: true,
      },
    ])

    const syncState = await value.getSyncState(defaultOwner)
    expect(syncState.isSuccess()).toBe(true)
    expect(syncState.success).toMatchObject({
      strategy: 'window_rescan',
      lastFullReconcileAt: '2026-11-09T00:00:00Z',
      lastWindowStart: '2026-11-01',
      lastWindowEnd: '2026-11-10',
      coverage: 'unverified',
      coverageReason: 'REDMINE_MULTI_PAGE',
    })

    const driftManifest: AnalyticsDatasetManifest = {
      ...expandedManifest,
      columns: expandedManifest.columns.map((c) =>
        c.name === 'hours' ? { ...c, type: 'string' } : c,
      ),
    }
    const driftStaging = await create(value, driftManifest, {
      datasetId: 'entries',
    })
    await value.append(
      driftStaging,
      batch(
        [
          {
            id: 6,
            team: 'X',
            hours: 'NaN',
            date: '2026-11-10',
            custom_billable: null,
          },
        ],
        driftManifest,
      ),
    )
    const driftMerge = await value.publishWindowMerge(
      defaultOwner,
      merged.success.generationId,
      driftStaging,
      { dateColumn: 'date', startDate: '2026-11-01', endDate: '2026-11-10' },
      'complete',
      '2026-11-10T02:00:00Z',
      { strategy: 'window_rescan' },
    )
    expect(driftMerge.isFailure()).toBe(true)
    expect(driftMerge.failure.messageKey).toBe(
      'ANALYTICS_SCHEMA_CHANGED_DURING_LOAD',
    )
    await value.remove(driftStaging)
  })

  it('merges changes deltas (multi-batch latest-wins + explicit delete + empty no-op preserving generationId)', async () => {
    const { value } = await engine()
    const baseGen = await create(value, deltaManifest, { datasetId: 'issues' })
    await value.append(
      baseGen,
      batch(
        [
          { id: 1, title: 'Keep', points: 3 },
          { id: 2, title: 'WillUpdate', points: 5 },
          { id: 3, title: 'WillDelete', points: 8 },
        ],
        deltaManifest,
      ),
    )
    const pub1 = await value.publish(
      baseGen,
      'complete',
      '2026-11-09T10:00:00Z',
      { strategy: 'full_replace', checkpoint: '2026-11-09T10:00:00Z' },
    )
    expect(pub1.isSuccess()).toBe(true)

    const noopPub = await value.publishChangesMerge(
      defaultOwner,
      pub1.success.generationId,
      undefined,
      [],
      'explicit',
      'complete',
      '2026-11-09T10:05:00Z',
      { strategy: 'incremental_changes', checkpoint: '2026-11-09T10:05:00Z' },
    )
    expect(noopPub.isSuccess()).toBe(true)
    expect(noopPub.success.generationId).toBe(pub1.success.generationId)

    const deltaGen = await create(value, deltaManifest, {
      datasetId: 'issues',
      execution: { kind: 'changes', checkpoint: '2026-11-09T10:05:00Z' },
    })
    await value.append(
      deltaGen,
      batch(
        [{ id: 2, title: 'UpdatedOnce', points: 6 }],
        deltaManifest,
        'changes',
      ),
    )
    await value.append(
      deltaGen,
      batch(
        [
          { id: 2, title: 'UpdatedTwice', points: 7 },
          { id: 4, title: 'Inserted', points: 13 },
        ],
        deltaManifest,
        'changes',
      ),
    )

    const disallowedDelete = await value.publishChangesMerge(
      defaultOwner,
      pub1.success.generationId,
      deltaGen,
      ['3'],
      'none',
      'complete',
      '2026-11-09T10:10:00Z',
      { strategy: 'incremental_changes', checkpoint: '2026-11-09T10:10:00Z' },
    )
    expect(disallowedDelete.isFailure()).toBe(true)
    expect(disallowedDelete.failure.messageKey).toBe(
      'ANALYTICS_CHANGES_DELETION_NOT_ALLOWED',
    )

    const merged = await value.publishChangesMerge(
      defaultOwner,
      pub1.success.generationId,
      deltaGen,
      ['3'],
      'explicit',
      'complete',
      '2026-11-09T10:10:00Z',
      { strategy: 'incremental_changes', checkpoint: '2026-11-09T10:10:00Z' },
    )
    expect(merged.isSuccess(), JSON.stringify(merged)).toBe(true)
    expect(merged.success.generationId).not.toBe(pub1.success.generationId)
    expect((await value.query(query(), authorizations)).success.rows).toEqual([
      { id: 1, title: 'Keep', points: 3 },
      { id: 2, title: 'UpdatedTwice', points: 7 },
      { id: 4, title: 'Inserted', points: 13 },
    ])

    await value.recordSyncFailure(
      defaultOwner,
      'TIMEOUT',
      '2026-11-09T10:15:00Z',
    )
    const failedState = await value.getSyncState(defaultOwner)
    expect(failedState.success?.lastError).toBe('TIMEOUT')
    expect(failedState.success?.checkpoint).toBe('2026-11-09T10:10:00Z')
  })

  it('lists publications strictly by authorization, revokes single connections cleanly, and persists workspace settings', async () => {
    const { value } = await engine()
    const genA = await create(
      value,
      manifest,
      { datasetId: 'entries' },
      defaultOwner,
    )
    await value.append(genA, batch([{ id: 1, team: 'A', hours: 2 }]))
    await value.publish(genA, 'complete', '2026-11-09T00:00:00Z', fullSyncMeta)

    const ownerB = {
      workspaceId: 'workspace',
      connectionInstanceId: 'connection-b',
      authorizationKey: 'auth-b',
      selectionKey: 'selection-b',
    }
    const genB = await create(value, manifest, { datasetId: 'entries' }, ownerB)
    await value.append(genB, batch([{ id: 2, team: 'B', hours: 4 }]))
    await value.publish(genB, 'complete', '2026-11-09T00:00:00Z', fullSyncMeta)

    const listed = await value.listPublications('workspace', [
      ...authorizations,
      { connectionInstanceId: 'connection-b', authorizationKey: 'auth-b' },
    ])
    expect(listed.isSuccess()).toBe(true)
    expect(listed.success).toHaveLength(2)

    await value.revokeConnection('workspace', 'connection')
    const afterRevoke = await value.listPublications('workspace', [
      ...authorizations,
      { connectionInstanceId: 'connection-b', authorizationKey: 'auth-b' },
    ])
    expect(afterRevoke.isSuccess()).toBe(true)
    expect(
      afterRevoke.success.map((e) => e.publication.connectionInstanceId),
    ).toEqual(['connection-b'])

    const saved = await value.saveWorkspaceState({
      workspaceId: 'workspace',
      pollingIntervalMinutes: 15,
      spacesJson: '[{"id":"s1"}]',
      startDate: '2026-11-01',
      endDate: '2026-11-10',
    })
    expect(saved.isSuccess()).toBe(true)
    const loaded = await value.getWorkspaceState('workspace')
    expect(loaded.success).toMatchObject({
      workspaceId: 'workspace',
      pollingIntervalMinutes: 15,
      spacesJson: '[{"id":"s1"}]',
      startDate: '2026-11-01',
      endDate: '2026-11-10',
    })
  })
})
