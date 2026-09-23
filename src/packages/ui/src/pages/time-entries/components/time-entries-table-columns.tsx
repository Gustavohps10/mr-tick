import { ColumnDef, Row as TanStackRow } from '@tanstack/react-table'
import { parseISO } from 'date-fns'
import {
  ChevronDown,
  ChevronRight,
  CircleDashed,
  MessageSquareDiff,
  Pause,
  Plus,
  Sparkles,
} from 'lucide-react'
import React from 'react'
import { useDebounce } from 'use-debounce'

import { DataSourceLogo } from '@/components/datasource-logo'
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
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { TimeEntryRowActions } from '@/pages/time-entries/components/time-entry-row-actions'
import {
  decimalToHMS,
  extractPureTaskId,
  getActivityIcon,
  hasNoTask,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'

import { SyncStatusCell } from './sync-status-cell'

export interface CreateColumnsOptions {
  activities: SyncMetadataItem[]
  tasksById?: Record<string, SyncTaskRxDBDTO>
  editingRows: Record<string, boolean>
  getRowData: (id: string) => Partial<SyncTimeEntryRxDBDTO> | undefined
  setEditingRows: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setTempData: React.Dispatch<
    React.SetStateAction<Record<string, Partial<SyncTimeEntryRxDBDTO>>>
  >
  setRowBeingEdited: (id: string | null) => void
  setTaskLookupOpen: (open: boolean) => void
  tempData?: Record<string, Partial<SyncTimeEntryRxDBDTO>>
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
  onResolveConflict?: (
    rowId: string,
    resolution: 'local' | 'remote',
  ) => Promise<void> | void
  onOpenConflict?: (row: SuggestionRow) => void
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
interface RunningTimerCellWrapperProps {
  initialSeconds?: number
}

function RunningTimerCellWrapper({
  initialSeconds = 0,
}: RunningTimerCellWrapperProps) {
  return (
    <div className="text-primary bg-primary/10 border-primary/30 animate-in fade-in flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-bold shadow-xs">
      <span className="relative flex h-2 w-2">
        <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
        <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
      </span>
      <TimerDisplay
        status="running"
        initialValue={initialSeconds}
        className="text-xs font-bold"
      />
    </div>
  )
}

interface MemoizedCommentInputProps {
  initialValue: string
  onChange: (val: string) => void
}

const MemoizedCommentInput = React.memo(
  ({ initialValue, onChange }: MemoizedCommentInputProps) => {
    const [localValue, setLocalValue] = React.useState(initialValue)
    const isFocusedRef = React.useRef(false)
    const latestValueRef = React.useRef(initialValue)
    latestValueRef.current = localValue
    const onChangeRef = React.useRef(onChange)
    onChangeRef.current = onChange

    React.useEffect(() => {
      if (isFocusedRef.current) return
      setLocalValue(initialValue)
    }, [initialValue])

    const [debouncedValue] = useDebounce(localValue, 300)

    React.useEffect(() => {
      if (!isFocusedRef.current) return
      if (debouncedValue === initialValue) return
      onChangeRef.current(debouncedValue)
    }, [debouncedValue, initialValue])

    const commitChange = React.useCallback(() => {
      if (latestValueRef.current === initialValue) return
      onChangeRef.current(latestValueRef.current)
    }, [initialValue])

    return (
      <Input
        data-testid="time-entry-comment-input"
        value={localValue}
        className="border-primary/40 h-7 w-full min-w-0 text-xs focus-visible:ring-1"
        onFocus={() => {
          isFocusedRef.current = true
        }}
        onChange={(e) => {
          setLocalValue(e.target.value)
        }}
        onBlur={() => {
          isFocusedRef.current = false
          commitChange()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          commitChange()
          e.currentTarget.blur()
        }}
      />
    )
  },
)
MemoizedCommentInput.displayName = 'MemoizedCommentInput'

const getRowKey = (row: SuggestionRow): string => row.id

function resolveRowTempData(
  rowKey: string,
  originalId: string,
  tempData?: Record<string, Partial<SyncTimeEntryRxDBDTO>>,
  getRowData?: (id: string) => Partial<SyncTimeEntryRxDBDTO> | undefined,
): Partial<SyncTimeEntryRxDBDTO> {
  if (getRowData) {
    const fromRefKey = getRowData(rowKey)
    if (fromRefKey && Object.keys(fromRefKey).length > 0) return fromRefKey
    const fromRefId = getRowData(originalId)
    if (fromRefId && Object.keys(fromRefId).length > 0) return fromRefId
  }
  if (tempData) {
    const fromStateKey = tempData[rowKey]
    if (fromStateKey && Object.keys(fromStateKey).length > 0)
      return fromStateKey
    const fromStateId = tempData[originalId]
    if (fromStateId && Object.keys(fromStateId).length > 0) return fromStateId
  }
  return {}
}

export function createTimeEntriesColumns(
  options: CreateColumnsOptions,
): ColumnDef<SuggestionRow>[] {
  const {
    activities,
    tasksById,
    editingRows,
    getRowData,
    setEditingRows,
    setTempData,
    tempData,
    setRowBeingEdited,
    setTaskLookupOpen,
    onSaveRow,
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
    onResolveConflict,
    onOpenConflict,
  } = options

  return [
    {
      id: 'expand',
      header: '',
      size: 50,
      minSize: 44,
      maxSize: 70,
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
      size: 210,
      minSize: 170,
      maxSize: 280,
      cell: ({ row }: { row: TanStackRow<SuggestionRow> }) => {
        const original = row.original
        const rowKey = getRowKey(original)
        const isGroupMaster =
          (original.subRows?.length ?? 0) > 1 && !row.getParentRow()

        const isEditing =
          !isGroupMaster &&
          (Boolean(original.isSuggestion) ||
            Boolean(editingRows[rowKey] || editingRows[original.id]))

        const data = resolveRowTempData(
          rowKey,
          original.id,
          tempData,
          getRowData,
        )

        const mergedRow = { ...original, ...data }

        const rawTaskId = mergedRow.task?.id ?? ''
        const cleanId = extractPureTaskId(rawTaskId)
        const currentTaskId = cleanId ? `#${cleanId}` : ''

        const updateField = (updates: Partial<SyncTimeEntryRxDBDTO>) => {
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

        const taskTitle =
          mergedRow.taskData?.title ||
          (cleanId && tasksById ? tasksById[cleanId]?.title : '') ||
          ''

        if (isEditing) {
          const isRemote = Boolean(
            (mergedRow.remoteId &&
              mergedRow.remoteId.trim() !== '' &&
              !mergedRow.remoteId.startsWith('local-')) ||
            mergedRow.syncStatus === 'synced',
          )
          const currentDescription = mergedRow.comments ?? ''
          const currentActivity = mergedRow.activity?.id ?? ''
          const currentConnectionId = mergedRow.connectionInstanceId ?? ''

          const formattedActivities = activities.map((act) => ({
            id: act.id,
            name: act.name,
            icon: getActivityIcon(act.icon),
          }))

          const hasSelectedTask = Boolean(cleanId && cleanId !== '')
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
                isRemote={isRemote}
                taskId={currentTaskId}
                onTaskIdChange={(id) => {
                  const clean = extractPureTaskId(id)
                  if (isRemote && !clean) return
                  updateField({ task: { id: clean } })
                }}
                description={currentDescription}
                onDescriptionChange={(val) => updateField({ comments: val })}
                selectedActivity={currentActivity}
                onActivityChange={(val) => {
                  if (!val) {
                    if (isRemote) return
                    updateField({ activity: { id: '', name: '' } })
                    return
                  }
                  const foundActivity = activities.find((a) => a.id === val)
                  let activityName: string | undefined = undefined
                  if (foundActivity) activityName = foundActivity.name
                  updateField({ activity: { id: val, name: activityName } })
                }}
                selectedConnectionId={currentConnectionId}
                onConnectionChange={(val) =>
                  updateField({ connectionInstanceId: val })
                }
                activities={formattedActivities}
                onSelectTask={(task) => {
                  const resolvedTaskId = extractPureTaskId(
                    task.sourceId || task.id,
                  )
                  updateField({
                    task: { id: resolvedTaskId },
                    taskData: task,
                    connectionInstanceId: task.connectionInstanceId,
                    dataSourceId: task.dataSourceId,
                  })
                }}
                trigger={
                  <Button
                    data-testid="time-entry-task-popover-trigger"
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
                        <DataSourceLogo
                          connectionInstanceId={currentConnectionId}
                          className="h-3.5 w-3.5 shrink-0 rounded-xs"
                          fallback={
                            <MessageSquareDiff className="text-primary h-3.5 w-3.5 shrink-0" />
                          }
                        />
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
          if (!cleanId) {
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
                    <DataSourceLogo
                      connectionInstanceId={original.connectionInstanceId}
                      dataSourceId={original.dataSourceId}
                      className="h-3.5 w-3.5 shrink-0 rounded-xs"
                    />
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
        if (!cleanId) {
          return (
            <div className="flex w-full justify-start pl-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
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
                  <DataSourceLogo
                    connectionInstanceId={original.connectionInstanceId}
                    dataSourceId={original.dataSourceId}
                    className="h-3.5 w-3.5 shrink-0 rounded-xs"
                  />
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
          Sync
        </div>
      ),
      size: 60,
      minSize: 50,
      maxSize: 75,
      cell: ({ row }) => {
        const original = row.original
        const isGroupMaster =
          (original.subRows?.length ?? 0) > 1 && !row.getParentRow()

        return (
          <SyncStatusCell
            original={original}
            isGroupMaster={isGroupMaster}
            onResolveConflict={onResolveConflict}
            onOpenConflict={onOpenConflict}
          />
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
      size: 140,
      minSize: 120,
      maxSize: 170,
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

        if (isEditing) {
          const rowData = resolveRowTempData(
            rowKey,
            original.id,
            tempData,
            getRowData,
          )
          const mergedRow = { ...original, ...rowData }
          const isRemote = Boolean(
            (mergedRow.remoteId &&
              mergedRow.remoteId.trim() !== '' &&
              !mergedRow.remoteId.startsWith('local-')) ||
            mergedRow.syncStatus === 'synced',
          )
          const currentTaskId = mergedRow.task?.id
          const currentConnectionId = mergedRow.connectionInstanceId
          const hasTaskOrDatasource = Boolean(
            currentTaskId || currentConnectionId || original.dataSourceId,
          )

          let currentVal = ''
          if (mergedRow.activity && mergedRow.activity.id) {
            currentVal = mergedRow.activity.id
          }

          const isSelectDisabled =
            !hasTaskOrDatasource && activities.length === 0

          return (
            <Select
              value={currentVal || (isRemote ? '' : '__NONE__')}
              onValueChange={(val) => {
                if (val === '__NONE__') {
                  if (isRemote) return
                  updateField({ activity: { id: '', name: '' } })
                  return
                }
                const foundActivity = activities.find((a) => a.id === val)
                let activityName: string | undefined = undefined
                if (foundActivity) activityName = foundActivity.name
                updateField({ activity: { id: val, name: activityName } })
              }}
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
                {!isRemote && (
                  <SelectItem
                    value="__NONE__"
                    className="text-muted-foreground text-xs italic"
                  >
                    <div className="flex items-center gap-1.5">
                      <CircleDashed className="text-muted-foreground h-3.5 w-3.5" />
                      <span>Sem atividade</span>
                    </div>
                  </SelectItem>
                )}
                {activities.map((a) => {
                  const SelectIcon = getActivityIcon(a.icon)
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-1.5">
                        {SelectIcon && <SelectIcon size={12} />}
                        <span>{a.name}</span>
                      </div>
                    </SelectItem>
                  )
                })}
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

        if (isGroupMaster) {
          const uniqueActivityIds = Array.from(
            new Set(
              (original.subRows || []).length > 0
                ? (original.subRows || []).map((s) => s.activity?.id)
                : [original.activity?.id],
            ),
          ).filter(Boolean)

          const groupActivities = uniqueActivityIds
            .map((id) => activities.find((a) => a.id === id))
            .filter((a): a is SyncMetadataItem => Boolean(a))

          return (
            <div className="relative flex h-8 w-full min-w-0 items-center">
              <div className="relative h-6 w-full">
                {groupActivities.slice(0, 3).map((act, i) => {
                  const IconComponent = getActivityIcon(act.icon)
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
        }

        const foundActivity = activities.find(
          (a) => a.id === original.activity?.id,
        )

        if (!foundActivity) {
          if (original.activity?.name) {
            return (
              <div className="border-border/60 bg-secondary/70 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-2xs">
                <span className="max-w-[120px] truncate">
                  {original.activity.name}
                </span>
              </div>
            )
          }

          return (
            <div className="flex w-full justify-start pl-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setEditingRows((prev) => ({ ...prev, [rowKey]: true }))
                    }}
                    className="hover:border-primary text-muted-foreground hover:text-primary bg-muted/20 hover:bg-primary/10 border-muted-foreground/40 inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-dashed px-2 font-sans text-[11px] font-medium transition-all"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Selecione a atividade</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs">Clique para definir uma atividade</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )
        }

        const SingleIconComponent = getActivityIcon(foundActivity.icon)

        return (
          <div
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-2xs transition-all"
            style={{
              backgroundColor: foundActivity.colors?.background,
              color: foundActivity.colors?.text,
              borderColor: foundActivity.colors?.badge,
            }}
          >
            {SingleIconComponent && <SingleIconComponent size={12} />}
            <span className="max-w-[120px] truncate">{foundActivity.name}</span>
          </div>
        )
      },
    },
    {
      id: 'comments',
      accessorKey: 'comments',
      size: 260,
      minSize: 160,
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

        if (isEditing) {
          const rowData = resolveRowTempData(
            rowKey,
            original.id,
            tempData,
            getRowData,
          )
          const currentVal = rowData.comments ?? original.comments ?? ''
          return (
            <div className="w-full min-w-0 pr-2">
              <MemoizedCommentInput
                initialValue={currentVal}
                onChange={(val) => updateField({ comments: val })}
              />
            </div>
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
      size: 215,
      minSize: 205,
      maxSize: 230,
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

        if (isGroupMaster) {
          return <MasterGroupTotalTimeCell subRows={original.subRows} />
        }

        if (original.timeStatus === 'running') {
          const initialSecs = original.timeSpent
            ? Math.round(original.timeSpent * 3600)
            : 0
          return (
            <div className="flex shrink-0 items-center justify-end whitespace-nowrap">
              <RunningTimerCellWrapper initialSeconds={initialSecs} />
            </div>
          )
        }

        if (original.timeStatus === 'paused') {
          return (
            <div className="flex shrink-0 items-center justify-end whitespace-nowrap">
              <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
                <Pause className="h-2.5 w-2.5 fill-current" />
                <span>{decimalToHMS(original.timeSpent || 0)}</span>
              </div>
            </div>
          )
        }

        const isEditing =
          !isGroupMaster &&
          (Boolean(original.isSuggestion) ||
            Boolean(editingRows[rowKey] || editingRows[original.id]))

        const rowData = resolveRowTempData(
          rowKey,
          original.id,
          tempData,
          getRowData,
        )
        const mergedRow = { ...original, ...rowData }
        const resolvedEndDate = mergedRow.endDate
        return (
          <div className="flex shrink-0 items-center justify-end whitespace-nowrap">
            <TimeEntryInputs
              startDate={mergedRow.startDate}
              endDate={
                resolvedEndDate !== null && resolvedEndDate !== undefined
                  ? resolvedEndDate
                  : undefined
              }
              timeSpent={mergedRow.timeSpent ?? 0}
              disabled={isGroupMaster && !original.isSuggestion}
              onChange={(newData) => {
                if (original.isSuggestion || isEditing) {
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
      size: 75,
      minSize: 65,
      maxSize: 90,
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
