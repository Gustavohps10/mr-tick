import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetRow,
  AnalyticsDatasetScope,
  AnalyticsExecutionRequest,
  AnalyticsFilterDynamicSource,
  AnalyticsFilterOption,
  AnalyticsFilterValue,
  AnalyticsPlanNode,
  AnalyticsPublication,
  AnalyticsRefreshMode,
  AnalyticsSyncState,
  AnalyticsSyncStrategy,
  SaveAnalyticsWorkspaceStateInput,
  WorkspaceViewModel,
} from '@mr-tick/application'
import {
  analyticsSelectionKey,
  createAnalyticsDatasetScope,
} from '@mr-tick/application'
import type { AddonManifestViewModel } from '@mr-tick/sdk'
import { isAnalytics } from '@mr-tick/shared/helpers'
import type {
  AnalyticsLoadProgressEvent,
  AnalyticsStorageResetEvent,
} from '@mr-tick/shared/transport'
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
  collectUpstreamSourceNodeIds,
  isRemoteAggregateUnsupportedVisual,
  isRemoteAggregateUpstream,
} from '../lib/analytics-plan'
import {
  normalizeCustomDateRange,
  normalizeSourceFilters,
  queryWithDatasetSelection,
  resolveEffectiveNodeDates,
  resolveEffectiveNodeProject,
  selectionSignature,
} from '../lib/analytics-selection'
import {
  isIsoDateString,
  isoDateToLocalDate,
  parsePersistedSpaces,
} from '../lib/analytics-spaces-schema'
import {
  type AddNodeTypeOption,
  type AnalyticsSourceFailureItem,
  type AnalyticsSpaceConfig,
  type AnalyticsSyncStatusSummary,
  type AnalyticsUpstreamSourceStatus,
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

const DEFAULT_POLLING_INTERVAL_MINUTES = 5
const DEFAULT_FULL_RECONCILE_INTERVAL_MINUTES = 360
const MAX_CONCURRENT_SELECTIONS = 2

interface StoredSelectionEntry {
  workspaceId: string
  connectionId: string
  scopeSignature: string
  computedSelectionKey: string
  scope: AnalyticsDatasetScope
  publication: AnalyticsPublication
  syncState: AnalyticsSyncState
}

interface SourceSelectionDescriptor {
  selKey: string
  nodeId: string
  connectionId: string
  rawQuery: AnalyticsDatasetQueryInput
  selectedQuery: AnalyticsDatasetQueryInput
  scopeSignature: string
  computedSelectionKey?: string
}

function buildSettingsSnapshotKey(
  input: SaveAnalyticsWorkspaceStateInput,
): string {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    pollingIntervalMinutes: input.pollingIntervalMinutes,
    spacesJson: input.spacesJson,
    startDate: input.startDate,
    endDate: input.endDate,
  })
}

function maxIsoTimestamp(
  current: string | undefined,
  candidate: string | undefined,
): string | undefined {
  if (candidate === undefined || candidate.trim() === '') return current
  if (current === undefined) return candidate

  const currentMs = Date.parse(current)
  const candidateMs = Date.parse(candidate)

  if (!Number.isFinite(currentMs) || candidateMs > currentMs) return candidate

  return current
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
  const [pollingIntervalMinutes, setPollingIntervalMinutes] = useState<number>(
    DEFAULT_POLLING_INTERVAL_MINUTES,
  )
  const [isHydrated, setIsHydrated] = useState<boolean>(false)
  const [hydrateError, setHydrateError] = useState<string | undefined>(
    undefined,
  )
  const [hydrateErrorDetails, setHydrateErrorDetails] = useState<
    Record<string, string[]> | undefined
  >()
  const [hydrationAttempt, setHydrationAttempt] = useState(0)
  const retryHydration = useCallback(
    () => setHydrationAttempt((value) => value + 1),
    [],
  )
  const [isResettingStorage, setIsResettingStorage] = useState(false)
  const [resetError, setResetError] = useState<string | undefined>()
  const [resetErrorDetails, setResetErrorDetails] = useState<
    Record<string, string[]> | undefined
  >()
  const [settingsError, setSettingsError] = useState<string | undefined>()
  const [settingsErrorDetails, setSettingsErrorDetails] = useState<
    Record<string, string[]> | undefined
  >()
  const [settingsSaveRevision, setSettingsSaveRevision] = useState(0)
  const retrySaveWorkspaceState = useCallback(
    () => setSettingsSaveRevision((value) => value + 1),
    [],
  )

  const [startDate, setStartDate] = useState<string>('2026-08-01')
  const [endDate, setEndDate] = useState<string>('2026-10-31')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: new Date(2026, 7, 1),
    to: new Date(2026, 9, 31),
  }))

  const [selectionEntries, setSelectionEntries] = useState<
    Record<string, StoredSelectionEntry>
  >({})
  const [computedKeysBySelKey, setComputedKeysBySelKey] = useState<
    Record<string, string>
  >({})
  const [selectionProgress, setSelectionProgress] = useState<
    Record<string, AnalyticsLoadProgressEvent>
  >({})
  const [activeSelectionModes, setActiveSelectionModes] = useState<
    Record<string, AnalyticsRefreshMode>
  >({})
  const [selectionErrors, setSelectionErrors] = useState<
    Record<string, string>
  >({})
  const [selectionErrorDetails, setSelectionErrorDetails] = useState<
    Record<string, Record<string, string[]>>
  >({})

  const [installedAddons, setInstalledAddons] = useState<
    AddonManifestViewModel[]
  >([])

  const [overloadTolerancePct, setOverloadTolerancePct] = useState<number>(10)
  const [idleTolerancePct, setIdleTolerancePct] = useState<number>(15)
  const [estimationTolerancePct, setEstimationTolerancePct] =
    useState<number>(15)

  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null)
  const [nodeModalSearch, setNodeModalSearch] = useState<string>('')
  const [inspectionPage, setInspectionPage] = useState<{
    id: string
    search: string
    offset: number
    limit: number
    version?: string
  }>({ id: '', search: '', offset: 0, limit: 100 })

  const handleSetInspectedNodeId = useCallback((nodeId: string | null) => {
    setInspectedNodeId(nodeId)
    setInspectionPage((previous) => ({
      id: '',
      search: '',
      offset: 0,
      limit: previous.limit,
    }))
  }, [])
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
  const [newNodeCustomDateRange, setNewNodeCustomDateRange] = useState<
    { from?: string; to?: string } | undefined
  >(undefined)
  const [sourceCatalog, setNodeSourceDatasets] = useState<
    AnalyticsDatasetManifest[]
  >([])
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

  const analyticsCatalogs = useRef(
    new Map<string, AnalyticsDatasetManifest[]>(),
  )
  const lastSavedWorkspaceSnapshotRef = useRef<string>('')
  const settingsSaveTailRef = useRef(Promise.resolve())
  const pendingSettingsSavesRef = useRef(0)
  const canAutoPersistSettingsRef = useRef<boolean>(false)
  const userMutatedStateRef = useRef<boolean>(false)
  const inFlightSelectionsRef = useRef(
    new Map<string, { mode: AnalyticsRefreshMode; promise: Promise<void> }>(),
  )
  const latestSelectionRequestsRef = useRef(new Map<string, symbol>())
  const attemptedMissingKeysRef = useRef(new Set<string>())
  const checkedHydratedOverdueRef = useRef(new Set<string>())
  const eventKeyToSelKeyRef = useRef(new Map<string, string>())
  const computedKeysRef = useRef<Record<string, string>>({})
  const isResettingStorageRef = useRef<boolean>(false)
  const isMountedRef = useRef<boolean>(false)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleSetNodeFilterValue = useCallback(
    (filterId: string, val: AnalyticsFilterValue) => {
      setNewNodeFilterValues((prev) => ({
        ...prev,
        [filterId]: val,
      }))
    },
    [],
  )

  const activeSpace = useMemo<AnalyticsSpaceConfig>(() => {
    if (pageId) {
      const matched = spaces.find((s) => s.id === pageId)
      if (matched) return matched
    }

    const [firstSpace] = spaces
    if (firstSpace) return firstSpace

    return createDefaultBlankSpace()
  }, [pageId, spaces])

  const activeWorkflowNodesRef = useRef(activeSpace.workflowNodes)
  activeWorkflowNodesRef.current = activeSpace.workflowNodes

  const selectionEntriesRef = useRef(selectionEntries)
  selectionEntriesRef.current = selectionEntries

  const startDateRef = useRef(startDate)
  startDateRef.current = startDate

  const endDateRef = useRef(endDate)
  endDateRef.current = endDate

  const findCachedManifest = useCallback(
    (
      connectionId: string,
      datasetId: string,
    ): AnalyticsDatasetManifest | undefined => {
      if (workspaceId !== undefined) {
        const catalogKey = JSON.stringify([workspaceId, connectionId])
        const catalog = analyticsCatalogs.current.get(catalogKey)
        const matched = catalog?.find((item) => item.id === datasetId)
        if (matched !== undefined) return matched
      }

      for (const entry of Object.values(selectionEntriesRef.current)) {
        if (
          entry.connectionId === connectionId &&
          entry.publication.manifest.id === datasetId
        )
          return entry.publication.manifest
      }

      return undefined
    },
    [workspaceId],
  )

  const nodeSelectionPlans = useMemo<
    Record<string, SourceSelectionDescriptor>
  >(() => {
    const result: Record<string, SourceSelectionDescriptor> = {}

    for (const node of activeSpace.workflowNodes) {
      if (node.kind !== 'source' || !node.connectionId || !node.datasetId)
        continue

      const effDates = resolveEffectiveNodeDates(
        node.customDateRange,
        startDate,
        endDate,
      )
      const effProject = resolveEffectiveNodeProject(node.filterValues)
      const rawQuery: AnalyticsDatasetQueryInput = {
        datasetId: node.datasetId,
        projectId: effProject,
        startDate: effDates.from,
        endDate: effDates.to,
        execution: node.queryExecution,
        filters: normalizeSourceFilters(node.filterValues),
      }
      const manifest = findCachedManifest(node.connectionId, node.datasetId)
      const selectedQuery = queryWithDatasetSelection(rawQuery, manifest)
      const scopeSig = selectionSignature(selectedQuery)
      const selKey = `${node.connectionId}::${scopeSig}`
      let computedKey = computedKeysBySelKey[selKey]
      const existingEntry = selectionEntries[selKey]
      if (computedKey === undefined && existingEntry !== undefined)
        computedKey = existingEntry.computedSelectionKey

      result[node.id] = {
        selKey,
        nodeId: node.id,
        connectionId: node.connectionId,
        rawQuery,
        selectedQuery,
        scopeSignature: scopeSig,
        computedSelectionKey: computedKey,
      }
    }

    return result
  }, [
    activeSpace.workflowNodes,
    computedKeysBySelKey,
    endDate,
    findCachedManifest,
    selectionEntries,
    startDate,
  ])

  useEffect(() => {
    let active = true
    const descriptors = Object.values(nodeSelectionPlans)

    for (const desc of descriptors) {
      if (desc.computedSelectionKey !== undefined) {
        const eventKey = `${desc.connectionId}::${desc.computedSelectionKey}`
        eventKeyToSelKeyRef.current.set(eventKey, desc.selKey)
        continue
      }

      void analyticsSelectionKey(desc.selectedQuery).then((hashKey) => {
        if (!active) return
        const eventKey = `${desc.connectionId}::${hashKey}`
        eventKeyToSelKeyRef.current.set(eventKey, desc.selKey)
        if (computedKeysRef.current[desc.selKey] === hashKey) return
        computedKeysRef.current = {
          ...computedKeysRef.current,
          [desc.selKey]: hashKey,
        }
        setComputedKeysBySelKey((previous) => {
          if (previous[desc.selKey] === hashKey) return previous
          return { ...previous, [desc.selKey]: hashKey }
        })
      })
    }

    return () => {
      active = false
    }
  }, [nodeSelectionPlans])

  const nodeSourceDatasets = useMemo(() => {
    if (editingNodeId === null) return sourceCatalog

    const plan = nodeSelectionPlans[editingNodeId]
    let cached: StoredSelectionEntry | undefined
    if (plan !== undefined) cached = selectionEntries[plan.selKey]

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
    nodeSelectionPlans,
    selectionEntries,
    workspaceId,
    newNodeSelectedConnectionId,
    newNodeDatasetId,
  ])

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
      userMutatedStateRef.current = true
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

  useEffect(() => {
    if (!workspaceId) return
    let active = true

    canAutoPersistSettingsRef.current = false
    userMutatedStateRef.current = false
    setIsHydrated(false)
    setHydrateError(undefined)
    setHydrateErrorDetails(undefined)
    setResetError(undefined)
    setResetErrorDetails(undefined)
    setSettingsError(undefined)
    setSettingsErrorDetails(undefined)
    setSelectionEntries({})
    setComputedKeysBySelKey({})
    computedKeysRef.current = {}
    setSelectionProgress({})
    setSelectionErrors({})
    setSelectionErrorDetails({})
    setActiveSelectionModes({})
    attemptedMissingKeysRef.current.clear()
    checkedHydratedOverdueRef.current.clear()
    eventKeyToSelKeyRef.current.clear()

    void bridge.addons
      .hydrateAnalytics({ body: { workspaceId } })
      .then((res) => {
        if (!active) return

        if (!res.isSuccess || res.data === undefined) {
          let message = 'ANALYTICS_HYDRATE_FAILED'
          if (res.error !== undefined) message = res.error
          setHydrateError(message)
          setHydrateErrorDetails(res.details)
          return
        }

        let restoredSpaces = [createDefaultBlankSpace()]
        let restoredPolling = DEFAULT_POLLING_INTERVAL_MINUTES
        let restoredStart = '2026-08-01'
        let restoredEnd = '2026-10-31'

        if (res.data.settings !== undefined) {
          restoredPolling = res.data.settings.pollingIntervalMinutes

          if (
            res.data.settings.startDate !== undefined &&
            isIsoDateString(res.data.settings.startDate)
          )
            restoredStart = res.data.settings.startDate

          if (
            res.data.settings.endDate !== undefined &&
            isIsoDateString(res.data.settings.endDate)
          )
            restoredEnd = res.data.settings.endDate

          if (res.data.settings.spacesJson !== undefined) {
            const parsed = parsePersistedSpaces(res.data.settings.spacesJson)

            if (parsed.isFailure()) {
              setHydrateError(parsed.failure.messageKey)
              setHydrateErrorDetails(parsed.failure.details)
              return
            }

            if (parsed.success.length > 0) restoredSpaces = parsed.success
          }
        }

        const nextEntries: Record<string, StoredSelectionEntry> = {}
        const nextComputed: Record<string, string> = {}

        for (const item of res.data.publications) {
          const scopeSig = selectionSignature(item.publication.query)
          const selKey = `${item.publication.connectionInstanceId}::${scopeSig}`
          const eventKey = `${item.publication.connectionInstanceId}::${item.publication.selectionKey}`
          eventKeyToSelKeyRef.current.set(eventKey, selKey)
          nextComputed[selKey] = item.publication.selectionKey
          nextEntries[selKey] = {
            workspaceId,
            connectionId: item.publication.connectionInstanceId,
            scopeSignature: scopeSig,
            computedSelectionKey: item.publication.selectionKey,
            scope: createAnalyticsDatasetScope(item.publication.query),
            publication: item.publication,
            syncState: item.syncState,
          }
        }

        canAutoPersistSettingsRef.current = true
        computedKeysRef.current = nextComputed

        if (!userMutatedStateRef.current) {
          lastSavedWorkspaceSnapshotRef.current = buildSettingsSnapshotKey({
            workspaceId,
            pollingIntervalMinutes: restoredPolling,
            spacesJson: JSON.stringify(restoredSpaces),
            startDate: restoredStart,
            endDate: restoredEnd,
          })
          setSpaces(restoredSpaces)
          setPollingIntervalMinutes(restoredPolling)
          setStartDate(restoredStart)
          setEndDate(restoredEnd)
          setDateRange({
            from: isoDateToLocalDate(restoredStart),
            to: isoDateToLocalDate(restoredEnd),
          })
        }

        setComputedKeysBySelKey(nextComputed)
        setSelectionEntries(nextEntries)
        setIsHydrated(true)
      })

    return () => {
      active = false
    }
  }, [bridge.addons, hydrationAttempt, workspaceId])

  useEffect(() => {
    if (!isHydrated || !workspaceId || !canAutoPersistSettingsRef.current)
      return

    const payload: SaveAnalyticsWorkspaceStateInput = {
      workspaceId,
      pollingIntervalMinutes,
      spacesJson: JSON.stringify(spaces),
    }

    if (isIsoDateString(startDate)) payload.startDate = startDate
    if (isIsoDateString(endDate)) payload.endDate = endDate

    const snapshot = buildSettingsSnapshotKey(payload)
    if (
      snapshot === lastSavedWorkspaceSnapshotRef.current &&
      pendingSettingsSavesRef.current === 0
    )
      return

    let active = true
    pendingSettingsSavesRef.current += 1
    settingsSaveTailRef.current = settingsSaveTailRef.current
      .then(async () => {
        if (active) {
          setSettingsError(undefined)
          setSettingsErrorDetails(undefined)
        }

        const response = await bridge.addons.saveAnalyticsWorkspaceState({
          body: payload,
        })
        if (!active) return

        if (response.isSuccess) {
          lastSavedWorkspaceSnapshotRef.current = snapshot
          return
        }

        let message = 'ANALYTICS_SETTINGS_SAVE_FAILED'
        if (response.error !== undefined) message = response.error
        setSettingsError(message)
        setSettingsErrorDetails(response.details)
      })
      .finally(() => {
        pendingSettingsSavesRef.current -= 1
      })

    return () => {
      active = false
    }
  }, [
    bridge.addons,
    endDate,
    isHydrated,
    pollingIntervalMinutes,
    settingsSaveRevision,
    spaces,
    startDate,
    workspaceId,
  ])

  useEffect(() => {
    const unsubscribe = bridge.events.on(
      'analytics:load-progress',
      (payload) => {
        if (payload.workspaceId !== workspaceId) return
        const eventKey = `${payload.connectionInstanceId}::${payload.selectionKey}`

        if (payload.phase === 'completed' || payload.phase === 'failed') {
          setSelectionProgress((previous) => {
            if (previous[eventKey] === undefined) return previous
            const next = { ...previous }
            delete next[eventKey]
            return next
          })
          return
        }

        setSelectionProgress((previous) => ({
          ...previous,
          [eventKey]: payload,
        }))
      },
    )

    return () => {
      unsubscribe()
    }
  }, [bridge.events, workspaceId])

  const applyResetAnalyticsState = useCallback(() => {
    lastSavedWorkspaceSnapshotRef.current = ''
    canAutoPersistSettingsRef.current = false
    userMutatedStateRef.current = false
    setSpaces([createDefaultBlankSpace()])
    setPollingIntervalMinutes(DEFAULT_POLLING_INTERVAL_MINUTES)
    setStartDate('2026-08-01')
    setEndDate('2026-10-31')
    setDateRange({
      from: isoDateToLocalDate('2026-08-01'),
      to: isoDateToLocalDate('2026-10-31'),
    })
    setSelectionEntries({})
    setComputedKeysBySelKey({})
    computedKeysRef.current = {}
    setSelectionProgress({})
    setSelectionErrors({})
    setSelectionErrorDetails({})
    setActiveSelectionModes({})
    setResetError(undefined)
    setResetErrorDetails(undefined)
    setHydrateError(undefined)
    setHydrateErrorDetails(undefined)
    setHydrationAttempt((value) => value + 1)
  }, [])

  const resetAnalyticsStorage = useCallback(async () => {
    if (!workspaceId || isResettingStorageRef.current) return

    isResettingStorageRef.current = true
    setIsResettingStorage(true)
    setResetError(undefined)
    setResetErrorDetails(undefined)

    try {
      const response = await bridge.addons.resetAnalyticsStorage({
        body: { workspaceId },
      })

      if (!isMountedRef.current) return

      if (!response.isSuccess) {
        let message = 'ANALYTICS_STORAGE_RESET_FAILED'
        if (response.error !== undefined) message = response.error
        setResetError(message)
        setResetErrorDetails(response.details)
        return
      }

      applyResetAnalyticsState()
    } finally {
      isResettingStorageRef.current = false
      if (isMountedRef.current) setIsResettingStorage(false)
    }
  }, [applyResetAnalyticsState, bridge.addons, workspaceId])

  useEffect(() => {
    const unsubscribe = bridge.events.on<AnalyticsStorageResetEvent>(
      'analytics:storage-reset',
      (payload) => {
        if (payload.workspaceId !== workspaceId) return
        if (isResettingStorageRef.current) return

        applyResetAnalyticsState()
      },
    )

    return () => {
      unsubscribe()
    }
  }, [applyResetAnalyticsState, bridge.events, workspaceId])

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
    const connectionId = newNodeSelectedConnectionId
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
    workspaceId,
    nodeSourceDatasets,
    newNodeDatasetId,
  ])

  const clearConnectionPublications = useCallback(
    (connectionIds: string[], message: string) => {
      if (connectionIds.length === 0) return

      const affectedSelKeys = new Set<string>()

      for (const [selKey, entry] of Object.entries(
        selectionEntriesRef.current,
      )) {
        if (connectionIds.includes(entry.connectionId))
          affectedSelKeys.add(selKey)
      }

      for (const node of activeWorkflowNodesRef.current) {
        if (
          node.kind !== 'source' ||
          node.connectionId === undefined ||
          !connectionIds.includes(node.connectionId)
        )
          continue

        const effDates = resolveEffectiveNodeDates(
          node.customDateRange,
          startDateRef.current,
          endDateRef.current,
        )
        const effProject = resolveEffectiveNodeProject(node.filterValues)
        const manifest = findCachedManifest(node.connectionId, node.datasetId)
        const selectedQuery = queryWithDatasetSelection(
          {
            datasetId: node.datasetId,
            projectId: effProject,
            startDate: effDates.from,
            endDate: effDates.to,
            execution: node.queryExecution,
            filters: normalizeSourceFilters(node.filterValues),
          },
          manifest,
        )
        const selKey = `${node.connectionId}::${selectionSignature(selectedQuery)}`
        affectedSelKeys.add(selKey)
      }

      setSelectionEntries((previousEntries) => {
        const remainingEntries: Record<string, StoredSelectionEntry> = {}

        for (const [selKey, entry] of Object.entries(previousEntries)) {
          if (connectionIds.includes(entry.connectionId)) continue

          remainingEntries[selKey] = entry
        }

        return remainingEntries
      })

      if (affectedSelKeys.size > 0) {
        setSelectionErrors((previousErrors) => {
          const next = { ...previousErrors }

          for (const key of affectedSelKeys) next[key] = message

          return next
        })
      }

      setSelectionProgress((previous) => {
        const next: Record<string, AnalyticsLoadProgressEvent> = {}

        for (const [eventKey, evt] of Object.entries(previous)) {
          if (!connectionIds.includes(evt.connectionInstanceId))
            next[eventKey] = evt
        }

        return next
      })
    },
    [findCachedManifest],
  )

  const syncUniqueSelection = useCallback(
    async (
      connectionId: string,
      rawQuery: AnalyticsDatasetQueryInput,
      mode: AnalyticsRefreshMode,
    ): Promise<void> => {
      if (!workspaceId || !connectionId) return

      const resolveCanonicalTarget = async (): Promise<{
        manifest?: AnalyticsDatasetManifest
        selectedQuery: AnalyticsDatasetQueryInput
        scopeSignature: string
        selKey: string
        computedKey: string
        catalogError?: string
      }> => {
        const catalogKey = JSON.stringify([workspaceId, connectionId])
        let catalog = analyticsCatalogs.current.get(catalogKey)

        if (catalog === undefined) {
          const cachedManifest = findCachedManifest(
            connectionId,
            rawQuery.datasetId,
          )
          if (cachedManifest !== undefined) {
            const selectedQuery = queryWithDatasetSelection(
              rawQuery,
              cachedManifest,
            )
            const scopeSignature = selectionSignature(selectedQuery)
            const selKey = `${connectionId}::${scopeSignature}`
            const computedKey = await analyticsSelectionKey(selectedQuery)
            return {
              manifest: cachedManifest,
              selectedQuery,
              scopeSignature,
              selKey,
              computedKey,
            }
          }

          const listed = await bridge.addons.listAnalyticsDatasets({
            body: { workspaceId, connectionInstanceId: connectionId },
          })

          if (!listed.isSuccess || listed.data === undefined) {
            let errorMessage = 'ANALYTICS_CATALOG_UNAVAILABLE'
            if (listed.error !== undefined) errorMessage = listed.error
            const fallbackQuery = queryWithDatasetSelection(rawQuery, undefined)
            const fallbackScopeSignature = selectionSignature(fallbackQuery)
            const fallbackSelKey = `${connectionId}::${fallbackScopeSignature}`
            const computedKey = await analyticsSelectionKey(fallbackQuery)
            return {
              selectedQuery: fallbackQuery,
              scopeSignature: fallbackScopeSignature,
              selKey: fallbackSelKey,
              computedKey,
              catalogError: errorMessage,
            }
          }

          catalog = listed.data
          analyticsCatalogs.current.set(catalogKey, catalog)
        }

        const manifest = catalog.find((item) => item.id === rawQuery.datasetId)
        const selectedQuery = queryWithDatasetSelection(rawQuery, manifest)
        const scopeSignature = selectionSignature(selectedQuery)
        const selKey = `${connectionId}::${scopeSignature}`
        const computedKey = await analyticsSelectionKey(selectedQuery)

        return {
          manifest,
          selectedQuery,
          scopeSignature,
          selKey,
          computedKey,
        }
      }

      const target = await resolveCanonicalTarget()
      if (!isMountedRef.current) return

      const eventKey = `${connectionId}::${target.computedKey}`
      eventKeyToSelKeyRef.current.set(eventKey, target.selKey)

      if (computedKeysRef.current[target.selKey] !== target.computedKey) {
        computedKeysRef.current = {
          ...computedKeysRef.current,
          [target.selKey]: target.computedKey,
        }
        setComputedKeysBySelKey((previous) => ({
          ...previous,
          [target.selKey]: target.computedKey,
        }))
      }

      if (target.catalogError !== undefined) {
        const catalogError = target.catalogError

        setSelectionErrors((previous) => ({
          ...previous,
          [target.selKey]: catalogError,
        }))

        return
      }

      if (target.manifest === undefined) {
        setSelectionErrors((previous) => ({
          ...previous,
          [target.selKey]: 'ANALYTICS_DATASET_NOT_AVAILABLE',
        }))
        return
      }

      const existingInFlight = inFlightSelectionsRef.current.get(target.selKey)

      if (existingInFlight !== undefined) {
        if (mode !== 'full' || existingInFlight.mode === 'full')
          return existingInFlight.promise

        await existingInFlight.promise
        if (!isMountedRef.current) return
        const postWait = inFlightSelectionsRef.current.get(target.selKey)
        if (postWait !== undefined && postWait.mode === 'full')
          return postWait.promise
      }

      attemptedMissingKeysRef.current.add(target.selKey)
      checkedHydratedOverdueRef.current.add(target.selKey)

      const executeLoad = async (): Promise<void> => {
        if (!isMountedRef.current) return

        const requestToken = Symbol()
        latestSelectionRequestsRef.current.set(target.selKey, requestToken)
        setActiveSelectionModes((previous) => ({
          ...previous,
          [target.selKey]: mode,
        }))
        setSelectionErrors((previous) => {
          if (previous[target.selKey] === undefined) return previous
          const next = { ...previous }
          delete next[target.selKey]
          return next
        })
        setSelectionErrorDetails((previous) => {
          if (previous[target.selKey] === undefined) return previous
          const next = { ...previous }
          delete next[target.selKey]
          return next
        })

        const response = await bridge.addons.loadAnalyticsDataset({
          body: {
            workspaceId,
            connectionInstanceId: connectionId,
            query: target.selectedQuery,
            policy: { mode },
          },
        })

        if (
          !isMountedRef.current ||
          latestSelectionRequestsRef.current.get(target.selKey) !== requestToken
        )
          return

        setActiveSelectionModes((previous) => {
          if (previous[target.selKey] === undefined) return previous
          const next = { ...previous }
          delete next[target.selKey]
          return next
        })
        setSelectionProgress((previous) => {
          if (previous[eventKey] === undefined) return previous
          const next = { ...previous }
          delete next[eventKey]
          return next
        })

        if (!response.isSuccess || response.data === undefined) {
          let message = 'ANALYTICS_REQUEST_FAILED'
          if (response.error !== undefined) message = response.error

          if (response.statusCode === 401 || response.statusCode === 403)
            clearConnectionPublications([connectionId], message)

          setSelectionErrors((previous) => ({
            ...previous,
            [target.selKey]: message,
          }))

          if (response.details !== undefined) {
            const details = response.details
            setSelectionErrorDetails((previous) => ({
              ...previous,
              [target.selKey]: details,
            }))
          }

          return
        }

        const publication = response.data.publication
        const syncState = response.data.syncState
        const pubEventKey = `${connectionId}::${publication.selectionKey}`
        eventKeyToSelKeyRef.current.set(pubEventKey, target.selKey)

        setSelectionEntries((previous) => ({
          ...previous,
          [target.selKey]: {
            workspaceId,
            connectionId,
            scopeSignature: target.scopeSignature,
            computedSelectionKey: publication.selectionKey,
            scope: createAnalyticsDatasetScope(target.selectedQuery),
            publication,
            syncState,
          },
        }))
      }

      const promise = executeLoad().finally(() => {
        const current = inFlightSelectionsRef.current.get(target.selKey)
        if (current !== undefined && current.promise === promise)
          inFlightSelectionsRef.current.delete(target.selKey)
      })

      inFlightSelectionsRef.current.set(target.selKey, { mode, promise })

      return promise
    },
    [
      bridge.addons,
      clearConnectionPublications,
      findCachedManifest,
      workspaceId,
    ],
  )

  const syncUniqueSelections = useCallback(
    async (
      descriptors: Array<{
        connectionId: string
        rawQuery: AnalyticsDatasetQueryInput
      }>,
      mode: AnalyticsRefreshMode,
    ): Promise<void> => {
      if (!workspaceId || descriptors.length === 0) return

      const deduplicated = new Map<
        string,
        { connectionId: string; rawQuery: AnalyticsDatasetQueryInput }
      >()

      for (const item of descriptors) {
        if (!item.connectionId || !item.rawQuery.datasetId) continue
        const manifest = findCachedManifest(
          item.connectionId,
          item.rawQuery.datasetId,
        )
        const normalizedQuery = queryWithDatasetSelection(
          item.rawQuery,
          manifest,
        )
        const key = `${item.connectionId}::${selectionSignature(normalizedQuery)}`
        if (!deduplicated.has(key))
          deduplicated.set(key, {
            connectionId: item.connectionId,
            rawQuery: item.rawQuery,
          })
      }

      const queue = Array.from(deduplicated.values())
      if (queue.length === 0) return

      let workerCount = MAX_CONCURRENT_SELECTIONS
      if (queue.length < workerCount) workerCount = queue.length

      let cursorIndex = 0
      const workers: Promise<void>[] = []

      for (let idx = 0; idx < workerCount; idx += 1) {
        workers.push(
          (async () => {
            while (cursorIndex < queue.length) {
              const nextIndex = cursorIndex
              cursorIndex += 1
              const target = queue[nextIndex]
              if (target === undefined) return
              await syncUniqueSelection(
                target.connectionId,
                target.rawQuery,
                mode,
              )
            }
          })(),
        )
      }

      await Promise.all(workers)
    },
    [findCachedManifest, syncUniqueSelection, workspaceId],
  )

  const collectActiveUniqueSourceDescriptors = useCallback(() => {
    const items: Array<{
      selKey: string
      connectionId: string
      rawQuery: AnalyticsDatasetQueryInput
    }> = []
    const seen = new Set<string>()

    for (const node of activeWorkflowNodesRef.current) {
      if (node.kind !== 'source' || !node.connectionId || !node.datasetId)
        continue

      const effDates = resolveEffectiveNodeDates(
        node.customDateRange,
        startDateRef.current,
        endDateRef.current,
      )
      const effProject = resolveEffectiveNodeProject(node.filterValues)
      const rawQuery: AnalyticsDatasetQueryInput = {
        datasetId: node.datasetId,
        projectId: effProject,
        startDate: effDates.from,
        endDate: effDates.to,
        execution: node.queryExecution,
        filters: normalizeSourceFilters(node.filterValues),
      }
      const manifest = findCachedManifest(node.connectionId, node.datasetId)
      const normalized = queryWithDatasetSelection(rawQuery, manifest)
      const selKey = `${node.connectionId}::${selectionSignature(normalized)}`
      if (seen.has(selKey)) continue
      seen.add(selKey)
      items.push({ selKey, connectionId: node.connectionId, rawQuery })
    }

    return items
  }, [findCachedManifest])

  useEffect(() => {
    if (!isHydrated || !workspaceId) return

    const toFetch: Array<{
      connectionId: string
      rawQuery: AnalyticsDatasetQueryInput
    }> = []
    const nowMs = Date.now()
    const planList = Object.values(nodeSelectionPlans)
    const scheduledKeys = new Set<string>()

    for (const plan of planList) {
      if (scheduledKeys.has(plan.selKey)) continue
      const entry = selectionEntriesRef.current[plan.selKey]

      if (entry === undefined) {
        if (
          !attemptedMissingKeysRef.current.has(plan.selKey) &&
          activeSelectionModes[plan.selKey] === undefined
        ) {
          attemptedMissingKeysRef.current.add(plan.selKey)
          scheduledKeys.add(plan.selKey)
          toFetch.push({
            connectionId: plan.connectionId,
            rawQuery: plan.rawQuery,
          })
        }

        continue
      }

      if (
        pollingIntervalMinutes > 0 &&
        !checkedHydratedOverdueRef.current.has(plan.selKey) &&
        activeSelectionModes[plan.selKey] === undefined
      ) {
        checkedHydratedOverdueRef.current.add(plan.selKey)
        const lastFastMs = Date.parse(entry.syncState.lastFastSyncAt)
        const lastFullMs = Date.parse(entry.syncState.lastFullReconcileAt)
        const fastDue =
          !Number.isFinite(lastFastMs) ||
          nowMs - lastFastMs >= pollingIntervalMinutes * 60_000
        const fullDue =
          !Number.isFinite(lastFullMs) ||
          nowMs - lastFullMs >= DEFAULT_FULL_RECONCILE_INTERVAL_MINUTES * 60_000

        if (fastDue || fullDue) {
          scheduledKeys.add(plan.selKey)
          toFetch.push({
            connectionId: plan.connectionId,
            rawQuery: plan.rawQuery,
          })
        }
      }
    }

    if (toFetch.length > 0) void syncUniqueSelections(toFetch, 'auto')
  }, [
    activeSelectionModes,
    isHydrated,
    nodeSelectionPlans,
    pollingIntervalMinutes,
    syncUniqueSelections,
    workspaceId,
  ])

  useEffect(() => {
    if (!isHydrated || !workspaceId || pollingIntervalMinutes <= 0) return

    const intervalMs = pollingIntervalMinutes * 60_000
    const timerId = window.setInterval(() => {
      const activeItems = collectActiveUniqueSourceDescriptors()
      if (activeItems.length === 0) return
      void syncUniqueSelections(activeItems, 'auto')
    }, intervalMs)

    return () => {
      window.clearInterval(timerId)
    }
  }, [
    collectActiveUniqueSourceDescriptors,
    isHydrated,
    pollingIntervalMinutes,
    syncUniqueSelections,
    workspaceId,
  ])

  const handleSyncAllSources = useCallback(async () => {
    if (!workspaceId) return
    const items = collectActiveUniqueSourceDescriptors()
    if (items.length === 0) return

    for (const item of items) attemptedMissingKeysRef.current.add(item.selKey)

    await syncUniqueSelections(items, 'full')
  }, [collectActiveUniqueSourceDescriptors, syncUniqueSelections, workspaceId])

  const retrySourceNode = useCallback(
    async (targetNodeId: string) => {
      if (!workspaceId) return
      const sourceIds = collectUpstreamSourceNodeIds(
        activeWorkflowNodesRef.current,
        targetNodeId,
      )
      const items: Array<{
        connectionId: string
        rawQuery: AnalyticsDatasetQueryInput
      }> = []

      for (const sourceId of sourceIds) {
        const plan = nodeSelectionPlans[sourceId]
        if (plan === undefined) continue
        attemptedMissingKeysRef.current.add(plan.selKey)
        items.push({
          connectionId: plan.connectionId,
          rawQuery: plan.rawQuery,
        })
      }

      if (items.length === 0) {
        await handleSyncAllSources()
        return
      }

      await syncUniqueSelections(items, 'full')
    },
    [
      handleSyncAllSources,
      nodeSelectionPlans,
      syncUniqueSelections,
      workspaceId,
    ],
  )

  const publications: Record<string, AnalyticsPublication> = {}

  for (const node of activeSpace.workflowNodes) {
    if (node.kind !== 'source') continue
    const plan = nodeSelectionPlans[node.id]
    if (plan === undefined) continue
    const entry = selectionEntries[plan.selKey]
    if (
      entry === undefined ||
      entry.workspaceId !== workspaceId ||
      entry.connectionId !== node.connectionId
    )
      continue

    publications[node.id] = entry.publication
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

  const findProgressForPlan = useCallback(
    (
      plan: SourceSelectionDescriptor,
    ): AnalyticsLoadProgressEvent | undefined => {
      const entry = selectionEntries[plan.selKey]
      if (entry !== undefined) {
        const pubKey = `${plan.connectionId}::${entry.computedSelectionKey}`
        const byPub = selectionProgress[pubKey]
        if (byPub !== undefined) return byPub
      }

      if (plan.computedSelectionKey !== undefined) {
        const compKey = `${plan.connectionId}::${plan.computedSelectionKey}`
        const byComp = selectionProgress[compKey]
        if (byComp !== undefined) return byComp
      }

      return undefined
    },
    [selectionEntries, selectionProgress],
  )

  const upstreamStatusByNodeId = useMemo<
    Record<string, AnalyticsUpstreamSourceStatus>
  >(() => {
    const map: Record<string, AnalyticsUpstreamSourceStatus> = {}

    for (const node of activeSpace.workflowNodes) {
      const upstreamSources = collectUpstreamSourceNodeIds(
        activeSpace.workflowNodes,
        node.id,
      )
      if (upstreamSources.length === 0) continue

      let hasAllPublications = true
      let isInitialLoading = false
      let isRefreshing = false
      let progress: AnalyticsLoadProgressEvent | undefined
      let error: string | undefined
      let errorDetails: Record<string, string[]> | undefined

      for (const sourceId of upstreamSources) {
        const plan = nodeSelectionPlans[sourceId]
        if (plan === undefined) {
          hasAllPublications = false
          continue
        }

        const pub = publications[sourceId]
        const activeMode = activeSelectionModes[plan.selKey]
        const sourceError = selectionErrors[plan.selKey]
        const sourceErrDetails = selectionErrorDetails[plan.selKey]
        const sourceProg = findProgressForPlan(plan)

        if (pub === undefined) {
          hasAllPublications = false
          if (
            sourceError === undefined &&
            (activeMode !== undefined || isHydrated)
          )
            isInitialLoading = true
        }

        if (pub !== undefined && activeMode !== undefined) isRefreshing = true
        if (progress === undefined && sourceProg !== undefined)
          progress = sourceProg

        if (error === undefined && sourceError !== undefined) {
          error = sourceError
          errorDetails = sourceErrDetails
        }
      }

      if (error !== undefined && !hasAllPublications) isInitialLoading = false

      map[node.id] = {
        hasPublication: hasAllPublications,
        isInitialLoading,
        isRefreshing,
        progress,
        error,
        errorDetails,
      }
    }

    return map
  }, [
    activeSelectionModes,
    activeSpace.workflowNodes,
    findProgressForPlan,
    isHydrated,
    nodeSelectionPlans,
    publications,
    selectionErrorDetails,
    selectionErrors,
  ])

  const syncStatusSummary = useMemo<AnalyticsSyncStatusSummary>(() => {
    let isBackgroundSyncing = false
    let isManualSyncing = false
    const activeProgress: AnalyticsLoadProgressEvent[] = []
    let lastFastSyncAt: string | undefined
    let lastFullReconcileAt: string | undefined
    const strategySet = new Set<AnalyticsSyncStrategy>()
    let hasRollingWindow = false
    let hasIncrementalChanges = false
    const reasonSet = new Set<string>()
    const seenSelKeys = new Set<string>()

    for (const plan of Object.values(nodeSelectionPlans)) {
      if (seenSelKeys.has(plan.selKey)) continue
      seenSelKeys.add(plan.selKey)

      const mode = activeSelectionModes[plan.selKey]
      if (mode === 'full') isManualSyncing = true
      if (mode === 'auto' || mode === 'fast') isBackgroundSyncing = true

      const prog = findProgressForPlan(plan)
      if (prog !== undefined) activeProgress.push(prog)

      const entry = selectionEntries[plan.selKey]
      if (entry === undefined) continue

      lastFastSyncAt = maxIsoTimestamp(
        lastFastSyncAt,
        entry.syncState.lastFastSyncAt,
      )
      lastFullReconcileAt = maxIsoTimestamp(
        lastFullReconcileAt,
        entry.syncState.lastFullReconcileAt,
      )
      strategySet.add(entry.syncState.strategy)

      if (
        entry.syncState.strategy === 'window_rescan' ||
        (!entry.publication.remoteAggregate &&
          entry.publication.manifest.extraction.windowRescan !== undefined &&
          entry.publication.manifest.selection?.dateRange === true)
      )
        hasRollingWindow = true

      if (
        entry.syncState.strategy === 'incremental_changes' ||
        (!entry.publication.remoteAggregate &&
          entry.publication.manifest.extraction.modes.includes('changes') &&
          entry.syncState.checkpoint !== undefined &&
          entry.syncState.checkpoint.trim() !== '')
      )
        hasIncrementalChanges = true

      if (entry.publication.coverage !== 'complete') {
        if (entry.publication.coverageReason !== undefined)
          reasonSet.add(entry.publication.coverageReason)
        if (entry.syncState.coverageReason !== undefined)
          reasonSet.add(entry.syncState.coverageReason)
      }
    }

    const strategies = Array.from(strategySet)

    return {
      isBackgroundSyncing,
      isManualSyncing,
      activeProgress,
      lastFastSyncAt,
      lastFullReconcileAt,
      strategies,
      hasRollingWindow,
      hasIncrementalChanges,
      coverageReasons: Array.from(reasonSet),
    }
  }, [
    activeSelectionModes,
    findProgressForPlan,
    nodeSelectionPlans,
    selectionEntries,
  ])

  const isFetchingLive =
    syncStatusSummary.isBackgroundSyncing || syncStatusSummary.isManualSyncing

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
    | {
        id: string
        search: string
        offset: number
        limit?: number
        version?: string
      }
    | undefined

  if (inspectedNodeId !== null) {
    inspection = {
      id: inspectedNodeId,
      search: nodeModalSearch,
      offset: 0,
      limit: inspectionPage.limit,
    }

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
      const page = nodePages[node.id]
      const data = page?.data

      if (data !== undefined)
        return {
          columns: data.columns,
          rows: data.rows,
          totalRows: data.totalRows,
          stageTotalRows: page?.stageTotalRows,
        }

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
      setNewNodeCustomDateRange(normalizeCustomDateRange(node.customDateRange))

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
        if (node.selectedProject && node.selectedProject !== 'all')
          initFilters.project_id = node.selectedProject
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

      handleSetInspectedNodeId(null)
      setIsAddNodeModalOpen(true)
    },
    [
      activeSpace.widgets,
      activeSpace.workflowNodes,
      handleSetInspectedNodeId,
      nodeSourceDatasets,
    ],
  )

  const handleOpenAddNode = useCallback(() => {
    setQueryExecution(undefined)
    setEditingNodeId(null)
    setNewNodeLabel('')
    setSelectedAddNodeType('source')
    setNewNodeFilterValues({})
    setNewNodeCustomDateRange(undefined)

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
  }, [newNodeDatasetId, nodeSourceDatasets])

  const initialPipelineNodes = useMemo<Array<Node<PipelineNodeData>>>(() => {
    return activeSpace.workflowNodes.map((nodeCfg) => {
      let rowCount = 0
      const page = nodePages[nodeCfg.id]

      if (page?.stageTotalRows !== undefined) rowCount = page.stageTotalRows
      if (page?.stageTotalRows === undefined && page?.data !== undefined)
        rowCount = page.data.totalRows

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
  }, [activeSpace.workflowNodes, handleOpenEditNode, nodePages])

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
      userMutatedStateRef.current = true
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
      userMutatedStateRef.current = true
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
      userMutatedStateRef.current = true
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

    userMutatedStateRef.current = true
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

    const normalizedCustomDates = normalizeCustomDateRange(
      newNodeCustomDateRange,
    )
    const normalizedFilters = normalizeSourceFilters(newNodeFilterValues)
    const effDates = resolveEffectiveNodeDates(
      normalizedCustomDates,
      startDate,
      endDate,
    )
    const effProject = resolveEffectiveNodeProject(normalizedFilters)

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

      if (effDates.from !== undefined || effDates.to !== undefined) {
        let fromText = '...'
        if (effDates.from !== undefined) fromText = effDates.from
        let toText = '...'
        if (effDates.to !== undefined) toText = effDates.to
        filterParts.push(`período [${fromText} .. ${toText}]`)
      }

      if (effProject !== undefined) filterParts.push(`projeto ${effProject}`)

      let filterSummarySuffix = ''
      if (filterParts.length > 0)
        filterSummarySuffix = ` filtrando por ${filterParts.join(' e ')}`

      ruleSummaryText = `Nó Extract (E): ${resolvedDsName} (${datasetLabel})${filterSummarySuffix}.`

      const whereClauses: string[] = []

      if (effDates.from !== undefined && effDates.to !== undefined) {
        whereClauses.push(
          `date >= '${effDates.from}' AND date <= '${effDates.to}'`,
        )
      }

      if (effProject !== undefined)
        whereClauses.push(`project = '${effProject}'`)

      let sqlWhereStr = ''
      if (whereClauses.length > 0)
        sqlWhereStr = ` WHERE ${whereClauses.join(' AND ')}`

      if (
        nodeSelectedColumns.length === 0 &&
        queryExecution?.kind !== 'aggregate'
      )
        return
      const colsSelectStr = nodeSelectedColumns.join(', ')

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
      customDateRange: normalizedCustomDates,
      queryExecution,
      filterValues: normalizedFilters,
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

    userMutatedStateRef.current = true
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
      const rawQuery: AnalyticsDatasetQueryInput = {
        datasetId: newNodeDatasetId,
        projectId: effProject,
        startDate: effDates.from,
        endDate: effDates.to,
        execution: queryExecution,
        filters: normalizedFilters,
      }
      const manifest = findCachedManifest(
        newNodeSelectedConnectionId,
        newNodeDatasetId,
      )
      const normalized = queryWithDatasetSelection(rawQuery, manifest)
      const selKey = `${newNodeSelectedConnectionId}::${selectionSignature(normalized)}`

      if (selectionEntriesRef.current[selKey] === undefined) {
        attemptedMissingKeysRef.current.add(selKey)
        void syncUniqueSelection(newNodeSelectedConnectionId, rawQuery, 'auto')
      }
    }
  }, [
    activeSpace.id,
    activeSpace.workflowNodes,
    connectionDisplayOptions,
    endDate,
    findCachedManifest,
    newNodeCustomDateRange,
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
    outputHierarchyColumns,
    outputMetricColumn,
    outputReferenceLineMode,
    outputReferenceLineTarget,
    outputSecondaryMetricColumn,
    outputSourceNodeId,
    outputStackColumn,
    queryExecution,
    selectedAddNodeType,
    sqlQueryText,
    startDate,
    syncUniqueSelection,
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

    const normalizedCustomDates = normalizeCustomDateRange(
      newNodeCustomDateRange,
    )
    const normalizedFilters = normalizeSourceFilters(newNodeFilterValues)
    const effDates = resolveEffectiveNodeDates(
      normalizedCustomDates,
      startDate,
      endDate,
    )
    const effProject = resolveEffectiveNodeProject(normalizedFilters)

    const filterParts: string[] = []

    if (effDates.from !== undefined || effDates.to !== undefined) {
      let fromText = '...'
      if (effDates.from !== undefined) fromText = effDates.from
      let toText = '...'
      if (effDates.to !== undefined) toText = effDates.to
      filterParts.push(`período [${fromText} .. ${toText}]`)
    }

    if (effProject !== undefined) filterParts.push(`projeto ${effProject}`)

    let filterSummarySuffix = ''
    if (filterParts.length > 0)
      filterSummarySuffix = ` filtrando por ${filterParts.join(' e ')}`

    let updatedRuleSummary = `Nó configurado: ${resolvedDsName} (${datasetLabel})${filterSummarySuffix}.`

    const whereClauses: string[] = []

    if (effDates.from !== undefined && effDates.to !== undefined) {
      whereClauses.push(
        `date >= '${effDates.from}' AND date <= '${effDates.to}'`,
      )
    }

    if (effProject !== undefined) whereClauses.push(`project = '${effProject}'`)

    let sqlWhereStr = ''
    if (whereClauses.length > 0)
      sqlWhereStr = ` WHERE ${whereClauses.join(' AND ')}`

    if (
      nodeSelectedColumns.length === 0 &&
      matchedNode.kind === 'source' &&
      queryExecution?.kind !== 'aggregate'
    )
      return
    const colsSelectStr = nodeSelectedColumns.join(', ')

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
      customDateRange: normalizedCustomDates,
      queryExecution,
      filterValues: normalizedFilters,
      sqlConfig: {
        sqlQuery: sqlQueryText,
      },
      ruleSummary: updatedRuleSummary,
      sqlPreview: updatedSqlPreview,
      upstreamNodeIds: updatedUpstreamIds,
    }

    userMutatedStateRef.current = true
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
      const rawQuery: AnalyticsDatasetQueryInput = {
        datasetId: newNodeDatasetId,
        projectId: effProject,
        startDate: effDates.from,
        endDate: effDates.to,
        execution: queryExecution,
        filters: normalizedFilters,
      }
      const manifest = findCachedManifest(
        newNodeSelectedConnectionId,
        newNodeDatasetId,
      )
      const normalized = queryWithDatasetSelection(rawQuery, manifest)
      const selKey = `${newNodeSelectedConnectionId}::${selectionSignature(normalized)}`

      if (selectionEntriesRef.current[selKey] === undefined) {
        attemptedMissingKeysRef.current.add(selKey)
        void syncUniqueSelection(newNodeSelectedConnectionId, rawQuery, 'auto')
      }
    }

    setIsAddNodeModalOpen(false)
    setEditingNodeId(null)
  }, [
    activeSpace.id,
    activeSpace.workflowNodes,
    connectionDisplayOptions,
    editingNodeId,
    endDate,
    findCachedManifest,
    newNodeCustomDateRange,
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
    outputHierarchyColumns,
    outputMetricColumn,
    outputReferenceLineMode,
    outputReferenceLineTarget,
    outputSecondaryMetricColumn,
    outputSourceNodeId,
    outputStackColumn,
    queryExecution,
    sqlQueryText,
    startDate,
    syncUniqueSelection,
    txUpstreamNodeId,
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
    totalRows?: number
    stageTotalRows?: number
  } = { columns: [], rows: [] }
  if (inspectedNodeConfig !== null)
    inspectedNodeResolvedData = resolveRowsForWorkflowNode(inspectedNodeConfig)

  const handleSetPollingIntervalMinutes = useCallback((minutes: number) => {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return
    userMutatedStateRef.current = true
    setPollingIntervalMinutes(minutes)
  }, [])

  const handleSelectDatasetId = useCallback(
    (datasetId: string) => {
      setQueryExecution(undefined)
      setNewNodeDatasetId(datasetId)
      const matched = nodeSourceDatasets.find((d) => d.id === datasetId)

      if (matched !== undefined && matched.selection?.dateRange !== true)
        setNewNodeCustomDateRange(undefined)

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

  const handleSelectInspectionPage = useCallback(
    async (nodeId: string, pageIndex: number) => {
      const page = nodePages[nodeId]

      if (page === undefined) {
        await retrySourceNode(nodeId)
        return
      }

      if (page.error !== undefined) {
        setInspectionPage((previous) => ({
          id: nodeId,
          search: nodeModalSearch,
          offset: 0,
          limit: previous.limit,
        }))
        setNativeRevision((previous) => previous + 1)
        return
      }

      const data = page.data
      if (data === undefined || pageIndex < 0) return

      const nextOffset = pageIndex * data.limit
      if (nextOffset >= data.totalRows && nextOffset > 0) return

      let pinnedVersion: string | undefined
      if (nextOffset > 0) pinnedVersion = data.version

      setInspectionPage({
        id: nodeId,
        search: nodeModalSearch,
        offset: nextOffset,
        limit: data.limit,
        version: pinnedVersion,
      })
    },
    [nodeModalSearch, nodePages, retrySourceNode],
  )

  const handleChangeInspectionPageSize = useCallback(
    (nodeId: string, nextLimit: number) => {
      if (!Number.isInteger(nextLimit) || nextLimit < 1 || nextLimit > 500)
        return

      setInspectionPage({
        id: nodeId,
        search: nodeModalSearch,
        offset: 0,
        limit: nextLimit,
      })
    },
    [nodeModalSearch],
  )

  const handleLoadNextSourceBatch = useCallback(
    async (nodeId: string) => {
      const page = nodePages[nodeId]

      if (page === undefined) {
        await retrySourceNode(nodeId)
        return
      }

      if (page.error !== undefined) {
        setInspectionPage((previous) => ({
          id: nodeId,
          search: nodeModalSearch,
          offset: 0,
          limit: previous.limit,
        }))
        setNativeRevision((previous) => previous + 1)
        return
      }

      const data = page.data
      if (data === undefined || !data.hasMore) return

      const nextPageIndex = Math.floor(data.offset / data.limit) + 1
      await handleSelectInspectionPage(nodeId, nextPageIndex)
    },
    [handleSelectInspectionPage, nodeModalSearch, nodePages, retrySourceNode],
  )

  let inspectedBatch:
    | {
        index: number
        offset: number
        limit: number
        finished: boolean
        totalRows?: number
      }
    | undefined
  let canLoadNextBatch = false
  let inspectedSourceLoading = false
  let inspectedSourceError: string | undefined

  if (inspectedNodeConfig !== null) {
    const page = nodePages[inspectedNodeConfig.id]
    const plan = nodeSelectionPlans[inspectedNodeConfig.id]
    const isSourceSyncing =
      plan !== undefined && activeSelectionModes[plan.selKey] !== undefined
    inspectedSourceLoading = isSourceSyncing || page === undefined
    inspectedSourceError = page?.error
    if (plan !== undefined && selectionErrors[plan.selKey] !== undefined)
      inspectedSourceError = selectionErrors[plan.selKey]

    if (page?.data !== undefined) {
      inspectedBatch = {
        index: Math.floor(page.data.offset / page.data.limit),
        offset: page.data.offset,
        limit: page.data.limit,
        finished: !page.data.hasMore,
        totalRows: page.data.totalRows,
      }
      canLoadNextBatch = page.data.hasMore
    }
  }

  const hasUnverifiedCoverage = Object.values(publications).some(
    (publication) => publication.coverage !== 'complete',
  )

  const sourceFailures: AnalyticsSourceFailureItem[] =
    activeSpace.workflowNodes.flatMap((node) => {
      if (node.kind !== 'source') return []

      const plan = nodeSelectionPlans[node.id]
      if (plan === undefined) return []

      const message = selectionErrors[plan.selKey]
      if (message === undefined) return []

      const item: AnalyticsSourceFailureItem = {
        nodeId: node.id,
        label: node.label,
        message,
      }
      const details = selectionErrorDetails[plan.selKey]
      if (details !== undefined) item.details = details

      return [item]
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
    retrySourceNode,
    upstreamStatusByNodeId,
    syncStatusSummary,
    pollingIntervalMinutes,
    setPollingIntervalMinutes: handleSetPollingIntervalMinutes,
    isHydrated,
    hydrateError,
    hydrateErrorDetails,
    retryHydration,
    isResettingStorage,
    resetError,
    resetErrorDetails,
    resetAnalyticsStorage,
    settingsError,
    settingsErrorDetails,
    retrySaveWorkspaceState,
    handleLoadNextSourceBatch,
    handleSelectInspectionPage,
    handleChangeInspectionPageSize,
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
    setInspectedNodeId: handleSetInspectedNodeId,
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
    newNodeCustomDateRange,
    setNewNodeCustomDateRange,
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
