import { describe, expect, it } from 'vitest'

import {
  applyResolvedFilterBindings,
  extractDistinctFilterValuesFromRows,
  getBindingCacheKey,
  resolveWorkflowFilterDependencies,
  sanitizeSqlAlias,
  syncEdgesForNode,
} from './analytics-cross-source'
import type { SpaceWorkflowNodeConfig } from './analytics-types'

function makeSourceNode(
  id: string,
  label: string,
  overrides: Partial<SpaceWorkflowNodeConfig> = {},
): SpaceWorkflowNodeConfig {
  return {
    id,
    positionX: 60,
    positionY: 80,
    label,
    subtitle: 'Redmine • Time Entries',
    badge: 'E • EXTRACT',
    kind: 'source',
    dataSourceName: 'Redmine',
    datasetId: 'time_entries',
    ruleSummary: 'Extract',
    sqlPreview: 'SELECT * FROM time_entries',
    upstreamNodeIds: [],
    ...overrides,
  }
}

describe('analytics-cross-source', () => {
  it('sanitizes arbitrary node labels into valid snake_case SQL aliases', () => {
    expect(sanitizeSqlAlias('Horas Redmine (Equipe)', 1)).toBe(
      'horas_redmine_equipe',
    )
    expect(sanitizeSqlAlias('2026 Ponto Eletrônico', 2)).toBe(
      'f_2026_ponto_eletronico',
    )
    expect(sanitizeSqlAlias('---', 3)).toBe('fonte_3')
  })

  it('orders source nodes topologically when one source filters another', () => {
    const users = makeSourceNode('src_users', 'Usuários Redmine')
    const ponto = makeSourceNode('src_ponto', 'Ponto Eletrônico', {
      filterBindings: [
        {
          targetFilterId: 'employee_emails',
          upstreamNodeId: 'src_users',
          sourceColumn: 'email',
          onEmptyUpstream: 'skip_empty',
        },
      ],
    })

    const result = resolveWorkflowFilterDependencies([ponto, users])

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.orderedSourceIds).toEqual([
        'src_users',
        'src_ponto',
      ])
    }
  })

  it('detects dependency cycles across source filter bindings', () => {
    const srcA = makeSourceNode('src_a', 'Fonte A', {
      filterBindings: [
        {
          targetFilterId: 'email',
          upstreamNodeId: 'src_b',
          sourceColumn: 'email',
          onEmptyUpstream: 'fail',
        },
      ],
    })
    const srcB = makeSourceNode('src_b', 'Fonte B', {
      filterBindings: [
        {
          targetFilterId: 'email',
          upstreamNodeId: 'src_a',
          sourceColumn: 'email',
          onEmptyUpstream: 'fail',
        },
      ],
    })

    const result = resolveWorkflowFilterDependencies([srcA, srcB])

    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.messageKey).toBe('ANALYTICS_DEPENDENCY_CYCLE')
    }
  })

  it('extracts distinct non-empty values and rejects cardinality overflow', () => {
    const ok = extractDistinctFilterValuesFromRows(
      [
        { email: 'a@test.com' },
        { email: 'b@test.com' },
        { email: 'a@test.com' },
        { email: '' },
        { email: null },
      ],
      'email',
      10,
    )

    expect(ok.isSuccess()).toBe(true)
    if (ok.isSuccess()) {
      expect(ok.success).toEqual(['a@test.com', 'b@test.com'])
    }

    const overflow = extractDistinctFilterValuesFromRows(
      [{ email: '1' }, { email: '2' }, { email: '3' }],
      'email',
      2,
    )

    expect(overflow.isFailure()).toBe(true)
    if (overflow.isFailure()) {
      expect(overflow.failure.messageKey).toBe(
        'ANALYTICS_CROSS_SOURCE_CARDINALITY_EXCEEDED',
      )
    }
  })

  it('handles ready, waiting, skip_empty, and fail states for filter bindings', () => {
    const skipNode = makeSourceNode('src_ponto', 'Ponto', {
      filterValues: { status: 'active' },
      filterBindings: [
        {
          targetFilterId: 'employee_emails',
          upstreamNodeId: 'src_users',
          sourceColumn: 'email',
          onEmptyUpstream: 'skip_empty',
        },
      ],
    })

    const waiting = applyResolvedFilterBindings(skipNode, {}, {})
    expect(waiting.status).toBe('waiting')

    const key = getBindingCacheKey('src_users', 'email')
    const skipped = applyResolvedFilterBindings(
      skipNode,
      { [key]: [] },
      { src_users: true },
    )
    expect(skipped.status).toBe('skipped_empty')

    const ready = applyResolvedFilterBindings(
      skipNode,
      { [key]: ['gustavo@x.com', 'joao@x.com'] },
      { src_users: true },
    )
    expect(ready.status).toBe('ready')
    expect(ready.filterValues).toEqual({
      status: 'active',
      employee_emails: ['gustavo@x.com', 'joao@x.com'],
    })

    const failNode = makeSourceNode('src_ponto_fail', 'Ponto Fail', {
      filterBindings: [
        {
          targetFilterId: 'employee_emails',
          upstreamNodeId: 'src_users',
          sourceColumn: 'email',
          onEmptyUpstream: 'fail',
        },
      ],
    })
    const failed = applyResolvedFilterBindings(
      failNode,
      { [key]: [] },
      { src_users: true },
    )
    expect(failed.status).toBe('failed')
  })

  it('syncs Filtro and alias edges cleanly for updated nodes', () => {
    const ponto = makeSourceNode('src_ponto', 'Ponto', {
      filterBindings: [
        {
          targetFilterId: 'employee_emails',
          upstreamNodeId: 'src_users',
          sourceColumn: 'email',
          onEmptyUpstream: 'skip_empty',
        },
      ],
    })

    const edges = syncEdgesForNode(
      [{ id: 'old', source: 'old_src', target: 'src_ponto' }],
      ponto,
    )
    expect(edges).toEqual([
      {
        id: 'e_src_users_src_ponto_filtro',
        source: 'src_users',
        target: 'src_ponto',
        label: 'Filtro',
      },
    ])

    const transformNode = makeSourceNode('tx_1', 'Join', {
      kind: 'sql',
      upstreamNodeIds: ['src_users', 'src_ponto'],
      transformInputs: [
        { nodeId: 'src_users', alias: 'usuarios' },
        { nodeId: 'src_ponto', alias: 'ponto' },
      ],
    })
    const txEdges = syncEdgesForNode(edges, transformNode)
    expect(txEdges).toHaveLength(3)
    expect(txEdges.map((e) => e.label)).toEqual(['Filtro', 'usuarios', 'ponto'])
  })
})
