'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckSquare2,
  CircleDashed,
  CornerDownLeft,
  ExternalLink,
  MessageSquareDiff,
  Pin,
  PinOff,
  Search,
  X,
} from 'lucide-react'
import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { MangoQuery } from 'rxdb'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'

import { DynamicIcon } from '@/components/mapping-config-modal'
import {
  getTaskConnectionOption,
  TaskConnectionOption,
  TaskConnectionSelect,
} from '@/components/task-connection-select'
import { TaskLookup } from '@/components/task-lookup'
import { TaskLookupResults } from '@/components/task-lookup-results'
import { TaskSearchStatus } from '@/components/task-search-status'
import { useOptionalTrackerContext } from '@/components/time-bar/ultimate-entry-bar'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { AddonConnectionView } from '@/contexts/DataSourceConnectionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useHostBridge } from '@/hooks'
import {
  resolveEntityMapping,
  useFieldMappings,
} from '@/hooks/use-field-mappings'
import { useRemoteTaskSearch } from '@/hooks/use-remote-task-search'
import { cn } from '@/lib/utils'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { extractPureTaskId } from '@/pages/time-entries/lib/time-entries-utils'
import { useConnectionsWithSync, useSyncStore } from '@/stores/syncStore'

const PINNED_TASKS_STORAGE_KEY = 'mr-tick:pinned-task-ids'

function getPinnedTaskIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PINNED_TASKS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePinnedTaskIds(ids: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PINNED_TASKS_STORAGE_KEY, JSON.stringify(ids))
  } catch (e) {
    console.error('Erro ao salvar tarefas fixadas:', e)
  }
}

export interface TaskPopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  align?: 'start' | 'center' | 'end'
  className?: string

  // Generic direct values & handlers (optional - fallback to tracker context if available):
  taskId?: string
  onTaskIdChange?: (taskId: string) => void
  description?: string
  onDescriptionChange?: (description: string) => void
  selectedActivity?: string
  onActivityChange?: (activityId: string) => void
  selectedConnectionId?: string
  onConnectionChange?: (connectionId: string) => void
  activities?: Array<{ id: string; name: string; icon?: React.ElementType }>
  syncConnections?: AddonConnectionView[]
  connections?: readonly TaskConnectionOption[]
  onSelectTask?: (
    task: SyncTaskRxDBDTO,
    context?: { activityId?: string; comment?: string },
  ) => void
  onCommitAndClose?: () => void
  isRemote?: boolean
  title?: string
  hideComment?: boolean
  getTestId?: (task: SyncTaskRxDBDTO) => string
  tasks?: SyncTaskRxDBDTO[]
  loadingTasks?: boolean
  footer?: React.ReactNode
  searchInputTestId?: string
  onSearchChange?: (query: string) => void
  onRemoteTasksUpdated?: (query: string) => void
  onSelectReference?: (
    taskId: string,
    connectionId: string,
    context: { activityId?: string; comment?: string; dataSourceId?: string },
  ) => void
  allowLocal?: boolean
  workspaceId?: string
}

export function TaskPopover({
  open: propOpen,
  onOpenChange: propOnOpenChange,
  trigger,
  side = 'bottom',
  sideOffset = 12,
  align = 'start',
  className,
  title,
  hideComment = false,
  getTestId,
  tasks: propTasks,
  loadingTasks: propLoadingTasks,
  footer: propFooter,
  searchInputTestId,
  onSearchChange: propOnSearchChange,
  onRemoteTasksUpdated,
  onSelectReference,
  allowLocal = true,
  workspaceId: propWorkspaceId,
  taskId: propTaskId,
  onTaskIdChange: propOnTaskIdChange,
  description: propDescription,
  onDescriptionChange: propOnDescriptionChange,
  selectedActivity: propSelectedActivity,
  onActivityChange: propOnActivityChange,
  selectedConnectionId: propSelectedConnectionId,
  onConnectionChange: propOnConnectionChange,
  activities: propActivities,
  syncConnections: propSyncConnections,
  connections: propConnections,
  onSelectTask: propOnSelectTask,
  onCommitAndClose: propOnCommitAndClose,
  isRemote: propIsRemote,
}: TaskPopoverProps) {
  const trackerContext = useOptionalTrackerContext()
  const defaultSyncConnections = useConnectionsWithSync()
  const { mappings } = useFieldMappings()

  const ownsTaskContext =
    propOnSelectTask !== undefined || propWorkspaceId !== undefined
  let isRemote = false
  let taskId = ''
  let description = ''

  if (trackerContext && !ownsTaskContext) {
    if (trackerContext.isRemote !== undefined)
      isRemote = trackerContext.isRemote
    taskId = trackerContext.taskId
    description = trackerContext.description
  }

  if (propIsRemote !== undefined) isRemote = propIsRemote
  if (propTaskId !== undefined) taskId = propTaskId
  if (propDescription !== undefined) description = propDescription

  const setTaskId = useCallback(
    (id: string) => {
      if (propOnTaskIdChange) {
        propOnTaskIdChange(id)
        return
      }
      if (trackerContext && !ownsTaskContext) void trackerContext.setTaskId(id)
    },
    [propOnTaskIdChange, trackerContext, ownsTaskContext],
  )

  const setDescription = useCallback(
    (text: string) => {
      if (propOnDescriptionChange) {
        propOnDescriptionChange(text)
        return
      }
      if (trackerContext && !ownsTaskContext)
        void trackerContext.setDescription(text)
    },
    [propOnDescriptionChange, trackerContext, ownsTaskContext],
  )

  const [localDescription, setLocalDescription] = useState(description)
  const isDescriptionFocusedRef = useRef(false)
  const latestDescriptionRef = useRef(description)
  latestDescriptionRef.current = localDescription
  const setDescriptionRef = useRef(setDescription)
  setDescriptionRef.current = setDescription

  useEffect(() => {
    if (isDescriptionFocusedRef.current) return
    setLocalDescription(description)
  }, [description])

  const [debouncedDescription] = useDebounce(localDescription, 300)

  useEffect(() => {
    if (!isDescriptionFocusedRef.current) return
    if (debouncedDescription === description) return
    setDescriptionRef.current(debouncedDescription)
  }, [debouncedDescription, description])

  const commitDescription = useCallback(() => {
    if (latestDescriptionRef.current === description) return
    setDescriptionRef.current(latestDescriptionRef.current)
  }, [description])

  let selectedActivity = ''
  if (trackerContext && !ownsTaskContext)
    selectedActivity = trackerContext.selectedActivity
  if (propSelectedActivity !== undefined)
    selectedActivity = propSelectedActivity

  const setSelectedActivity = useCallback(
    (id: string) => {
      if (propOnActivityChange) {
        propOnActivityChange(id)
        return
      }
      if (trackerContext && !ownsTaskContext)
        void trackerContext.setSelectedActivity(id)
    },
    [propOnActivityChange, trackerContext, ownsTaskContext],
  )

  let syncConnections: AddonConnectionView[] = defaultSyncConnections
  if (propSyncConnections !== undefined) syncConnections = propSyncConnections
  const [internalConnectionId, setInternalConnectionId] = useState<
    string | undefined
  >()
  const selectedConnectionId = useMemo(() => {
    if (propSelectedConnectionId !== undefined) return propSelectedConnectionId
    if (internalConnectionId !== undefined) return internalConnectionId
    if (trackerContext && !ownsTaskContext)
      return trackerContext.selectedConnectionId
    return ''
  }, [
    propSelectedConnectionId,
    internalConnectionId,
    trackerContext,
    ownsTaskContext,
  ])

  const setSelectedConnectionId = useCallback(
    (id: string) => {
      setInternalConnectionId(id)
      if (propOnConnectionChange) {
        propOnConnectionChange(id)
        return
      }
      if (trackerContext && !ownsTaskContext)
        void trackerContext.setSelectedConnectionId(id)
    },
    [propOnConnectionChange, trackerContext, ownsTaskContext],
  )

  const hostBridge = useHostBridge()
  const { workspace } = useWorkspace()
  let workspaceId = ''
  if (workspace) workspaceId = workspace.id
  if (propWorkspaceId !== undefined) workspaceId = propWorkspaceId

  const db = useSyncStore((s) => s.db)
  const queryClient = useQueryClient()

  const onCommitAndClose = propOnCommitAndClose
  const [internalOpen, setInternalOpen] = useState(false)
  let isOpen = internalOpen
  if (propOpen !== undefined) isOpen = propOpen
  const setIsOpen = useCallback(
    (open: boolean) => {
      if (propOnOpenChange) {
        propOnOpenChange(open)
        return
      }
      setInternalOpen(open)
    },
    [propOnOpenChange],
  )

  const metadataActivitiesQuery = useQuery({
    queryKey: [
      'popover-metadata-activities',
      selectedConnectionId,
      workspaceId,
    ],
    queryFn: async () => {
      if (!workspaceId) return []
      if (!hostBridge.core) return []
      if (!selectedConnectionId) {
        if (!hostBridge.core.getLocalMetadata) return []
        const result = await hostBridge.core.getLocalMetadata({
          body: { workspaceId },
        })
        if (!result.isSuccess || !result.data) return []
        return result.data.values.activities
      }

      const result = await hostBridge.core.getMetadata({
        body: { workspaceId, connectionInstanceId: selectedConnectionId },
      })
      if (!result.isSuccess || !result.data) return []
      return result.data.values.activities
    },
    enabled: isOpen && workspaceId.length > 0,
  })

  const activities = useMemo(() => {
    if (propActivities !== undefined) return propActivities
    if (metadataActivitiesQuery.data !== undefined)
      return metadataActivitiesQuery.data
    return []
  }, [propActivities, metadataActivitiesQuery.data])

  const handleSelectTask = (
    task: SyncTaskRxDBDTO,
    context: { activityId?: string; comment?: string },
  ) => {
    if (propOnSelectTask) {
      propOnSelectTask(task, context)
      return
    }
    if (trackerContext && !ownsTaskContext) {
      void trackerContext.handleSelectTask(task)
      return
    }
    setTaskId(task.sourceId)
  }

  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = searchQuery.trim()
  const [activeTaskKey, setActiveTaskKey] = useState<string | undefined>()
  const listId = useId()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isLookupModalOpen, setIsLookupModalOpen] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<string[]>(getPinnedTaskIds)

  const togglePin = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinnedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [id, ...prev]
      savePinnedTaskIds(next)
      return next
    })
  }, [])

  const miniTasksQueryKey = useMemo(
    () => [
      'popover-tasks-mini',
      workspaceId,
      db?.name,
      debouncedSearch,
      selectedConnectionId,
    ],
    [workspaceId, db?.name, debouncedSearch, selectedConnectionId],
  )

  // Subscription reativa ao RxDB em tempo real quando o popover estiver aberto
  useEffect(() => {
    if (!db?.tasks || !isOpen || propTasks) return

    const selector: MangoQuery<SyncTaskRxDBDTO>['selector'] = {
      _deleted: { $ne: true },
    }

    selector.connectionInstanceId = { $eq: selectedConnectionId }

    if (debouncedSearch.trim()) {
      const queryStr = debouncedSearch.trim()
      const escaped = queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      selector.$or = [
        { sourceId: { $regex: escaped, $options: 'i' } },
        { id: { $regex: escaped, $options: 'i' } },
        { title: { $regex: escaped, $options: 'i' } },
      ]
    }

    const query = db.tasks.find({
      selector,
      sort: [{ updatedAt: 'desc' }],
      limit: 50,
    })
    const subscription = query.$.subscribe((docs) => {
      queryClient.setQueryData(
        miniTasksQueryKey,
        docs.map((doc) => doc.toMutableJSON()),
      )
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [
    db,
    isOpen,
    debouncedSearch,
    selectedConnectionId,
    miniTasksQueryKey,
    queryClient,
  ])

  const remoteOrigins = useMemo(() => {
    if (!selectedConnectionId) return []
    if (propConnections)
      return propConnections.filter(
        (origin) => origin.id === selectedConnectionId,
      )
    return syncConnections
      .filter((origin) => origin.connectionId === selectedConnectionId)
      .map((origin) =>
        getTaskConnectionOption({
          id: origin.connectionId,
          addon: origin.addon,
          identityName: origin.identity?.displayName,
          memberName: origin.member?.name,
        }),
      )
  }, [selectedConnectionId, propConnections, syncConnections])
  const remoteSearch = useRemoteTaskSearch(
    workspaceId,
    remoteOrigins,
    searchQuery,
    isOpen,
  )
  const remoteRevision = remoteSearch.queries
    .map((query) => query.dataUpdatedAt)
    .join(':')
  const remoteUpdatedRef = useRef(onRemoteTasksUpdated)
  remoteUpdatedRef.current = onRemoteTasksUpdated

  useEffect(() => {
    if (!remoteRevision || !propTasks) return
    remoteUpdatedRef.current?.(searchQuery)
  }, [remoteRevision])

  // Buscar tarefas no RxDB de forma otimizada
  const { data: tasksList = [], isLoading: isLoadingTasks } = useQuery<
    SyncTaskRxDBDTO[]
  >({
    queryKey: miniTasksQueryKey,
    queryFn: async () => {
      if (!db?.tasks) return []
      const selector: MangoQuery<SyncTaskRxDBDTO>['selector'] = {
        _deleted: { $ne: true },
      }

      selector.connectionInstanceId = { $eq: selectedConnectionId }

      if (debouncedSearch.trim()) {
        const queryStr = debouncedSearch.trim()
        const escaped = queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        selector.$or = [
          { sourceId: { $regex: escaped, $options: 'i' } },
          { id: { $regex: escaped, $options: 'i' } },
          { title: { $regex: escaped, $options: 'i' } },
        ]
      }

      const docs = await db.tasks
        .find({ selector, sort: [{ updatedAt: 'desc' }], limit: 50 })
        .exec()
      return docs.map((docItem) => docItem.toMutableJSON())
    },
    enabled: isOpen && !!db?.tasks && !propTasks,
  })

  const effectiveTasks = useMemo(() => {
    if (propTasks) return propTasks
    return tasksList
  }, [propTasks, tasksList])

  let effectiveLoading = isLoadingTasks
  if (propLoadingTasks !== undefined) effectiveLoading = propLoadingTasks

  // Organiza: Fixadas no topo, seguidas por recentes/filtradas
  const sortedTasks = useMemo(() => {
    const pinnedSet = new Set(pinnedIds)
    const pinned: SyncTaskRxDBDTO[] = []
    const others: SyncTaskRxDBDTO[] = []

    effectiveTasks.forEach((t) => {
      if (pinnedSet.has(t.id)) {
        pinned.push(t)
        return
      }

      others.push(t)
    })

    return [...pinned, ...others]
  }, [effectiveTasks, pinnedIds])

  const confirmReference = (id: string) => {
    if (!selectedConnectionId && !allowLocal) return
    commitDescription()
    const connection = syncConnections.find(
      (item) => item.connectionId === selectedConnectionId,
    )
    if (onSelectReference)
      onSelectReference(id, selectedConnectionId, {
        activityId: selectedActivity,
        comment: latestDescriptionRef.current,
        dataSourceId: connection?.dataSourceId,
      })
    if (!onSelectReference) setTaskId(id)
    onCommitAndClose?.()
    setIsOpen(false)
  }

  const handlePickTask = (t: SyncTaskRxDBDTO) => {
    commitDescription()
    handleSelectTask(t, {
      activityId: selectedActivity ? selectedActivity : undefined,
      comment: latestDescriptionRef.current
        ? latestDescriptionRef.current
        : undefined,
    })
    if (!propOnSelectTask && !trackerContext?.handleSelectTask)
      setTaskId(t.sourceId)
    setIsOpen(false)
  }

  const handleCommitAndClose = () => {
    commitDescription()
    const rawVal = searchQuery.trim()
    const cleanId = rawVal

    if (!cleanId) {
      onCommitAndClose?.()
      setIsOpen(false)
      return
    }

    if (!selectedConnectionId && !allowLocal) {
      toast.error('Selecione uma origem para usar este ID.')
      return
    }

    const matched = sortedTasks.find(
      (t) =>
        extractPureTaskId(t.id) === cleanId ||
        extractPureTaskId(t.sourceId) === cleanId,
    )

    if (matched) {
      handleSelectTask(matched, {
        activityId: selectedActivity ? selectedActivity : undefined,
        comment: latestDescriptionRef.current
          ? latestDescriptionRef.current
          : undefined,
      })
      onCommitAndClose?.()
      setIsOpen(false)
      return
    }

    confirmReference(cleanId)
  }

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) commitDescription()
      if (nextOpen) {
        setSearchQuery('')
        setActiveTaskKey(undefined)
      }
      setIsOpen(nextOpen)
    },
    [commitDescription, setIsOpen],
  )

  const connectionOptions: TaskConnectionOption[] = useMemo(() => {
    if (propConnections) {
      const list: TaskConnectionOption[] = []

      if (allowLocal) {
        list.push({
          id: 'none',
          label: 'Local',
          description: 'Sem conexão externa',
        })
      }

      return [...list, ...propConnections]
    }

    const list: TaskConnectionOption[] = []

    if (allowLocal) {
      list.push({
        id: 'none',
        label: 'Local',
        description: 'Sem conexão externa',
      })
    }

    syncConnections.forEach((connection) => {
      list.push(
        getTaskConnectionOption({
          id: connection.connectionId,
          addon: connection.addon,
          identityName: connection.identity?.displayName,
          memberName: connection.member?.name,
        }),
      )
    })

    return list
  }, [allowLocal, propConnections, syncConnections])

  const manualOrigin = connectionOptions.find((option) => {
    if (selectedConnectionId) return option.id === selectedConnectionId
    return allowLocal && option.id === 'none'
  })

  const modalConnectionId = useMemo(() => {
    if (selectedConnectionId) return selectedConnectionId
    if (allowLocal) return ''
    return undefined
  }, [allowLocal, selectedConnectionId])

  return (
    <>
      <Popover
        open={isOpen && !isLookupModalOpen}
        onOpenChange={handleOpenChange}
      >
        {trigger ? (
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        ) : (
          <PopoverTrigger asChild>
            <Button
              variant={isOpen ? 'secondary' : 'ghost'}
              size="icon"
              className="text-muted-foreground hover:text-foreground h-7 w-7 shrink-0 rounded-full transition-colors"
              title="Detalhes da Tarefa"
            >
              {isOpen ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <MessageSquareDiff className="h-3.5 w-3.5" />
              )}
            </Button>
          </PopoverTrigger>
        )}
        <PopoverContent
          side={side}
          sideOffset={sideOffset}
          align={align}
          data-no-drag
          onPointerDownOutside={(event) => {
            const originalTarget =
              event.detail?.originalEvent?.target ?? event.target
            const element =
              originalTarget instanceof Element
                ? originalTarget
                : originalTarget instanceof Node
                  ? originalTarget.parentElement
                  : null

            if (
              element?.closest(
                '[data-slot="select-content"], [data-slot="select-item"], [role="listbox"], [data-radix-select-viewport]',
              )
            ) {
              event.preventDefault()
            }
          }}
          onInteractOutside={(event) => {
            const originalTarget =
              event.detail?.originalEvent?.target ?? event.target
            const element =
              originalTarget instanceof Element
                ? originalTarget
                : originalTarget instanceof Node
                  ? originalTarget.parentElement
                  : null

            if (
              element?.closest(
                '[data-slot="select-content"], [data-slot="select-item"], [role="listbox"], [data-radix-select-viewport]',
              )
            ) {
              event.preventDefault()
            }
          }}
          className={cn(
            'border-border/50 bg-card flex max-h-[var(--radix-popover-content-available-height)] w-[460px] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-hidden rounded-lg border p-3 shadow-xl backdrop-blur-md',
            className,
          )}
        >
          {/* Header com X para fechar */}
          <div className="flex shrink-0 items-center justify-between">
            <div className="text-foreground/90 flex items-center gap-1.5 text-xs font-semibold">
              <MessageSquareDiff className="text-primary h-3.5 w-3.5" />
              <span>{title || 'Detalhes da Tarefa'}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Fechar detalhes da tarefa"
              className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-md transition-colors"
              onClick={() => {
                commitDescription()
                setIsOpen(false)
              }}
              title="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleCommitAndClose()
            }}
            className="flex min-h-0 flex-1 flex-col gap-2.5"
          >
            {/* 1. Conexão */}
            <div className="flex shrink-0 flex-col gap-1">
              <span className="text-muted-foreground text-[11px] font-medium">
                Conexão
              </span>
              <TaskConnectionSelect
                onCloseAutoFocus={(event) => {
                  event.preventDefault()
                  searchInputRef.current?.focus()
                }}
                connections={connectionOptions}
                value={
                  selectedConnectionId
                    ? selectedConnectionId
                    : allowLocal
                      ? 'none'
                      : ''
                }
                onChange={(value) => {
                  setSearchQuery('')
                  setActiveTaskKey(undefined)
                  setSelectedActivity('')
                  if (value === 'none') {
                    setSelectedConnectionId('')
                    return
                  }
                  setSelectedConnectionId(value)
                }}
              />
            </div>

            {/* 2. Detalhes do apontamento */}
            <div
              role="group"
              aria-label="Detalhes do apontamento"
              className="flex shrink-0 flex-col"
            >
              <div
                className={cn(
                  'grid grid-cols-1 gap-2.5',
                  !hideComment && 'min-[440px]:grid-cols-[145px_minmax(0,1fr)]',
                )}
              >
                <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
                  <span className="text-muted-foreground text-[11px]">
                    Atividade
                  </span>
                  <Select
                    value={selectedActivity || (isRemote ? '' : '__NONE__')}
                    onValueChange={(val) => {
                      if (val === '__NONE__') {
                        if (!isRemote) setSelectedActivity('')
                        return
                      }
                      setSelectedActivity(val)
                    }}
                  >
                    <SelectTrigger
                      disabled={
                        metadataActivitiesQuery.isLoading &&
                        propActivities === undefined
                      }
                      size="sm"
                      aria-label="Atividade"
                      className="border-input/40 h-8 w-full text-xs font-medium"
                    >
                      {metadataActivitiesQuery.isLoading &&
                        propActivities === undefined && (
                          <Skeleton className="h-4 w-24" />
                        )}
                      {(!metadataActivitiesQuery.isLoading ||
                        propActivities !== undefined) && (
                        <SelectValue placeholder="Selecione..." />
                      )}
                    </SelectTrigger>
                    <SelectContent
                      onCloseAutoFocus={(event) => {
                        event.preventDefault()
                        searchInputRef.current?.focus()
                      }}
                    >
                      {!isRemote && (
                        <SelectItem
                          value="__NONE__"
                          className="text-muted-foreground text-xs italic"
                        >
                          <span className="flex items-center gap-2">
                            <CircleDashed className="text-muted-foreground h-3.5 w-3.5" />
                            <span>Sem atividade</span>
                          </span>
                        </SelectItem>
                      )}
                      {activities.map((act) => {
                        let resolved = resolveEntityMapping(
                          act,
                          'activity',
                          mappings,
                        )
                        const localActivity =
                          metadataActivitiesQuery.data?.find(
                            (item) => item.id === act.id,
                          )
                        if (!selectedConnectionId && localActivity) {
                          resolved = {
                            icon: localActivity.icon,
                            badgeColor: localActivity.colors.badge,
                            backgroundColor: localActivity.colors.background,
                            textColor: localActivity.colors.text,
                          }
                        }
                        return (
                          <SelectItem
                            key={act.id}
                            value={act.id}
                            className="text-xs"
                          >
                            <span className="flex items-center gap-2">
                              {resolved.icon && (
                                <DynamicIcon
                                  name={resolved.icon}
                                  color={resolved.badgeColor}
                                  className="h-3.5 w-3.5"
                                />
                              )}
                              <span>{act.name}</span>
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </label>
                {!hideComment && (
                  <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
                    <span className="text-muted-foreground text-[11px]">
                      Comentário
                    </span>
                    <Textarea
                      data-testid="time-entry-popover-comment-input"
                      value={localDescription}
                      onFocus={() => {
                        isDescriptionFocusedRef.current = true
                      }}
                      onChange={(e) => {
                        e.currentTarget.setAttribute('value', e.target.value)
                        setLocalDescription(e.target.value)
                      }}
                      onBlur={() => {
                        isDescriptionFocusedRef.current = false
                        commitDescription()
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' || e.shiftKey) return
                        e.preventDefault()
                        commitDescription()
                        handleCommitAndClose()
                      }}
                      placeholder="Descreva o trabalho realizado..."
                      rows={1}
                      aria-label="Comentário do apontamento"
                      className="border-input/40 h-8 max-h-8 min-h-8 w-full resize-none overflow-y-auto px-3 py-1.5 text-xs leading-4 focus-visible:ring-1 md:text-xs"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* 3. Tarefas: Header + Busca compacta sem borda + Resultados */}
            <div className="border-border/30 bg-muted/10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
              <div className="text-muted-foreground border-border/30 flex shrink-0 items-center justify-between border-b px-2.5 py-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-foreground/85 text-[11px] font-medium">
                    Tarefas ({sortedTasks.length})
                  </span>
                  {pinnedIds.length > 0 && (
                    <span className="text-[10px] opacity-75">
                      {pinnedIds.length} fixada(s)
                    </span>
                  )}
                </div>
                <Button
                  data-testid="time-entry-task-lookup-modal-btn"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground size-6 rounded-md transition-colors"
                  title="Busca detalhada (Modal)"
                  onClick={() => setIsLookupModalOpen(true)}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </div>

              {/* Input menor, fonte menor, sem borda e abaixo de Tarefas (50) */}
              <div className="border-border/20 bg-background/30 relative flex shrink-0 items-center border-b px-2 py-0.5">
                <Search className="text-muted-foreground/60 pointer-events-none size-3 shrink-0" />
                <input
                  ref={searchInputRef}
                  data-testid={
                    searchInputTestId
                      ? searchInputTestId
                      : 'time-entry-task-lookup-input'
                  }
                  type="text"
                  value={searchQuery}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isOpen}
                  aria-controls={`${listId} ${listId}-manual`}
                  aria-activedescendant={
                    activeTaskKey ? `${listId}-${activeTaskKey}` : undefined
                  }
                  onChange={(e) => {
                    setActiveTaskKey(undefined)
                    setSearchQuery(e.target.value)
                    if (propOnSearchChange) {
                      propOnSearchChange(e.target.value)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      const keys = sortedTasks.map((task) => task.id)
                      if (
                        searchQuery.trim() &&
                        (selectedConnectionId || allowLocal)
                      )
                        keys.push('manual-reference')
                      const position = keys.findIndex(
                        (key) => key === activeTaskKey,
                      )
                      let next = position + 1
                      if (e.key === 'ArrowUp') next = position - 1
                      if (next < 0) next = keys.length - 1
                      if (next >= keys.length) next = 0
                      const key = keys[next]
                      setActiveTaskKey(key)
                      if (key)
                        document
                          .getElementById(`${listId}-${key}`)
                          ?.scrollIntoView({ block: 'nearest' })
                      return
                    }

                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const task = sortedTasks.find(
                      (item) => item.id === activeTaskKey,
                    )
                    if (task) {
                      handlePickTask(task)
                      return
                    }
                    void handleCommitAndClose()
                  }}
                  aria-label="Buscar tarefa"
                  placeholder="Buscar por título ou ID da tarefa..."
                  className="text-foreground placeholder:text-muted-foreground/50 h-6.5 w-full bg-transparent px-1.5 text-[11px] outline-none"
                />
                {searchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSearchQuery('')
                      setActiveTaskKey(undefined)
                    }}
                    className="text-muted-foreground hover:text-foreground size-4 shrink-0 p-0"
                  >
                    <X className="size-2.5" />
                  </Button>
                )}
              </div>

              <TaskSearchStatus states={remoteSearch.states} />
              <TaskLookupResults
                listId={listId}
                activeKey={activeTaskKey}
                tasks={sortedTasks}
                loading={effectiveLoading}
                emptyMessage={
                  remoteSearch.states.some(
                    (state) =>
                      state.phase === 'searching' || state.phase === 'waiting',
                  )
                    ? 'Buscando outras tarefas…'
                    : 'Nenhuma tarefa encontrada.'
                }
                footer={propFooter}
                getKey={(task) => task.id}
                getTestId={getTestId}
                selectedKey={
                  sortedTasks.find((task) => {
                    let id = task.id
                    if (task.sourceId) id = task.sourceId
                    return extractPureTaskId(id) === extractPureTaskId(taskId)
                  })?.id
                }
                present={(task) => {
                  const tracker = resolveEntityMapping(
                    task.tracker,
                    'tracker',
                    mappings,
                  )
                  const priority = resolveEntityMapping(
                    task.priority,
                    'priority',
                    mappings,
                  )
                  let id = task.id
                  if (task.sourceId) id = task.sourceId
                  const pureId = extractPureTaskId(id)

                  let taskIcon: React.ReactNode = undefined
                  const source = connectionOptions.find(
                    (option) => option.id === task.connectionInstanceId,
                  )

                  if (source?.logo) {
                    taskIcon = (
                      <img
                        src={source.logo}
                        alt=""
                        className="size-4 rounded-xs object-contain"
                      />
                    )
                  }

                  if (!taskIcon && tracker.icon) {
                    taskIcon = (
                      <DynamicIcon
                        name={tracker.icon}
                        color={tracker.badgeColor}
                        className="size-4"
                      />
                    )
                  }

                  if (!taskIcon) {
                    taskIcon = (
                      <CheckSquare2 className="text-muted-foreground/50 size-4" />
                    )
                  }

                  return {
                    id: pureId,
                    title: task.title,
                    icon: taskIcon,
                    metadata: (
                      <>
                        {priority.icon && (
                          <DynamicIcon
                            name={priority.icon}
                            color={priority.badgeColor}
                            className="size-3.5"
                          />
                        )}
                        {task.projectName && <span>{task.projectName}</span>}
                        {task.assignedTo?.name && (
                          <span>{task.assignedTo.name}</span>
                        )}
                      </>
                    ),
                  }
                }}
                onSelect={handlePickTask}
                renderAction={(task) => {
                  const pinned = pinnedIds.includes(task.id)

                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground h-8 w-8"
                      onClick={(event) => togglePin(task.id, event)}
                      title={pinned ? 'Desafixar tarefa' : 'Fixar no topo'}
                    >
                      {pinned && (
                        <Pin className="text-primary size-3.5 fill-current" />
                      )}
                      {!pinned && <PinOff className="size-3.5" />}
                    </Button>
                  )
                }}
              />
              <div
                role="listbox"
                id={`${listId}-manual`}
                aria-label="ID informado"
                className="shrink-0"
              >
                {searchQuery.trim() && (
                  <Button
                    id={`${listId}-manual-reference`}
                    role="option"
                    aria-selected={activeTaskKey === 'manual-reference'}
                    type="button"
                    variant="ghost"
                    className={cn(
                      'h-auto w-full justify-start gap-2.5 rounded-none border-t px-3 py-2 text-left',
                      activeTaskKey === 'manual-reference' && 'bg-accent',
                    )}
                    data-testid="task-use-manual-id"
                    disabled={!selectedConnectionId && !allowLocal}
                    onClick={() => {
                      void handleCommitAndClose()
                    }}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {manualOrigin?.logo && (
                        <img
                          src={manualOrigin.logo}
                          alt=""
                          className="size-4 object-contain"
                        />
                      )}
                      {!manualOrigin?.logo && (
                        <CheckSquare2 className="text-muted-foreground size-4" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-xs font-medium">
                        Usar ID “{searchQuery.trim()}”
                      </span>
                      {manualOrigin && (
                        <span className="text-muted-foreground truncate text-[11px]">
                          {manualOrigin.label}
                        </span>
                      )}
                    </span>
                    <CornerDownLeft
                      aria-hidden="true"
                      className="text-muted-foreground size-3.5 shrink-0"
                    />
                  </Button>
                )}
              </div>
            </div>
          </form>
        </PopoverContent>
      </Popover>

      {/* Modal Completo de Busca Detalhada */}
      <TaskLookup
        open={isLookupModalOpen}
        workspaceId={workspaceId}
        connections={connectionOptions.map((option) => {
          if (option.id === 'none') return { ...option, id: '' }
          return option
        })}
        initialSearch={searchQuery}
        initialConnectionId={modalConnectionId}
        onSelectReference={(taskId, connectionId) => {
          commitDescription()
          const connection = syncConnections.find(
            (item) => item.connectionId === connectionId,
          )
          if (onSelectReference)
            onSelectReference(taskId, connectionId, {
              activityId: selectedActivity,
              comment: latestDescriptionRef.current,
              dataSourceId: connection?.dataSourceId,
            })
          if (!onSelectReference) {
            setSelectedConnectionId(connectionId)
            setTaskId(taskId)
          }
          setIsLookupModalOpen(false)
          setIsOpen(false)
        }}
        onOpenChange={setIsLookupModalOpen}
        onSelect={(task) => {
          handlePickTask(task)
          setIsLookupModalOpen(false)
        }}
      />
    </>
  )
}
