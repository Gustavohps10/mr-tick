import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetRow,
  AnalyticsDatasetScope,
  AnalyticsExecutionRequest,
  AnalyticsFilterDynamicSource,
  AnalyticsPlanNode,
  AnalyticsPublication,
  WorkspaceViewModel,
} from '@mr-tick/application'
import { createAnalyticsDatasetScope } from '@mr-tick/application'
import type { AddonManifestViewModel } from '@mr-tick/sdk'
import { isAnalytics } from '@mr-tick/shared/helpers'
import {
  type Edge,
  MarkerType,
  type Node,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { format } from 'date-fns'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useNavigate, useParams } from 'react-router-dom'

import { useHostBridge } from '@/hooks'

import {
  buildAnalyticsPlan,
  isRemoteAggregateUnsupportedVisual,
  isRemoteAggregateUpstream,
} from '../lib/analytics-plan'
import {
  type AddNodeTypeOption,
  type AnalyticsFilterOption,
  type AnalyticsFilterValue,
  type AnalyticsSpaceConfig,
  type AvailableProjectOption,
  type CanvasLayerMode,
  type ChartVisualType,
  type ConnectionDisplayOption,
  createDefaultBlankSpace,
  type DrillDownSelection,
  GENERIC_CHART_MODELS,
  type PipelineNodeData,
  type ReferenceLineMode,
  type SpaceWidgetConfig,
  type SpaceWorkflowNodeConfig,
  type WidgetId,
  type WidgetSpan,
  type WorkflowNodeKind,
} from '../lib/analytics-types'
import { useAnalyticsNodePages } from './use-analytics-node-pages'

function queryWithDatasetSelection(
  input: AnalyticsDatasetQueryInput,
  manifest: AnalyticsDatasetManifest | undefined,
): AnalyticsDatasetQueryInput {
  const scope = createAnalyticsDatasetScope(input)

  if (manifest?.selection?.dateRange !== true) {
    delete scope.startDate
    delete scope.endDate
  }

  if (manifest?.selection?.project !== true) delete scope.projectId
  return { ...scope, execution: input.execution }
}

interface CachedAnalyticsResult {
  workspaceId: string
  connectionId: string
  scope: AnalyticsDatasetScope
  publication: AnalyticsPublication
}

function resolveEffectiveNodeDates(
  filterValues: Record<string, AnalyticsFilterValue> | undefined,
  fallbackStart: string,
  fallbackEnd: string,
): { from: string; to: string } {
  if (!filterValues) return { from: fallbackStart, to: fallbackEnd }

  const rangeVal = filterValues.date_range

  if (
    typeof rangeVal === 'object' &&
    rangeVal !== null &&
    !Array.isArray(rangeVal)
  ) {
    let from = fallbackStart
    let to = fallbackEnd

    if (
      'from' in rangeVal &&
      typeof rangeVal.from === 'string' &&
      rangeVal.from
    )
      from = rangeVal.from

    if ('to' in rangeVal && typeof rangeVal.to === 'string' && rangeVal.to)
      to = rangeVal.to

    return { from, to }
  }

  return { from: fallbackStart, to: fallbackEnd }
}

function resolveEffectiveNodeProject(
  filterValues: Record<string, AnalyticsFilterValue> | undefined,
): string {
  if (!filterValues) return 'all'
  const p = filterValues.project_id

  if (typeof p === 'string' && p.trim()) return p.trim()

  return 'all'
}

export function useAnalyticsWorkspace() {
  const { workspaceId, pageId } = useParams<{
    workspaceId: string
    pageId?: string
  }>()
  const navigate = useNavigate()
  const bridge = useHostBridge()

  const [spaces, setSpaces] = useState<AnalyticsSpaceConfig[]>(() => [
    createDefaultBlankSpace(),
  ])
  const [layerMode, setLayerMode] = useState<CanvasLayerMode>('front')
  const [workspace, setWorkspace] = useState<WorkspaceViewModel | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')

  const [startDate, setStartDate] = useState<string>('2026-08-01')
  const [endDate, setEndDate] = useState<string>('2026-10-31')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: new Date(2026, 7, 1),
    to: new Date(2026, 9, 31),
  }))

  const [datasetResults, setDatasetResults] = useState<
    Record<string, CachedAnalyticsResult>
  >({})
  const [installedAddons, setInstalledAddons] = useState<
    AddonManifestViewModel[]
  >([])
  const [isFetchingLive, setIsFetchingLive] = useState<boolean>(false)

  const [overloadTolerancePct, setOverloadTolerancePct] = useState<number>(10)
  const [idleTolerancePct, setIdleTolerancePct] = useState<number>(15)
  const [estimationTolerancePct, setEstimationTolerancePct] =
    useState<number>(15)

  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null)
  const [nodeModalSearch, setNodeModalSearch] = useState<string>('')
  const [drillDown, setDrillDown] = useState<DrillDownSelection | null>(null)

  const [isNewSpaceModalOpen, setIsNewSpaceModalOpen] = useState<boolean>(false)
  const [newSpaceTitle, setNewSpaceTitle] = useState<string>('')
  const [newSpaceSubtitle, setNewSpaceSubtitle] = useState<string>('')
  const [newSpaceWidgets, setNewSpaceWidgets] = useState<WidgetId[]>([
    'bar_vertical',
    'bar_stacked',
  ])

  const [isAddNodeModalOpen, setIsAddNodeModalOpen] = useState<boolean>(false)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [selectedAddNodeType, setSelectedAddNodeType] =
    useState<AddNodeTypeOption>('source')
  const [newNodeLabel, setNewNodeLabel] = useState<string>('')
  const [newNodeSelectedConnectionId, setNewNodeSelectedConnectionId] =
    useState<string>('')
  const [queryExecution, setQueryExecution] =
    useState<AnalyticsExecutionRequest>()
  const [newNodeDatasetId, setNewNodeDatasetId] = useState<string>('')
  const [sourceCatalog, setNodeSourceDatasets] = useState<
    AnalyticsDatasetManifest[]
  >([])
  const nodeSourceDatasets = useMemo(() => {
    if (editingNodeId === null) return sourceCatalog
    const cached = datasetResults[editingNodeId]
    if (
      cached === undefined ||
      cached.workspaceId !== workspaceId ||
      cached.connectionId !== newNodeSelectedConnectionId ||
      cached.publication.remoteAggregate ||
      cached.publication.manifest.id !== newNodeDatasetId
    )
      return sourceCatalog
    return sourceCatalog.map((dataset) => {
      if (dataset.id !== cached.publication.manifest.id) return dataset
      return { ...dataset, columns: cached.publication.manifest.columns }
    })
  }, [
    sourceCatalog,
    editingNodeId,
    datasetResults,
    workspaceId,
    newNodeSelectedConnectionId,
    newNodeDatasetId,
  ])
  const [isLoadingNodeDatasets, setIsLoadingNodeDatasets] =
    useState<boolean>(false)
  const [nodeSelectedColumns, setNodeSelectedColumns] = useState<string[]>([])
  const [nodeCustomFieldTypes, setNodeCustomFieldTypes] = useState<
    Record<string, 'string' | 'number' | 'date'>
  >({})
  const [newNodeFilterValues, setNewNodeFilterValues] = useState<
    Record<string, AnalyticsFilterValue>
  >({})
  const [connectionMetadataOptions, setConnectionMetadataOptions] = useState<
    Record<AnalyticsFilterDynamicSource, AnalyticsFilterOption[]>
  >({
    projects: [],
    members: [],
    activities: [],
    task_statuses: [],
    task_trackers: [],
    task_priorities: [],
    sprints_versions: [],
  })

  const handleSetNodeFilterValue = useCallback(
    (filterId: string, val: AnalyticsFilterValue) => {
      setNewNodeFilterValues((prev) => ({
        ...prev,
        [filterId]: val,
      }))
    },
    [],
  )

  const [newNodeWidgetType, setNewNodeWidgetType] =
    useState<WidgetId>('bar_vertical')
  const [newNodeSpan, setNewNodeSpan] = useState<WidgetSpan>(2)
  const [outputSourceNodeId, setOutputSourceNodeId] = useState<string>('')
  const [outputCategoryColumn, setOutputCategoryColumn] = useState<string>('')
  const [outputMetricColumn, setOutputMetricColumn] = useState<string>('')
  const [outputSecondaryMetricColumn, setOutputSecondaryMetricColumn] =
    useState<string>('')
  const [outputHierarchyColumns, setOutputHierarchyColumns] = useState<
    string[]
  >([])
  const [outputStackColumn, setOutputStackColumn] = useState<string>('')
  const [outputReferenceLineMode, setOutputReferenceLineMode] =
    useState<ReferenceLineMode>('none')
  const [outputReferenceLineTarget, setOutputReferenceLineTarget] =
    useState<number>(24)

  const [txUpstreamNodeId, setTxUpstreamNodeId] = useState<string>('')
  const [sqlQueryText, setSqlQueryText] = useState<string>('')

  const activeSpace = useMemo<AnalyticsSpaceConfig>(() => {
    if (pageId) {
      const matched = spaces.find((s) => s.id === pageId)
      if (matched) return matched
    }

    const [firstSpace] = spaces
    if (firstSpace) return firstSpace

    return {
      id: 'default',
      title: 'Analytics',
      subtitle: 'Espaço Analítico',
      badge: 'Ativo',
      widgets: [],
      workflowNodes: [],
      workflowEdges: [],
    }
  }, [pageId, spaces])

  const handleSelectSpace = useCallback(
    (targetSpaceId: string) => {
      setLayerMode('front')

      if (workspaceId)
        navigate(`/workspaces/${workspaceId}/analytics/${targetSpaceId}`)
    },
    [navigate, workspaceId],
  )

  const handleDateRangeChange = useCallback(
    (nextRange: DateRange | undefined) => {
      setDateRange(nextRange)
      if (!nextRange || !nextRange.from) return

      const fromStr = format(nextRange.from, 'yyyy-MM-dd')
      setStartDate(fromStr)

      if (nextRange.to) {
        const toStr = format(nextRange.to, 'yyyy-MM-dd')
        setEndDate(toStr)
      }
    },
    [],
  )

  useEffect(() => {
    if (!workspaceId) return
    let active = true

    bridge.workspaces.getById({ body: { workspaceId } }).then((res) => {
      if (!active) return

      if (res.isSuccess && res.data) setWorkspace(res.data)
    })

    return () => {
      active = false
    }
  }, [bridge.workspaces, workspaceId])

  useEffect(() => {
    let active = true

    if (bridge.addons && bridge.addons.listInstalled) {
      bridge.addons.listInstalled().then((res) => {
        if (!active) return

        if (res.isSuccess && res.data) setInstalledAddons(res.data)
      })
    }

    return () => {
      active = false
    }
  }, [bridge.addons])

  const connectionDisplayOptions = useMemo<ConnectionDisplayOption[]>(() => {
    if (!workspace || workspace.connections.length === 0) return []

    const options: ConnectionDisplayOption[] = []

    for (const conn of workspace.connections) {
      if (conn.status !== 'connected') continue

      const matchedAddon = installedAddons.find((a) => a.id === conn.addonId)

      if (!matchedAddon) continue

      if (!isAnalytics(matchedAddon.capabilities)) continue

      let addonName = matchedAddon.name

      if (!addonName) addonName = conn.addonId

      let identityName = ''

      if (conn.identity && conn.identity.displayName)
        identityName = conn.identity.displayName

      if (!identityName && conn.member && conn.member.name)
        identityName = conn.member.name

      if (!identityName && conn.member && conn.member.login)
        identityName = conn.member.login

      if (!identityName && conn.connectionProfileId)
        identityName = conn.connectionProfileId

      let logoUrl = ''

      if (matchedAddon.logo) logoUrl = matchedAddon.logo

      if (!logoUrl && conn.identity && conn.identity.avatarUrl)
        logoUrl = conn.identity.avatarUrl

      options.push({
        id: conn.id,
        addonName,
        identityName,
        logoUrl,
      })
    }

    return options
  }, [installedAddons, workspace])

  useEffect(() => {
    if (connectionDisplayOptions.length === 0) {
      if (newNodeSelectedConnectionId) setNewNodeSelectedConnectionId('')

      return
    }

    const exists = connectionDisplayOptions.some(
      (opt) => opt.id === newNodeSelectedConnectionId,
    )

    if (!exists) setNewNodeSelectedConnectionId('')
  }, [connectionDisplayOptions, newNodeSelectedConnectionId])

  useEffect(() => {
    if (connectionDisplayOptions.length === 0) {
      if (selectedConnectionId) setSelectedConnectionId('')

      return
    }

    const exists = connectionDisplayOptions.some(
      (opt) => opt.id === selectedConnectionId,
    )

    if (!exists) setSelectedConnectionId('')
  }, [connectionDisplayOptions, selectedConnectionId])

  const analyticsCatalogs = useRef(
    new Map<string, AnalyticsDatasetManifest[]>(),
  )

  useEffect(() => {
    if (!newNodeSelectedConnectionId || !workspaceId) {
      setNodeSourceDatasets([])
      setNewNodeDatasetId('')
      return
    }

    let active = true
    setIsLoadingNodeDatasets(true)

    bridge.addons
      .listAnalyticsDatasets({
        body: {
          workspaceId,
          connectionInstanceId: newNodeSelectedConnectionId,
        },
      })
      .then((res) => {
        if (!active) return
        setIsLoadingNodeDatasets(false)

        if (res.isSuccess && res.data && res.data.length > 0) {
          analyticsCatalogs.current.set(
            JSON.stringify([workspaceId, newNodeSelectedConnectionId]),
            res.data,
          )
          setNodeSourceDatasets(res.data)

          return
        }

        setNodeSourceDatasets([])
        setNewNodeDatasetId('')
      })
      .catch(() => {
        if (!active) return
        setIsLoadingNodeDatasets(false)
        setNodeSourceDatasets([])
        setNewNodeDatasetId('')
      })

    return () => {
      active = false
    }
  }, [bridge.addons, newNodeSelectedConnectionId, workspaceId])

  const [filterOptionsErrors, setFilterOptionsErrors] = useState<
    Record<string, string>
  >({})

  useEffect(() => {
    let connectionId = newNodeSelectedConnectionId
    if (!connectionId) connectionId = selectedConnectionId
    setFilterOptionsErrors({})
    setConnectionMetadataOptions({
      projects: [],
      members: [],
      activities: [],
      task_statuses: [],
      task_trackers: [],
      task_priorities: [],
      sprints_versions: [],
    })
    if (!connectionId || !workspaceId) return
    let active = true
    const sources = new Set<AnalyticsFilterDynamicSource>()
    const selectedDataset = nodeSourceDatasets.find(
      (dataset) => dataset.id === newNodeDatasetId,
    )
    if (selectedDataset === undefined) return

    for (const dataset of [selectedDataset]) {
      if (!dataset.supportedFilters) continue

      for (const filter of dataset.supportedFilters) {
        if (filter.dynamicOptionsSource)
          sources.add(filter.dynamicOptionsSource)
      }
    }

    for (const source of sources) {
      void bridge.addons
        .getAnalyticsFilterOptions({
          body: { workspaceId, connectionInstanceId: connectionId, source },
        })
        .then((response) => {
          if (!active) return

          if (!response.isSuccess || response.data === undefined) {
            let message = 'ANALYTICS_FILTER_OPTIONS_FAILED'
            if (response.error !== undefined) message = response.error
            setFilterOptionsErrors((previous) => ({
              ...previous,
              [source]: message,
            }))
            return
          }

          const options = response.data
          setConnectionMetadataOptions((previous) => ({
            ...previous,
            [source]: options,
          }))
        })
    }

    return () => {
      active = false
    }
  }, [
    bridge.addons,
    newNodeSelectedConnectionId,
    selectedConnectionId,
    workspaceId,
    nodeSourceDatasets,
    newNodeDatasetId,
  ])

  const latestSourceRequests = useRef(new Map<string, symbol>())
  const [loadingSourceIds, setLoadingSourceIds] = useState(new Set<string>())
  const [sourceErrorDetails, setSourceErrorDetails] = useState<
    Record<string, Record<string, string[]>>
  >({})
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({})
  const clearConnectionPublications = useCallback(
    (connectionIds: string[], message: string) => {
      setSourceErrors((previous) => {
        const next = { ...previous }

        for (const [id, entry] of Object.entries(datasetResults))
          if (connectionIds.includes(entry.connectionId)) next[id] = message

        return next
      })
      setDatasetResults((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(
            ([, entry]) => !connectionIds.includes(entry.connectionId),
          ),
        ),
      )
    },
    [datasetResults],
  )
  const fetchSourceDataset = useCallback(
    async (
      nodeId: string,
      connectionId: string,
      query: AnalyticsDatasetQueryInput,
    ) => {
      if (!workspaceId) return
      const request = Symbol()
      latestSourceRequests.current.set(nodeId, request)
      setLoadingSourceIds((previous) => new Set([...previous, nodeId]))
      setSourceErrors((previous) => {
        const next = { ...previous }
        delete next[nodeId]
        return next
      })
      setSourceErrorDetails((previous) => {
        const next = { ...previous }
        delete next[nodeId]
        return next
      })
      const fail = (message: string) => {
        setLoadingSourceIds((previous) => {
          const next = new Set(previous)
          next.delete(nodeId)
          return next
        })
        setSourceErrors((previous) => ({ ...previous, [nodeId]: message }))
      }
      const catalogKey = JSON.stringify([workspaceId, connectionId])
      let catalog = analyticsCatalogs.current.get(catalogKey)

      if (catalog === undefined) {
        const listed = await bridge.addons.listAnalyticsDatasets({
          body: { workspaceId, connectionInstanceId: connectionId },
        })
        if (latestSourceRequests.current.get(nodeId) !== request) return

        if (!listed.isSuccess || listed.data === undefined) {
          let message = 'ANALYTICS_CATALOG_UNAVAILABLE'
          if (listed.error !== undefined) message = listed.error
          fail(message)
          return
        }

        catalog = listed.data
        analyticsCatalogs.current.set(catalogKey, catalog)
      }

      const manifest = catalog.find((item) => item.id === query.datasetId)

      if (manifest === undefined) {
        fail('ANALYTICS_DATASET_NOT_AVAILABLE')
        return
      }

      const selectedQuery = queryWithDatasetSelection(query, manifest)
      const response = await bridge.addons.loadAnalyticsDataset({
        body: {
          workspaceId,
          connectionInstanceId: connectionId,
          query: selectedQuery,
        },
      })
      if (latestSourceRequests.current.get(nodeId) !== request) return
      setLoadingSourceIds((previous) => {
        const next = new Set(previous)
        next.delete(nodeId)
        return next
      })

      if (!response.isSuccess || response.data === undefined) {
        let message = 'ANALYTICS_REQUEST_FAILED'
        if (response.error !== undefined) message = response.error
        if (response.statusCode === 401 || response.statusCode === 403)
          clearConnectionPublications([connectionId], message)
        setSourceErrors((previous) => ({ ...previous, [nodeId]: message }))
        const details = response.details
        if (details !== undefined)
          setSourceErrorDetails((previous) => ({
            ...previous,
            [nodeId]: details,
          }))
        return
      }

      const publication = response.data.publication
      const scope = createAnalyticsDatasetScope(selectedQuery)
      setDatasetResults((previous) => ({
        ...previous,
        [nodeId]: { workspaceId, connectionId, scope, publication },
      }))
    },
    [bridge.addons, workspaceId, clearConnectionPublications],
  )

  const loadAnalyticsFromConnection = useCallback(
    async (connectionId: string) => {
      if (!workspaceId || !connectionId) {
        setDatasetResults({})
        return
      }

      setIsFetchingLive(true)

      const listRes = await bridge.addons.listAnalyticsDatasets({
        body: {
          workspaceId,
          connectionInstanceId: connectionId,
        },
      })

      if (!listRes.isSuccess || !listRes.data || listRes.data.length === 0) {
        setDatasetResults({})
        setIsFetchingLive(false)
        return
      }

      const remoteDatasets = listRes.data
      analyticsCatalogs.current.set(
        JSON.stringify([workspaceId, connectionId]),
        remoteDatasets,
      )

      const activeSourceNodes = activeSpace.workflowNodes.filter(
        (node) => node.kind === 'source',
      )

      for (const node of activeSourceNodes) {
        if (!node.connectionId) continue
        const dates = resolveEffectiveNodeDates(
          node.filterValues,
          startDate,
          endDate,
        )
        await fetchSourceDataset(node.id, node.connectionId, {
          datasetId: node.datasetId,
          projectId: resolveEffectiveNodeProject(node.filterValues),
          startDate: dates.from,
          endDate: dates.to,
          execution: node.queryExecution,
          filters: node.filterValues,
        })
      }

      setIsFetchingLive(false)
    },
    [
      fetchSourceDataset,
      queryExecution,
      activeSpace.workflowNodes,
      bridge.addons,
      endDate,
      startDate,
      workspaceId,
    ],
  )

  useEffect(() => {
    if (!selectedConnectionId) return
    void loadAnalyticsFromConnection(selectedConnectionId)
  }, [loadAnalyticsFromConnection, selectedConnectionId])

  const [inspectionPage, setInspectionPage] = useState<{
    id: string
    search: string
    offset: number
    version?: string
  }>({ id: '', search: '', offset: 0 })
  const publications: Record<string, AnalyticsPublication> = {}

  for (const node of activeSpace.workflowNodes) {
    const cached = datasetResults[node.id]
    if (
      cached === undefined ||
      cached.workspaceId !== workspaceId ||
      cached.connectionId !== node.connectionId
    )
      continue
    const dates = resolveEffectiveNodeDates(
      node.filterValues,
      startDate,
      endDate,
    )
    const scope = createAnalyticsDatasetScope(
      queryWithDatasetSelection(
        {
          datasetId: node.datasetId,
          projectId: resolveEffectiveNodeProject(node.filterValues),
          startDate: dates.from,
          endDate: dates.to,
          filters: node.filterValues,
        },
        cached.publication.manifest,
      ),
    )
    if (
      JSON.stringify(scope) === JSON.stringify(cached.scope) &&
      JSON.stringify(node.queryExecution) ===
        JSON.stringify(cached.publication.query.execution)
    )
      publications[node.id] = cached.publication
  }

  const warehousePlan = buildAnalyticsPlan(
    activeSpace.workflowNodes,
    publications,
  )
  const publicationVersion = JSON.stringify(
    Object.entries(publications).map(([id, publication]) => [
      id,
      publication.generationId,
    ]),
  )
  const previewInputs = activeSpace.workflowNodes
    .filter(
      (node) =>
        node.kind !== 'output' &&
        node.id !== editingNodeId &&
        (txUpstreamNodeId === '__all__' || node.id === txUpstreamNodeId),
    )
    .map((node) => node.id)
  const queryNodes: AnalyticsPlanNode[] = [...warehousePlan]
  if (
    isAddNodeModalOpen &&
    selectedAddNodeType === 'transform' &&
    previewInputs.length > 0 &&
    sqlQueryText.trim() !== ''
  )
    queryNodes.push({
      id: 'analytics_sql_preview',
      kind: 'sql',
      upstreamNodeIds: previewInputs,
      sqlConfig: { sqlQuery: sqlQueryText },
    })
  let inspection:
    { id: string; search: string; offset: number; version?: string } | undefined

  if (inspectedNodeId !== null) {
    inspection = { id: inspectedNodeId, search: nodeModalSearch, offset: 0 }
    if (
      inspectionPage.id === inspectedNodeId &&
      inspectionPage.search === nodeModalSearch
    )
      inspection = { ...inspection, ...inspectionPage }
  }

  const [nativeRevision, setNativeRevision] = useState(0)
  const nodePages = useAnalyticsNodePages(
    nativeRevision,
    workspaceId,
    queryNodes,
    publicationVersion,
    clearConnectionPublications,
    inspection,
  )
  const resolveRowsForWorkflowNode = useCallback(
    (node: SpaceWorkflowNodeConfig) => {
      const data = nodePages[node.id]?.data
      if (data !== undefined) return { columns: data.columns, rows: data.rows }
      return { columns: [], rows: [] }
    },
    [nodePages],
  )

  const handleGenericChartDrillDown = useCallback(
    (
      sourceNode: SpaceWorkflowNodeConfig | undefined,
      categoryKey: string,
      categoryValue: string,
    ) => {
      if (sourceNode === undefined || workspaceId === undefined) return
      void bridge.addons
        .queryAnalytics({
          body: {
            workspaceId,
            nodes: warehousePlan,
            targetNodeId: sourceNode.id,
            filters: [
              { column: categoryKey, operator: 'eq', value: categoryValue },
            ],
            offset: 0,
            limit: 100,
          },
        })
        .then((response) => {
          if (response.isSuccess && response.data !== undefined)
            setDrillDown({
              title: categoryValue,
              subtitle: sourceNode.label,
              data: response.data,
            })
        })
    },
    [bridge.addons, warehousePlan, workspaceId],
  )

  const dynamicFilterOptions: Record<string, AnalyticsFilterOption[]> =
    connectionMetadataOptions

  const availableProjects = useMemo<AvailableProjectOption[]>(
    () => [
      {
        id: 'all',
        name: 'Todos os projetos',
        description: 'Sem restrição de projeto',
      },
      ...connectionMetadataOptions.projects.map((option) => ({
        id: option.value,
        name: option.label,
        description: `Identificador: ${option.value}`,
      })),
    ],
    [connectionMetadataOptions.projects],
  )

  const upstreamAvailableColumns = useMemo<AnalyticsColumnSchema[]>(() => {
    const dataNodes = activeSpace.workflowNodes.filter(
      (n) => n.kind !== 'output' && n.id !== editingNodeId,
    )
    let targetNode: SpaceWorkflowNodeConfig | undefined = undefined

    if (selectedAddNodeType === 'output' && outputSourceNodeId)
      targetNode = dataNodes.find((n) => n.id === outputSourceNodeId)

    if (
      selectedAddNodeType === 'transform' &&
      txUpstreamNodeId &&
      txUpstreamNodeId !== '__all__'
    )
      targetNode = dataNodes.find((n) => n.id === txUpstreamNodeId)

    if (txUpstreamNodeId === '__all__' && dataNodes.length > 0) {
      const merged: AnalyticsColumnSchema[] = []
      const seen = new Set<string>()

      for (const dn of dataNodes) {
        const res = resolveRowsForWorkflowNode(dn)

        for (const col of res.columns) {
          if (!seen.has(col.name)) {
            seen.add(col.name)
            merged.push(col)
          }
        }
      }

      return merged
    }

    if (!targetNode) return []
    return resolveRowsForWorkflowNode(targetNode).columns
  }, [
    activeSpace.workflowNodes,
    editingNodeId,
    outputSourceNodeId,
    resolveRowsForWorkflowNode,
    selectedAddNodeType,
    txUpstreamNodeId,
  ])

  const previewBeforeNode = activeSpace.workflowNodes.find(
    (node) => node.id === txUpstreamNodeId,
  )
  let transformPreviewBeforePayload: {
    columns: AnalyticsColumnSchema[]
    rows: AnalyticsDatasetRow[]
  } = { columns: [], rows: [] }
  if (previewBeforeNode !== undefined)
    transformPreviewBeforePayload =
      resolveRowsForWorkflowNode(previewBeforeNode)
  let transformPreviewAfterPayload: {
    columns: AnalyticsColumnSchema[]
    rows: AnalyticsDatasetRow[]
  } = { columns: [], rows: [] }
  const previewPage = nodePages.analytics_sql_preview
  if (previewPage?.data !== undefined)
    transformPreviewAfterPayload = previewPage.data

  const handleOpenEditNode = useCallback(
    (nodeId: string) => {
      const node = activeSpace.workflowNodes.find((n) => n.id === nodeId)
      if (!node) return

      setQueryExecution(node.queryExecution)
      setEditingNodeId(node.id)
      setNewNodeLabel(node.label)

      let kindType: AddNodeTypeOption = 'source'
      if (node.kind === 'output') kindType = 'output'
      if (node.kind !== 'source' && node.kind !== 'output')
        kindType = 'transform'
      setSelectedAddNodeType(kindType)

      if (node.connectionId) setNewNodeSelectedConnectionId(node.connectionId)

      setNewNodeDatasetId(node.datasetId)

      if (node.selectedColumns) setNodeSelectedColumns(node.selectedColumns)

      if (!node.selectedColumns) {
        const matchedDs = nodeSourceDatasets.find(
          (d) => d.id === node.datasetId,
        )
        if (matchedDs)
          setNodeSelectedColumns(matchedDs.columns.map((c) => c.name))
        if (!matchedDs) setNodeSelectedColumns([])
      }

      let nextCustomFieldTypes: Record<string, 'string' | 'number' | 'date'> =
        {}
      if (node.customFieldTypes) nextCustomFieldTypes = node.customFieldTypes
      setNodeCustomFieldTypes(nextCustomFieldTypes)

      if (node.filterValues) setNewNodeFilterValues({ ...node.filterValues })

      if (!node.filterValues) {
        const initFilters: Record<string, AnalyticsFilterValue> = {}
        if (node.selectedProject) initFilters.project_id = node.selectedProject
        setNewNodeFilterValues(initFilters)
      }

      let nextTxUpstream = ''
      let nextOutputSource = ''
      const [firstUpstream] = node.upstreamNodeIds

      if (firstUpstream) {
        nextTxUpstream = firstUpstream
        nextOutputSource = firstUpstream
      }

      if (node.upstreamNodeIds.length > 1) nextTxUpstream = '__all__'

      let nextSqlQueryText = ''
      if (node.sqlConfig && node.sqlConfig.sqlQuery)
        nextSqlQueryText = node.sqlConfig.sqlQuery
      if ((!node.sqlConfig || !node.sqlConfig.sqlQuery) && node.sqlPreview)
        nextSqlQueryText = node.sqlPreview
      setSqlQueryText(nextSqlQueryText)

      let nextWidgetType: WidgetId = 'bar_vertical'
      let nextSpan: WidgetSpan = 2
      let nextCategoryColumn = ''
      let nextMetricColumn = ''
      let nextSecondaryMetricColumn = ''
      let nextHierarchyColumns: string[] = []
      let nextStackColumn = ''
      let nextReferenceLineMode: ReferenceLineMode = 'none'
      let nextReferenceLineTarget = 24

      if (node.kind === 'output') {
        const linkedWidget = activeSpace.widgets.find(
          (w) => w.outputNodeId === node.id || w.title === node.label,
        )

        if (linkedWidget) {
          nextWidgetType = linkedWidget.widgetType
          if (linkedWidget.chartVisualType)
            nextWidgetType = linkedWidget.chartVisualType
          nextSpan = linkedWidget.span
          if (!nextOutputSource && linkedWidget.sourceNodeId)
            nextOutputSource = linkedWidget.sourceNodeId
          if (linkedWidget.categoryColumn)
            nextCategoryColumn = linkedWidget.categoryColumn
          if (linkedWidget.metricColumn)
            nextMetricColumn = linkedWidget.metricColumn
          if (linkedWidget.secondaryMetricColumn)
            nextSecondaryMetricColumn = linkedWidget.secondaryMetricColumn
          if (linkedWidget.hierarchyColumns !== undefined)
            nextHierarchyColumns = linkedWidget.hierarchyColumns
          if (linkedWidget.stackColumn)
            nextStackColumn = linkedWidget.stackColumn
          if (linkedWidget.referenceLineMode)
            nextReferenceLineMode = linkedWidget.referenceLineMode
          if (linkedWidget.referenceLineTarget !== undefined)
            nextReferenceLineTarget = linkedWidget.referenceLineTarget
        }
      }

      setTxUpstreamNodeId(nextTxUpstream)
      setOutputSourceNodeId(nextOutputSource)
      setNewNodeWidgetType(nextWidgetType)
      setNewNodeSpan(nextSpan)
      setOutputCategoryColumn(nextCategoryColumn)
      setOutputMetricColumn(nextMetricColumn)
      setOutputSecondaryMetricColumn(nextSecondaryMetricColumn)
      setOutputHierarchyColumns(nextHierarchyColumns)
      setOutputStackColumn(nextStackColumn)
      setOutputReferenceLineMode(nextReferenceLineMode)
      setOutputReferenceLineTarget(nextReferenceLineTarget)

      setInspectedNodeId(null)
      setIsAddNodeModalOpen(true)
    },
    [
      activeSpace.widgets,
      activeSpace.workflowNodes,
      availableProjects,
      nodeSourceDatasets,
    ],
  )

  const handleOpenAddNode = useCallback(() => {
    setQueryExecution(undefined)
    setEditingNodeId(null)
    setNewNodeLabel('')
    setSelectedAddNodeType('source')
    setNewNodeFilterValues({})

    const matchedDs = nodeSourceDatasets.find((d) => d.id === newNodeDatasetId)
    if (matchedDs) setNodeSelectedColumns(matchedDs.columns.map((c) => c.name))
    if (!matchedDs) setNodeSelectedColumns([])

    setNodeCustomFieldTypes({})
    setTxUpstreamNodeId('')
    setSqlQueryText('')
    setOutputSourceNodeId('')
    setNewNodeWidgetType('bar_vertical')
    setNewNodeSpan(2)
    setOutputCategoryColumn('')
    setOutputMetricColumn('')
    setOutputSecondaryMetricColumn('')
    setOutputHierarchyColumns([])
    setOutputStackColumn('')
    setOutputReferenceLineMode('none')
    setOutputReferenceLineTarget(24)
    setIsAddNodeModalOpen(true)
  }, [activeSpace.workflowNodes, newNodeDatasetId, nodeSourceDatasets])

  const initialPipelineNodes = useMemo<Array<Node<PipelineNodeData>>>(() => {
    return activeSpace.workflowNodes.map((nodeCfg) => {
      let rowCount = 0
      const page = nodePages[nodeCfg.id]?.data
      if (page !== undefined) rowCount = page.totalRows
      return {
        id: nodeCfg.id,
        type: 'pipelineNode',
        position: { x: nodeCfg.positionX, y: nodeCfg.positionY },
        data: {
          nodeId: nodeCfg.id,
          label: nodeCfg.label,
          subtitle: nodeCfg.subtitle,
          badge: nodeCfg.badge,
          kind: nodeCfg.kind,
          dataSourceName: nodeCfg.dataSourceName,
          rowCount,
          datasetId: nodeCfg.datasetId,
          onEditNode: () => handleOpenEditNode(nodeCfg.id),
        },
      }
    })
  }, [
    activeSpace.workflowNodes,
    handleOpenEditNode,
    resolveRowsForWorkflowNode,
  ])

  const initialPipelineEdges = useMemo<Edge[]>(() => {
    return activeSpace.workflowEdges.map((edgeCfg) => ({
      id: edgeCfg.id,
      source: edgeCfg.source,
      target: edgeCfg.target,
      animated: true,
      label: edgeCfg.label,
      markerEnd: { type: MarkerType.ArrowClosed },
    }))
  }, [activeSpace.workflowEdges])

  const [pipelineNodes, setPipelineNodes, onPipelineNodesChange] =
    useNodesState(initialPipelineNodes)
  const [pipelineEdges, setPipelineEdges, onPipelineEdgesChange] =
    useEdgesState(initialPipelineEdges)

  useEffect(() => {
    setPipelineNodes(initialPipelineNodes)
    setPipelineEdges(initialPipelineEdges)
  }, [
    initialPipelineEdges,
    initialPipelineNodes,
    setPipelineEdges,
    setPipelineNodes,
  ])

  const updateWidgetSpan = useCallback(
    (widgetId: string, nextSpan: WidgetSpan) => {
      setSpaces((prev) =>
        prev.map((space) => {
          if (space.id !== activeSpace.id) return space
          return {
            ...space,
            widgets: space.widgets.map((w) => {
              if (w.id === widgetId) return { ...w, span: nextSpan }

              return w
            }),
          }
        }),
      )
    },
    [activeSpace.id],
  )

  const updateWidgetVisualType = useCallback(
    (widgetId: string, nextType: ChartVisualType) => {
      setSpaces((prev) =>
        prev.map((space) => {
          if (space.id !== activeSpace.id) return space
          return {
            ...space,
            widgets: space.widgets.map((w) => {
              if (w.id !== widgetId) return w

              const hasStackColumn =
                w.stackColumn !== undefined && w.stackColumn !== ''
              const isRemoteAggregate = isRemoteAggregateUpstream(
                space.workflowNodes,
                w.sourceNodeId,
              )

              if (
                isRemoteAggregate &&
                (isRemoteAggregateUnsupportedVisual(nextType) ||
                  ((nextType === 'bar_stacked' ||
                    nextType === 'area_stacked') &&
                    hasStackColumn))
              )
                return w

              return { ...w, chartVisualType: nextType }
            }),
          }
        }),
      )
    },
    [activeSpace.id],
  )

  const moveWidgetOrder = useCallback(
    (widgetId: string, direction: -1 | 1) => {
      setSpaces((prev) =>
        prev.map((space) => {
          if (space.id !== activeSpace.id) return space
          const idx = space.widgets.findIndex((w) => w.id === widgetId)
          if (idx < 0) return space
          const targetIdx = idx + direction
          if (targetIdx < 0 || targetIdx >= space.widgets.length) return space

          const copy = [...space.widgets]
          const currentItem = copy[idx]
          const targetItem = copy[targetIdx]
          if (!currentItem || !targetItem) return space

          copy[idx] = targetItem
          copy[targetIdx] = currentItem
          return { ...space, widgets: copy }
        }),
      )
    },
    [activeSpace.id],
  )

  const handleToggleNewSpaceWidget = useCallback(
    (widgetId: WidgetId, checked: boolean) => {
      if (checked) {
        setNewSpaceWidgets((prev) => [...prev, widgetId])
        return
      }

      setNewSpaceWidgets((prev) => prev.filter((w) => w !== widgetId))
    },
    [],
  )

  const handleCreateNewSpace = useCallback(() => {
    const cleanTitle = newSpaceTitle.trim()
    if (!cleanTitle) return

    const slugId =
      cleanTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') + `-${spaces.length + 1}`

    const createdWidgets: SpaceWidgetConfig[] = newSpaceWidgets.map(
      (wType, idx) => {
        const matchedModel = GENERIC_CHART_MODELS.find((m) => m.id === wType)
        let titleText = `Gráfico Analítico #${idx + 1}`
        let subtitleText = 'Visualização agnóstica conectada ao pipeline ETL'

        if (matchedModel) {
          titleText = matchedModel.label
          subtitleText = matchedModel.description
        }

        return {
          id: `w_${slugId}_${idx}`,
          widgetType: wType,
          title: titleText,
          subtitle: subtitleText,
          datasetBadge: 'Pipeline ETL',
          sourceNodeId: '',
          chartVisualType: wType,
          span: 2,
          visible: true,
        }
      },
    )

    let resolvedSubtitle =
      'Espaço analítico customizado com Grade Inteligente e Background próprio.'

    if (newSpaceSubtitle.trim().length > 0)
      resolvedSubtitle = newSpaceSubtitle.trim()

    const newSpace: AnalyticsSpaceConfig = {
      id: slugId,
      title: cleanTitle,
      subtitle: resolvedSubtitle,
      badge: `${createdWidgets.length} Gráficos`,
      widgets: createdWidgets,
      workflowNodes: [],
      workflowEdges: [],
    }

    setSpaces((prev) => [...prev, newSpace])
    setNewSpaceTitle('')
    setNewSpaceSubtitle('')
    setIsNewSpaceModalOpen(false)
    setLayerMode('front')

    if (workspaceId) navigate(`/workspaces/${workspaceId}/analytics/${slugId}`)
  }, [
    navigate,
    newSpaceSubtitle,
    newSpaceTitle,
    newSpaceWidgets,
    spaces.length,
    workspaceId,
  ])

  const handleAddWorkflowNode = useCallback(() => {
    const cleanLabel = newNodeLabel.trim()
    if (!cleanLabel) return

    const generatedId: string = crypto.randomUUID()

    let badgeText = 'E • EXTRACT'
    let kindVal: WorkflowNodeKind = 'source'
    let resolvedDsName = 'Fonte de Dados'
    const resolvedDataset = newNodeDatasetId
    let datasetLabel = newNodeDatasetId

    let posX = 80
    let posY = 80
    let upstreamIds: string[] = []
    let ruleSummaryText = ''
    let sqlPreviewText = ''

    const effDates = resolveEffectiveNodeDates(
      newNodeFilterValues,
      startDate,
      endDate,
    )
    const effProject = resolveEffectiveNodeProject(newNodeFilterValues)

    if (selectedAddNodeType === 'source') {
      kindVal = 'source'
      posX = 80
      posY =
        80 +
        activeSpace.workflowNodes.filter((n) => n.kind === 'source').length *
          115
      const matchedOpt = connectionDisplayOptions.find(
        (c) => c.id === newNodeSelectedConnectionId,
      )

      if (matchedOpt) {
        resolvedDsName = matchedOpt.addonName

        if (matchedOpt.identityName)
          resolvedDsName = `${matchedOpt.addonName} (${matchedOpt.identityName})`
      }

      const matchedDs = nodeSourceDatasets.find(
        (d) => d.id === newNodeDatasetId,
      )

      if (matchedDs && matchedDs.name) datasetLabel = matchedDs.name

      badgeText = 'E • EXTRACT'
      upstreamIds = []

      const filterParts: string[] = []

      if (effDates.from || effDates.to)
        filterParts.push(`período [${effDates.from} .. ${effDates.to}]`)

      if (effProject !== 'all') filterParts.push(`projeto ${effProject}`)

      const filterSummarySuffix =
        filterParts.length > 0
          ? ` filtrando por ${filterParts.join(' e ')}`
          : ''

      ruleSummaryText = `Nó Extract (E): ${resolvedDsName} (${datasetLabel})${filterSummarySuffix}.`

      const whereClauses: string[] = []

      if (effDates.from && effDates.to) {
        whereClauses.push(
          `date >= '${effDates.from}' AND date <= '${effDates.to}'`,
        )
      }

      if (effProject !== 'all') whereClauses.push(`project = '${effProject}'`)

      const sqlWhereStr =
        whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''

      if (
        nodeSelectedColumns.length === 0 &&
        queryExecution?.kind !== 'aggregate'
      )
        return
      let colsSelectStr = nodeSelectedColumns.join(', ')

      if (nodeSelectedColumns.length > 0)
        colsSelectStr = nodeSelectedColumns.join(', ')

      sqlPreviewText = `SELECT ${colsSelectStr} FROM ${resolvedDataset}${sqlWhereStr}`
      if (queryExecution?.kind === 'aggregate')
        sqlPreviewText = JSON.stringify(queryExecution, null, 2)
    }

    if (selectedAddNodeType === 'transform') {
      kindVal = 'sql'
      posX = 410
      posY =
        80 +
        activeSpace.workflowNodes.filter(
          (n) => n.kind !== 'source' && n.kind !== 'output',
        ).length *
          115
      resolvedDsName = 'Transform (DuckDB)'
      badgeText = 'T • TRANSFORM'
      datasetLabel = 'SQL Transform'
      const dataNodes = activeSpace.workflowNodes.filter(
        (n) => n.kind !== 'output',
      )

      if (txUpstreamNodeId === '__all__')
        upstreamIds = dataNodes.map((n) => n.id)

      if (
        txUpstreamNodeId &&
        txUpstreamNodeId !== '__all__' &&
        dataNodes.some((n) => n.id === txUpstreamNodeId)
      )
        upstreamIds = [txUpstreamNodeId]

      if (upstreamIds.length === 0) return
      if (
        upstreamIds.some((id) =>
          isRemoteAggregateUpstream(activeSpace.workflowNodes, id),
        )
      )
        return
      ruleSummaryText = `Transform (T) via SQL no motor local: ${sqlQueryText}`
      sqlPreviewText = sqlQueryText
    }

    if (selectedAddNodeType === 'output') {
      if (newNodeWidgetType !== 'kpi_card' && outputCategoryColumn === '')
        return
      kindVal = 'output'
      posX = 760
      posY =
        80 +
        activeSpace.workflowNodes.filter((n) => n.kind === 'output').length *
          115
      resolvedDsName = 'Grade Inteligente'
      badgeText = 'L • LOAD (GRÁFICO)'
      const dataNodes = activeSpace.workflowNodes.filter(
        (n) => n.kind !== 'output',
      )

      if (
        outputSourceNodeId &&
        dataNodes.some((n) => n.id === outputSourceNodeId)
      )
        upstreamIds = [outputSourceNodeId]

      if (upstreamIds.length === 0) return

      const [outputUpstreamId] = upstreamIds

      if (
        outputUpstreamId !== undefined &&
        isRemoteAggregateUpstream(activeSpace.workflowNodes, outputUpstreamId)
      ) {
        const hasStackColumn = outputStackColumn !== ''
        const unsupportedVisual =
          isRemoteAggregateUnsupportedVisual(newNodeWidgetType) ||
          ((newNodeWidgetType === 'bar_stacked' ||
            newNodeWidgetType === 'area_stacked') &&
            hasStackColumn)
        const unsupportedReference =
          outputReferenceLineMode === 'average' ||
          outputReferenceLineMode === 'weighted_ratio'
        if (unsupportedVisual || unsupportedReference || hasStackColumn) return
      }

      ruleSummaryText = `Load (L): Publicação visual (${newNodeWidgetType}) na Grade Inteligente consumindo o fluxo upstream.`
      sqlPreviewText = `-- Widget publicado na Grade Inteligente: ${cleanLabel} (${newNodeWidgetType})`
    }

    const newNode: SpaceWorkflowNodeConfig = {
      id: generatedId,
      positionX: posX,
      positionY: posY,
      label: cleanLabel,
      subtitle: `${resolvedDsName} • ${datasetLabel}`,
      badge: badgeText,
      kind: kindVal,
      connectionId: newNodeSelectedConnectionId,
      dataSourceName: resolvedDsName,
      datasetId: resolvedDataset,
      selectedProject: effProject,
      selectedColumns: nodeSelectedColumns,
      customFieldTypes: nodeCustomFieldTypes,
      queryExecution,
      filterValues: newNodeFilterValues,
      sqlConfig: {
        sqlQuery: sqlQueryText,
      },
      ruleSummary: ruleSummaryText,
      sqlPreview: sqlPreviewText,
      upstreamNodeIds: upstreamIds,
    }

    const newEdges = upstreamIds.map((upId, idx) => ({
      id: `edge_${generatedId}_${idx}`,
      source: upId,
      target: generatedId,
      label: 'Fluxo',
    }))

    setSpaces((prev) =>
      prev.map((space) => {
        if (space.id !== activeSpace.id) return space

        const nextWidgets = [...space.widgets]

        if (selectedAddNodeType === 'output') {
          const matchedModel = GENERIC_CHART_MODELS.find(
            (m) => m.id === newNodeWidgetType,
          )
          let desc = 'Visualização gerada pelo Workflow ETL'

          if (matchedModel) desc = matchedModel.description

          const [firstUpstream] = upstreamIds
          let sourceId = generatedId

          if (firstUpstream) sourceId = firstUpstream

          let catCol: string | undefined = undefined
          if (outputCategoryColumn) catCol = outputCategoryColumn

          let metCol: string | undefined = outputMetricColumn
          if (outputMetricColumn) metCol = outputMetricColumn

          let secMetCol: string | undefined = undefined

          if (outputSecondaryMetricColumn)
            secMetCol = outputSecondaryMetricColumn

          let stkCol: string | undefined = undefined
          if (outputStackColumn) stkCol = outputStackColumn

          nextWidgets.push({
            id: `w_custom_${space.widgets.length + 1}`,
            widgetType: newNodeWidgetType,
            title: cleanLabel,
            subtitle: desc,
            datasetBadge: resolvedDataset,
            sourceNodeId: sourceId,
            outputNodeId: generatedId,
            chartVisualType: newNodeWidgetType,
            span: newNodeSpan,
            visible: true,
            categoryColumn: catCol,
            metricColumn: metCol,
            secondaryMetricColumn: secMetCol,
            stackColumn: stkCol,
            hierarchyColumns: outputHierarchyColumns,
            referenceLineMode: outputReferenceLineMode,
            referenceLineTarget: outputReferenceLineTarget,
          })
        }

        return {
          ...space,
          widgets: nextWidgets,
          workflowNodes: [...space.workflowNodes, newNode],
          workflowEdges: [...space.workflowEdges, ...newEdges],
        }
      }),
    )

    setNewNodeLabel('')
    setIsAddNodeModalOpen(false)

    if (
      selectedAddNodeType === 'source' &&
      newNodeSelectedConnectionId &&
      newNodeDatasetId &&
      workspaceId
    ) {
      void fetchSourceDataset(generatedId, newNodeSelectedConnectionId, {
        datasetId: newNodeDatasetId,
        projectId: effProject,
        startDate: effDates.from,
        endDate: effDates.to,
        execution: queryExecution,
        filters: newNodeFilterValues,
      })
    }
  }, [
    fetchSourceDataset,
    queryExecution,
    activeSpace.id,
    activeSpace.workflowNodes,
    bridge.addons,
    connectionDisplayOptions,
    endDate,
    newNodeDatasetId,
    newNodeFilterValues,
    newNodeLabel,
    newNodeSelectedConnectionId,
    newNodeSpan,
    newNodeWidgetType,
    nodeCustomFieldTypes,
    nodeSelectedColumns,
    nodeSourceDatasets,
    outputCategoryColumn,
    outputMetricColumn,
    outputReferenceLineMode,
    outputReferenceLineTarget,
    outputSecondaryMetricColumn,
    outputSourceNodeId,
    outputHierarchyColumns,
    outputStackColumn,
    selectedAddNodeType,
    sqlQueryText,
    startDate,
    txUpstreamNodeId,
    workspaceId,
  ])

  const handleSaveEditedNode = useCallback(() => {
    if (!editingNodeId) return

    const cleanLabel = newNodeLabel.trim()
    if (!cleanLabel) return

    const matchedNode = activeSpace.workflowNodes.find(
      (n) => n.id === editingNodeId,
    )
    if (!matchedNode) return

    let resolvedDsName = matchedNode.dataSourceName
    const matchedOpt = connectionDisplayOptions.find(
      (c) => c.id === newNodeSelectedConnectionId,
    )

    if (matchedOpt && matchedNode.kind === 'source') {
      resolvedDsName = matchedOpt.addonName

      if (matchedOpt.identityName)
        resolvedDsName = `${matchedOpt.addonName} (${matchedOpt.identityName})`
    }

    let datasetLabel = newNodeDatasetId
    const matchedDs = nodeSourceDatasets.find((d) => d.id === newNodeDatasetId)

    if (matchedDs && matchedDs.name) datasetLabel = matchedDs.name

    const isTransformNode =
      matchedNode.kind !== 'source' && matchedNode.kind !== 'output'
    let updatedKind = matchedNode.kind
    let updatedUpstreamIds = matchedNode.upstreamNodeIds

    const effDates = resolveEffectiveNodeDates(
      newNodeFilterValues,
      startDate,
      endDate,
    )
    const effProject = resolveEffectiveNodeProject(newNodeFilterValues)

    const filterParts: string[] = []

    if (effDates.from || effDates.to)
      filterParts.push(`período [${effDates.from} .. ${effDates.to}]`)

    if (effProject !== 'all') filterParts.push(`projeto ${effProject}`)

    const filterSummarySuffix =
      filterParts.length > 0 ? ` filtrando por ${filterParts.join(' e ')}` : ''

    let updatedRuleSummary = `Nó configurado: ${resolvedDsName} (${datasetLabel})${filterSummarySuffix}.`

    const whereClauses: string[] = []

    if (effDates.from && effDates.to) {
      whereClauses.push(
        `date >= '${effDates.from}' AND date <= '${effDates.to}'`,
      )
    }

    if (effProject !== 'all') whereClauses.push(`project = '${effProject}'`)

    const sqlWhereStr =
      whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''

    if (
      nodeSelectedColumns.length === 0 &&
      matchedNode.kind === 'source' &&
      queryExecution?.kind !== 'aggregate'
    )
      return
    let colsSelectStr = nodeSelectedColumns.join(', ')

    if (nodeSelectedColumns.length > 0)
      colsSelectStr = nodeSelectedColumns.join(', ')

    let updatedSqlPreview = `SELECT ${colsSelectStr} FROM ${newNodeDatasetId}${sqlWhereStr}`
    if (queryExecution?.kind === 'aggregate')
      updatedSqlPreview = JSON.stringify(queryExecution, null, 2)

    if (isTransformNode) {
      updatedKind = 'sql'
      resolvedDsName = 'Transform (DuckDB)'
      datasetLabel = 'SQL Transform'
      const dataNodes = activeSpace.workflowNodes.filter(
        (n) => n.kind !== 'output' && n.id !== editingNodeId,
      )

      if (txUpstreamNodeId === '__all__')
        updatedUpstreamIds = dataNodes.map((n) => n.id)

      if (
        txUpstreamNodeId &&
        txUpstreamNodeId !== '__all__' &&
        dataNodes.some((n) => n.id === txUpstreamNodeId)
      )
        updatedUpstreamIds = [txUpstreamNodeId]

      const transformCandidates = activeSpace.workflowNodes.filter(
        (n) => n.id !== editingNodeId,
      )
      if (
        updatedUpstreamIds.some((id) =>
          isRemoteAggregateUpstream(transformCandidates, id),
        )
      )
        return

      updatedRuleSummary = `Transform (T) via SQL no motor local: ${sqlQueryText}`
      updatedSqlPreview = sqlQueryText
    }

    if (matchedNode.kind === 'output') {
      if (newNodeWidgetType !== 'kpi_card' && outputCategoryColumn === '')
        return

      const validOutputUpstream = activeSpace.workflowNodes.find(
        (n) =>
          n.kind !== 'output' &&
          n.id !== editingNodeId &&
          n.id === outputSourceNodeId,
      )
      if (validOutputUpstream !== undefined)
        updatedUpstreamIds = [validOutputUpstream.id]

      const [outputUpstreamId] = updatedUpstreamIds

      if (
        outputUpstreamId !== undefined &&
        isRemoteAggregateUpstream(activeSpace.workflowNodes, outputUpstreamId)
      ) {
        const hasStackColumn = outputStackColumn !== ''
        const unsupportedVisual =
          isRemoteAggregateUnsupportedVisual(newNodeWidgetType) ||
          ((newNodeWidgetType === 'bar_stacked' ||
            newNodeWidgetType === 'area_stacked') &&
            hasStackColumn)
        const unsupportedReference =
          outputReferenceLineMode === 'average' ||
          outputReferenceLineMode === 'weighted_ratio'
        if (unsupportedVisual || unsupportedReference || hasStackColumn) return
      }
    }

    const updatedNode: SpaceWorkflowNodeConfig = {
      ...matchedNode,
      kind: updatedKind,
      label: cleanLabel,
      subtitle: `${resolvedDsName} • ${datasetLabel}`,
      connectionId: newNodeSelectedConnectionId,
      dataSourceName: resolvedDsName,
      datasetId: newNodeDatasetId,
      selectedProject: effProject,
      selectedColumns: nodeSelectedColumns,
      customFieldTypes: nodeCustomFieldTypes,
      queryExecution,
      filterValues: newNodeFilterValues,
      sqlConfig: {
        sqlQuery: sqlQueryText,
      },
      ruleSummary: updatedRuleSummary,
      sqlPreview: updatedSqlPreview,
      upstreamNodeIds: updatedUpstreamIds,
    }

    setSpaces((prev) =>
      prev.map((s) => {
        if (s.id !== activeSpace.id) return s

        let nextWidgets = s.widgets

        if (matchedNode.kind === 'output') {
          let catCol: string | undefined = undefined
          if (outputCategoryColumn) catCol = outputCategoryColumn

          let metCol: string | undefined = outputMetricColumn
          if (outputMetricColumn) metCol = outputMetricColumn

          let secMetCol: string | undefined = undefined

          if (outputSecondaryMetricColumn)
            secMetCol = outputSecondaryMetricColumn

          let stkCol: string | undefined = undefined
          if (outputStackColumn) stkCol = outputStackColumn

          nextWidgets = s.widgets.map((w) => {
            if (
              w.outputNodeId === editingNodeId ||
              w.title === matchedNode.label
            ) {
              return {
                ...w,
                title: cleanLabel,
                widgetType: newNodeWidgetType,
                chartVisualType: newNodeWidgetType,
                span: newNodeSpan,
                sourceNodeId: outputSourceNodeId,
                outputNodeId: editingNodeId,
                categoryColumn: catCol,
                metricColumn: metCol,
                secondaryMetricColumn: secMetCol,
                stackColumn: stkCol,
                hierarchyColumns: outputHierarchyColumns,
                referenceLineMode: outputReferenceLineMode,
                referenceLineTarget: outputReferenceLineTarget,
              }
            }

            return w
          })
        }

        return {
          ...s,
          widgets: nextWidgets,
          workflowNodes: s.workflowNodes.map((n) => {
            if (n.id === editingNodeId) return updatedNode
            return n
          }),
        }
      }),
    )

    if (
      matchedNode.kind === 'source' &&
      newNodeSelectedConnectionId &&
      newNodeDatasetId &&
      workspaceId
    ) {
      void fetchSourceDataset(editingNodeId, newNodeSelectedConnectionId, {
        datasetId: newNodeDatasetId,
        projectId: effProject,
        startDate: effDates.from,
        endDate: effDates.to,
        execution: queryExecution,
        filters: newNodeFilterValues,
      })
    }

    setIsAddNodeModalOpen(false)
    setEditingNodeId(null)
  }, [
    fetchSourceDataset,
    queryExecution,
    activeSpace.id,
    activeSpace.workflowNodes,
    bridge.addons,
    connectionDisplayOptions,
    editingNodeId,
    endDate,
    newNodeDatasetId,
    newNodeFilterValues,
    newNodeLabel,
    newNodeSelectedConnectionId,
    newNodeSpan,
    newNodeWidgetType,
    nodeCustomFieldTypes,
    nodeSelectedColumns,
    nodeSourceDatasets,
    outputCategoryColumn,
    outputMetricColumn,
    outputReferenceLineMode,
    outputReferenceLineTarget,
    outputSecondaryMetricColumn,
    outputSourceNodeId,
    outputHierarchyColumns,
    outputStackColumn,
    sqlQueryText,
    startDate,
    txUpstreamNodeId,
    workspaceId,
  ])

  const handleSyncAllSources = useCallback(async () => {
    if (!workspaceId) return
    setIsFetchingLive(true)

    const sourceNodes = activeSpace.workflowNodes.filter(
      (n) => n.kind === 'source',
    )

    if (sourceNodes.length === 0 && selectedConnectionId) {
      await loadAnalyticsFromConnection(selectedConnectionId)
      setIsFetchingLive(false)
      return
    }

    for (const node of sourceNodes) {
      if (!node.connectionId || !node.datasetId) continue

      const effDates = resolveEffectiveNodeDates(
        node.filterValues,
        startDate,
        endDate,
      )
      const effProject = resolveEffectiveNodeProject(node.filterValues)

      await fetchSourceDataset(node.id, node.connectionId, {
        datasetId: node.datasetId,
        projectId: effProject,
        startDate: effDates.from,
        endDate: effDates.to,
        execution: node.queryExecution,
        filters: node.filterValues,
      })
    }

    setIsFetchingLive(false)
  }, [
    fetchSourceDataset,
    queryExecution,
    activeSpace.workflowNodes,
    bridge.addons,
    endDate,
    loadAnalyticsFromConnection,
    selectedConnectionId,
    startDate,
    workspaceId,
  ])

  const inspectedNodeConfig = useMemo<SpaceWorkflowNodeConfig | null>(() => {
    if (!inspectedNodeId) return null
    const found = activeSpace.workflowNodes.find(
      (n) => n.id === inspectedNodeId,
    )
    if (found) return found
    return null
  }, [activeSpace.workflowNodes, inspectedNodeId])

  const inspectedNodeLineageChain = useMemo<SpaceWorkflowNodeConfig[]>(() => {
    if (!inspectedNodeConfig) return []
    const chain: SpaceWorkflowNodeConfig[] = []
    const visited = new Set<string>()

    for (const upId of inspectedNodeConfig.upstreamNodeIds) {
      const upNode = activeSpace.workflowNodes.find((n) => n.id === upId)

      if (upNode && !visited.has(upNode.id)) {
        visited.add(upNode.id)
        chain.push(upNode)
      }
    }

    if (!visited.has(inspectedNodeConfig.id)) chain.push(inspectedNodeConfig)

    return chain
  }, [activeSpace.workflowNodes, inspectedNodeConfig])

  let inspectedNodeResolvedData: {
    columns: AnalyticsColumnSchema[]
    rows: AnalyticsDatasetRow[]
  } = { columns: [], rows: [] }
  if (inspectedNodeConfig !== null)
    inspectedNodeResolvedData = resolveRowsForWorkflowNode(inspectedNodeConfig)

  const handleSelectDatasetId = useCallback(
    (datasetId: string) => {
      setQueryExecution(undefined)
      setNewNodeDatasetId(datasetId)
      const matched = nodeSourceDatasets.find((d) => d.id === datasetId)

      if (matched && matched.columns) {
        setNodeSelectedColumns(matched.columns.map((c) => c.name))
        return
      }

      setNodeSelectedColumns([])
    },
    [nodeSourceDatasets],
  )

  const handleToggleNodeSelectedColumn = useCallback(
    (colName: string, checked: boolean) => {
      if (checked) {
        setNodeSelectedColumns((prev) => {
          if (prev.includes(colName)) return prev
          return [...prev, colName]
        })
        return
      }

      setNodeSelectedColumns((prev) => prev.filter((c) => c !== colName))
    },
    [],
  )

  const handleSelectAllNodeColumns = useCallback((allColNames: string[]) => {
    setNodeSelectedColumns(allColNames)
  }, [])

  const handleClearAllNodeColumns = useCallback(() => {
    setNodeSelectedColumns([])
  }, [])

  const handleChangeNodeColumnType = useCallback(
    (colName: string, nextType: 'string' | 'number' | 'date') => {
      setNodeCustomFieldTypes((prev) => ({
        ...prev,
        [colName]: nextType,
      }))
    },
    [],
  )

  const handleLoadNextSourceBatch = useCallback(
    async (nodeId: string) => {
      const page = nodePages[nodeId]

      if (page === undefined) {
        await handleSyncAllSources()
        return
      }

      if (page?.error !== undefined) {
        setInspectionPage({ id: nodeId, search: nodeModalSearch, offset: 0 })
        setNativeRevision((previous) => previous + 1)
        return
      }

      const data = page?.data
      if (data === undefined || !data.hasMore) return
      setInspectionPage({
        id: nodeId,
        search: nodeModalSearch,
        offset: data.offset + data.limit,
        version: data.version,
      })
    },
    [nodePages, handleSyncAllSources, nodeModalSearch],
  )
  let inspectedBatch:
    | { index: number; offset: number; finished: boolean; totalRows?: number }
    | undefined
  let canLoadNextBatch = false
  let inspectedSourceLoading = false
  let inspectedSourceError: string | undefined

  if (inspectedNodeConfig !== null) {
    const page = nodePages[inspectedNodeConfig.id]
    inspectedSourceLoading =
      loadingSourceIds.has(inspectedNodeConfig.id) || page === undefined
    inspectedSourceError = page?.error
    if (sourceErrors[inspectedNodeConfig.id] !== undefined)
      inspectedSourceError = sourceErrors[inspectedNodeConfig.id]

    if (page?.data !== undefined) {
      inspectedBatch = {
        index: page.data.offset / page.data.limit,
        offset: page.data.offset,
        finished: !page.data.hasMore,
        totalRows: page.data.totalRows,
      }
      canLoadNextBatch = page.data.hasMore
    }
  }

  const hasUnverifiedCoverage = Object.values(publications).some(
    (publication) => publication.coverage !== 'complete',
  )

  const sourceFailures = activeSpace.workflowNodes.flatMap((node) => {
    const message = sourceErrors[node.id]
    if (message === undefined) return []
    return [
      {
        nodeId: node.id,
        label: node.label,
        message,
        details: sourceErrorDetails[node.id],
      },
    ]
  })

  return {
    clearConnectionPublications,
    queryExecution,
    setQueryExecution,
    warehousePlan,
    publicationVersion,
    previewError: previewPage?.error,
    previewDetails: previewPage?.details,
    filterOptionsFailures: Object.entries(filterOptionsErrors).map(
      ([source, message]) => ({ source, message }),
    ),
    sourceFailures,
    handleLoadNextSourceBatch,
    inspectedBatch,
    canLoadNextBatch,
    inspectedSourceLoading,
    inspectedSourceError,
    hasUnverifiedCoverage,
    spaces,
    activeSpace,
    layerMode,
    setLayerMode,
    startDate,
    endDate,
    dateRange,
    handleDateRangeChange,
    isFetchingLive,
    handleSelectSpace,
    handleSyncAllSources,
    resolveRowsForWorkflowNode,
    handleGenericChartDrillDown,
    updateWidgetSpan,
    updateWidgetVisualType,
    moveWidgetOrder,
    overloadTolerancePct,
    setOverloadTolerancePct,
    idleTolerancePct,
    setIdleTolerancePct,
    estimationTolerancePct,
    setEstimationTolerancePct,
    pipelineNodes,
    pipelineEdges,
    onPipelineNodesChange,
    onPipelineEdgesChange,
    handleOpenAddNode,
    handleOpenEditNode,
    inspectedNodeConfig,
    inspectedNodeLineageChain,
    inspectedNodeResolvedData,
    nodeModalSearch,
    setNodeModalSearch,
    setInspectedNodeId,
    drillDown,
    setDrillDown,
    isNewSpaceModalOpen,
    setIsNewSpaceModalOpen,
    newSpaceTitle,
    setNewSpaceTitle,
    newSpaceSubtitle,
    setNewSpaceSubtitle,
    newSpaceWidgets,
    handleToggleNewSpaceWidget,
    handleCreateNewSpace,
    isAddNodeModalOpen,
    setIsAddNodeModalOpen,
    editingNodeId,
    setEditingNodeId,
    selectedAddNodeType,
    setSelectedAddNodeType,
    newNodeLabel,
    setNewNodeLabel,
    newNodeSelectedConnectionId,
    setNewNodeSelectedConnectionId,
    newNodeDatasetId,
    setNewNodeDatasetId,
    handleSelectDatasetId,
    nodeSourceDatasets,
    isLoadingNodeDatasets,
    nodeSelectedColumns,
    setNodeSelectedColumns,
    handleToggleNodeSelectedColumn,
    handleSelectAllNodeColumns,
    handleClearAllNodeColumns,
    nodeCustomFieldTypes,
    handleChangeNodeColumnType,
    newNodeWidgetType,
    setNewNodeWidgetType,
    newNodeSpan,
    setNewNodeSpan,
    outputSourceNodeId,
    setOutputSourceNodeId,
    outputCategoryColumn,
    setOutputCategoryColumn,
    outputMetricColumn,
    setOutputMetricColumn,
    outputSecondaryMetricColumn,
    setOutputSecondaryMetricColumn,
    outputHierarchyColumns,
    outputStackColumn,
    setOutputHierarchyColumns,
    setOutputStackColumn,
    outputReferenceLineMode,
    setOutputReferenceLineMode,
    outputReferenceLineTarget,
    setOutputReferenceLineTarget,
    connectionDisplayOptions,
    availableProjects,
    upstreamAvailableColumns,
    transformPreviewBeforePayload,
    transformPreviewAfterPayload,
    txUpstreamNodeId,
    setTxUpstreamNodeId,
    sqlQueryText,
    setSqlQueryText,
    newNodeFilterValues,
    handleSetNodeFilterValue,
    dynamicFilterOptions,
    handleSaveEditedNode,
    handleAddWorkflowNode,
  }
}
