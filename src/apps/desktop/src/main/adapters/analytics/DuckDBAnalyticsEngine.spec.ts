import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  AnalyticsDatasetManifest,
  AnalyticsDatasetResult,
  AnalyticsGeneration,
  AnalyticsQueryInput,
} from '@mr-tick/application'
import { afterEach, describe, expect, it } from 'vitest'

import { DuckDBAnalyticsEngine } from './DuckDBAnalyticsEngine'

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
): AnalyticsDatasetResult {
  return {
    dataset: schema,
    rows,
    fetchedAt: '2026-11-09T00:00:00Z',
    execution: {
      kind: 'snapshot',
      scope: { datasetId: 'entries' },
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
async function create(
  value: DuckDBAnalyticsEngine,
  schema = manifest,
): Promise<AnalyticsGeneration> {
  const result = await value.create(
    {
      workspaceId: 'workspace',
      connectionInstanceId: 'connection',
      authorizationKey: 'authorization',
      selectionKey: 'selection',
    },
    schema,
    { datasetId: 'entries' },
  )
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
        await value.publish(generation, 'complete', '2026-11-09T00:00:00Z')
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
    await value.publish(generation, 'unverified', '2026-11-09T00:00:00Z')
    await value.close()
    const reopened = new DuckDBAnalyticsEngine(directory)
    engines.push(reopened)
    const result = await reopened.query(query(), authorizations)
    expect(result.success.rows).toEqual([{ id: 1, team: 'A', hours: 2 }])
    expect(result.success.coverage).toBe('unverified')
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
    await value.publish(first, 'complete', '2026-11-09T00:00:00Z')
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
    await value.publish(second, 'complete', '2026-11-09T00:00:00Z')
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
    await value.publish(generation, 'complete', '2026-11-09T00:00:00Z')
    expect((await value.query(query(), authorizations)).success.rows).toEqual([
      { id: 1, team: 'A', hours: 2, custom_field_42: null },
      { id: 2, team: 'B', hours: 3, custom_field_42: 'yes' },
    ])
  })
  it('executes real SQL using only authorized inputs and rejects wildcard/external access', async () => {
    const { value } = await engine()
    const generation = await create(value)
    await value.append(
      generation,
      batch([
        { id: 1, team: 'A', hours: 2 },
        { id: 2, team: 'A', hours: 3 },
      ]),
    )
    await value.publish(generation, 'complete', '2026-11-09T00:00:00Z')
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
    await value.publish(generation, 'complete', '2026-11-09T00:00:00Z')
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
    await value.publish(generation, 'complete', '2026-11-09T00:00:00Z')
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
        await reopened.publish(generation, 'complete', '2026-11-09T00:00:00Z')
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
    await value.publish(generation, 'complete', '2026-11-09T00:00:00Z')
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
    await value.publish(generation, 'complete', '2026-11-09T00:00:00Z')
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
    await value.publish(second, 'complete', '2026-11-09T00:00:00Z')
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
    const created = await value.create(
      {
        workspaceId: 'workspace',
        connectionInstanceId: 'connection',
        authorizationKey: 'authorization',
        selectionKey: 'selection',
      },
      aggregate,
      {
        datasetId: 'entries',
        execution: {
          kind: 'aggregate',
          groupBy: ['team'],
          measures: [
            { name: 'mean_hours', column: 'hours', operator: 'average' },
          ],
        },
      },
    )
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
    await value.publish(generation, 'complete', '2026-11-09T00:00:00Z')
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
    await value.publish(generation, 'complete', '2026-11-09T00:00:00Z')
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
