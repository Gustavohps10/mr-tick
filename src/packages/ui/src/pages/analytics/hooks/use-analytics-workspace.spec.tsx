import type {
  AnalyticsDatasetQueryInput,
  IHostBridge,
} from '@mr-tick/application'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnalyticsWorkspace } from './use-analytics-workspace'

const calls = vi.hoisted(() => ({
  getById: vi.fn(),
  listInstalled: vi.fn(),
  listAnalyticsDatasets: vi.fn(),
  fetchAnalyticsDataset: vi.fn(),
  loadAnalyticsDataset: vi.fn(),
  queryAnalytics: vi.fn(),
  getAnalyticsFilterOptions: vi.fn(),
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

function reply(generationId: string) {
  return {
    isSuccess: true,
    statusCode: 200,
    data: {
      publication: {
        generationId,
        selectionKey: 'selection',
        connectionInstanceId: 'reader',
        manifest: dataset,
        query: { datasetId: 'telemetry' },
        rowCount: 201,
        coverage: 'unverified',
        loadedAt: '2026-11-09T00:00:00Z',
        fetchedAt: '2026-11-09T00:00:00Z',
        remoteAggregate: false,
      },
    },
  }
}

async function createSource(expectedConnections = 1) {
  const rendered = renderHook(() => useAnalyticsWorkspace())
  await waitFor(() =>
    expect(rendered.result.current.connectionDisplayOptions).toHaveLength(
      expectedConnections,
    ),
  )
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
        const loaded = reply(`generation-${body.connectionInstanceId}`)
        return {
          ...loaded,
          data: {
            publication: {
              ...loaded.data.publication,
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
          return { isSuccess: false, statusCode: 403, error: 'FORBIDDEN_A' }
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
