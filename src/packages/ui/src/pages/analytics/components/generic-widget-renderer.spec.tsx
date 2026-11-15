import type {
  AnalyticsQueryInput,
  AnalyticsQueryResult,
  IHostBridge,
} from '@mr-tick/application'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
import type * as Recharts from 'recharts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AnalyticsSpaceConfig,
  AnalyticsUpstreamSourceStatus,
  ReferenceLineMode,
  WidgetId,
} from '../lib/analytics-types'
import { GenericWidgetRenderer } from './generic-widget-renderer'

const calls = vi.hoisted(() => ({
  query: vi.fn<IHostBridge['addons']['queryAnalytics']>(),
  charts: vi.fn<(node: ReactNode) => void>(),
  unauthorized: vi.fn<(ids: string[], message: string) => void>(),
}))
const bridge = {
  addons: { queryAnalytics: calls.query },
} as unknown as IHostBridge
vi.mock('@/hooks', () => ({ useHostBridge: () => bridge }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ workspaceId: 'workspace' }),
}))
vi.mock('recharts', async () => ({
  ...(await vi.importActual<typeof Recharts>('recharts')),
  ResponsiveContainer: ({ children }: { children: ReactNode }) => {
    calls.charts(children)
    return null
  },
}))

const columns: AnalyticsQueryResult['columns'] = [
  { name: 'category', label: 'Category', type: 'string' },
  { name: 'series', label: 'Series', type: 'string' },
  { name: 'hours', label: 'Hours', type: 'number' },
]
const space: AnalyticsSpaceConfig = {
  id: 'space',
  title: 'Space',
  subtitle: '',
  badge: '',
  widgets: [],
  workflowEdges: [],
  workflowNodes: [
    {
      id: 'source',
      kind: 'source',
      positionX: 0,
      positionY: 0,
      label: 'Source',
      subtitle: '',
      badge: '',
      connectionId: 'connection',
      dataSourceName: 'Fixture',
      datasetId: 'entries',
      upstreamNodeIds: [],
      ruleSummary: '',
      sqlPreview: '',
    },
  ],
}
const visuals: WidgetId[] = [
  'pivot_matrix',
  'bar_stacked',
  'bar_horizontal_stacked',
  'area_stacked',
]

function queryData(body: AnalyticsQueryInput): AnalyticsQueryResult {
  return {
    columns,
    rows: [{ category: 'A', series: 'X', hours: 2 }],
    totalRows: 1,
    offset: body.offset,
    limit: body.limit,
    hasMore: false,
    version: 'version',
    coverage: 'complete',
    loadedAt: '2026-11-09T00:00:00Z',
    remoteAggregate: false,
  }
}

beforeEach(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.clearAllMocks()
  calls.query.mockImplementation(async ({ body }) => {
    if (
      body.pivot !== undefined &&
      (body.pivot.operator !== 'count' || body.pivot.valueColumn !== undefined)
    )
      return {
        isSuccess: false,
        statusCode: 422,
        error: 'ANALYTICS_MEASURE_COLUMN_REQUIRED',
      }
    const data = queryData(body)
    return { isSuccess: true, statusCode: 200, data }
  })
})

const pagedVisuals: WidgetId[] = [
  'bar_vertical',
  'pivot_matrix',
  'split_pane_chart',
]
it.each(pagedVisuals)(
  'keeps the chart on its initial groups and only paginates tables for %s',
  async (visual) => {
    calls.query.mockImplementation(async ({ body }) => ({
      isSuccess: true,
      statusCode: 200,
      data: {
        ...queryData(body),
        rows: [
          { category: body.offset === 0 ? 'Primeiro' : 'Segundo', hours: 2 },
        ],
        totalRows: 101,
        hasMore: body.offset === 0,
      },
    }))
    renderWidget(visual, 'hours', undefined)

    if (visual === 'bar_vertical') {
      expect(
        await screen.findByText(/Gráfico exibe os primeiros 1 de 101 grupos/),
      ).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Próxima página' }),
      ).not.toBeInTheDocument()
      return
    }

    await screen.findByRole('cell', { name: 'Primeiro' })
    const chartCalls = calls.charts.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(await screen.findByRole('cell', { name: 'Segundo' })).toBeVisible()
    if (visual === 'split_pane_chart') {
      expect(chartCalls).toBeGreaterThan(0)
      expect(
        screen.getByText(/Gráfico exibe os primeiros 1 de 101 grupos/),
      ).toBeVisible()
      expect(calls.charts.mock.lastCall?.[0]).toMatchObject({
        props: { data: [{ category: 'Primeiro', hours: 2 }] },
      })
    }
  },
)

function renderWidget(
  visual: WidgetId,
  metricColumn: string,
  secondaryMetricColumn: string | undefined,
  referenceLineMode?: ReferenceLineMode,
  referenceLineTarget?: number,
) {
  render(
    <GenericWidgetRenderer
      widget={{
        id: 'widget',
        widgetType: visual,
        chartVisualType: visual,
        title: 'Count',
        subtitle: '',
        datasetBadge: '',
        sourceNodeId: 'source',
        span: 1,
        visible: true,
        categoryColumn: 'category',
        stackColumn: 'series',
        metricColumn,
        secondaryMetricColumn,
        referenceLineMode,
        referenceLineTarget,
      }}
      activeSpace={space}
      warehousePlan={[
        {
          id: 'source',
          kind: 'source',
          connectionInstanceId: 'connection',
          selectionKey: 'selection',
        },
        {
          id: 'unrelated',
          kind: 'source',
          connectionInstanceId: 'other-connection',
          selectionKey: 'other-selection',
        },
      ]}
      publicationVersion="generation"
      onUnauthorized={calls.unauthorized}
      resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
      onGenericDrillDown={vi.fn()}
      overloadTolerancePct={10}
      onSetOverloadTolerancePct={vi.fn()}
      idleTolerancePct={10}
      onSetIdleTolerancePct={vi.fn()}
      estimationTolerancePct={10}
      onSetEstimationTolerancePct={vi.fn()}
    />,
  )
}

function collectKeys(node: ReactNode, keys: string[]) {
  if (Array.isArray(node)) {
    for (const child of node) collectKeys(child, keys)
    return
  }
  if (!isValidElement<{ children?: ReactNode; dataKey?: string }>(node)) return
  if (node.props.dataKey !== undefined) keys.push(node.props.dataKey)
  collectKeys(node.props.children, keys)
}

describe('Native widget query contract', () => {
  it.each(visuals)(
    'counts records in %s without inventing a measure column',
    async (visual) => {
      renderWidget(visual, '', undefined)
      await waitFor(() =>
        expect(calls.query).toHaveBeenCalledWith({
          body: expect.objectContaining<Partial<AnalyticsQueryInput>>({
            pivot: {
              rowColumn: 'category',
              pivotColumn: 'series',
              operator: 'count',
              valueColumn: undefined,
            },
          }),
        }),
      )
    },
  )

  const remoteVisuals: WidgetId[] = ['bar_grouped', 'combo_multiaxis']
  it.each(remoteVisuals)(
    'uses the declared remote measure names in %s',
    async (visual) => {
      calls.query.mockImplementation(async ({ body }) => ({
        isSuccess: true,
        statusCode: 200,
        data: {
          columns: [
            { name: 'category', label: 'Category', type: 'string' },
            {
              name: 'published_primary',
              label: 'Primary',
              type: 'number',
            },
            {
              name: 'published_secondary',
              label: 'Secondary',
              type: 'number',
            },
          ],
          rows: [
            {
              category: 'A',
              published_primary: 10,
              published_secondary: 5,
            },
          ],
          totalRows: 1,
          offset: body.offset,
          limit: body.limit,
          hasMore: false,
          version: 'remote-version',
          coverage: 'complete',
          loadedAt: '2026-11-09T00:00:00Z',
          remoteAggregate: true,
        },
      }))
      renderWidget(visual, 'published_primary', 'published_secondary')
      await waitFor(() => expect(calls.charts).toHaveBeenCalled())
      const keys: string[] = []
      for (const [tree] of calls.charts.mock.calls) collectKeys(tree, keys)
      expect(keys).toEqual(
        expect.arrayContaining(['published_primary', 'published_secondary']),
      )
      expect(keys).not.toContain('analytics_metric_primary')
      expect(keys).not.toContain('analytics_metric_secondary')
    },
  )

  it('invalidates only inputs of the failed widget query', async () => {
    calls.query.mockResolvedValue({
      isSuccess: false,
      statusCode: 403,
      error: 'FORBIDDEN_A',
      details: { connectionInstanceIds: ['connection'] },
    })
    renderWidget('bar_vertical', 'hours', undefined)
    await waitFor(() =>
      expect(calls.unauthorized).toHaveBeenCalledWith(
        ['connection'],
        'FORBIDDEN_A',
      ),
    )
    expect(calls.unauthorized).not.toHaveBeenCalledWith(
      expect.arrayContaining(['other-connection']),
      expect.anything(),
    )
  })
  it('shows structured reference failures and retries only that auxiliary query', async () => {
    let rejected = true
    calls.query.mockImplementation(async ({ body }) => {
      if (body.measures !== undefined && body.groupBy?.length === 0) {
        if (rejected)
          return {
            isSuccess: false,
            statusCode: 429,
            error: 'ANALYTICS_ENGINE_QUEUE_LIMIT',
            details: { reference: ['queue saturated'] },
          }
        return {
          isSuccess: true,
          statusCode: 200,
          data: {
            ...queryData(body),
            columns: [
              {
                name: 'analytics_metric_primary',
                label: 'Mean',
                type: 'number',
              },
            ],
            rows: [{ analytics_metric_primary: 4.5 }],
          },
        }
      }
      return { isSuccess: true, statusCode: 200, data: queryData(body) }
    })
    renderWidget('line_reference', 'hours', undefined, 'average')
    await waitFor(() => expect(calls.charts).toHaveBeenCalled())
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver avisos do gráfico' }),
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('ANALYTICS_ENGINE_QUEUE_LIMIT')
    expect(alert).toHaveTextContent('queue saturated')
    const before = calls.query.mock.calls.length
    rejected = false
    fireEvent.click(
      screen.getByRole('button', { name: 'Tentar referência novamente' }),
    )
    await waitFor(() => expect(calls.query).toHaveBeenCalledTimes(before + 1))
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    )
  })
  const noSummary: ReferenceLineMode[] = ['none', 'fixed_target']
  it.each(noSummary)(
    'does not request an unused reference summary for %s',
    async (mode) => {
      renderWidget('line_reference', 'hours', undefined, mode, 12)
      await waitFor(() => expect(calls.charts).toHaveBeenCalled())
      expect(calls.query).toHaveBeenCalledTimes(2)
      expect(
        calls.query.mock.calls.some(
          ([request]) => request.body.groupBy?.length === 0,
        ),
      ).toBe(false)
    },
  )
  const unsupportedRemote: ReferenceLineMode[] = ['average', 'weighted_ratio']
  it.each(unsupportedRemote)(
    'makes unsupported remote %s post-processing explicit',
    async (mode) => {
      calls.query.mockImplementation(async ({ body }) => {
        if (body.measures !== undefined)
          return {
            isSuccess: false,
            statusCode: 422,
            error: 'ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY',
          }
        return {
          isSuccess: true,
          statusCode: 200,
          data: {
            ...queryData(body),
            columns: [
              { name: 'category', label: 'Category', type: 'string' },
              { name: 'remote_total', label: 'Total', type: 'number' },
              { name: 'remote_capacity', label: 'Capacity', type: 'number' },
            ],
            rows: [{ category: 'A', remote_total: 10, remote_capacity: 5 }],
            remoteAggregate: true,
          },
        }
      })
      renderWidget('line_reference', 'remote_total', 'remote_capacity', mode)
      await waitFor(() => expect(calls.charts).toHaveBeenCalled())
      fireEvent.click(
        await screen.findByRole('button', { name: 'Ver avisos do gráfico' }),
      )
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY',
      )
    },
  )
  it('exposes the native error for an average without a numeric measure', async () => {
    calls.query.mockImplementation(async ({ body }) => {
      if (body.measures?.some((measure) => measure.operator === 'avg'))
        return {
          isSuccess: false,
          statusCode: 422,
          error: 'ANALYTICS_MEASURE_COLUMN_REQUIRED',
        }
      return { isSuccess: true, statusCode: 200, data: queryData(body) }
    })
    renderWidget('line_reference', '', undefined, 'average')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver avisos do gráfico' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ANALYTICS_MEASURE_COLUMN_REQUIRED',
    )
  })
  const remotePostProcessed: WidgetId[] = [
    'pivot_matrix',
    'tree_grid',
    'conditional_table',
  ]
  it.each(remotePostProcessed)(
    'does not silently skip %s post-processing on a remote aggregate',
    async (visual) => {
      calls.query.mockImplementation(async ({ body }) => {
        if (
          body.pivot !== undefined ||
          body.rollup === true ||
          body.calculation !== undefined
        )
          return {
            isSuccess: false,
            statusCode: 422,
            error: 'ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY',
          }
        return {
          isSuccess: true,
          statusCode: 200,
          data: {
            ...queryData(body),
            columns: [
              { name: 'category', label: 'Category', type: 'string' },
              { name: 'series', label: 'Series', type: 'string' },
              { name: 'remote_total', label: 'Total', type: 'number' },
              { name: 'remote_capacity', label: 'Capacity', type: 'number' },
            ],
            rows: [
              {
                category: 'A',
                series: 'X',
                remote_total: 10,
                remote_capacity: 5,
              },
            ],
            remoteAggregate: true,
          },
        }
      })
      render(
        <GenericWidgetRenderer
          widget={{
            id: 'widget',
            widgetType: visual,
            chartVisualType: visual,
            title: 'Remote Post',
            subtitle: '',
            datasetBadge: '',
            sourceNodeId: 'source',
            span: 1,
            visible: true,
            categoryColumn: 'category',
            stackColumn: 'series',
            hierarchyColumns: ['category'],
            metricColumn: 'remote_total',
            secondaryMetricColumn: 'remote_capacity',
          }}
          activeSpace={space}
          warehousePlan={[
            {
              id: 'source',
              kind: 'source',
              connectionInstanceId: 'connection',
              selectionKey: 'selection',
            },
          ]}
          publicationVersion="generation"
          onUnauthorized={calls.unauthorized}
          resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
          onGenericDrillDown={vi.fn()}
          overloadTolerancePct={10}
          onSetOverloadTolerancePct={vi.fn()}
          idleTolerancePct={10}
          onSetIdleTolerancePct={vi.fn()}
          estimationTolerancePct={10}
          onSetEstimationTolerancePct={vi.fn()}
        />,
      )
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY',
      )
    },
  )

  it('shows initial batch loading progress without firing premature local queries', () => {
    const onRetrySource = vi.fn()
    const upstreamStatus: AnalyticsUpstreamSourceStatus = {
      hasPublication: false,
      isInitialLoading: true,
      isRefreshing: false,
      progress: {
        workspaceId: 'workspace',
        connectionInstanceId: 'connection',
        selectionKey: 'selection',
        datasetId: 'entries',
        mode: 'full',
        phase: 'extracting',
        batchIndex: 2,
        fetchedRows: 300,
        totalRows: 1000,
      },
    }

    render(
      <GenericWidgetRenderer
        widget={{
          id: 'widget',
          widgetType: 'bar_vertical',
          chartVisualType: 'bar_vertical',
          title: 'Initial load',
          subtitle: '',
          datasetBadge: '',
          sourceNodeId: 'source',
          span: 1,
          visible: true,
          categoryColumn: 'category',
          metricColumn: 'hours',
        }}
        activeSpace={space}
        warehousePlan={[]}
        publicationVersion="[]"
        upstreamStatus={upstreamStatus}
        onRetrySource={onRetrySource}
        onUnauthorized={calls.unauthorized}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={10}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={10}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Carregando lote 3 • 300 de 1000 registros',
    )
    expect(calls.query).not.toHaveBeenCalled()
  })

  it('retains rendered chart during background refresh and shows non-destructive cache warning with retry on transient refresh error', async () => {
    const onRetrySource = vi.fn()
    const plan = [
      {
        id: 'source',
        kind: 'source' as const,
        connectionInstanceId: 'connection',
        selectionKey: 'selection',
      },
    ]

    const rendered = render(
      <GenericWidgetRenderer
        widget={{
          id: 'widget',
          widgetType: 'bar_vertical',
          chartVisualType: 'bar_vertical',
          title: 'Cached Chart',
          subtitle: '',
          datasetBadge: '',
          sourceNodeId: 'source',
          span: 1,
          visible: true,
          categoryColumn: 'category',
          metricColumn: 'hours',
        }}
        activeSpace={space}
        warehousePlan={plan}
        publicationVersion="gen-1"
        upstreamStatus={{
          hasPublication: true,
          isInitialLoading: false,
          isRefreshing: false,
        }}
        onRetrySource={onRetrySource}
        onUnauthorized={calls.unauthorized}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={10}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={10}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    await waitFor(() => expect(calls.charts).toHaveBeenCalled())
    const initialChartCalls = calls.charts.mock.calls.length
    expect(
      screen.queryByRole('combobox', { name: 'Agregação da visualização' }),
    ).not.toBeInTheDocument()
    const summaryText = screen.getByText(/grupos/)

    rendered.rerender(
      <GenericWidgetRenderer
        widget={{
          id: 'widget',
          widgetType: 'bar_vertical',
          chartVisualType: 'bar_vertical',
          title: 'Cached Chart',
          subtitle: '',
          datasetBadge: '',
          sourceNodeId: 'source',
          span: 1,
          visible: true,
          categoryColumn: 'category',
          metricColumn: 'hours',
        }}
        activeSpace={space}
        warehousePlan={plan}
        publicationVersion="gen-1"
        upstreamStatus={{
          hasPublication: true,
          isInitialLoading: false,
          isRefreshing: true,
        }}
        onRetrySource={onRetrySource}
        onUnauthorized={calls.unauthorized}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={10}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={10}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    expect(calls.charts.mock.calls.length).toBeGreaterThanOrEqual(
      initialChartCalls,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Atualizando em segundo plano...',
    )
    expect(screen.getByText(/grupos/)).toBe(summaryText)

    rendered.rerender(
      <GenericWidgetRenderer
        widget={{
          id: 'widget',
          widgetType: 'bar_vertical',
          chartVisualType: 'bar_vertical',
          title: 'Cached Chart',
          subtitle: '',
          datasetBadge: '',
          sourceNodeId: 'source',
          span: 1,
          visible: true,
          categoryColumn: 'category',
          metricColumn: 'hours',
        }}
        activeSpace={space}
        warehousePlan={plan}
        publicationVersion="gen-1"
        upstreamStatus={{
          hasPublication: true,
          isInitialLoading: false,
          isRefreshing: false,
          error: 'REDMINE_TIMEOUT',
        }}
        onRetrySource={onRetrySource}
        onUnauthorized={calls.unauthorized}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={10}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={10}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/grupos/)).toBe(summaryText)
    fireEvent.click(
      screen.getByRole('button', { name: 'Ver avisos do gráfico' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('REDMINE_TIMEOUT')
    expect(
      screen.getByText('Exibindo última versão disponível em cache.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetrySource).toHaveBeenCalledTimes(1)
  })

  it('displays Portuguese coverage labels and localized timestamp instead of raw unverified or ISO text', async () => {
    const testPlan = [
      {
        id: 'source',
        kind: 'source' as const,
        connectionInstanceId: 'connection',
        selectionKey: 'selection',
      },
    ]

    calls.query.mockImplementation(async ({ body }) => ({
      isSuccess: true,
      statusCode: 200,
      data: {
        ...queryData(body),
        coverage: 'unverified',
        loadedAt: '2026-11-14T06:18:29.592Z',
      },
    }))

    render(
      <GenericWidgetRenderer
        widget={{
          id: 'widget-coverage',
          widgetType: 'bar_vertical',
          chartVisualType: 'bar_vertical',
          title: 'Coverage Chart',
          subtitle: '',
          datasetBadge: '',
          sourceNodeId: 'source',
          span: 1,
          visible: true,
          categoryColumn: 'category',
          metricColumn: 'hours',
        }}
        activeSpace={space}
        warehousePlan={testPlan}
        publicationVersion="gen-1"
        upstreamStatus={{
          hasPublication: true,
          isInitialLoading: false,
          isRefreshing: false,
        }}
        onRetrySource={vi.fn()}
        onUnauthorized={calls.unauthorized}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={10}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={10}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Cobertura parcial')).toBeInTheDocument()
    })
    expect(screen.queryByText(/unverified/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText('2026-11-14T06:18:29.592Z'),
    ).not.toBeInTheDocument()
  })

  it('never emits analytics_metric_secondary as a series label when secondaryMetricLabel is omitted', async () => {
    const testPlan = [
      {
        id: 'source',
        kind: 'source' as const,
        connectionInstanceId: 'connection',
        selectionKey: 'selection',
      },
    ]

    calls.query.mockImplementation(async ({ body }) => ({
      isSuccess: true,
      statusCode: 200,
      data: {
        columns: [
          { name: 'category', label: 'Category', type: 'string' },
          { name: 'hours', label: 'Hours', type: 'number' },
          {
            name: 'estimated_hours',
            label: 'Estimated Hours',
            type: 'number',
          },
        ],
        rows: [{ category: 'Dev', hours: 10, estimated_hours: 12 }],
        totalRows: 1,
        offset: body.offset,
        limit: body.limit,
        hasMore: false,
        version: 'v1',
        coverage: 'complete',
        loadedAt: '2026-11-14T06:18:29.592Z',
        remoteAggregate: false,
      },
    }))

    render(
      <GenericWidgetRenderer
        widget={{
          id: 'widget-labels',
          widgetType: 'bar_horizontal',
          chartVisualType: 'bar_horizontal',
          title: 'Dual Metric Chart',
          subtitle: '',
          datasetBadge: '',
          sourceNodeId: 'source',
          span: 1,
          visible: true,
          categoryColumn: 'category',
          metricColumn: 'hours',
          secondaryMetricColumn: 'estimated_hours',
        }}
        activeSpace={space}
        warehousePlan={testPlan}
        publicationVersion="gen-1"
        upstreamStatus={{
          hasPublication: true,
          isInitialLoading: false,
          isRefreshing: false,
        }}
        onRetrySource={vi.fn()}
        onUnauthorized={calls.unauthorized}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={10}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={10}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(calls.charts).toHaveBeenCalled()
    })

    const hasInternalKey = (node: ReactNode): boolean => {
      if (typeof node === 'string') {
        return node.includes('analytics_metric_secondary')
      }

      if (!isValidElement(node)) {
        return false
      }

      const props = node.props as Record<string, unknown>

      if (
        typeof props.name === 'string' &&
        props.name.includes('analytics_metric_secondary')
      ) {
        return true
      }

      if (Array.isArray(props.children)) {
        return props.children.some((child) => hasInternalKey(child))
      }

      return hasInternalKey(props.children as ReactNode)
    }

    const latestCall = calls.charts.mock.calls.at(-1)
    expect(latestCall).toBeDefined()

    if (latestCall) {
      expect(hasInternalKey(latestCall[0])).toBe(false)
    }
  })

  it('renders scrollable container when showAllRows is enabled with 35 rows and formats percentage mode', async () => {
    const testPlan = [
      {
        id: 'source',
        kind: 'source' as const,
        connectionInstanceId: 'connection',
        selectionKey: 'selection',
      },
    ]

    const manyRows = Array.from({ length: 35 }, (_, idx) => ({
      category: `Membro ${idx + 1}`,
      hours: 10 + idx,
    }))

    calls.query.mockImplementation(async ({ body }) => ({
      isSuccess: true,
      statusCode: 200,
      data: {
        ...queryData(body),
        rows: manyRows,
        totalRows: 35,
      },
    }))

    const { container } = render(
      <GenericWidgetRenderer
        widget={{
          id: 'widget-scroll-pct',
          widgetType: 'bar_horizontal',
          chartVisualType: 'bar_horizontal',
          title: 'Membros Scroll Percentage',
          subtitle: '',
          datasetBadge: '',
          sourceNodeId: 'source',
          span: 2,
          visible: true,
          categoryColumn: 'category',
          metricColumn: 'hours',
          showAllRows: true,
          valueDisplayMode: 'percentage',
        }}
        activeSpace={space}
        warehousePlan={testPlan}
        publicationVersion="gen-1"
        upstreamStatus={{
          hasPublication: true,
          isInitialLoading: false,
          isRefreshing: false,
        }}
        onRetrySource={vi.fn()}
        onUnauthorized={calls.unauthorized}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={10}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={10}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(calls.charts).toHaveBeenCalled()
    })

    expect(container.querySelector('.overflow-y-auto')).not.toBeNull()
  })

  it('uses column label metadata instead of hashed pivot column name for stacked series', async () => {
    const testPlan = [
      {
        id: 'source',
        kind: 'source' as const,
        connectionInstanceId: 'connection',
        selectionKey: 'selection',
      },
    ]

    calls.query.mockImplementation(async ({ body }) => ({
      isSuccess: true,
      statusCode: 200,
      data: {
        columns: [
          { name: 'category', label: 'Colaborador', type: 'string' },
          { name: 'pivot_abc123', label: 'Desenvolvimento', type: 'number' },
        ],
        rows: [{ category: 'Ana Oliveira', pivot_abc123: 12 }],
        totalRows: 1,
        offset: body.offset,
        limit: body.limit,
        hasMore: false,
        version: 'version',
        coverage: 'complete',
        loadedAt: '2026-11-09T00:00:00Z',
        remoteAggregate: false,
      },
    }))

    render(
      <GenericWidgetRenderer
        widget={{
          id: 'widget-pivot-labels',
          widgetType: 'bar_horizontal_stacked',
          chartVisualType: 'bar_horizontal_stacked',
          title: 'Horas por Colaborador x Atividade',
          subtitle: '',
          datasetBadge: '',
          sourceNodeId: 'source',
          span: 2,
          visible: true,
          categoryColumn: 'category',
          metricColumn: 'hours',
          stackColumn: 'series',
        }}
        activeSpace={space}
        warehousePlan={testPlan}
        publicationVersion="gen-1"
        upstreamStatus={{
          hasPublication: true,
          isInitialLoading: false,
          isRefreshing: false,
        }}
        onRetrySource={vi.fn()}
        onUnauthorized={calls.unauthorized}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={10}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={10}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(calls.charts).toHaveBeenCalled()
    })

    const hasSeriesName = (node: ReactNode, expectedName: string): boolean => {
      if (Array.isArray(node))
        return node.some((item) => hasSeriesName(item, expectedName))
      if (typeof node === 'string') return node.includes(expectedName)
      if (!isValidElement(node)) return false

      const props = node.props as Record<string, unknown>

      if (props.name === expectedName) return true
      if (Array.isArray(props.children))
        return props.children.some((child) =>
          hasSeriesName(child, expectedName),
        )

      return hasSeriesName(props.children as ReactNode, expectedName)
    }

    const latestCall = calls.charts.mock.calls.at(-1)
    expect(latestCall).toBeDefined()

    if (latestCall) {
      expect(hasSeriesName(latestCall[0], 'Desenvolvimento')).toBe(true)
      expect(hasSeriesName(latestCall[0], 'Pivot Abc123')).toBe(false)
    }
  })
})
