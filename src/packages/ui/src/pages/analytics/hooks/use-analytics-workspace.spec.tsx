import type {
  AnalyticsDatasetQueryInput,
  AnalyticsSyncStrategy,
  IHostBridge,
} from '@mr-tick/application'
import type { AnalyticsLoadProgressEvent } from '@mr-tick/shared/transport'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultBlankSpace } from '../lib/analytics-types'
import { useAnalyticsWorkspace } from './use-analytics-workspace'

const calls = vi.hoisted(() => ({
  getById: vi.fn(),
  listInstalled: vi.fn(),
  listAnalyticsDatasets: vi.fn(),
  fetchAnalyticsDataset: vi.fn(),
  loadAnalyticsDataset: vi.fn(),
  queryAnalytics: vi.fn(),
  getAnalyticsFilterOptions: vi.fn(),
  hydrateAnalytics: vi.fn(),
  saveAnalyticsWorkspaceState: vi.fn(),
  resetAnalyticsStorage: vi.fn(),
  eventsOn: vi.fn(),
  getMetadata: vi.fn(),
}))
const bridge = {
  workspaces: { getById: calls.getById },
  addons: {
    listInstalled: calls.listInstalled,
    listAnalyticsDatasets: calls.listAnalyticsDatasets,
    fetchAnalyticsDataset: calls.fetchAnalyticsDataset,
    loadAnalyticsDataset: calls.loadAnalyticsDataset,
    queryAnalytics: calls.queryAnalytics,
    getAnalyticsFilterOptions: calls.getAnalyticsFilterOptions,
    hydrateAnalytics: calls.hydrateAnalytics,
    saveAnalyticsWorkspaceState: calls.saveAnalyticsWorkspaceState,
    resetAnalyticsStorage: calls.resetAnalyticsStorage,
  },
  events: {
    on: calls.eventsOn,
    emit: vi.fn(),
  },
  core: { getMetadata: calls.getMetadata },
} as unknown as IHostBridge
vi.mock('@/hooks', () => ({ useHostBridge: () => bridge }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ workspaceId: 'workspace' }),
  useNavigate: () => vi.fn(),
}))

const dataset = {
  id: 'telemetry',
  name: 'Telemetry',
  description: '',
  sourceFormat: 'json',
  endpoint: '/telemetry',
  extraction: { modes: ['snapshot'], identity: { kind: 'scope' } },
  columns: [{ name: 'value', label: 'Value', type: 'number' }],
  supportedFilters: [
    {
      id: 'project',
      label: 'Project',
      type: 'select',
      dynamicOptionsSource: 'projects',
    },
  ],
}

function reply(
  generationId: string,
  connectionInstanceId = 'reader',
  selectionKey = 'selection',
  strategy: AnalyticsSyncStrategy = 'full_replace',
  syncedAt = '2026-11-09T00:00:00Z',
) {
  return {
    isSuccess: true,
    statusCode: 200,
    data: {
      strategy,
      publication: {
        generationId,
        selectionKey,
        connectionInstanceId,
        manifest: dataset,
        query: { datasetId: 'telemetry' },
        rowCount: 201,
        coverage: 'unverified' as const,
        loadedAt: syncedAt,
        fetchedAt: syncedAt,
        remoteAggregate: false,
      },
      syncState: {
        connectionInstanceId,
        selectionKey,
        datasetId: 'telemetry',
        strategy,
        lastFastSyncAt: syncedAt,
        lastFullReconcileAt: syncedAt,
        coverage: 'unverified' as const,
      },
    },
  }
}

async function createSource(expectedConnections = 1) {
  const rendered = renderHook(() => useAnalyticsWorkspace())
  await waitFor(() => {
    expect(rendered.result.current.isHydrated).toBe(true)
    expect(rendered.result.current.connectionDisplayOptions).toHaveLength(
      expectedConnections,
    )
  })
  act(() => rendered.result.current.setNewNodeSelectedConnectionId('reader'))
  await waitFor(() =>
    expect(rendered.result.current.nodeSourceDatasets).toHaveLength(1),
  )
  act(() => {
    rendered.result.current.handleSelectDatasetId('telemetry')
    rendered.result.current.setNewNodeLabel('Selected source')
  })
  act(() => rendered.result.current.handleAddWorkflowNode())
  const node = rendered.result.current.activeSpace.workflowNodes.find(
    (item) => item.label === 'Selected source',
  )
  expect(node).toBeDefined()
  return { ...rendered, node }
}

beforeEach(() => {
  vi.resetAllMocks()
  calls.eventsOn.mockImplementation(() => vi.fn())
  calls.hydrateAnalytics.mockResolvedValue({
    isSuccess: true,
    statusCode: 200,
    data: { publications: [] },
  })
  calls.saveAnalyticsWorkspaceState.mockResolvedValue({
    isSuccess: true,
    statusCode: 200,
    data: {
      workspaceId: 'workspace',
      pollingIntervalMinutes: 5,
      updatedAt: '2026-11-10T00:00:00.000Z',
    },
  })
  calls.loadAnalyticsDataset.mockResolvedValue(reply('generation'))
  calls.queryAnalytics.mockResolvedValue({
    isSuccess: true,
    statusCode: 200,
    data: {
      columns: dataset.columns,
      rows: [{ value: 7 }],
      offset: 0,
      limit: 100,
      totalRows: 201,
      hasMore: true,
      version: 'version',
      coverage: 'unverified',
      loadedAt: '2026-11-09T00:00:00Z',
      remoteAggregate: false,
    },
  })
  calls.getById.mockResolvedValue({
    isSuccess: true,
    data: {
      id: 'workspace',
      connections: [
        { id: 'reader', addonId: 'analytics-reader', status: 'connected' },
        { id: 'personal', addonId: 'personal-source', status: 'connected' },
      ],
    },
  })
  calls.listInstalled.mockResolvedValue({
    isSuccess: true,
    data: [
      {
        id: 'analytics-reader',
        name: 'Analytics Reader',
        capabilities: ['auth', 'analytics'],
      },
      {
        id: 'personal-source',
        name: 'Personal',
        capabilities: ['auth', 'dataSource'],
      },
    ],
  })
  calls.listAnalyticsDatasets.mockResolvedValue({
    isSuccess: true,
    data: [dataset],
  })
  calls.getAnalyticsFilterOptions.mockResolvedValue({
    isSuccess: true,
    data: [{ value: 'native-project-id', label: 'Native project' }],
  })
})

describe('Analytics UI independent capability', () => {
  it('offers analytics-only connections and requires explicit source and dataset selection', async () => {
    const { result } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() =>
      expect(
        result.current.connectionDisplayOptions.map((option) => option.id),
      ).toEqual(['reader']),
    )
    expect(result.current.newNodeSelectedConnectionId).toBe('')
    expect(result.current.newNodeDatasetId).toBe('')
    expect(calls.listAnalyticsDatasets).not.toHaveBeenCalled()
    act(() => result.current.setNewNodeSelectedConnectionId('reader'))
    await waitFor(() =>
      expect(result.current.nodeSourceDatasets).toHaveLength(1),
    )
    expect(result.current.newNodeDatasetId).toBe('')
    act(() => result.current.handleSelectDatasetId('telemetry'))
    await waitFor(() =>
      expect(result.current.dynamicFilterOptions.projects).toEqual([
        { value: 'native-project-id', label: 'Native project' },
      ]),
    )
    expect(calls.getAnalyticsFilterOptions).toHaveBeenCalledWith({
      body: {
        workspaceId: 'workspace',
        connectionInstanceId: 'reader',
        source: 'projects',
      },
    })
    expect(calls.getMetadata).not.toHaveBeenCalled()
    expect(calls.fetchAnalyticsDataset).not.toHaveBeenCalled()
  })
})

describe('Native warehouse UI', () => {
  it('loads the whole selection through the host and receives only a local result page', async () => {
    const { result, node } = await createSource()
    if (node === undefined) return
    await waitFor(() =>
      expect(result.current.resolveRowsForWorkflowNode(node).rows).toEqual([
        { value: 7 },
      ]),
    )
    expect(calls.fetchAnalyticsDataset).not.toHaveBeenCalled()
    expect(calls.loadAnalyticsDataset).toHaveBeenCalledWith({
      body: {
        workspaceId: 'workspace',
        connectionInstanceId: 'reader',
        query: expect.not.objectContaining({
          startDate: expect.anything(),
          endDate: expect.anything(),
        }),
        policy: { mode: 'auto' },
      },
    })
    expect(calls.queryAnalytics).toHaveBeenCalledWith({
      body: expect.objectContaining({
        workspaceId: 'workspace',
        targetNodeId: node.id,
        offset: 0,
        limit: 100,
      }),
    })
    expect(
      result.current.resolveRowsForWorkflowNode({
        ...node,
        id: 'other-source',
        connectionId: 'other-reader',
      }).rows,
    ).toEqual([])
  })
  it('paginates locally with a pinned version and does not fetch another provider batch', async () => {
    const { result, node } = await createSource()
    if (node === undefined) return
    act(() => result.current.setInspectedNodeId(node.id))
    await waitFor(() => expect(result.current.canLoadNextBatch).toBe(true))
    await act(async () => {
      await result.current.handleLoadNextSourceBatch(node.id)
    })
    await waitFor(() =>
      expect(calls.queryAnalytics).toHaveBeenCalledWith({
        body: expect.objectContaining({ offset: 100, version: 'version' }),
      }),
    )
    expect(calls.loadAnalyticsDataset).toHaveBeenCalledTimes(1)
    expect(calls.fetchAnalyticsDataset).not.toHaveBeenCalled()
  })
  it('retains the last publication after a failed refresh and exposes the provider failure', async () => {
    const { result, node } = await createSource()
    if (node === undefined) return
    await waitFor(() =>
      expect(result.current.resolveRowsForWorkflowNode(node).rows).toHaveLength(
        1,
      ),
    )
    calls.loadAnalyticsDataset.mockResolvedValue({
      isSuccess: false,
      statusCode: 503,
      error: 'PROVIDER_UNAVAILABLE',
    })
    await act(async () => {
      await result.current.handleSyncAllSources()
    })
    expect(result.current.resolveRowsForWorkflowNode(node).rows).toEqual([
      { value: 7 },
    ])
    expect(result.current.sourceFailures).toEqual([
      { nodeId: node.id, label: node.label, message: 'PROVIDER_UNAVAILABLE' },
    ])
  })
  it('exposes permission errors from the filter catalog', async () => {
    calls.getAnalyticsFilterOptions.mockResolvedValue({
      isSuccess: false,
      statusCode: 403,
      error: 'Forbidden',
    })
    const { result } = await createSource()
    await waitFor(() =>
      expect(result.current.filterOptionsFailures).toEqual([
        { source: 'projects', message: 'Forbidden' },
      ]),
    )
  })
  it('shows no stale page after authorization is rejected for the new query', async () => {
    const { result, node } = await createSource()
    if (node === undefined) return
    act(() => result.current.setInspectedNodeId(node.id))
    await waitFor(() =>
      expect(result.current.inspectedNodeResolvedData.rows).toHaveLength(1),
    )
    calls.queryAnalytics.mockResolvedValue({
      isSuccess: false,
      statusCode: 401,
      error: 'ANALYTICS_AUTHORIZATION_CHANGED',
      details: { connectionInstanceIds: ['reader'] },
    })
    act(() => result.current.setNodeModalSearch('restricted'))
    await waitFor(() =>
      expect(result.current.inspectedSourceError).toBe(
        'ANALYTICS_AUTHORIZATION_CHANGED',
      ),
    )
    expect(result.current.inspectedNodeResolvedData.rows).toEqual([])
  })
  it('paginates searched results with the same search and query version', async () => {
    const { result, node } = await createSource()
    if (node === undefined) return
    act(() => {
      result.current.setInspectedNodeId(node.id)
      result.current.setNodeModalSearch('selected')
    })
    await waitFor(() => expect(result.current.canLoadNextBatch).toBe(true))
    await act(async () => {
      await result.current.handleLoadNextSourceBatch(node.id)
    })
    await waitFor(() =>
      expect(calls.queryAnalytics).toHaveBeenCalledWith({
        body: expect.objectContaining({
          search: 'selected',
          offset: 100,
          version: 'version',
        }),
      }),
    )
    expect(calls.loadAnalyticsDataset).toHaveBeenCalledTimes(1)
  })
  it('offers discovered published fields for explicit selection without adding them silently', async () => {
    const loaded = reply('generation-custom')
    const discovered = {
      name: 'custom_42',
      label: 'Published custom field',
      type: 'string',
      origin: 'custom',
      providerFieldId: '42',
    }
    calls.loadAnalyticsDataset.mockResolvedValue({
      ...loaded,
      data: {
        ...loaded.data,
        publication: {
          ...loaded.data.publication,
          manifest: { ...dataset, columns: [...dataset.columns, discovered] },
        },
      },
    })
    const { result, node } = await createSource()
    if (node === undefined) return
    await waitFor(() =>
      expect(result.current.resolveRowsForWorkflowNode(node).rows).toHaveLength(
        1,
      ),
    )
    act(() => result.current.handleOpenEditNode(node.id))
    await waitFor(() =>
      expect(
        result.current.nodeSourceDatasets.find(
          (item) => item.id === 'telemetry',
        )?.columns,
      ).toContainEqual(discovered),
    )
    expect(result.current.nodeSelectedColumns).toEqual(['value'])
    act(() => result.current.handleToggleNodeSelectedColumn('custom_42', true))
    act(() => result.current.handleSaveEditedNode())
    await waitFor(() =>
      expect(result.current.warehousePlan).toContainEqual(
        expect.objectContaining({
          id: node.id,
          kind: 'source',
          columns: ['value', 'custom_42'],
        }),
      ),
    )
  })

  it('keeps an unrelated connection publication when one inspected source is forbidden', async () => {
    calls.getById.mockResolvedValue({
      isSuccess: true,
      data: {
        id: 'workspace',
        connections: [
          { id: 'reader', addonId: 'analytics-reader', status: 'connected' },
          { id: 'reader-b', addonId: 'analytics-reader', status: 'connected' },
        ],
      },
    })
    calls.loadAnalyticsDataset.mockImplementation(
      async ({ body }: { body: { connectionInstanceId: string } }) => {
        const loaded = reply(
          `generation-${body.connectionInstanceId}`,
          body.connectionInstanceId,
          `selection-${body.connectionInstanceId}`,
        )
        return {
          ...loaded,
          data: {
            ...loaded.data,
            publication: {
              ...loaded.data.publication,
              connectionInstanceId: body.connectionInstanceId,
              selectionKey: `selection-${body.connectionInstanceId}`,
            },
            syncState: {
              ...loaded.data.syncState,
              connectionInstanceId: body.connectionInstanceId,
              selectionKey: `selection-${body.connectionInstanceId}`,
            },
          },
        }
      },
    )
    const { result, node } = await createSource(2)
    if (node === undefined) return
    await waitFor(() =>
      expect(result.current.resolveRowsForWorkflowNode(node).rows).toHaveLength(
        1,
      ),
    )
    act(() => {
      result.current.handleOpenAddNode()
      result.current.setNewNodeSelectedConnectionId('reader-b')
    })
    await waitFor(() =>
      expect(result.current.nodeSourceDatasets).toHaveLength(1),
    )
    act(() => {
      result.current.handleSelectDatasetId('telemetry')
      result.current.setNewNodeLabel('Unrelated source')
    })
    act(() => result.current.handleAddWorkflowNode())
    const unrelated = result.current.activeSpace.workflowNodes.find(
      (item) => item.label === 'Unrelated source',
    )
    expect(unrelated).toBeDefined()
    if (unrelated === undefined) return
    await waitFor(() =>
      expect(
        result.current.resolveRowsForWorkflowNode(unrelated).rows,
      ).toHaveLength(1),
    )
    calls.queryAnalytics.mockImplementation(
      async ({ body }: { body: { targetNodeId: string } }) => {
        if (body.targetNodeId === node.id)
          return {
            isSuccess: false,
            statusCode: 403,
            error: 'FORBIDDEN_A',
            details: { connectionInstanceIds: ['reader'] },
          }
        return {
          isSuccess: true,
          statusCode: 200,
          data: {
            columns: dataset.columns,
            rows: [{ value: 7 }],
            totalRows: 1,
            offset: 0,
            limit: 100,
            hasMore: false,
            version: 'version-b',
            coverage: 'unverified',
            loadedAt: '2026-11-09T00:00:00Z',
            remoteAggregate: false,
          },
        }
      },
    )
    act(() => {
      result.current.setInspectedNodeId(node.id)
      result.current.setNodeModalSearch('restricted')
    })
    await waitFor(() =>
      expect(
        result.current.sourceFailures.some(
          (item) => item.nodeId === node.id && item.message === 'FORBIDDEN_A',
        ),
      ).toBe(true),
    )
    expect(result.current.warehousePlan).toContainEqual(
      expect.objectContaining({
        id: unrelated.id,
        kind: 'source',
        connectionInstanceId: 'reader-b',
      }),
    )
    expect(
      result.current.sourceFailures.some(
        (item) => item.nodeId === unrelated.id,
      ),
    ).toBe(false)
  })
  it('creates a remote aggregate source without requiring raw projection columns', async () => {
    const remote = {
      ...dataset,
      extraction: {
        modes: ['snapshot', 'aggregate'],
        identity: { kind: 'scope' },
        aggregation: {
          groupByColumns: [],
          operators: ['count'],
          postProcessing: 'projection-only',
        },
      },
    }
    calls.listAnalyticsDatasets.mockResolvedValue({
      isSuccess: true,
      data: [remote],
    })
    const execution: AnalyticsDatasetQueryInput['execution'] = {
      kind: 'aggregate',
      groupBy: [],
      measures: [{ name: 'records', operator: 'count' }],
    }
    const loaded = reply('remote-count')
    const resultColumns = [
      { name: 'records', label: 'Records', type: 'number' },
    ]
    calls.loadAnalyticsDataset.mockResolvedValue({
      ...loaded,
      data: {
        ...loaded.data,
        publication: {
          ...loaded.data.publication,
          manifest: { ...remote, columns: resultColumns },
          query: { datasetId: 'telemetry', execution },
          rowCount: 1,
          remoteAggregate: true,
        },
      },
    })
    calls.queryAnalytics.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: {
        columns: resultColumns,
        rows: [{ records: 201 }],
        totalRows: 1,
        offset: 0,
        limit: 100,
        hasMore: false,
        version: 'remote-count',
        coverage: 'complete',
        loadedAt: '2026-11-09T00:00:00Z',
        remoteAggregate: true,
      },
    })
    const { result } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() =>
      expect(result.current.connectionDisplayOptions).toHaveLength(1),
    )
    act(() => result.current.setNewNodeSelectedConnectionId('reader'))
    await waitFor(() =>
      expect(result.current.nodeSourceDatasets).toHaveLength(1),
    )
    act(() => {
      result.current.handleSelectDatasetId('telemetry')
      result.current.handleClearAllNodeColumns()
      result.current.setQueryExecution({
        kind: 'aggregate',
        groupBy: [],
        measures: [{ name: 'records', operator: 'count' }],
      })
      result.current.setNewNodeLabel('Remote count')
    })
    act(() => result.current.handleAddWorkflowNode())
    expect(result.current.activeSpace.workflowNodes).toHaveLength(1)
    await waitFor(() =>
      expect(calls.loadAnalyticsDataset).toHaveBeenCalledWith({
        body: expect.objectContaining({
          query: expect.objectContaining({
            execution: {
              kind: 'aggregate',
              groupBy: [],
              measures: [{ name: 'records', operator: 'count' }],
            },
          }),
        }),
      }),
    )
    await waitFor(() =>
      expect(result.current.warehousePlan).toContainEqual(
        expect.objectContaining({ kind: 'source', columns: ['records'] }),
      ),
    )
  })

  it('resets stale output state when switching handleOpenEditNode across output nodes', async () => {
    const { result, node } = await createSource()
    if (node === undefined) return

    act(() => {
      result.current.handleOpenAddNode()
      result.current.setSelectedAddNodeType('output')
      result.current.setNewNodeLabel('First Output')
      result.current.setOutputSourceNodeId(node.id)
      result.current.setNewNodeWidgetType('pivot_matrix')
      result.current.setOutputCategoryColumn('project')
      result.current.setOutputMetricColumn('value')
      result.current.setOutputSecondaryMetricColumn('value')
      result.current.setOutputHierarchyColumns(['project'])
      result.current.setOutputStackColumn('project')
      result.current.setOutputReferenceLineMode('average')
      result.current.setOutputReferenceLineTarget(42)
    })
    act(() => result.current.handleAddWorkflowNode())

    act(() => {
      result.current.handleOpenAddNode()
      result.current.setSelectedAddNodeType('output')
      result.current.setNewNodeLabel('Second Output')
      result.current.setOutputSourceNodeId(node.id)
      result.current.setNewNodeWidgetType('kpi_card')
      result.current.setOutputMetricColumn('value')
    })
    act(() => result.current.handleAddWorkflowNode())

    const firstOutput = result.current.activeSpace.workflowNodes.find(
      (item) => item.label === 'First Output',
    )
    const secondOutput = result.current.activeSpace.workflowNodes.find(
      (item) => item.label === 'Second Output',
    )
    expect(firstOutput).toBeDefined()
    expect(secondOutput).toBeDefined()
    if (firstOutput === undefined || secondOutput === undefined) return

    act(() => result.current.handleOpenEditNode(firstOutput.id))
    expect(result.current.outputCategoryColumn).toBe('project')
    expect(result.current.outputStackColumn).toBe('project')
    expect(result.current.outputReferenceLineMode).toBe('average')

    act(() => result.current.handleOpenEditNode(secondOutput.id))
    expect(result.current.newNodeWidgetType).toBe('kpi_card')
    expect(result.current.outputCategoryColumn).toBe('')
    expect(result.current.outputSecondaryMetricColumn).toBe('')
    expect(result.current.outputHierarchyColumns).toEqual([])
    expect(result.current.outputStackColumn).toBe('')
    expect(result.current.outputReferenceLineMode).toBe('none')
    expect(result.current.outputReferenceLineTarget).toBe(24)
  })

  it('refuses SQL transforms, unsupported outputs, and card visual switches on remote aggregate sources', async () => {
    const remote = {
      ...dataset,
      extraction: {
        modes: ['snapshot', 'aggregate'],
        identity: { kind: 'scope' },
        aggregation: {
          groupByColumns: ['project'],
          operators: ['sum', 'count'],
          postProcessing: 'projection-only',
        },
      },
    }
    calls.listAnalyticsDatasets.mockResolvedValue({
      isSuccess: true,
      data: [remote],
    })
    const { result } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() =>
      expect(result.current.connectionDisplayOptions).toHaveLength(1),
    )
    act(() => result.current.setNewNodeSelectedConnectionId('reader'))
    await waitFor(() =>
      expect(result.current.nodeSourceDatasets).toHaveLength(1),
    )
    act(() => {
      result.current.handleSelectDatasetId('telemetry')
      result.current.setQueryExecution({
        kind: 'aggregate',
        groupBy: ['project'],
        measures: [{ name: 'records', operator: 'count' }],
      })
      result.current.setNewNodeLabel('Remote source')
    })
    act(() => result.current.handleAddWorkflowNode())

    const remoteNode = result.current.activeSpace.workflowNodes.find(
      (item) => item.label === 'Remote source',
    )
    expect(remoteNode).toBeDefined()
    if (remoteNode === undefined) return

    act(() => {
      result.current.handleOpenAddNode()
      result.current.setSelectedAddNodeType('transform')
      result.current.setNewNodeLabel('Forbidden SQL')
      result.current.setTxUpstreamNodeId(remoteNode.id)
      result.current.setSqlQueryText('SELECT * FROM input')
    })
    act(() => result.current.handleAddWorkflowNode())
    expect(
      result.current.activeSpace.workflowNodes.some(
        (item) => item.label === 'Forbidden SQL',
      ),
    ).toBe(false)

    act(() => {
      result.current.handleOpenAddNode()
      result.current.setSelectedAddNodeType('output')
      result.current.setNewNodeLabel('Forbidden Pivot')
      result.current.setOutputSourceNodeId(remoteNode.id)
      result.current.setNewNodeWidgetType('pivot_matrix')
      result.current.setOutputCategoryColumn('project')
      result.current.setOutputMetricColumn('records')
    })
    act(() => result.current.handleAddWorkflowNode())
    expect(
      result.current.activeSpace.workflowNodes.some(
        (item) => item.label === 'Forbidden Pivot',
      ),
    ).toBe(false)

    act(() => {
      result.current.handleOpenAddNode()
      result.current.setSelectedAddNodeType('output')
      result.current.setNewNodeLabel('Valid Bar')
      result.current.setOutputSourceNodeId(remoteNode.id)
      result.current.setNewNodeWidgetType('bar_vertical')
      result.current.setOutputCategoryColumn('project')
      result.current.setOutputMetricColumn('records')
    })
    act(() => result.current.handleAddWorkflowNode())
    const widget = result.current.activeSpace.widgets.find(
      (item) => item.title === 'Valid Bar',
    )
    expect(widget).toBeDefined()
    if (widget === undefined) return

    act(() => result.current.updateWidgetVisualType(widget.id, 'pivot_matrix'))
    const unchanged = result.current.activeSpace.widgets.find(
      (item) => item.id === widget.id,
    )
    expect(unchanged?.chartVisualType).toBe('bar_vertical')
  })
})

describe('Phase 3 offline hydration, polling, deduplication and progress UI hook', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates DuckDB publications and workspace settings offline without firing remote load when manual polling is configured', async () => {
    const persistedSpace = {
      ...createDefaultBlankSpace('ops-space', 'Operações'),
      workflowNodes: [
        {
          id: 'src-hydrated',
          positionX: 80,
          positionY: 80,
          label: 'Hydrated Source',
          subtitle: 'Analytics Reader • Telemetry',
          badge: 'E • EXTRACT',
          kind: 'source' as const,
          connectionId: 'reader',
          dataSourceName: 'Analytics Reader',
          datasetId: 'telemetry',
          ruleSummary: '',
          sqlPreview: '',
          upstreamNodeIds: [],
        },
      ],
    }

    const hydratedReply = reply(
      'gen-hydrated',
      'reader',
      'hash-hydrated',
      'window_rescan',
      new Date().toISOString(),
    )

    calls.hydrateAnalytics.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: {
        settings: {
          workspaceId: 'workspace',
          pollingIntervalMinutes: 0,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          spacesJson: JSON.stringify([persistedSpace]),
          updatedAt: '2026-11-10T00:00:00.000Z',
        },
        publications: [
          {
            publication: hydratedReply.data.publication,
            syncState: hydratedReply.data.syncState,
          },
        ],
      },
    })

    const { result } = renderHook(() => useAnalyticsWorkspace())

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
      expect(result.current.pollingIntervalMinutes).toBe(0)
    })

    expect(result.current.startDate).toBe('2026-09-01')
    expect(result.current.endDate).toBe('2026-09-30')
    expect(result.current.activeSpace.title).toBe('Operações')
    expect(result.current.syncStatusSummary.hasRollingWindow).toBe(true)
    expect(result.current.hydrateError).toBeUndefined()

    const [hydratedNode] = result.current.activeSpace.workflowNodes
    expect(hydratedNode).toBeDefined()
    if (hydratedNode === undefined) return

    await waitFor(() =>
      expect(
        result.current.resolveRowsForWorkflowNode(hydratedNode).rows,
      ).toEqual([{ value: 7 }]),
    )

    expect(calls.loadAnalyticsDataset).not.toHaveBeenCalled()
    expect(calls.saveAnalyticsWorkspaceState).not.toHaveBeenCalled()

    act(() => result.current.setPollingIntervalMinutes(15))

    await waitFor(() =>
      expect(calls.saveAnalyticsWorkspaceState).toHaveBeenCalledWith({
        body: {
          workspaceId: 'workspace',
          pollingIntervalMinutes: 15,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          spacesJson: JSON.stringify([persistedSpace]),
        },
      }),
    )
  })

  it('keeps hydration failed with structured details and retries explicitly before enabling persistence', async () => {
    calls.hydrateAnalytics.mockResolvedValueOnce({
      isSuccess: false,
      statusCode: 422,
      error: 'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
      details: { storedFormatVersion: ['1'], supportedFormatVersion: ['2'] },
    })
    const { result } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() =>
      expect(result.current.hydrateError).toBe(
        'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
      ),
    )
    expect(result.current.isHydrated).toBe(false)
    expect(result.current.hydrateErrorDetails).toEqual({
      storedFormatVersion: ['1'],
      supportedFormatVersion: ['2'],
    })
    expect(calls.saveAnalyticsWorkspaceState).not.toHaveBeenCalled()
    act(() => result.current.retryHydration())
    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    expect(result.current.hydrateError).toBeUndefined()
    expect(calls.hydrateAnalytics).toHaveBeenCalledTimes(2)
  })

  it('never overwrites invalid persisted spaces with default spaces after hydration fails', async () => {
    calls.hydrateAnalytics.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: {
        publications: [],
        settings: {
          workspaceId: 'workspace',
          pollingIntervalMinutes: 0,
          spacesJson: '{invalid-state',
          updatedAt: '2026-11-10T00:00:00Z',
        },
      },
    })
    const { result } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() =>
      expect(result.current.hydrateError).toBe(
        'ANALYTICS_SPACES_STATE_INVALID',
      ),
    )
    act(() => result.current.setPollingIntervalMinutes(15))
    await act(async () => {})
    expect(calls.saveAnalyticsWorkspaceState).not.toHaveBeenCalled()
    expect(result.current.isHydrated).toBe(false)
  })

  it('surfaces failed settings writes and retries the unchanged snapshot explicitly', async () => {
    const { result } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    calls.saveAnalyticsWorkspaceState.mockResolvedValueOnce({
      isSuccess: false,
      statusCode: 500,
      error: 'STORAGE_WRITE_FAILED',
      details: { storage: ['unavailable'] },
    })
    act(() => result.current.setPollingIntervalMinutes(15))
    await waitFor(() =>
      expect(result.current.settingsError).toBe('STORAGE_WRITE_FAILED'),
    )
    expect(result.current.settingsErrorDetails).toEqual({
      storage: ['unavailable'],
    })
    const attempts = calls.saveAnalyticsWorkspaceState.mock.calls.length
    act(() => result.current.retrySaveWorkspaceState())
    await waitFor(() =>
      expect(calls.saveAnalyticsWorkspaceState).toHaveBeenCalledTimes(
        attempts + 1,
      ),
    )
    await waitFor(() => expect(result.current.settingsError).toBeUndefined())
    expect(
      calls.saveAnalyticsWorkspaceState.mock.lastCall?.[0].body
        .pollingIntervalMinutes,
    ).toBe(15)
  })

  it('persists the latest settings when edits return to the initial snapshot during a pending save', async () => {
    const { result } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    calls.saveAnalyticsWorkspaceState.mockImplementationOnce(async () => {
      await gate
      return { isSuccess: true, statusCode: 200 }
    })
    const initial = result.current.pollingIntervalMinutes
    act(() => result.current.setPollingIntervalMinutes(15))
    await waitFor(() =>
      expect(calls.saveAnalyticsWorkspaceState).toHaveBeenCalledTimes(1),
    )
    act(() => result.current.setPollingIntervalMinutes(initial))
    expect(calls.saveAnalyticsWorkspaceState).toHaveBeenCalledTimes(1)
    await act(async () => release())
    await waitFor(() =>
      expect(calls.saveAnalyticsWorkspaceState).toHaveBeenCalledTimes(2),
    )
    expect(
      calls.saveAnalyticsWorkspaceState.mock.lastCall?.[0].body
        .pollingIntervalMinutes,
    ).toBe(initial)
  })

  it('finishes queued settings writes when leaving Analytics', async () => {
    const { result, unmount } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    calls.saveAnalyticsWorkspaceState.mockImplementationOnce(async () => {
      await gate
      return { isSuccess: true, statusCode: 200 }
    })
    act(() => result.current.setPollingIntervalMinutes(15))
    await waitFor(() =>
      expect(calls.saveAnalyticsWorkspaceState).toHaveBeenCalledTimes(1),
    )
    act(() => result.current.setPollingIntervalMinutes(30))
    unmount()
    await act(async () => release())
    await waitFor(() =>
      expect(calls.saveAnalyticsWorkspaceState).toHaveBeenCalledTimes(2),
    )
    expect(
      calls.saveAnalyticsWorkspaceState.mock.lastCall?.[0].body
        .pollingIntervalMinutes,
    ).toBe(30)
  })

  it('rejects polling outside the persisted contract before changing settings', async () => {
    const { result } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    const interval = result.current.pollingIntervalMinutes
    act(() => result.current.setPollingIntervalMinutes(2000))
    expect(result.current.pollingIntervalMinutes).toBe(interval)
    expect(calls.saveAnalyticsWorkspaceState).not.toHaveBeenCalled()
  })

  it('polls on mount interval only while mounted and sends full reconcile policy on manual sync', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    const nowIso = new Date().toISOString()
    const hydratedReply = reply(
      'gen-recent',
      'reader',
      'hash-recent',
      'incremental_changes',
      nowIso,
    )
    const space = {
      ...createDefaultBlankSpace(),
      workflowNodes: [
        {
          id: 'src-poll',
          positionX: 80,
          positionY: 80,
          label: 'Polled Source',
          subtitle: 'Analytics Reader • Telemetry',
          badge: 'E • EXTRACT',
          kind: 'source' as const,
          connectionId: 'reader',
          dataSourceName: 'Analytics Reader',
          datasetId: 'telemetry',
          ruleSummary: '',
          sqlPreview: '',
          upstreamNodeIds: [],
        },
      ],
    }

    calls.hydrateAnalytics.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: {
        settings: {
          workspaceId: 'workspace',
          pollingIntervalMinutes: 5,
          startDate: '2026-08-01',
          endDate: '2026-10-31',
          spacesJson: JSON.stringify([space]),
          updatedAt: nowIso,
        },
        publications: [
          {
            publication: hydratedReply.data.publication,
            syncState: hydratedReply.data.syncState,
          },
        ],
      },
    })

    const { result, unmount } = renderHook(() => useAnalyticsWorkspace())

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.isHydrated).toBe(true)
    expect(result.current.syncStatusSummary.hasIncrementalChanges).toBe(true)
    expect(calls.loadAnalyticsDataset).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000)
    })

    await waitFor(() =>
      expect(calls.loadAnalyticsDataset).toHaveBeenCalledTimes(1),
    )
    expect(calls.loadAnalyticsDataset).toHaveBeenLastCalledWith({
      body: expect.objectContaining({
        connectionInstanceId: 'reader',
        policy: { mode: 'auto' },
      }),
    })

    await act(async () => {
      await result.current.handleSyncAllSources()
    })

    expect(calls.loadAnalyticsDataset).toHaveBeenCalledTimes(2)
    expect(calls.loadAnalyticsDataset).toHaveBeenLastCalledWith({
      body: expect.objectContaining({
        connectionInstanceId: 'reader',
        policy: { mode: 'full' },
      }),
    })

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })

    expect(calls.loadAnalyticsDataset).toHaveBeenCalledTimes(2)
  })

  it('deduplicates shared source selections while separating distinct customDateRange and normalized filters', async () => {
    const datedDataset = {
      ...dataset,
      selection: { dateRange: true, project: true },
      supportedFilters: [
        {
          id: 'closed_range',
          label: 'Closed Date Range',
          type: 'date_range' as const,
        },
      ],
    }
    calls.listAnalyticsDatasets.mockResolvedValue({
      isSuccess: true,
      data: [datedDataset],
    })
    calls.loadAnalyticsDataset.mockImplementation(
      async ({ body }: { body: { query: AnalyticsDatasetQueryInput } }) => {
        const keySuffix = `${body.query.startDate ?? 'none'}_${body.query.endDate ?? 'none'}`
        return {
          isSuccess: true,
          statusCode: 200,
          data: {
            strategy: 'window_rescan' as const,
            publication: {
              generationId: `gen-${keySuffix}`,
              selectionKey: `key-${keySuffix}`,
              connectionInstanceId: 'reader',
              manifest: datedDataset,
              query: body.query,
              rowCount: 10,
              coverage: 'unverified' as const,
              loadedAt: '2026-11-10T00:00:00.000Z',
              fetchedAt: '2026-11-10T00:00:00.000Z',
              remoteAggregate: false,
            },
            syncState: {
              connectionInstanceId: 'reader',
              selectionKey: `key-${keySuffix}`,
              datasetId: 'telemetry',
              strategy: 'window_rescan' as const,
              lastFastSyncAt: '2026-11-10T00:00:00.000Z',
              lastFullReconcileAt: '2026-11-10T00:00:00.000Z',
              coverage: 'unverified' as const,
            },
          },
        }
      },
    )

    const { result } = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
      expect(result.current.connectionDisplayOptions).toHaveLength(1)
    })

    act(() => result.current.setNewNodeSelectedConnectionId('reader'))
    await waitFor(() =>
      expect(result.current.nodeSourceDatasets).toHaveLength(1),
    )

    act(() => {
      result.current.handleSelectDatasetId('telemetry')
      result.current.setNewNodeLabel('Source Panel A')
    })
    act(() => result.current.handleAddWorkflowNode())

    await waitFor(() =>
      expect(calls.loadAnalyticsDataset).toHaveBeenCalledTimes(1),
    )

    act(() => {
      result.current.handleOpenAddNode()
      result.current.handleSelectDatasetId('telemetry')
      result.current.setNewNodeLabel('Source Panel B')
    })
    act(() => result.current.handleAddWorkflowNode())

    expect(calls.loadAnalyticsDataset).toHaveBeenCalledTimes(1)

    const nodeB = result.current.activeSpace.workflowNodes.find(
      (item) => item.label === 'Source Panel B',
    )
    expect(nodeB).toBeDefined()
    if (nodeB !== undefined) {
      await waitFor(() =>
        expect(result.current.resolveRowsForWorkflowNode(nodeB).rows).toEqual([
          { value: 7 },
        ]),
      )
    }

    act(() => {
      result.current.handleOpenAddNode()
      result.current.handleSelectDatasetId('telemetry')
      result.current.setNewNodeLabel('Source Custom Dates')
      result.current.setNewNodeCustomDateRange({
        from: '2026-01-01',
        to: '2026-01-31',
      })
      result.current.handleSetNodeFilterValue('closed_range', {
        from: '2026-02-01',
        to: '2026-02-28',
      })
    })
    act(() => result.current.handleAddWorkflowNode())

    await waitFor(() =>
      expect(calls.loadAnalyticsDataset).toHaveBeenCalledTimes(2),
    )

    expect(calls.loadAnalyticsDataset).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            datasetId: 'telemetry',
            startDate: '2026-08-01',
            endDate: '2026-10-31',
          }),
        }),
      }),
    )

    expect(calls.loadAnalyticsDataset).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            datasetId: 'telemetry',
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            filters: {
              closed_range: { from: '2026-02-01', to: '2026-02-28' },
            },
          }),
        }),
      }),
    )
  })

  it('tracks live analytics:load-progress events per source and clears progress after completion', async () => {
    let emitProgress: ((event: AnalyticsLoadProgressEvent) => void) | undefined
    calls.eventsOn.mockImplementation(
      (
        channel: string,
        listener: (event: AnalyticsLoadProgressEvent) => void,
      ) => {
        if (channel === 'analytics:load-progress') emitProgress = listener
        return vi.fn()
      },
    )

    let resolveLoad: ((value: unknown) => void) | undefined
    calls.loadAnalyticsDataset.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve
        }),
    )

    const { result, node } = await createSource()
    expect(node).toBeDefined()
    if (node === undefined) return

    await waitFor(() =>
      expect(calls.loadAnalyticsDataset).toHaveBeenCalledTimes(1),
    )

    const [firstCallArgs = []] = calls.loadAnalyticsDataset.mock.calls
    const [sentPayload] = firstCallArgs as Array<
      { body: { query: AnalyticsDatasetQueryInput } } | undefined
    >
    expect(sentPayload).toBeDefined()
    if (sentPayload === undefined) return

    const { analyticsSelectionKey } = await import('@mr-tick/application')
    const selectionKey = await analyticsSelectionKey(sentPayload.body.query)

    await waitFor(() =>
      expect(
        result.current.upstreamStatusByNodeId[node.id]?.isInitialLoading,
      ).toBe(true),
    )

    act(() => {
      emitProgress?.({
        workspaceId: 'workspace',
        connectionInstanceId: 'reader',
        selectionKey,
        datasetId: 'telemetry',
        mode: 'full',
        phase: 'extracting',
        batchIndex: 1,
        fetchedRows: 200,
        totalRows: 500,
      })
    })

    expect(result.current.upstreamStatusByNodeId[node.id]?.progress).toEqual(
      expect.objectContaining({
        phase: 'extracting',
        batchIndex: 1,
        fetchedRows: 200,
        totalRows: 500,
      }),
    )
    expect(result.current.syncStatusSummary.activeProgress).toHaveLength(1)

    await act(async () => {
      resolveLoad?.(reply('gen-prog', 'reader', selectionKey))
    })

    await waitFor(() =>
      expect(
        result.current.upstreamStatusByNodeId[node.id]?.hasPublication,
      ).toBe(true),
    )
    expect(result.current.syncStatusSummary.activeProgress).toHaveLength(0)
  })

  it('exposes hasIncrementalChanges after initial snapshot when manifest declares changes and syncState has checkpoint', async () => {
    const incrementalDataset = {
      ...dataset,
      id: 'issues_incremental',
      name: 'Issues Incremental',
      extraction: {
        modes: ['snapshot', 'changes'] as const,
        identity: { kind: 'row' as const, columns: ['value'] },
        changes: { deletions: 'explicit' as const },
      },
    }
    calls.listAnalyticsDatasets.mockResolvedValue({
      isSuccess: true,
      data: [incrementalDataset],
    })
    calls.loadAnalyticsDataset.mockResolvedValue({
      isSuccess: true,
      statusCode: 200,
      data: {
        strategy: 'full_replace' as const,
        publication: {
          generationId: 'gen-init',
          selectionKey: 'sel-init',
          connectionInstanceId: 'reader',
          manifest: incrementalDataset,
          query: { datasetId: 'issues_incremental' },
          rowCount: 1,
          coverage: 'complete' as const,
          loadedAt: '2026-11-10T10:00:00Z',
          fetchedAt: '2026-11-10T10:00:00Z',
          remoteAggregate: false,
        },
        syncState: {
          connectionInstanceId: 'reader',
          selectionKey: 'sel-init',
          datasetId: 'issues_incremental',
          strategy: 'full_replace' as const,
          checkpoint: '2026-11-10T09:59:00Z',
          lastFastSyncAt: '2026-11-10T10:00:00Z',
          lastFullReconcileAt: '2026-11-10T10:00:00Z',
          coverage: 'complete' as const,
        },
      },
    })

    const rendered = renderHook(() => useAnalyticsWorkspace())
    await waitFor(() => {
      expect(rendered.result.current.isHydrated).toBe(true)
      expect(rendered.result.current.connectionDisplayOptions).toHaveLength(1)
    })

    act(() => rendered.result.current.setNewNodeSelectedConnectionId('reader'))
    await waitFor(() =>
      expect(rendered.result.current.nodeSourceDatasets).toHaveLength(1),
    )

    act(() => {
      rendered.result.current.handleSelectDatasetId('issues_incremental')
      rendered.result.current.setNewNodeLabel('Issues Incremental Node')
    })
    act(() => rendered.result.current.handleAddWorkflowNode())

    await waitFor(() =>
      expect(
        rendered.result.current.syncStatusSummary.hasIncrementalChanges,
      ).toBe(true),
    )
  })

  it('resets blocked analytics storage cleanly, reports reset failures, and recovers on external reset event', async () => {
    let resetListener:
      ((payload: { workspaceId: string; removed: boolean }) => void) | undefined
    calls.eventsOn.mockImplementation(
      (channel: string, listener: (payload: never) => void) => {
        if (channel === 'analytics:storage-reset')
          resetListener = listener as unknown as (payload: {
            workspaceId: string
            removed: boolean
          }) => void
        return vi.fn()
      },
    )

    calls.hydrateAnalytics.mockResolvedValueOnce({
      isSuccess: false,
      statusCode: 400,
      error: 'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
      details: {
        storedFormatVersion: ['1'],
        supportedFormatVersion: ['2'],
      },
    })

    const rendered = renderHook(() => useAnalyticsWorkspace())

    await waitFor(() =>
      expect(rendered.result.current.hydrateError).toBe(
        'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
      ),
    )

    calls.resetAnalyticsStorage.mockResolvedValueOnce({
      isSuccess: false,
      statusCode: 409,
      error: 'ANALYTICS_RESET_ACTIVE_LOAD',
    })

    await act(async () => {
      await rendered.result.current.resetAnalyticsStorage()
    })

    expect(rendered.result.current.resetError).toBe(
      'ANALYTICS_RESET_ACTIVE_LOAD',
    )
    expect(rendered.result.current.hydrateError).toBe(
      'ANALYTICS_STORAGE_FORMAT_UNSUPPORTED',
    )

    calls.resetAnalyticsStorage.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: { workspaceId: 'workspace', removed: true },
    })
    calls.hydrateAnalytics.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: { publications: [] },
    })

    await act(async () => {
      await rendered.result.current.resetAnalyticsStorage()
    })

    await waitFor(() => expect(rendered.result.current.isHydrated).toBe(true))
    expect(rendered.result.current.hydrateError).toBeUndefined()
    expect(rendered.result.current.resetError).toBeUndefined()
    expect(calls.resetAnalyticsStorage).toHaveBeenCalledWith({
      body: { workspaceId: 'workspace' },
    })

    // External reset event from Settings tab resets blocked or hydrated workspace and re-hydrates
    calls.hydrateAnalytics.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: { publications: [] },
    })
    act(() => {
      resetListener?.({ workspaceId: 'workspace', removed: true })
    })
    await waitFor(() => expect(calls.hydrateAnalytics).toHaveBeenCalledTimes(3))
  })

  it('preserves stageTotalRows during modal search and navigates pages and page sizes', async () => {
    calls.queryAnalytics.mockImplementation(
      async ({
        body,
      }: {
        body: { search?: string; offset: number; limit: number }
      }) => {
        const isFiltered = body.search !== undefined && body.search !== ''
        let totalRows = 250
        if (isFiltered) totalRows = 12

        return {
          isSuccess: true,
          statusCode: 200,
          data: {
            columns: dataset.columns,
            rows: [{ value: body.offset + 1 }],
            offset: body.offset,
            limit: body.limit,
            totalRows,
            hasMore: body.offset + body.limit < totalRows,
            version: 'pinned-v1',
            coverage: 'complete' as const,
            loadedAt: '2026-11-10T00:00:00Z',
            remoteAggregate: false,
          },
        }
      },
    )

    const { result, node } = await createSource()
    expect(node).toBeDefined()
    if (node === undefined) return

    await waitFor(() =>
      expect(result.current.resolveRowsForWorkflowNode(node).totalRows).toBe(
        250,
      ),
    )

    act(() => result.current.setInspectedNodeId(node.id))
    await waitFor(() => expect(result.current.inspectedBatch?.index).toBe(0))
    expect(result.current.inspectedNodeResolvedData.stageTotalRows).toBe(250)

    await act(async () => {
      await result.current.handleSelectInspectionPage(node.id, 2)
    })

    await waitFor(() => expect(result.current.inspectedBatch?.offset).toBe(200))
    expect(result.current.inspectedBatch?.index).toBe(2)

    await act(async () => {
      await result.current.handleSelectInspectionPage(node.id, 0)
    })

    await waitFor(() => expect(result.current.inspectedBatch?.offset).toBe(0))

    act(() => result.current.handleChangeInspectionPageSize(node.id, 50))
    await waitFor(() => expect(result.current.inspectedBatch?.limit).toBe(50))

    act(() => result.current.setNodeModalSearch('needle'))
    await waitFor(() =>
      expect(result.current.inspectedNodeResolvedData.totalRows).toBe(12),
    )
    expect(result.current.inspectedNodeResolvedData.stageTotalRows).toBe(250)
  })
})
