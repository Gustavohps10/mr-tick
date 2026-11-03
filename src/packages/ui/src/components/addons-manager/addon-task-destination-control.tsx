import type {
  AddonSettingsTaskReferenceField,
  AddonTaskReferenceValue,
  CoreConnection,
  CoreTask,
  LocalRuntimeSyncStatus,
} from '@mr-tick/application'
import { isDataSource } from '@mr-tick/shared/helpers'
import type { MetadataItem } from '@mr-tick/shared/view-models'
import {
  QueryClient,
  QueryClientContext,
  QueryClientProvider,
} from '@tanstack/react-query'
import { CheckSquare2, ChevronsUpDown, Loader2, X } from 'lucide-react'
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  getTaskConnectionOption,
  type TaskConnectionOption,
} from '@/components/task-connection-select'
import { TaskPopover } from '@/components/task-popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useOptionalDataSourceConnections } from '@/contexts/DataSourceConnectionsContext'
import { useHostBridge } from '@/hooks/use-host-bridge'
import type { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'

export interface AddonTaskDestinationControlProps {
  field: AddonSettingsTaskReferenceField
  workspaceId: string
  value: AddonTaskReferenceValue | null | undefined
  onChange: (value: AddonTaskReferenceValue | null) => void
  disabled?: boolean
  connectionInstanceId?: string
}

function makeTaskKey(
  workspaceId: string,
  connectionInstanceId: string,
  taskId: string,
): string {
  return `${workspaceId}::${connectionInstanceId}::${taskId}`
}

const defaultFallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

function AddonTaskDestinationControlInner({
  field,
  workspaceId,
  value,
  onChange,
  disabled = false,
  connectionInstanceId: explicitConnectionInstanceId,
}: AddonTaskDestinationControlProps) {
  const bridge = useHostBridge()
  const catalog = useOptionalDataSourceConnections()

  const [connections, setConnections] = useState<readonly CoreConnection[]>([])
  const [isLoadingConnections, setIsLoadingConnections] = useState(false)
  const [connectionsError, setConnectionsError] = useState<string | null>(null)

  const initialConnectionId = useMemo(() => {
    if (explicitConnectionInstanceId) return explicitConnectionInstanceId
    if (value && value.connectionInstanceId) return value.connectionInstanceId
    return ''
  }, [explicitConnectionInstanceId, value])

  const [selectedConnectionId, setSelectedConnectionId] =
    useState<string>(initialConnectionId)

  useEffect(() => {
    if (explicitConnectionInstanceId) {
      setSelectedConnectionId(explicitConnectionInstanceId)
      return
    }

    if (value && value.connectionInstanceId) {
      setSelectedConnectionId(value.connectionInstanceId)
    }
  }, [explicitConnectionInstanceId, value?.connectionInstanceId])

  const requestSequenceRef = useRef<number>(0)
  const activeConnectionsRequestRef = useRef<string>('')
  const activeTaskRequestRef = useRef<string>('')
  const activeMetadataRequestRef = useRef<string>('')
  const activeGetTaskRequestRef = useRef<string>('')

  const loadConnections = useCallback(async () => {
    if (!workspaceId) {
      setConnections([])
      return
    }

    if (!bridge?.core?.listConnections) {
      return
    }

    requestSequenceRef.current += 1
    const requestId = requestSequenceRef.current
    const requestToken = `${workspaceId}::${requestId}`
    activeConnectionsRequestRef.current = requestToken

    setIsLoadingConnections(true)
    setConnectionsError(null)

    const response = await bridge.core.listConnections({
      body: { workspaceId, capability: 'dataSource' },
    })

    if (activeConnectionsRequestRef.current !== requestToken) return

    if (!response || !response.isSuccess || !response.data) {
      const errorMsg =
        response && response.error && response.error.length > 0
          ? response.error
          : 'Falha ao carregar conexões'
      setConnectionsError(errorMsg)
      setConnections([])
      setIsLoadingConnections(false)
      return
    }

    const connectedOnly = response.data.filter((c) => {
      if (c.status !== 'connected') return false
      if (c.capability === 'dataSource') return true
      if (c.capability !== undefined) return false

      if (
        catalog &&
        catalog.installedPlugins &&
        catalog.installedPlugins.length > 0
      ) {
        const plugin = catalog.installedPlugins.find((p) => p.id === c.addonId)
        if (plugin) {
          return isDataSource(plugin.capabilities)
        }
      }

      return false
    })

    setConnections(connectedOnly)
    setIsLoadingConnections(false)

    if (!explicitConnectionInstanceId && !value?.connectionInstanceId) {
      setSelectedConnectionId((current) => {
        if (current) return current
        for (const first of connectedOnly) {
          return first.connectionInstanceId
        }
        return ''
      })
    }
  }, [
    bridge?.core,
    catalog,
    explicitConnectionInstanceId,
    value?.connectionInstanceId,
    workspaceId,
  ])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  const [popoverOpen, setPopoverOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [tasks, setTasks] = useState<readonly CoreTask[]>([])
  const [hasMoreTasks, setHasMoreTasks] = useState(false)
  const [nextTaskCursor, setNextTaskCursor] = useState<string | undefined>(
    undefined,
  )
  const [isLoadingTasks, setIsLoadingTasks] = useState(false)
  const [isLoadingMoreTasks, setIsLoadingMoreTasks] = useState(false)

  const [activities, setActivities] = useState<readonly MetadataItem[]>([])
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)

  const knownTasksMap = useRef<Map<string, CoreTask>>(new Map())
  const [knownTaskRevision, setKnownTaskRevision] = useState(0)

  const activeIdentityRef = useRef<string>('')

  const currentIdentity = useMemo(() => {
    return JSON.stringify({
      workspaceId,
      connectionInstanceId: selectedConnectionId,
      fieldId: field.id,
    })
  }, [workspaceId, selectedConnectionId, field.id])

  useEffect(() => {
    if (activeIdentityRef.current !== currentIdentity) {
      activeIdentityRef.current = currentIdentity
      setTasks([])
      setHasMoreTasks(false)
      setNextTaskCursor(undefined)
      setActivities([])
    }
  }, [currentIdentity])

  useEffect(() => {
    return () => {
      activeIdentityRef.current = ''
      activeTaskRequestRef.current = ''
      activeMetadataRequestRef.current = ''
      activeGetTaskRequestRef.current = ''
      activeConnectionsRequestRef.current = ''
    }
  }, [])

  const fetchTasks = useCallback(
    async (searchQuery: string, cursor?: string) => {
      if (!workspaceId || !selectedConnectionId) return
      if (!bridge?.core?.listTasks) return

      requestSequenceRef.current += 1
      const requestId = requestSequenceRef.current
      const requestToken = `${workspaceId}::${selectedConnectionId}::${field.id}::${searchQuery}::${cursor ? cursor : 'root'}::${requestId}`
      activeTaskRequestRef.current = requestToken

      const isPagination = cursor !== undefined
      if (isPagination) {
        setIsLoadingMoreTasks(true)
      }

      if (!isPagination) {
        setIsLoadingTasks(true)
      }

      if (bridge.localSync?.request) {
        await bridge.localSync.request({
          action: 'status',
          workspaceId,
        })
      }

      if (activeTaskRequestRef.current !== requestToken) return

      const trimmedSearch = searchQuery.trim()
      const response = await bridge.core.listTasks({
        body: {
          workspaceId,
          connectionInstanceId: selectedConnectionId,
          limit: 30,
          search: trimmedSearch.length > 0 ? trimmedSearch : undefined,
          cursor,
        },
      })

      if (activeTaskRequestRef.current !== requestToken) return

      if (!response || !response.isSuccess || !response.data) {
        if (isPagination) {
          setIsLoadingMoreTasks(false)
          return
        }

        setTasks([])
        setHasMoreTasks(false)
        setNextTaskCursor(undefined)
        setIsLoadingTasks(false)
        return
      }

      const data = response.data
      for (const t of data.tasks) {
        knownTasksMap.current.set(
          makeTaskKey(t.workspaceId, t.connectionInstanceId, t.taskId),
          t,
        )
      }

      if (isPagination) {
        setTasks((prev) => [...prev, ...data.tasks])
        setHasMoreTasks(data.hasMore)
        setNextTaskCursor(data.nextCursor)
        setIsLoadingMoreTasks(false)
        return
      }

      setTasks(data.tasks)
      setHasMoreTasks(data.hasMore)
      setNextTaskCursor(data.nextCursor)
      setIsLoadingTasks(false)
    },
    [
      bridge?.core,
      bridge?.localSync,
      field.id,
      selectedConnectionId,
      workspaceId,
    ],
  )

  const fetchMetadata = useCallback(async () => {
    if (!workspaceId || !selectedConnectionId) return
    if (!field.includeMetadata) return
    if (!bridge?.core?.getMetadata) return

    requestSequenceRef.current += 1
    const requestId = requestSequenceRef.current
    const requestToken = `${workspaceId}::${selectedConnectionId}::${requestId}`
    activeMetadataRequestRef.current = requestToken

    setIsLoadingMetadata(true)

    if (bridge.localSync?.request) {
      await bridge.localSync.request({
        action: 'status',
        workspaceId,
      })
    }

    if (activeMetadataRequestRef.current !== requestToken) return

    const response = await bridge.core.getMetadata({
      body: {
        workspaceId,
        connectionInstanceId: selectedConnectionId,
      },
    })

    if (activeMetadataRequestRef.current !== requestToken) return

    if (
      response &&
      response.isSuccess &&
      response.data &&
      response.data.values &&
      response.data.values.activities
    ) {
      setActivities(response.data.values.activities)
      setIsLoadingMetadata(false)
      return
    }

    setActivities([])
    setIsLoadingMetadata(false)
  }, [
    bridge?.core,
    bridge?.localSync,
    field.includeMetadata,
    selectedConnectionId,
    workspaceId,
  ])

  useEffect(() => {
    if (!selectedConnectionId) return
    if (!popoverOpen) return

    fetchTasks(searchTerm)
  }, [selectedConnectionId, popoverOpen, searchTerm, fetchTasks])

  useEffect(() => {
    if (!selectedConnectionId) return
    if (!field.includeMetadata) return

    fetchMetadata()
  }, [selectedConnectionId, field.includeMetadata, fetchMetadata])

  const fetchIndividualTask = useCallback(
    async (
      targetTaskId: string,
      targetConnectionId: string,
      freshness: 'cache' | 'refresh',
    ) => {
      if (!workspaceId || !targetConnectionId || !targetTaskId) return
      if (!bridge?.core?.getTask) return

      const key = makeTaskKey(workspaceId, targetConnectionId, targetTaskId)
      if (freshness === 'cache' && knownTasksMap.current.has(key)) return

      requestSequenceRef.current += 1
      const requestId = requestSequenceRef.current
      const requestToken = `${workspaceId}::${targetConnectionId}::${targetTaskId}::${requestId}`
      activeGetTaskRequestRef.current = requestToken

      if (bridge.localSync?.request) {
        await bridge.localSync.request({
          action: 'status',
          workspaceId,
        })
      }

      if (activeGetTaskRequestRef.current !== requestToken) return

      const response = await bridge.core.getTask({
        body: {
          workspaceId,
          connectionInstanceId: targetConnectionId,
          taskId: targetTaskId,
        },
      })

      if (activeGetTaskRequestRef.current !== requestToken) return

      if (response && response.isSuccess && response.data) {
        knownTasksMap.current.set(
          makeTaskKey(
            response.data.workspaceId,
            response.data.connectionInstanceId,
            response.data.taskId,
          ),
          response.data,
        )
        setKnownTaskRevision((r) => r + 1)
      }
    },
    [bridge?.core, bridge?.localSync, workspaceId],
  )

  useEffect(() => {
    if (!value || !value.taskId) return
    void fetchIndividualTask(value.taskId, value.connectionInstanceId, 'cache')
  }, [value, fetchIndividualTask])

  const referencedTaskId = value?.taskId
  const referencedConnectionId = value?.connectionInstanceId

  useEffect(() => {
    const completedPulls = new Map<string, string>()
    const taskKey = `tasks_${selectedConnectionId}`
    const metadataKey = `metadata_${selectedConnectionId}`

    return bridge.events.on<{
      workspaceId: string
      statuses: LocalRuntimeSyncStatus[]
    }>('local-runtime:sync-status', (event) => {
      if (event.workspaceId !== workspaceId) return

      for (const status of event.statuses) {
        if (status.key !== taskKey && status.key !== metadataKey) continue
        if (status.isActive || status.isPulling) continue
        if (status.lastPullResult !== 'success') continue
        if (status.lastPulledAt === null) continue
        if (completedPulls.get(status.key) === status.lastPulledAt) continue
        completedPulls.set(status.key, status.lastPulledAt)

        if (status.key === metadataKey) {
          void fetchMetadata()
          continue
        }

        if (
          referencedTaskId &&
          referencedConnectionId === selectedConnectionId
        ) {
          void fetchIndividualTask(
            referencedTaskId,
            referencedConnectionId,
            'refresh',
          )
        }

        if (popoverOpen) void fetchTasks(searchTerm)
      }
    })
  }, [
    bridge.events,
    workspaceId,
    selectedConnectionId,
    referencedTaskId,
    referencedConnectionId,
    fetchIndividualTask,
    fetchMetadata,
    popoverOpen,
    fetchTasks,
    searchTerm,
  ])

  const selectedTask = useMemo(() => {
    if (!value || !value.taskId) return null

    const key = makeTaskKey(
      value.workspaceId,
      value.connectionInstanceId,
      value.taskId,
    )
    const fromKnown = knownTasksMap.current.get(key)
    if (fromKnown) return fromKnown

    const fromList = tasks.find((t) => t.taskId === value.taskId)
    if (fromList) return fromList

    return null
  }, [value, tasks, knownTaskRevision])

  const [draftActivityId, setDraftActivityId] = useState<string>('')
  const [draftComment, setDraftComment] = useState<string>('')

  useEffect(() => {
    if (value && value.metadataValues) {
      const actVal = value.metadataValues['activityId']
      if (typeof actVal === 'string') {
        setDraftActivityId(actVal)
        return
      }
      if (typeof actVal === 'number') {
        setDraftActivityId(String(actVal))
        return
      }
    }

    setDraftActivityId('')
  }, [value?.metadataValues?.activityId])

  useEffect(() => {
    if (value && value.metadataValues) {
      const commentVal = value.metadataValues['comment']
      if (typeof commentVal === 'string') {
        setDraftComment(commentVal)
        return
      }
      if (typeof commentVal === 'number') {
        setDraftComment(String(commentVal))
        return
      }
    }

    setDraftComment('')
  }, [value?.metadataValues?.comment])

  const currentActivityId = useMemo(() => {
    if (!value || !value.metadataValues) return ''
    const act = value.metadataValues['activityId']
    if (typeof act === 'string') return act
    return ''
  }, [value])

  const selectedActivityId = useMemo(() => {
    if (draftActivityId) return draftActivityId
    return currentActivityId
  }, [draftActivityId, currentActivityId])

  const currentComment = useMemo(() => {
    if (!value || !value.metadataValues) return ''
    const commentValue = value.metadataValues['comment']
    if (typeof commentValue === 'string') return commentValue
    return ''
  }, [value])

  const selectedComment = useMemo(() => {
    if (draftComment) return draftComment
    return currentComment
  }, [draftComment, currentComment])

  const handleSelectActivity = (activityId: string) => {
    setDraftActivityId(activityId)

    if (!value) return

    const currentMetadata = value.metadataValues
      ? { ...value.metadataValues }
      : {}

    if (!activityId) {
      delete currentMetadata.activityId
      const hasRemaining = Object.keys(currentMetadata).length > 0
      onChange({
        ...value,
        metadataValues: hasRemaining ? currentMetadata : undefined,
      })
      return
    }

    onChange({
      ...value,
      metadataValues: {
        ...currentMetadata,
        activityId,
      },
    })
  }

  const handleSelectComment = (comment: string) => {
    setDraftComment(comment)

    if (!value) return

    const currentMetadata = value.metadataValues
      ? { ...value.metadataValues }
      : {}

    if (!comment) {
      delete currentMetadata.comment
      const hasRemaining = Object.keys(currentMetadata).length > 0
      onChange({
        ...value,
        metadataValues: hasRemaining ? currentMetadata : undefined,
      })
      return
    }

    onChange({
      ...value,
      metadataValues: {
        ...currentMetadata,
        comment,
      },
    })
  }

  const handleClear = () => {
    setDraftActivityId('')
    setDraftComment('')
    onChange(null)
  }

  const handleSelectTask = useCallback(
    (
      task: SyncTaskRxDBDTO,
      context?: { activityId?: string; comment?: string },
    ) => {
      if (!workspaceId) return

      const connId = task.connectionInstanceId
        ? task.connectionInstanceId
        : selectedConnectionId
      if (!connId) return

      if (connId !== selectedConnectionId) {
        setSelectedConnectionId(connId)
      }

      const pureTaskId = task.sourceId ? task.sourceId : task.id

      if (task.title && task.status) {
        const coreTask: CoreTask = {
          workspaceId,
          connectionInstanceId: connId,
          taskId: pureTaskId,
          dataSourceId: task.dataSourceId ? task.dataSourceId : '',
          title: task.title,
          status: task.status,
          projectName: task.projectName ? task.projectName : undefined,
          createdAt: task.createdAt ? task.createdAt : new Date().toISOString(),
          updatedAt: task.updatedAt ? task.updatedAt : new Date().toISOString(),
        }
        knownTasksMap.current.set(
          makeTaskKey(workspaceId, connId, pureTaskId),
          coreTask,
        )
      }

      const effectiveActivityId =
        context && context.activityId ? context.activityId : selectedActivityId
      const effectiveComment =
        context && context.comment ? context.comment : selectedComment

      const meta: Record<string, string> = {}
      if (effectiveActivityId) {
        meta.activityId = effectiveActivityId
      }
      if (effectiveComment) {
        meta.comment = effectiveComment
      }
      const hasMeta = Object.keys(meta).length > 0

      onChange({
        workspaceId,
        connectionInstanceId: connId,
        taskId: pureTaskId,
        metadataValues: hasMeta ? meta : undefined,
      })
      setPopoverOpen(false)
    },
    [
      onChange,
      selectedActivityId,
      selectedComment,
      selectedConnectionId,
      workspaceId,
    ],
  )

  const selectedConnectionLogo = useMemo(() => {
    const connId = value?.connectionInstanceId || selectedConnectionId
    if (!connId) return undefined

    const matched = connections.find((c) => c.connectionInstanceId === connId)
    if (!matched) return undefined

    const addon = catalog?.installedPlugins.find(
      (p) => p.id === matched.addonId,
    )
    return addon?.logo
  }, [
    connections,
    selectedConnectionId,
    value?.connectionInstanceId,
    catalog?.installedPlugins,
  ])

  const popoverTasks: SyncTaskRxDBDTO[] = useMemo(() => {
    return tasks.map((t) => ({
      id: `${t.connectionInstanceId}::${t.taskId}`,
      sourceId: t.taskId,
      connectionInstanceId: t.connectionInstanceId,
      dataSourceId: t.dataSourceId,
      title: t.title,
      status: t.status,
      projectName: t.projectName,
      _deleted: false,
      syncStatus: 'synced',
      lastPulledAt: t.updatedAt,
      lastPushedAt: null,
      lastReconciledAt: null,
      timeEntryIds: [],
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  }, [tasks])

  const popoverActivities = useMemo(() => {
    return activities.map((a) => ({ id: a.id, name: a.name }))
  }, [activities])

  const connectionOptions: readonly TaskConnectionOption[] = useMemo(() => {
    return connections.map((connection) =>
      getTaskConnectionOption({
        id: connection.connectionInstanceId,
        addon: catalog?.installedPlugins.find(
          (addon) => addon.id === connection.addonId,
        ),
        identityName: connection.identity?.displayName,
      }),
    )
  }, [connections, catalog?.installedPlugins])

  return (
    <div
      data-testid={`addon-task-destination-${field.id}`}
      className="flex flex-col gap-2 py-2"
    >
      <div>
        <label className="text-sm font-medium">{field.label}</label>
        {field.description && (
          <p className="text-muted-foreground text-xs">{field.description}</p>
        )}
      </div>

      {connectionsError && (
        <p className="text-destructive text-xs">{connectionsError}</p>
      )}

      {value && value.taskId ? (
        <div
          data-testid={`addon-task-selected-card-${field.id}`}
          className="border-border/40 bg-card/60 flex flex-col gap-2 rounded-lg border p-2.5 shadow-2xs"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {selectedConnectionLogo ? (
                <img
                  src={selectedConnectionLogo}
                  alt=""
                  className="mt-0.5 size-4 shrink-0 rounded-xs object-contain"
                />
              ) : (
                <CheckSquare2 className="text-primary mt-0.5 size-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="border-border/30 bg-muted/40 text-muted-foreground font-mono text-[10px] font-normal"
                  >
                    ID: {value.taskId}
                  </Badge>
                  {selectedTask && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-normal"
                    >
                      {selectedTask.status.name}
                    </Badge>
                  )}
                  {selectedTask && selectedTask.projectName && (
                    <Badge
                      variant="outline"
                      className="border-border/30 text-[10px] font-normal"
                    >
                      {selectedTask.projectName}
                    </Badge>
                  )}
                </div>
                <p className="text-foreground mt-1 text-xs leading-snug font-medium break-words">
                  {selectedTask
                    ? selectedTask.title
                    : `Tarefa #${value.taskId}`}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              data-testid={`addon-task-clear-btn-${field.id}`}
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground size-6 shrink-0 rounded-md"
              title="Desvincular tarefa"
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {field.includeMetadata && (
            <div className="border-border/30 flex flex-col gap-2.5 border-t pt-2">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-[11px] font-medium">
                  Atividade / Categoria (opcional):
                </span>
                {isLoadingMetadata && <Skeleton className="h-7 w-48 rounded" />}
                {!isLoadingMetadata && (
                  <Select
                    value={selectedActivityId}
                    onValueChange={handleSelectActivity}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      size="sm"
                      className="border-input/40 h-8 w-full text-xs"
                      data-testid={`addon-task-activity-select-${field.id}`}
                    >
                      <SelectValue placeholder="Selecione uma atividade..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activities.map((act) => (
                        <SelectItem
                          key={act.id}
                          value={act.id}
                          className="text-xs"
                        >
                          {act.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-[11px] font-medium">
                  Comentário (opcional):
                </span>
                <Input
                  value={selectedComment}
                  onChange={(e) => handleSelectComment(e.target.value)}
                  disabled={disabled}
                  placeholder="Descreva o trabalho realizado..."
                  className="border-input/40 h-8 w-full text-xs"
                  data-testid={`addon-task-comment-input-${field.id}`}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <TaskPopover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          side="bottom"
          align="start"
          title={field.label ? field.label : 'Selecionar Tarefa'}
          hideComment={false}
          allowLocal={false}
          workspaceId={workspaceId}
          connections={connectionOptions}
          selectedConnectionId={selectedConnectionId}
          onConnectionChange={(connId) => {
            setSelectedConnectionId(connId)
            if (value && value.connectionInstanceId !== connId) {
              onChange(null)
            }
          }}
          selectedActivity={selectedActivityId}
          onActivityChange={handleSelectActivity}
          description={selectedComment}
          onDescriptionChange={handleSelectComment}
          onSelectTask={handleSelectTask}
          tasks={popoverTasks}
          activities={activities.length > 0 ? popoverActivities : undefined}
          loadingTasks={isLoadingTasks}
          footer={
            hasMoreTasks ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isLoadingMoreTasks}
                data-testid={`addon-task-load-more-${field.id}`}
                onClick={() => fetchTasks(searchTerm, nextTaskCursor)}
                className="text-muted-foreground h-8 w-full text-xs"
              >
                {isLoadingMoreTasks && (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                )}
                Carregar mais
              </Button>
            ) : undefined
          }
          searchInputTestId={`addon-task-search-input-${field.id}`}
          onSearchChange={(query) => {
            setSearchTerm(query)
            fetchTasks(query)
          }}
          getTestId={(task) =>
            `addon-task-option-${task.sourceId ? task.sourceId : task.id}`
          }
          trigger={
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={popoverOpen}
              disabled={disabled}
              data-testid={`addon-task-destination-trigger-${field.id}`}
              className="text-muted-foreground border-input/40 h-8.5 w-full justify-between text-xs font-normal"
            >
              <span>Selecione uma tarefa de destino...</span>
              <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
            </Button>
          }
        />
      )}
    </div>
  )
}

export function AddonTaskDestinationControl(
  props: AddonTaskDestinationControlProps,
) {
  const queryClientInContext = useContext(QueryClientContext)

  if (!queryClientInContext) {
    return (
      <QueryClientProvider client={defaultFallbackQueryClient}>
        <AddonTaskDestinationControlInner {...props} />
      </QueryClientProvider>
    )
  }

  return <AddonTaskDestinationControlInner {...props} />
}
