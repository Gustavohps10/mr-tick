import type {
  AddonSettingsTaskReferenceField,
  AddonTaskReferenceValue,
  CoreConnection,
  CoreTask,
} from '@mr-tick/application'
import type { MetadataItem } from '@mr-tick/shared/view-models'
import {
  AlertCircle,
  ChevronsUpDown,
  FolderKanban,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useHostBridge } from '@/hooks/use-host-bridge'

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

export function AddonTaskDestinationControl({
  field,
  workspaceId,
  value,
  onChange,
  disabled = false,
  connectionInstanceId: explicitConnectionInstanceId,
}: AddonTaskDestinationControlProps) {
  const bridge = useHostBridge()

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
      body: { workspaceId },
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

    const connectedOnly = response.data.filter(
      (c) =>
        c.status === 'connected' &&
        (c.capability === undefined || c.capability === 'dataSource'),
    )
    setConnections(connectedOnly)
    setIsLoadingConnections(false)
  }, [bridge?.core, workspaceId])

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
  const [tasksError, setTasksError] = useState<string | null>(null)

  const [activities, setActivities] = useState<readonly MetadataItem[]>([])
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)
  const [metadataError, setMetadataError] = useState<string | null>(null)

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
      setTasksError(null)
      setActivities([])
      setMetadataError(null)
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
      const requestToken = `${workspaceId}::${selectedConnectionId}::${field.id}::${searchQuery}::${cursor ?? 'root'}::${requestId}`
      activeTaskRequestRef.current = requestToken

      const isPagination = cursor !== undefined

      if (isPagination) {
        setIsLoadingMoreTasks(true)
      }
      if (!isPagination) {
        setIsLoadingTasks(true)
        setTasksError(null)
      }

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
        const failureMsg =
          response && response.error && response.error.length > 0
            ? response.error
            : 'Falha ao carregar tarefas'
        if (isPagination) {
          setIsLoadingMoreTasks(false)
          return
        }
        setTasksError(failureMsg)
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
    [bridge?.core, field.id, selectedConnectionId, workspaceId],
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
    setMetadataError(null)

    const response = await bridge.core.getMetadata({
      body: {
        workspaceId,
        connectionInstanceId: selectedConnectionId,
      },
    })

    if (activeMetadataRequestRef.current !== requestToken) return

    if (!response || !response.isSuccess || !response.data) {
      const failureMsg =
        response && response.error && response.error.length > 0
          ? response.error
          : 'Falha ao carregar metadados'
      setMetadataError(failureMsg)
      setIsLoadingMetadata(false)
      return
    }

    setActivities(response.data.values.activities)
    setIsLoadingMetadata(false)
  }, [bridge?.core, field.includeMetadata, selectedConnectionId, workspaceId])

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
    async (targetTaskId: string) => {
      if (!workspaceId || !selectedConnectionId || !targetTaskId) return
      if (!bridge?.core?.getTask) return
      const key = makeTaskKey(workspaceId, selectedConnectionId, targetTaskId)
      if (knownTasksMap.current.has(key)) return

      requestSequenceRef.current += 1
      const requestId = requestSequenceRef.current
      const requestToken = `${workspaceId}::${selectedConnectionId}::${targetTaskId}::${requestId}`
      activeGetTaskRequestRef.current = requestToken

      const response = await bridge.core.getTask({
        body: {
          workspaceId,
          connectionInstanceId: selectedConnectionId,
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
    [bridge?.core, selectedConnectionId, workspaceId],
  )

  useEffect(() => {
    if (value && value.taskId) {
      fetchIndividualTask(value.taskId)
    }
  }, [value, fetchIndividualTask])

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

  const handleSelectTask = (task: CoreTask) => {
    if (!workspaceId || !selectedConnectionId) return

    knownTasksMap.current.set(
      makeTaskKey(task.workspaceId, task.connectionInstanceId, task.taskId),
      task,
    )

    onChange({
      workspaceId,
      connectionInstanceId: selectedConnectionId,
      taskId: task.taskId,
      metadataValues: undefined,
    })
    setPopoverOpen(false)
  }

  const handleClear = () => {
    onChange(null)
  }

  const handleSelectActivity = (activityId: string) => {
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

  const selectedActivityId = useMemo(() => {
    if (!value || !value.metadataValues) return ''
    const act = value.metadataValues['activityId']
    if (typeof act === 'string') return act
    return ''
  }, [value])

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

      {!explicitConnectionInstanceId && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            Instância de Conexão:
          </span>
          {isLoadingConnections && <Skeleton className="h-8 w-full rounded" />}
          {!isLoadingConnections && connectionsError && (
            <p className="text-destructive text-xs">{connectionsError}</p>
          )}
          {!isLoadingConnections && !connectionsError && (
            <Select
              value={selectedConnectionId}
              onValueChange={(val) => {
                setSelectedConnectionId(val)
                onChange(null)
              }}
              disabled={disabled}
            >
              <SelectTrigger
                className="h-8 w-full text-xs"
                data-testid={`task-dest-connection-select-${field.id}`}
              >
                <SelectValue placeholder="Selecione a conexão do datasource" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem
                    key={c.connectionInstanceId}
                    value={c.connectionInstanceId}
                    className="text-xs"
                  >
                    {c.identity?.displayName || c.connectionInstanceId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {value && value.taskId ? (
        <Card
          data-testid={`addon-task-selected-card-${field.id}`}
          className="border-primary/30 bg-primary/5 shadow-none"
        >
          <CardContent className="flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    ID: {value.taskId}
                  </Badge>
                  {selectedTask && (
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedTask.status.name}
                    </Badge>
                  )}
                  {selectedTask && selectedTask.projectName && (
                    <Badge variant="outline" className="text-[10px]">
                      {selectedTask.projectName}
                    </Badge>
                  )}
                </div>
                <p className="text-foreground mt-1 truncate text-xs font-semibold">
                  {selectedTask
                    ? selectedTask.title
                    : `Tarefa #${value.taskId}`}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                data-testid={`addon-task-clear-btn-${field.id}`}
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground size-6 shrink-0"
                title="Desvincular tarefa"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            {field.includeMetadata && (
              <div className="flex flex-col gap-1.5 border-t pt-2">
                <span className="text-muted-foreground text-[11px] font-medium">
                  Atividade / Categoria (opcional):
                </span>
                {isLoadingMetadata && <Skeleton className="h-7 w-48 rounded" />}
                {!isLoadingMetadata && metadataError && (
                  <p className="text-destructive text-[11px]">
                    {metadataError}
                  </p>
                )}
                {!isLoadingMetadata && !metadataError && (
                  <Select
                    value={selectedActivityId}
                    onValueChange={handleSelectActivity}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      className="h-7 w-full text-xs"
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
            )}
          </CardContent>
        </Card>
      ) : (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={popoverOpen}
              disabled={disabled || !selectedConnectionId}
              data-testid={`addon-task-destination-trigger-${field.id}`}
              className="text-muted-foreground h-9 w-full justify-between text-xs font-normal"
            >
              <span>Selecione uma tarefa de destino...</span>
              <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-[340px] p-2" align="start">
            <div className="relative mb-2">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
              <Input
                type="text"
                placeholder="Pesquisar por título ou ID..."
                value={searchTerm}
                data-testid={`addon-task-search-input-${field.id}`}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {isLoadingTasks && (
              <div
                className="space-y-1.5 p-2"
                data-testid={`addon-task-loading-${field.id}`}
              >
                <Skeleton className="h-7 w-full rounded" />
                <Skeleton className="h-7 w-full rounded" />
                <Skeleton className="h-7 w-full rounded" />
              </div>
            )}

            {!isLoadingTasks && tasksError && (
              <div
                data-testid={`addon-task-error-${field.id}`}
                className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border p-2.5 text-xs"
              >
                <AlertCircle className="size-4 shrink-0" />
                <p className="flex-1 text-[11px]">{tasksError}</p>
              </div>
            )}

            {!isLoadingTasks && !tasksError && tasks.length === 0 && (
              <div
                data-testid={`addon-task-empty-${field.id}`}
                className="text-muted-foreground flex flex-col items-center justify-center p-4 text-center text-xs"
              >
                <FolderKanban className="mb-1 size-6 opacity-30" />
                <p>Nenhuma tarefa encontrada.</p>
              </div>
            )}

            {!isLoadingTasks && !tasksError && tasks.length > 0 && (
              <ScrollArea className="max-h-56">
                <div className="space-y-1 p-0.5">
                  {tasks.map((task) => (
                    <button
                      key={task.taskId}
                      type="button"
                      onClick={() => handleSelectTask(task)}
                      data-testid={`addon-task-option-${task.taskId}`}
                      className="hover:bg-muted/70 flex w-full cursor-pointer flex-col rounded p-2 text-left text-xs transition-colors"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-muted-foreground font-mono text-[10px]">
                          #{task.taskId}
                        </span>
                        <Badge
                          variant="secondary"
                          className="px-1 py-0 text-[9px]"
                        >
                          {task.status.name}
                        </Badge>
                      </div>
                      <p className="text-foreground mt-0.5 truncate font-medium">
                        {task.title}
                      </p>
                      {task.projectName && (
                        <p className="text-muted-foreground truncate text-[10px]">
                          {task.projectName}
                        </p>
                      )}
                    </button>
                  ))}

                  {hasMoreTasks && (
                    <div className="pt-1 pb-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isLoadingMoreTasks}
                        data-testid={`addon-task-load-more-${field.id}`}
                        onClick={() => fetchTasks(searchTerm, nextTaskCursor)}
                        className="text-muted-foreground h-7 w-full text-xs"
                      >
                        {isLoadingMoreTasks ? (
                          <Loader2 className="mr-1 size-3 animate-spin" />
                        ) : null}
                        Carregar mais
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
