'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckSquare2,
  CircleDashed,
  ExternalLink,
  MessageSquareDiff,
  Pin,
  PinOff,
  Search,
  X,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { AddonConnectionView } from '@/contexts/DataSourceConnectionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useHostBridge } from '@/hooks'
import {
  resolveEntityMapping,
  useFieldMappings,
} from '@/hooks/use-field-mappings'
import { fetchAndPersistTasks } from '@/lib/tasks-enrichment'
import { cn } from '@/lib/utils'
import { SyncMetadataRxDBDTO } from '@/local-db/schemas/metadata-sync-schema'
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

  const isRemote = propIsRemote ?? trackerContext?.isRemote ?? false

  // Resolve state & handlers (props take priority, then context, then defaults)
  const taskId = propTaskId ?? trackerContext?.taskId ?? ''
  const setTaskId =
    propOnTaskIdChange ?? trackerContext?.setTaskId ?? (() => {})

  const description = propDescription ?? trackerContext?.description ?? ''
  const setDescription =
    propOnDescriptionChange ?? trackerContext?.setDescription ?? (() => {})

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

  const selectedActivity =
    propSelectedActivity ?? trackerContext?.selectedActivity ?? ''
  const setSelectedActivity =
    propOnActivityChange ?? trackerContext?.setSelectedActivity ?? (() => {})

  const syncConnections =
    propSyncConnections ??
    trackerContext?.syncConnections ??
    defaultSyncConnections ??
    []

  const [internalConnectionId, setInternalConnectionId] = useState('')

  const selectedConnectionId = useMemo(() => {
    if (propSelectedConnectionId) {
      const match = syncConnections.find(
        (c) =>
          c.connectionId === propSelectedConnectionId ||
          c.dataSourceId === propSelectedConnectionId,
      )
      if (match) return match.connectionId
      return propSelectedConnectionId
    }
    if (internalConnectionId) return internalConnectionId
    if (trackerContext?.selectedConnectionId) {
      return trackerContext.selectedConnectionId
    }
    return ''
  }, [
    propSelectedConnectionId,
    internalConnectionId,
    trackerContext?.selectedConnectionId,
    syncConnections,
  ])

  const setSelectedConnectionId = useCallback(
    (connId: string) => {
      console.log(
        '[POPOVER-DEBUG setSelectedConnectionId]',
        JSON.stringify({
          connId,
          hasPropOnConnectionChange: Boolean(propOnConnectionChange),
        }),
      )
      setInternalConnectionId(connId)
      if (propOnConnectionChange) {
        propOnConnectionChange(connId)
        return
      }
      if (trackerContext?.setSelectedConnectionId) {
        trackerContext.setSelectedConnectionId(connId)
      }
    },
    [propOnConnectionChange, trackerContext],
  )

  const hostBridge = useHostBridge()
  const { workspace } = useWorkspace()
  const workspaceId = propWorkspaceId ?? workspace?.id ?? ''

  const db = useSyncStore((s) => s.db)
  const queryClient = useQueryClient()

  const metadataActivitiesQuery = useQuery({
    queryKey: [
      'popover-metadata-activities',
      selectedConnectionId,
      workspaceId,
    ],
    queryFn: async () => {
      const loaded: Array<{
        id: string
        name: string
        icon?: React.ElementType
      }> = []

      if (db?.metadata) {
        try {
          const matchedDocs: SyncMetadataRxDBDTO[] = []

          if (selectedConnectionId && selectedConnectionId !== 'none') {
            const docById = await db.metadata
              .findOne(`${selectedConnectionId}::metadata`)
              .exec()

            if (docById) {
              const json = docById.toMutableJSON
                ? docById.toMutableJSON()
                : docById
              matchedDocs.push(json)
            }
          }

          if (matchedDocs.length === 0) {
            const allDocs = await db.metadata.find().exec()

            allDocs.forEach((doc) => {
              const json = doc.toMutableJSON ? doc.toMutableJSON() : doc

              if (
                !selectedConnectionId ||
                selectedConnectionId === 'none' ||
                json.connectionInstanceId === selectedConnectionId ||
                json.dataSourceId === selectedConnectionId ||
                json.id === `${selectedConnectionId}::metadata`
              ) {
                matchedDocs.push(json)
              }
            })
          }

          matchedDocs.forEach((json) => {
            const items = json.activities ?? []

            items.forEach((item) => {
              if (!loaded.some((a) => a.id === item.id)) {
                loaded.push({
                  id: item.id,
                  name: item.name,
                })
              }
            })
          })
        } catch (err) {
          console.error(
            '[METADATA] Erro ao carregar atividades no popover:',
            err,
          )
        }
      }

      if (
        loaded.length === 0 &&
        hostBridge?.core?.getMetadata &&
        workspaceId &&
        selectedConnectionId &&
        selectedConnectionId !== 'none'
      ) {
        try {
          const res = await hostBridge.core.getMetadata({
            body: {
              workspaceId,
              connectionInstanceId: selectedConnectionId,
            },
          })
          if (res?.isSuccess && res.data?.values?.activities) {
            res.data.values.activities.forEach((act) => {
              if (!loaded.some((a) => a.id === act.id)) {
                loaded.push({
                  id: act.id,
                  name: act.name,
                })
              }
            })
          }
        } catch (err) {
          console.error(
            '[METADATA] Erro ao carregar atividades via hostBridge:',
            err,
          )
        }
      }

      return loaded
    },
    enabled: Boolean(db?.metadata || hostBridge?.core?.getMetadata),
  })

  const activities = useMemo(() => {
    if (propActivities && propActivities.length > 0) return propActivities
    if (trackerContext?.activities && trackerContext.activities.length > 0) {
      return trackerContext.activities
    }
    if (
      metadataActivitiesQuery.data &&
      metadataActivitiesQuery.data.length > 0
    ) {
      return metadataActivitiesQuery.data
    }
    return []
  }, [propActivities, trackerContext?.activities, metadataActivitiesQuery.data])

  const handleSelectTask =
    propOnSelectTask ?? trackerContext?.handleSelectTask ?? (() => {})

  const onCommitAndClose = propOnCommitAndClose
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = propOpen ?? internalOpen
  const setIsOpen = propOnOpenChange ?? setInternalOpen

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch] = useDebounce(searchQuery, 250)
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
    () => ['popover-tasks-mini', debouncedSearch, selectedConnectionId],
    [debouncedSearch, selectedConnectionId],
  )

  // Subscription reativa ao RxDB em tempo real quando o popover estiver aberto
  useEffect(() => {
    if (!db?.tasks || !isOpen) return

    const selector: MangoQuery<SyncTaskRxDBDTO>['selector'] = {
      _deleted: { $ne: true },
    }

    if (selectedConnectionId) {
      selector.connectionInstanceId = { $eq: selectedConnectionId }
    }

    if (debouncedSearch.trim()) {
      const queryStr = debouncedSearch.trim()
      const pureQuery = extractPureTaskId(queryStr)
      const escaped = queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      selector.$or = [
        { sourceId: { $regex: pureQuery || escaped, $options: 'i' } },
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

  const searchedTermsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isOpen || !db || !workspace?.id || !debouncedSearch.trim()) return

    const queryStr = debouncedSearch.trim()
    const pureId = extractPureTaskId(queryStr)
    const isPureNumeric = /^\d+$/.test(pureId)

    const targetConnections = selectedConnectionId
      ? syncConnections.filter((c) => c.connectionId === selectedConnectionId)
      : syncConnections

    if (targetConnections.length === 0) return

    let needsRemoteSearch = false
    for (const conn of targetConnections) {
      const searchKey = `${conn.connectionId}::${queryStr}`
      if (!searchedTermsRef.current.has(searchKey)) {
        needsRemoteSearch = true
        searchedTermsRef.current.add(searchKey)
      }
    }

    if (!needsRemoteSearch) return

    targetConnections.forEach((conn) => {
      fetchAndPersistTasks({
        hostBridge,
        db,
        workspaceId: workspace.id,
        connectionInstanceId: conn.connectionId,
        dataSourceId: conn.dataSourceId,
        ids: isPureNumeric ? [pureId] : undefined,
        search: !isPureNumeric ? queryStr : undefined,
      })
    })
  }, [
    isOpen,
    db,
    workspace?.id,
    debouncedSearch,
    selectedConnectionId,
    syncConnections,
    hostBridge,
  ])

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

      if (selectedConnectionId) {
        selector.connectionInstanceId = { $eq: selectedConnectionId }
      }

      if (debouncedSearch.trim()) {
        const queryStr = debouncedSearch.trim()
        const pureQuery = extractPureTaskId(queryStr)
        const escaped = queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        selector.$or = [
          { sourceId: { $regex: pureQuery || escaped, $options: 'i' } },
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

  const effectiveLoading = propLoadingTasks ?? isLoadingTasks

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

  const handlePickTask = (t: SyncTaskRxDBDTO) => {
    const cleanId = extractPureTaskId(t.sourceId || t.id)
    setTaskId(cleanId)
    setSearchQuery(cleanId)
    commitDescription()
    handleSelectTask(t, {
      activityId: selectedActivity ? selectedActivity : undefined,
      comment: latestDescriptionRef.current
        ? latestDescriptionRef.current
        : undefined,
    })
    setIsOpen(false)
  }

  const handleCommitAndClose = useCallback(async () => {
    commitDescription()
    const rawVal = taskId.trim()
    const cleanId = extractPureTaskId(rawVal)

    if (!cleanId && isRemote) {
      toast.error(
        'Registros sincronizados com o servidor não podem ficar sem tarefa',
      )
      if (propTaskId) {
        setTaskId(propTaskId)
        setSearchQuery(propTaskId)
      }
      return
    }

    if (!cleanId) {
      setTaskId('')
      onCommitAndClose?.()
      setIsOpen(false)
      return
    }

    let matched = sortedTasks.find(
      (t) =>
        extractPureTaskId(t.id) === cleanId ||
        extractPureTaskId(t.sourceId) === cleanId,
    )

    if (!matched && db?.tasks) {
      try {
        const docs = await db.tasks
          .find({
            selector: {
              _deleted: { $ne: true },
              $or: [
                { id: { $eq: cleanId } },
                { sourceId: { $eq: cleanId } },
                { id: { $eq: rawVal } },
              ],
            },
            limit: 1,
          })
          .exec()
        const [firstDoc] = docs
        if (firstDoc) matched = firstDoc.toMutableJSON()
      } catch (e) {
        console.error('Erro ao buscar tarefa no Enter:', e)
      }
    }

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

    setTaskId(cleanId)
    onCommitAndClose?.()
    setIsOpen(false)
  }, [
    commitDescription,
    taskId,
    isRemote,
    propTaskId,
    sortedTasks,
    db,
    handleSelectTask,
    setTaskId,
    setIsOpen,
    onCommitAndClose,
  ])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) commitDescription()
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
            'border-border/50 bg-card flex max-h-[var(--radix-popover-content-available-height)] w-[460px] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto rounded-lg border p-3 shadow-xl backdrop-blur-md',
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
              onClick={handleCommitAndClose}
              title="Fechar (Salvar)"
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
                connections={connectionOptions}
                value={
                  selectedConnectionId
                    ? selectedConnectionId
                    : allowLocal
                      ? 'none'
                      : ''
                }
                onChange={(value) => {
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
              className="border-border/30 bg-muted/20 flex shrink-0 flex-col gap-2 rounded-lg border p-2.5"
            >
              <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                Detalhes do apontamento
              </span>
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
                      size="sm"
                      aria-label="Atividade"
                      className="border-input/40 h-8 w-full text-xs font-medium"
                    >
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
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
                        const resolved = resolveEntityMapping(
                          act,
                          'activity',
                          mappings,
                        )
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
                  data-testid={
                    searchInputTestId
                      ? searchInputTestId
                      : 'time-entry-task-lookup-input'
                  }
                  type="text"
                  value={taskId}
                  onChange={(e) => {
                    setTaskId(e.target.value)
                    setSearchQuery(e.target.value)
                    if (propOnSearchChange) {
                      propOnSearchChange(e.target.value)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCommitAndClose()
                    }
                  }}
                  aria-label="Buscar tarefa"
                  placeholder="Buscar por título ou ID da tarefa..."
                  className="text-foreground placeholder:text-muted-foreground/50 h-6.5 w-full bg-transparent px-1.5 text-[11px] outline-none"
                />
                {taskId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setTaskId('')
                      setSearchQuery('')
                    }}
                    className="text-muted-foreground hover:text-foreground size-4 shrink-0 p-0"
                  >
                    <X className="size-2.5" />
                  </Button>
                )}
              </div>

              <TaskLookupResults
                tasks={sortedTasks}
                loading={effectiveLoading}
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
                  if (tracker.icon) {
                    taskIcon = (
                      <DynamicIcon
                        name={tracker.icon}
                        color={tracker.badgeColor}
                        className="size-4"
                      />
                    )
                  }
                  if (!taskIcon) {
                    const targetConnId =
                      task.connectionInstanceId || selectedConnectionId

                    if (targetConnId) {
                      const activeConn = syncConnections.find(
                        (c) =>
                          c.connectionId === targetConnId ||
                          c.dataSourceId === targetConnId,
                      )

                      if (activeConn?.addon?.logo) {
                        taskIcon = (
                          <img
                            src={activeConn.addon.logo}
                            alt=""
                            className="size-4 rounded-xs object-contain"
                          />
                        )
                      }

                      if (!taskIcon) {
                        const matchedOption = connectionOptions.find(
                          (opt) => opt.id === targetConnId,
                        )

                        if (matchedOption?.logo) {
                          taskIcon = (
                            <img
                              src={matchedOption.logo}
                              alt=""
                              className="size-4 rounded-xs object-contain"
                            />
                          )
                        }
                      }
                    }
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
            </div>
          </form>
        </PopoverContent>
      </Popover>

      {/* Modal Completo de Busca Detalhada */}
      <TaskLookup
        open={isLookupModalOpen}
        onOpenChange={setIsLookupModalOpen}
        onSelect={(task) => {
          handlePickTask(task)
          setIsLookupModalOpen(false)
        }}
      />
    </>
  )
}
