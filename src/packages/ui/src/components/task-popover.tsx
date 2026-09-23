'use client'

import { useQuery } from '@tanstack/react-query'
import {
  CircleDashed,
  Code,
  ExternalLink,
  MessageSquareDiff,
  Palette,
  Pin,
  PinOff,
  Wrench,
  X,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MangoQuery } from 'rxdb'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'

import { LookupInput } from '@/components/lookup-input'
import { TaskLookup } from '@/components/task-lookup'
import { useOptionalTrackerContext } from '@/components/time-bar/ultimate-entry-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { AddonConnectionView } from '@/contexts/DataSourceConnectionsContext'
import { cn } from '@/lib/utils'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { extractPureTaskId } from '@/pages/time-entries/lib/time-entries-utils'
import { useConnectionsWithSync, useSyncStore } from '@/stores/syncStore'

const DEFAULT_ACTIVITIES: Array<{
  id: string
  name: string
  icon?: React.ElementType
}> = [
  { id: 'dev', name: 'Desenvolvimento', icon: Code },
  { id: 'design', name: 'Design', icon: Palette },
  { id: 'fix', name: 'Correção', icon: Wrench },
]

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
  onSelectTask?: (task: SyncTaskRxDBDTO) => void
  onCommitAndClose?: () => void
  isRemote?: boolean
}

export function TaskPopover({
  open: propOpen,
  onOpenChange: propOnOpenChange,
  trigger,
  side = 'bottom',
  sideOffset = 12,
  align = 'start',
  className,
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
  onSelectTask: propOnSelectTask,
  onCommitAndClose: propOnCommitAndClose,
  isRemote: propIsRemote,
}: TaskPopoverProps) {
  const trackerContext = useOptionalTrackerContext()
  const defaultSyncConnections = useConnectionsWithSync()

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

  const validConnection = syncConnections.find(
    (c) => c.connectionId === propSelectedConnectionId,
  )
  const fallbackConnection = syncConnections.find(
    (c) => c.connectionId === trackerContext?.selectedConnectionId,
  )
  const selectedConnectionId =
    validConnection?.connectionId ?? fallbackConnection?.connectionId ?? ''

  const setSelectedConnectionId =
    propOnConnectionChange ??
    trackerContext?.setSelectedConnectionId ??
    (() => {})

  const activities =
    propActivities && propActivities.length > 0
      ? propActivities
      : trackerContext?.activities && trackerContext.activities.length > 0
        ? trackerContext.activities
        : DEFAULT_ACTIVITIES

  const handleSelectTask =
    propOnSelectTask ?? trackerContext?.handleSelectTask ?? (() => {})

  const onCommitAndClose = propOnCommitAndClose

  const db = useSyncStore((s) => s.db)
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

  // Buscar tarefas no RxDB de forma otimizada
  const { data: tasksList = [] } = useQuery<SyncTaskRxDBDTO[]>({
    queryKey: ['popover-tasks-mini', debouncedSearch, selectedConnectionId],
    queryFn: async () => {
      if (!db?.tasks) return []
      const selector: MangoQuery<SyncTaskRxDBDTO>['selector'] = {
        _deleted: { $eq: false },
      }

      if (selectedConnectionId) {
        selector.connectionInstanceId = { $eq: selectedConnectionId }
      }

      if (debouncedSearch.trim()) {
        const queryStr = debouncedSearch.trim()
        selector.$or = [
          { id: { $regex: queryStr, $options: 'i' } },
          { title: { $regex: queryStr, $options: 'i' } },
        ]
      }

      const docs = await db.tasks
        .find({
          selector,
          limit: 30,
          sort: [{ updatedAt: 'desc' }],
        })
        .exec()

      return docs.map((docItem) => docItem.toMutableJSON())
    },
    enabled: isOpen && !!db?.tasks,
  })

  // Organiza: Fixadas no topo, seguidas por recentes/filtradas
  const sortedTasks = useMemo(() => {
    const pinnedSet = new Set(pinnedIds)
    const pinned: SyncTaskRxDBDTO[] = []
    const others: SyncTaskRxDBDTO[] = []

    tasksList.forEach((t) => {
      if (pinnedSet.has(t.id)) {
        pinned.push(t)
      } else {
        others.push(t)
      }
    })

    return [...pinned, ...others]
  }, [tasksList, pinnedIds])

  const handlePickTask = (t: SyncTaskRxDBDTO) => {
    handleSelectTask(t)
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
              _deleted: { $eq: false },
              $or: [
                { id: { $eq: cleanId } },
                { sourceId: { $eq: cleanId } },
                { id: { $eq: rawVal } },
              ],
            },
            limit: 1,
          })
          .exec()
        const firstDoc = docs[0]
        if (firstDoc) matched = firstDoc.toMutableJSON()
      } catch (e) {
        console.error('Erro ao buscar tarefa no Enter:', e)
      }
    }

    if (matched) {
      handleSelectTask(matched)
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
            'border-border/50 bg-card flex w-[285px] flex-col gap-1.5 rounded-xl border p-2.5 shadow-xl backdrop-blur-md',
            className,
          )}
        >
          {/* Header com X para fechar */}
          <div className="border-border/40 flex items-center justify-between border-b pb-1.5">
            <div className="text-foreground/90 flex items-center gap-1.5 text-xs font-semibold">
              <MessageSquareDiff className="text-primary h-3.5 w-3.5" />
              <span>Detalhes da Tarefa</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground h-5 w-5 rounded-md transition-colors"
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
            className="flex flex-col gap-1.5"
          >
            {/* LINHA 1: Atividade + Conexão/Datasource */}
            <div className="flex items-center gap-1.5">
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
                <SelectTrigger className="h-7 flex-1 text-[11px] font-medium">
                  <SelectValue placeholder="Selecione uma atividade..." />
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
                  {activities.map(({ id, name, icon: Icon }) => (
                    <SelectItem key={id} value={id} className="text-xs">
                      <span className="flex items-center gap-2">
                        {Icon && (
                          <Icon
                            className={cn(
                              'h-3.5 w-3.5',
                              id === selectedActivity
                                ? 'text-primary'
                                : 'text-muted-foreground',
                            )}
                          />
                        )}
                        {name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedConnectionId}
                onValueChange={setSelectedConnectionId}
              >
                <SelectTrigger className="border-input bg-background hover:bg-accent hover:text-accent-foreground flex !h-7 !w-7 shrink-0 items-center justify-center rounded-md border !p-0 shadow-sm transition-colors focus:ring-1 [&>svg]:hidden">
                  <SelectValue>
                    {(() => {
                      const conn = syncConnections.find(
                        (connItem) =>
                          connItem.connectionId === selectedConnectionId,
                      )
                      return conn?.addon?.logo ? (
                        <img
                          src={conn.addon.logo}
                          className="h-3.5 w-3.5 object-contain"
                          alt=""
                        />
                      ) : (
                        <span className="text-xs">📦</span>
                      )
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end" className="min-w-[170px]">
                  {syncConnections.map((connItem) => (
                    <SelectItem
                      key={connItem.connectionId}
                      value={connItem.connectionId}
                      className="py-1.5 text-xs"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {connItem.addon?.logo ? (
                            <img
                              src={connItem.addon.logo}
                              className="h-4 w-4 shrink-0 object-contain"
                              alt=""
                            />
                          ) : (
                            <span className="text-xs">📦</span>
                          )}
                          <span className="truncate font-medium">
                            {connItem.addon?.name ?? connItem.connectionId}
                          </span>
                        </div>
                        {connItem.member && (
                          <div className="ml-6 flex items-center gap-1.5">
                            {connItem.member.avatarUrl ? (
                              <img
                                src={connItem.member.avatarUrl}
                                alt=""
                                className="h-3.5 w-3.5 rounded-full"
                              />
                            ) : (
                              <LucideIcons.User2 className="h-3 w-3 opacity-60" />
                            )}
                            <span className="text-muted-foreground truncate text-[10px]">
                              {connItem.member.name ?? connItem.member.login}
                            </span>
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* LINHA 2: Input de Busca Compacto (h-7) + Botão de Busca Detalhada */}
            <div className="flex items-center gap-1.5">
              <LookupInput
                data-testid="time-entry-task-lookup-input"
                value={taskId}
                onChange={(val) => {
                  setTaskId(val)
                  setSearchQuery(val)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCommitAndClose()
                  }
                }}
                size="xs"
                placeholder="Buscar ou digitar ID..."
                className="flex-1"
                sourceIcon={(() => {
                  const activeConn = syncConnections.find(
                    (connItem) =>
                      connItem.connectionId === selectedConnectionId,
                  )
                  return activeConn?.addon?.logo ? (
                    <img
                      src={activeConn.addon.logo}
                      alt={activeConn.addon.name}
                      className="h-3.5 w-3.5 rounded-xs object-contain"
                    />
                  ) : undefined
                })()}
              />
              <Button
                data-testid="time-entry-task-lookup-modal-btn"
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-md transition-colors"
                title="Busca detalhada (Modal)"
                onClick={() => setIsLookupModalOpen(true)}
              >
                <ExternalLink className="text-muted-foreground hover:text-foreground h-3.5 w-3.5" />
              </Button>
            </div>

            {/* LINHA 3: Mini Lista de Tarefas (Fixadas no Topo) */}
            <div className="border-border/40 bg-muted/20 flex flex-col gap-1 rounded-lg border p-1">
              <div className="text-muted-foreground flex items-center justify-between px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase">
                <span>Tarefas ({sortedTasks.length})</span>
                {pinnedIds.length > 0 && (
                  <span className="text-primary text-[9px] font-medium">
                    📌 {pinnedIds.length} fixada(s)
                  </span>
                )}
              </div>

              <div className="flex max-h-[150px] scrollbar-thin flex-col gap-0.5 overflow-y-auto pr-0.5">
                {sortedTasks.length === 0 ? (
                  <div className="text-muted-foreground py-3 text-center text-[11px]">
                    Nenhuma tarefa encontrada
                  </div>
                ) : (
                  sortedTasks.map((t) => {
                    const isPinned = pinnedIds.includes(t.id)
                    const isSelected = taskId === t.id
                    const ticketId = /^\d+$/.test(t.id) ? `#${t.id}` : t.id

                    return (
                      <div
                        key={t.id}
                        onClick={() => handlePickTask(t)}
                        title={`${ticketId} - ${t.title}`}
                        className={cn(
                          'group flex cursor-pointer items-center justify-between gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors',
                          isSelected
                            ? 'bg-primary/15 text-primary font-medium'
                            : 'hover:bg-accent/60 text-foreground',
                          isPinned && !isSelected && 'bg-accent/30',
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="shrink-0 font-mono text-[10px] font-bold opacity-80">
                            {ticketId}
                          </span>
                          <span className="truncate text-[11px] leading-snug">
                            {t.title}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {t.assignedTo?.name && (
                            <span className="bg-muted text-muted-foreground max-w-[50px] truncate rounded px-1 text-[9px]">
                              {t.assignedTo.name.split(' ')[0]}
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'h-5 w-5 p-0 transition-opacity hover:bg-transparent',
                              isPinned
                                ? 'text-primary opacity-100'
                                : 'text-muted-foreground opacity-0 group-hover:opacity-100',
                            )}
                            onClick={(e) => togglePin(t.id, e)}
                            title={
                              isPinned ? 'Desafixar tarefa' : 'Fixar no topo'
                            }
                          >
                            {isPinned ? (
                              <Pin className="h-3 w-3 fill-current" />
                            ) : (
                              <PinOff className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* LINHA 4 (NO FIM DO POPOVER): Input "No que está trabalhando?" */}
            <Input
              data-testid="time-entry-popover-comment-input"
              value={localDescription}
              onFocus={() => {
                isDescriptionFocusedRef.current = true
              }}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={() => {
                isDescriptionFocusedRef.current = false
                commitDescription()
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                commitDescription()
                handleCommitAndClose()
              }}
              placeholder="No que está trabalhando?"
              className="h-7 text-[11px] focus-visible:ring-1"
            />
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
