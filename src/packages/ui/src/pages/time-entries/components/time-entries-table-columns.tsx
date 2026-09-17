import { ColumnDef, Row as TanStackRow } from '@tanstack/react-table'
import { parseISO } from 'date-fns'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudOff,
  Lightbulb,
  MessageSquareDiff,
  Pause,
  Plus,
  Sparkles,
} from 'lucide-react'
import React from 'react'

import { TaskPopover } from '@/components/task-popover'
import { TimerDisplay } from '@/components/time-bar/timer-display'
import { useActiveTimer } from '@/components/time-bar/useActiveTimer'
import { TimeEntryInputs } from '@/components/time-entry-inputs'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib'
import { SyncMetadataItem } from '@/local-db/schemas/metadata-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { TimeEntryRowActions } from '@/pages/time-entries/components/time-entry-row-actions'
import {
  activityIconMap,
  decimalToHMS,
  hasNoTask,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'

export interface CreateColumnsOptions {
  activities: SyncMetadataItem[]
  editingRows: Record<string, boolean>
  getRowData: (id: string) => Partial<SyncTimeEntryRxDBDTO> | undefined
  setEditingRows: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setTempData: React.Dispatch<
    React.SetStateAction<Record<string, Partial<SyncTimeEntryRxDBDTO>>>
  >
  setRowBeingEdited: (id: string | null) => void
  setTaskLookupOpen: (open: boolean) => void
  onSaveRow: (id: string) => void
  onDirectUpdateRow?: (
    id: string,
    updates: Partial<SyncTimeEntryRxDBDTO>,
  ) => void
  onCancelEdit: (id: string) => void
  onDeleteRow: (id: string) => void
  onDuplicateRow: (row: SuggestionRow) => void
  onAcceptSuggestion: (row: SuggestionRow) => void
  onDismissSuggestion: (id: string) => void
  onTimeChangeDirect?: (
    id: string,
    updates: Partial<SyncTimeEntryRxDBDTO>,
  ) => void
  onPauseTimer?: (row: SuggestionRow) => void
  onResumeTimer?: (row: SuggestionRow) => void
  onStopTimer?: (row: SuggestionRow) => void
  isGrouped?: boolean
  onAddNewEntry?: (day: Date, parentTask?: { id: string }) => void
}

function MasterGroupTotalTimeCell({ subRows }: { subRows?: SuggestionRow[] }) {
  const liveActiveSeconds = useActiveTimer()

  const totalHMS = React.useMemo(() => {
    let totalSeconds = 0
    for (const child of subRows || []) {
      if (child.isSuggestion) continue
      if (child.timeStatus === 'running') {
        totalSeconds += liveActiveSeconds
      } else {
        const baseSeconds = Math.round((child.timeSpent || 0) * 3600)
        totalSeconds += baseSeconds
      }
    }
    return decimalToHMS(totalSeconds / 3600)
  }, [subRows, liveActiveSeconds])

  return (
    <div className="flex items-center justify-end px-2">
      <span className="text-foreground/80 font-mono text-xs font-semibold">
        {totalHMS}
      </span>
    </div>
  )
}

function AudioWavePlayingIndicator() {
  return (
    <div
      className="flex items-center gap-[2.5px] px-1"
      title="Em gravação / Ao vivo"
    >
      <span className="bg-primary h-3 w-1 animate-pulse rounded-full" />
      <span className="bg-primary h-4.5 w-1 animate-bounce rounded-full [animation-delay:0.15s]" />
      <span className="bg-primary h-2 w-1 animate-bounce rounded-full [animation-delay:0.3s]" />
      <span className="bg-primary h-3.5 w-1 animate-pulse rounded-full [animation-delay:0.45s]" />
    </div>
  )
}

/**
 * Wrapper that renders TimerDisplay inside the table cell for a running entry.
 * Uses IPC timer:tick from the main process for precision, same as the widget/bar.
 */
function RunningTimerCellWrapper() {
  return (
    <div className="text-primary bg-primary/10 border-primary/30 animate-in fade-in flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-bold shadow-xs">
      <span className="relative flex h-2 w-2">
        <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
        <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
      </span>
      <TimerDisplay status="running" className="text-xs font-bold" />
    </div>
  )
}

const MemoizedCommentInput = React.memo(
  ({
    initialValue,
    onChange,
  }: {
    initialValue: string
    onChange: (val: string) => void
  }) => {
    const [localValue, setLocalValue] = React.useState(initialValue)

    React.useEffect(() => {
      setLocalValue(initialValue)
    }, [initialValue])

    return (
      <Input
        value={localValue}
        className="border-primary/40 h-7 text-xs focus-visible:ring-1"
        onChange={(e) => {
          setLocalValue(e.target.value)
          onChange(e.target.value)
        }}
      />
    )
  },
)
MemoizedCommentInput.displayName = 'MemoizedCommentInput'

const getRowKey = (row: SuggestionRow): string => row.id

export function createTimeEntriesColumns(
  options: CreateColumnsOptions,
): ColumnDef<SuggestionRow>[] {
  const {
    activities,
    editingRows,
    getRowData,
    setEditingRows,
    setTempData,
    setRowBeingEdited,
    setTaskLookupOpen,
    onSaveRow,
    onDirectUpdateRow,
    onCancelEdit,
    onDeleteRow,
    onDuplicateRow,
    onAcceptSuggestion,
    onDismissSuggestion,
    onTimeChangeDirect,
    onPauseTimer,
    onResumeTimer,
    onStopTimer,
    isGrouped = true,
    onAddNewEntry,
  } = options

  return [
    {
      id: 'expand',
      header: '',
      size: 105,
      minSize: 52,
      maxSize: 130,
      cell: ({ row }) => {
        if (
          row.original.isSuggestion ||
          row.original.timeStatus === 'suggestion'
        ) {
          const source = row.original.addonSource
          const sourceName = source?.name
            ? `@${source.name.toLowerCase().replace(/\s+/g, '')}`
            : '@addon'

          return (
            <div className="flex items-center justify-start pl-1">
              <div
                className="border-border/80 bg-background/80 text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-2xs"
                title={`Fonte: ${source?.name || 'Addon'}`}
              >
                {source?.imageUrl ? (
                  <img
                    src={source.imageUrl}
                    alt={source.name}
                    className="h-3.5 w-3.5 rounded-sm object-cover"
                  />
                ) : (
                  <Sparkles className="text-primary h-3.5 w-3.5" />
                )}
                <span>{sourceName}</span>
              </div>
            </div>
          )
        }

        const isRunning = row.original.timeStatus === 'running'
        const isPaused = row.original.timeStatus === 'paused'

        if (row.depth > 0) {
          if (isRunning) {
            return (
              <div className="flex h-5 w-5 items-center justify-center pl-1 text-emerald-500">
                <span className="relative flex h-2 w-2">
                  <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                  <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
                </span>
              </div>
            )
          }

          if (isPaused) {
            return (
              <div className="flex h-5 w-5 items-center justify-center pl-1 text-amber-500">
                <Pause className="h-3 w-3 fill-current" />
              </div>
            )
          }

          return null
        }

        const isGroupMaster =
          (row.original.subRows?.length ?? 0) > 1 && !row.getParentRow()

        if (!isGroupMaster) {
          // Em modo sem agrupar, não exibe o número 1
          if (!isGrouped) {
            return null
          }

          return (
            <div className="flex items-center justify-start pl-[22px]">
              <Badge
                variant="outline"
                className="bg-muted/20 border-border/40 text-muted-foreground/70 flex h-4 min-w-[18px] items-center justify-center px-1 font-mono text-[10px]"
              >
                1
              </Badge>
            </div>
          )
        }

        const count = row.original.subRows?.length ?? 0

        return (
          <div className="flex items-center justify-start gap-1">
            <button
              type="button"
              onClick={row.getToggleExpandedHandler()}
              className="hover:bg-muted/70 flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1 text-xs font-semibold transition-all select-none active:scale-95"
              title={row.getIsExpanded() ? 'Recolher grupo' : 'Expandir grupo'}
            >
              {row.getIsExpanded() ? (
                <ChevronDown className="text-foreground/80 h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="text-foreground/80 h-3.5 w-3.5 shrink-0" />
              )}
              <Badge
                variant="outline"
                className="bg-muted/40 border-border/60 text-foreground flex h-4 min-w-[18px] items-center justify-center px-1 font-mono text-[10px] font-bold"
              >
                {count || 1}
              </Badge>
            </button>
          </div>
        )
      },
    },

    {
      id: 'issue_id',
      accessorKey: 'task.id',
      header: () => (
        <div className="pl-1 text-left text-[10px] font-bold uppercase opacity-70">
          Ticket
        </div>
      ),
      size: 190,
      minSize: 135,
      maxSize: 260,
      cell: ({ row }: { row: TanStackRow<SuggestionRow> }) => {
        const original = row.original
        const rowKey = getRowKey(original)
        const isGroupMaster =
          (original.subRows?.length ?? 0) > 1 && !row.getParentRow()

        const isEditing =
          !isGroupMaster &&
          (Boolean(original.isSuggestion) ||
            Boolean(editingRows[rowKey] || editingRows[original.id]))

        const data = getRowData(rowKey) || getRowData(original.id)

        const rawTaskId = data?.task?.id ?? original.task?.id ?? ''
        const currentTaskId =
          rawTaskId === '# ticket' ||
          rawTaskId === '# Ticket' ||
          rawTaskId === 'sem-issue' ||
          rawTaskId === 'Tarefa'
            ? ''
            : rawTaskId

        const updateField = (updates: Partial<SyncTimeEntryRxDBDTO>) => {
          if (onDirectUpdateRow) {
            onDirectUpdateRow(rowKey, updates)
          } else {
            setTempData((p) => ({
              ...p,
              [rowKey]: {
                ...p[rowKey],
                ...updates,
              },
              [original.id]: {
                ...p[original.id],
                ...updates,
              },
            }))
          }
        }

        const taskTitle = original.taskData?.title || ''
        const cleanId = currentTaskId.replace(/^#/, '')

        if (isEditing) {
          const currentDescription = data?.comments ?? original.comments ?? ''
          const currentActivity =
            data?.activity?.id ?? original.activity?.id ?? 'dev'
          const currentConnectionId =
            data?.connectionInstanceId ?? original.connectionInstanceId

          const formattedActivities = activities.map((act) => ({
            id: act.id,
            name: act.name,
            icon: (activityIconMap[act.icon || 'Code'] ||
              activityIconMap.Code) as React.ElementType,
          }))

          const hasSelectedTask = Boolean(
            currentTaskId && currentTaskId.trim() !== '',
          )
          const displayLabel = hasSelectedTask
            ? taskTitle
              ? `#${cleanId} - ${taskTitle}`
              : `#${cleanId}`
            : 'Escolher tarefa'

          return (
            <div className="flex w-full justify-start pl-1">
              <TaskPopover
                side="bottom"
                align="start"
                taskId={currentTaskId}
                onTaskIdChange={(id) => updateField({ task: { id } })}
                description={currentDescription}
                onDescriptionChange={(val) => updateField({ comments: val })}
                selectedActivity={currentActivity}
                onActivityChange={(val) =>
                  updateField({ activity: { id: val } })
                }
                selectedConnectionId={currentConnectionId}
                onConnectionChange={(val) =>
                  updateField({ connectionInstanceId: val })
                }
                activities={formattedActivities}
                onSelectTask={(task) => {
                  updateField({
                    task: { id: task.id },
                    taskData: task,
                    connectionInstanceId: task.connectionInstanceId,
                    dataSourceId: task.dataSourceId,
                  })
                }}
                onCommitAndClose={() => {
                  if (!original.isDraft) {
                    onSaveRow(rowKey)
                  }
                }}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      'bg-background flex h-7 w-full max-w-[190px] items-center justify-between gap-1.5 px-2 text-xs font-medium shadow-2xs transition-all',
                      hasSelectedTask
                        ? 'border-primary/40 hover:border-primary font-sans'
                        : 'border-primary/50 bg-primary/5 hover:bg-primary/10 text-primary border-dashed font-sans',
                    )}
                    title="Clique para abrir detalhes e selecionar tarefa"
                  >
                    <div className="flex min-w-0 items-center gap-1.5 truncate">
                      {hasSelectedTask ? (
                        <MessageSquareDiff className="text-primary h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Plus className="text-primary h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{displayLabel}</span>
                    </div>
                  </Button>
                }
              />
            </div>
          )
        }

        if (isGroupMaster) {
          if (!currentTaskId) {
            return (
              <div className="flex w-full justify-start pl-1">
                <span className="text-muted-foreground/80 border-border/70 inline-flex items-center gap-1 rounded border border-dashed px-2 py-0.5 font-sans text-[11px] font-medium">
                  Sem tarefa
                </span>
              </div>
            )
          }

          return (
            <div className="flex w-full justify-start pl-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="border-border/60 bg-secondary/70 hover:bg-secondary inline-flex max-w-[180px] cursor-help items-center gap-1.5 truncate rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-2xs transition-colors">
                    <span className="shrink-0 font-mono font-bold">{`#${cleanId}`}</span>
                    {taskTitle && (
                      <>
                        <span className="text-muted-foreground/50 shrink-0 font-mono">
                          -
                        </span>
                        <span className="text-muted-foreground truncate font-sans text-[11px] font-normal">
                          {taskTitle}
                        </span>
                      </>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[320px]">
                  <p className="font-mono text-xs font-bold">{`#${cleanId}`}</p>
                  {taskTitle && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {taskTitle}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          )
        }

        // Se a linha (sublinha ou isolada) não tem tarefa definida, exibe botão para escolher
        if (!currentTaskId) {
          return (
            <div className="flex w-full justify-start pl-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingRows((prev) => ({ ...prev, [rowKey]: true }))
                    }}
                    className="hover:border-primary text-muted-foreground hover:text-primary bg-muted/20 hover:bg-primary/10 border-muted-foreground/40 inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-dashed px-2 font-sans text-[11px] font-medium transition-all"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Escolher...</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs">Clique para definir uma tarefa</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )
        }

        // Em modo agrupado, sublinhas que já possuem tarefa definida pelo grupo não exibem o ticket repetido
        if (row.depth > 0) {
          return null
        }

        return (
          <div className="flex w-full justify-start pl-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="border-border/60 bg-secondary/70 hover:bg-secondary inline-flex max-w-[180px] cursor-help items-center gap-1.5 truncate rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-2xs transition-colors">
                  <span className="shrink-0 font-mono font-bold">{`#${cleanId}`}</span>
                  {taskTitle && (
                    <>
                      <span className="text-muted-foreground/50 shrink-0 font-mono">
                        -
                      </span>
                      <span className="text-muted-foreground truncate font-sans text-[11px] font-normal">
                        {taskTitle}
                      </span>
                    </>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[320px]">
                <p className="font-mono text-xs font-bold">{`#${cleanId}`}</p>
                {taskTitle && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {taskTitle}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        )
      },
    },

    {
      id: 'syncStatus',
      header: () => (
        <div className="text-center text-[10px] font-bold uppercase opacity-70">
          Status
        </div>
      ),
      size: 70,
      cell: ({ row }) => {
        const original = row.original
        const isGroupMaster =
          (original.subRows?.length ?? 0) > 1 && !row.getParentRow()

        if (isGroupMaster) {
          return (
            <div className="text-muted-foreground/40 flex justify-center font-mono text-xs select-none">
              —
            </div>
          )
        }

        if (original.timeStatus === 'running') {
          return (
            <div className="flex justify-center">
              <Badge
                variant="outline"
                className="border-primary/50 bg-primary/15 text-primary gap-1 px-1.5 py-0.5 text-[10px] font-bold shadow-xs"
              >
                <span className="relative flex h-2 w-2">
                  <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                  <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
                </span>
                <span>AO VIVO</span>
              </Badge>
            </div>
          )
        }

        if (original.timeStatus === 'paused') {
          return (
            <div className="flex justify-center">
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
              >
                <Pause className="h-2.5 w-2.5 fill-current" />
                <span>PAUSADO</span>
              </Badge>
            </div>
          )
        }

        if (original.isSuggestion || original.timeStatus === 'suggestion') {
          return (
            <div className="flex justify-center">
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
              >
                <Lightbulb className="h-3 w-3 fill-current text-amber-500" />
                <span>SUGESTÃO</span>
              </Badge>
            </div>
          )
        }

        if (original.conflicted) {
          return (
            <div className="flex justify-center text-amber-500">
              <AlertCircle className="h-4 w-4" />
            </div>
          )
        }

        if (
          original.syncStatus === 'synced' ||
          original.lastPushedAt ||
          original.lastPulledAt
        ) {
          return (
            <div className="flex justify-center text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          )
        }

        return (
          <div className="text-muted-foreground flex justify-center opacity-60">
            <CloudOff className="h-3.5 w-3.5" />
          </div>
        )
      },
    },
    {
      id: 'activity',
      header: () => (
        <div className="text-[10px] font-bold uppercase opacity-70">
          Atividade
        </div>
      ),
      cell: ({ row }: { row: TanStackRow<SuggestionRow> }) => {
        const original = row.original
        const rowKey = getRowKey(original)
        const isGroupMaster =
          (original.subRows?.length ?? 0) > 1 && !row.getParentRow()
        const isEditing =
          !isGroupMaster &&
          (Boolean(original.isSuggestion) ||
            Boolean(editingRows[rowKey] || editingRows[original.id]))

        const updateField = (updates: Partial<SyncTimeEntryRxDBDTO>) => {
          if (onDirectUpdateRow) {
            onDirectUpdateRow(rowKey, updates)
          } else {
            setTempData((p) => ({
              ...p,
              [rowKey]: {
                ...p[rowKey],
                ...updates,
              },
              [original.id]: {
                ...p[original.id],
                ...updates,
              },
            }))
          }
        }

        if (isEditing) {
          const rowData = getRowData(rowKey) || getRowData(original.id)
          const currentTaskId = rowData?.task?.id ?? original.task?.id
          const currentConnectionId =
            rowData?.connectionInstanceId ?? original.connectionInstanceId
          const hasTaskOrDatasource = Boolean(
            currentTaskId || currentConnectionId || original.dataSourceId,
          )

          const currentVal =
            rowData?.activity?.id || original.activity?.id || activities[0]?.id

          const isSelectDisabled =
            !hasTaskOrDatasource && activities.length === 0

          return (
            <Select
              value={currentVal}
              onValueChange={(val) => updateField({ activity: { id: val } })}
              disabled={isSelectDisabled}
            >
              <SelectTrigger className="border-primary/40 h-7 text-xs focus:ring-1">
                <SelectValue
                  placeholder={
                    isSelectDisabled ? 'Selecione uma tarefa' : 'Selecione'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }

        if (isGroupMaster && hasNoTask(original)) {
          return (
            <div className="text-muted-foreground/40 flex justify-start pl-2 font-mono text-xs select-none">
              —
            </div>
          )
        }

        const uniqueActivityIds = Array.from(
          new Set(
            (original.subRows || []).length > 0
              ? (original.subRows || []).map((s) => s.activity?.id)
              : [original.activity?.id],
          ),
        ).filter(Boolean)

        const groupActivities = uniqueActivityIds
          .map((id) => activities.find((a) => a.id === id))
          .filter((a): a is SyncMetadataItem => !!a)

        return (
          <div className="relative flex h-8 w-full min-w-0 items-center">
            <div className="relative h-6 w-full">
              {groupActivities.slice(0, 3).map((act, i) => {
                const IconComponent = activityIconMap[act.icon]
                return (
                  <div
                    key={act.id}
                    className={cn(
                      'absolute flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-sm transition-all',
                      i === 0 && 'top-0 left-0 z-3',
                      i === 1 && 'z-2 translate-x-2 translate-y-1',
                      i === 2 && 'z-1 translate-x-4 translate-y-2',
                    )}
                    style={{
                      backgroundColor: act.colors?.background,
                      color: act.colors?.text,
                      borderColor: act.colors?.badge,
                    }}
                  >
                    {IconComponent && <IconComponent size={12} />}
                    <span className="max-w-[80px] truncate md:max-w-[120px]">
                      {act.name}
                    </span>
                  </div>
                )
              })}
            </div>
            {groupActivities.length > 3 && (
              <Badge variant="outline" className="ml-auto text-[10px]">
                +{groupActivities.length - 3}
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      id: 'comments',
      accessorKey: 'comments',
      header: () => (
        <div className="text-[10px] font-bold uppercase opacity-70">
          Comentários
        </div>
      ),
      cell: ({ row }: { row: TanStackRow<SuggestionRow> }) => {
        const original = row.original
        const rowKey = getRowKey(original)
        const isGroupMaster =
          (original.subRows?.length ?? 0) > 1 && !row.getParentRow()
        const isEditing =
          !isGroupMaster &&
          (Boolean(original.isSuggestion) ||
            Boolean(editingRows[rowKey] || editingRows[original.id]))

        const updateField = (updates: Partial<SyncTimeEntryRxDBDTO>) => {
          if (onDirectUpdateRow) {
            onDirectUpdateRow(rowKey, updates)
          } else {
            setTempData((p) => ({
              ...p,
              [rowKey]: {
                ...p[rowKey],
                ...updates,
              },
              [original.id]: {
                ...p[original.id],
                ...updates,
              },
            }))
          }
        }

        if (isEditing) {
          const currentVal =
            getRowData(rowKey)?.comments ??
            getRowData(original.id)?.comments ??
            original.comments ??
            ''
          return (
            <MemoizedCommentInput
              initialValue={currentVal}
              onChange={(val) => updateField({ comments: val })}
            />
          )
        }

        return (
          <span className="text-muted-foreground line-clamp-1 text-xs">
            {original.comments || '—'}
          </span>
        )
      },
    },
    {
      id: 'hours',
      header: () => (
        <div className="text-right text-[10px] font-bold uppercase opacity-70">
          Tempo
        </div>
      ),
      cell: ({ row }: { row: TanStackRow<SuggestionRow> }) => {
        const original = row.original
        const rowKey = getRowKey(original)
        const isGroupMaster =
          (original.subRows?.length ?? 0) > 1 && !row.getParentRow()
        const rowData = getRowData(rowKey) || getRowData(original.id) || {}

        if (isGroupMaster) {
          return <MasterGroupTotalTimeCell subRows={original.subRows} />
        }

        if (original.timeStatus === 'running') {
          return (
            <div className="flex items-center justify-end">
              <RunningTimerCellWrapper />
            </div>
          )
        }

        if (original.timeStatus === 'paused') {
          return (
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
                <Pause className="h-2.5 w-2.5 fill-current" />
                <span>{decimalToHMS(original.timeSpent || 0)}</span>
              </div>
            </div>
          )
        }

        return (
          <div className="flex items-center justify-end">
            <TimeEntryInputs
              startDate={rowData.startDate ?? original.startDate}
              endDate={rowData.endDate ?? original.endDate}
              timeSpent={rowData.timeSpent ?? original.timeSpent}
              disabled={isGroupMaster && !original.isSuggestion}
              onChange={(newData) => {
                if (original.isSuggestion) {
                  setTempData((p) => ({
                    ...p,
                    [rowKey]: { ...p[rowKey], ...newData },
                    [original.id]: { ...p[original.id], ...newData },
                  }))
                  return
                }
                onTimeChangeDirect?.(rowKey, newData)
              }}
            />
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      size: 85,
      minSize: 70,
      maxSize: 105,
      cell: ({ row }) => {
        const original = row.original
        const rowKey = getRowKey(original)
        const isGroupMaster =
          (original.subRows?.length ?? 0) > 1 && !row.getParentRow()

        if (isGroupMaster) {
          return (
            <div className="flex items-center justify-end pr-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  const day = original.startDate
                    ? parseISO(original.startDate)
                    : new Date()
                  const parentTask =
                    original.task?.id && !hasNoTask(original)
                      ? { id: original.task.id }
                      : undefined
                  onAddNewEntry?.(day, parentTask)
                }}
                className="hover:bg-muted/60 text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 font-medium transition-colors select-none"
                title="Adicionar apontamento para esta tarefa"
              >
                <Plus className="h-3 w-3" />
                <span className="text-[11px]">Adicionar</span>
              </Button>
            </div>
          )
        }

        const isEditing =
          !isGroupMaster &&
          (Boolean(original.isSuggestion) ||
            Boolean(editingRows[rowKey] || editingRows[original.id]))

        return (
          <TimeEntryRowActions
            row={original}
            isEditing={isEditing}
            onToggleEdit={() =>
              setEditingRows((prev) => {
                const next = { ...prev }
                const nextState = !isEditing
                if (nextState) {
                  next[rowKey] = true
                } else {
                  delete next[rowKey]
                  delete next[original.id]
                  Object.keys(next).forEach((k) => {
                    if (k.endsWith(original.id)) {
                      delete next[k]
                    }
                  })
                }
                return next
              })
            }
            onSave={() => onSaveRow(rowKey)}
            onCancelEdit={() => onCancelEdit(rowKey)}
            onDuplicate={() => onDuplicateRow(original)}
            onDelete={() => onDeleteRow(rowKey)}
            onAcceptSuggestion={() => onAcceptSuggestion(original)}
            onDismissSuggestion={() => onDismissSuggestion(rowKey)}
            onPauseTimer={onPauseTimer}
            onResumeTimer={onResumeTimer}
            onStopTimer={onStopTimer}
          />
        )
      },
    },
  ]
}
