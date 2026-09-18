'use client'

import { useQuery } from '@tanstack/react-query'
import {
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
import React, { useCallback, useMemo, useState } from 'react'
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
import { cn } from '@/lib/utils'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { useConnectionsWithSync, useSyncStore } from '@/stores/syncStore'

const DEFAULT_ACTIVITIES: Array<{
  id: string
  name: string
  icon: React.ElementType
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
  activities?: Array<{ id: string; name: string; icon: React.ElementType }>
  syncConnections?: any[]
  onSelectTask?: (task: SyncTaskRxDBDTO) => void
  onCommitAndClose?: () => void
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
}: TaskPopoverProps) {
  const trackerContext = useOptionalTrackerContext()
  const defaultSyncConnections = useConnectionsWithSync()

  // Resolve state & handlers (props take priority, then context, then defaults)
  const taskId = propTaskId ?? trackerContext?.taskId ?? ''
  const setTaskId =
    propOnTaskIdChange ?? trackerContext?.setTaskId ?? (() => {})

  const description = propDescription ?? trackerContext?.description ?? ''
  const setDescription =
    propOnDescriptionChange ?? trackerContext?.setDescription ?? (() => {})

  const selectedActivity =
    propSelectedActivity ?? trackerContext?.selectedActivity ?? 'dev'
  const setSelectedActivity =
    propOnActivityChange ?? trackerContext?.setSelectedActivity ?? (() => {})

  const syncConnections =
    propSyncConnections ??
    trackerContext?.syncConnections ??
    defaultSyncConnections ??
    []
  const selectedConnectionId =
    propSelectedConnectionId ??
    trackerContext?.selectedConnectionId ??
    syncConnections[0]?.connectionId ??
    ''
  const setSelectedConnectionId =
    propOnConnectionChange ??
    trackerContext?.setSelectedConnectionId ??
    (() => {})

  const activities =
    propActivities ?? trackerContext?.activities ?? DEFAULT_ACTIVITIES

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
  const { data: tasksList = [] } = useQuery({
    queryKey: ['popover-tasks-mini', debouncedSearch, selectedConnectionId],
    queryFn: async () => {
      if (!db?.tasks) return []
      const selector: any = { _deleted: { $eq: false } }

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

      return docs.map((d) =>
        d.toMutableJSON ? d.toMutableJSON() : d,
      ) as SyncTaskRxDBDTO[]
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
    const rawVal = taskId.trim()
    const cleanId = rawVal.replace(/^#/, '')

    if (rawVal) {
      let matched = sortedTasks.find(
        (t) =>
          t.id === rawVal ||
          t.id === cleanId ||
          t.id.toLowerCase() === rawVal.toLowerCase() ||
          t.id.toLowerCase() === cleanId.toLowerCase(),
      )

      if (!matched && db?.tasks && cleanId) {
        try {
          const docs = await db.tasks
            .find({
              selector: {
                _deleted: { $eq: false },
                $or: [
                  { id: { $eq: cleanId } },
                  { id: { $eq: rawVal } },
                  { id: { $regex: cleanId, $options: 'i' } },
                ],
              },
              limit: 1,
            })
            .exec()
          if (docs.length > 0) matched = docs[0].toMutableJSON()
        } catch (e) {
          console.error('Erro ao buscar tarefa no Enter:', e)
        }
      }

      if (matched) {
        handleSelectTask(matched)
      } else {
        setTaskId(rawVal)
      }
    }

    onCommitAndClose?.()
    setIsOpen(false)
  }, [
    taskId,
    sortedTasks,
    db,
    handleSelectTask,
    setTaskId,
    setIsOpen,
    onCommitAndClose,
  ])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleCommitAndClose()
      } else {
        setIsOpen(true)
      }
    },
    [handleCommitAndClose, setIsOpen],
  )

  return (
    <>
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
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
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
                value={selectedActivity}
                onValueChange={setSelectedActivity}
                disabled={!selectedConnectionId}
              >
                <SelectTrigger className="h-7 flex-1 text-[11px] font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activities.map(({ id, name, icon: Icon }) => (
                    <SelectItem key={id} value={id} className="text-xs">
                      <span className="flex items-center gap-2">
                        <Icon
                          className={cn(
                            'h-3.5 w-3.5',
                            id === selectedActivity
                              ? 'text-primary'
                              : 'text-muted-foreground',
                          )}
                        />
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
                        (c: any) => c.connectionId === selectedConnectionId,
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
                  {syncConnections.map((c: any) => (
                    <SelectItem
                      key={c.connectionId}
                      value={c.connectionId}
                      className="py-1.5 text-xs"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {c.addon?.logo ? (
                            <img
                              src={c.addon.logo}
                              className="h-4 w-4 shrink-0 object-contain"
                              alt=""
                            />
                          ) : (
                            <span className="text-xs">📦</span>
                          )}
                          <span className="truncate font-medium">
                            {c.addon?.name || c.connectionId}
                          </span>
                        </div>
                        {c.member && (
                          <div className="ml-6 flex items-center gap-1.5">
                            {c.member.avatarUrl ? (
                              <img
                                src={c.member.avatarUrl}
                                alt=""
                                className="h-3.5 w-3.5 rounded-full"
                              />
                            ) : (
                              <LucideIcons.User2 className="h-3 w-3 opacity-60" />
                            )}
                            <span className="text-muted-foreground truncate text-[10px]">
                              {c.member.name || c.member.login}
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
              />
              <Button
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCommitAndClose()
                }
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
