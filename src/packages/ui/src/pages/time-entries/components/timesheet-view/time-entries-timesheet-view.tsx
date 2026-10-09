import { TimeEntriesColumnsProvider } from '@/pages/time-entries/components/time-entries-columns-context'
;('use client')

import type { ConfiguredFieldMapping } from '@mr-tick/sdk'
import { useQueryClient } from '@tanstack/react-query'
import { ExpandedState } from '@tanstack/react-table'
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  parseISO,
  startOfWeek,
  subWeeks,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Activity,
  CalendarCheck,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  Sparkles,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { DataSourceLogo } from '@/components/datasource-logo'
import { TaskLookup } from '@/components/task-lookup'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useHostBridge } from '@/hooks'
import {
  resolveEntityMapping,
  useFieldMappings,
} from '@/hooks/use-field-mappings'
import { cn } from '@/lib/utils'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { requestEntryPersistence } from '@/local-runtime/persistence-client'
import { TimeEntriesDayCard } from '@/pages/time-entries/components/time-entries-day-card'
import { TimeEntriesLoading } from '@/pages/time-entries/components/time-entries-loading'
import {
  type CreateColumnsOptions,
  createTimeEntriesColumns,
} from '@/pages/time-entries/components/time-entries-table-columns'
import { useTimeEntriesData } from '@/pages/time-entries/hooks/use-time-entries-data'
import { useTimeEntryMutations } from '@/pages/time-entries/hooks/use-time-entry-mutations'
import {
  cleanTaskId,
  extractPureTaskId,
  formatHours,
  getActivityIcon,
  hasNoTask,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'

interface TimesheetRowItem {
  key: string
  taskTitle: string
  taskId?: string
  dataSourceId?: string
  connectionInstanceId?: string
  activityId?: string
  activityName?: string
  activityColor?: string
  entries: SyncTimeEntryRxDBDTO[]
  dailyEntries: SyncTimeEntryRxDBDTO[][]
  dailyHours: number[]
  totalHours: number
}

interface SelectedTaskFocus {
  taskId?: string
  taskTitle: string
  activityId?: string
  dataSourceId?: string
  connectionInstanceId?: string
}

interface TimesheetTaskChipProps {
  row: TimesheetRowItem
  tasksById?: Record<string, SyncTaskRxDBDTO>
  mappings?: Record<string, ConfiguredFieldMapping>
  compact?: boolean
}

function TimesheetTaskChip({
  row,
  tasksById,
  mappings,
  compact = false,
}: TimesheetTaskChipProps) {
  const cleanId = row.taskId ? extractPureTaskId(row.taskId) : undefined
  const associatedTask =
    (cleanId && tasksById ? tasksById[cleanId] : undefined) ||
    (row.taskId && tasksById ? tasksById[row.taskId] : undefined) ||
    row.entries.find((e) => e.taskData)?.taskData
  const trackerObj = associatedTask?.tracker
  const resolvedTracker = resolveEntityMapping(trackerObj, 'tracker', mappings)
  const TrackerIconComponent = getActivityIcon(resolvedTracker.icon)
  const hasTaskTitle = Boolean(
    row.taskTitle &&
    cleanId &&
    row.taskTitle !== cleanId &&
    row.taskTitle !== `#${cleanId}` &&
    row.taskTitle !== 'Tarefa',
  )

  const resolvedConnectionInstanceId =
    row.connectionInstanceId ||
    associatedTask?.connectionInstanceId ||
    row.entries.find((e) => e.connectionInstanceId)?.connectionInstanceId ||
    row.entries.find((e) => e.taskData?.connectionInstanceId)?.taskData
      ?.connectionInstanceId

  const resolvedDataSourceId =
    row.dataSourceId ||
    associatedTask?.dataSourceId ||
    row.entries.find((e) => e.dataSourceId)?.dataSourceId ||
    row.entries.find((e) => e.taskData?.dataSourceId)?.taskData?.dataSourceId

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'border-border/60 bg-secondary/70 hover:bg-secondary inline-flex max-w-[300px] cursor-help items-center gap-1.5 truncate rounded-md border px-2 py-1 text-[11px] font-medium shadow-2xs transition-colors',
            compact && 'max-w-[195px] px-1.5 py-0.5 text-[10px]',
          )}
        >
          <DataSourceLogo
            connectionInstanceId={resolvedConnectionInstanceId}
            dataSourceId={resolvedDataSourceId}
            className={cn(
              'h-3.5 w-3.5 shrink-0 rounded-xs',
              compact && 'h-3 w-3',
            )}
          />
          {TrackerIconComponent && (
            <TrackerIconComponent
              size={compact ? 10 : 12}
              className="shrink-0"
              style={{ color: resolvedTracker.badgeColor }}
            />
          )}
          {cleanId ? (
            <>
              <span className="shrink-0 font-mono font-bold">{`#${cleanId}`}</span>
              {hasTaskTitle && (
                <>
                  <span className="text-muted-foreground/50 shrink-0 font-mono">
                    -
                  </span>
                  <span className="text-muted-foreground truncate font-sans text-[11px] font-normal">
                    {row.taskTitle}
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-muted-foreground truncate font-sans text-[11px] font-normal">
              {row.taskTitle || 'Sem tarefa vinculada'}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[320px]">
        {cleanId && (
          <p className="font-mono text-xs font-bold">{`#${cleanId}`}</p>
        )}
        {row.taskTitle && (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {row.taskTitle}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export interface TimeEntriesTimesheetViewProps {
  className?: string
  compact?: boolean
  initialDate?: Date
}

export function TimeEntriesTimesheetView({
  className,
  compact = false,
  initialDate,
}: TimeEntriesTimesheetViewProps = {}) {
  const queryClient = useQueryClient()
  const bridge = useHostBridge()
  const { mappings } = useFieldMappings()
  const [currentWeekDate, setCurrentWeekDate] = React.useState<Date>(() => {
    if (initialDate) return initialDate
    return new Date()
  })

  // 7 days interval of the active week (Segunda a Domingo)
  const weekDays = React.useMemo(() => {
    const start = startOfWeek(currentWeekDate, { weekStartsOn: 1 })
    const end = endOfWeek(start, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentWeekDate])

  const weekRange = React.useMemo(() => {
    return {
      from: weekDays[0],
      to: weekDays[weekDays.length - 1],
    }
  }, [weekDays])

  const {
    db,
    memberIdsByConnection,
    isLoading,
    timeEntries,
    activities,
    tasksById,
    activeTimeEntry,
    setActive,
    pauseCurrentTimeEntry,
    playCurrentTimeEntry,
    stopCurrentTimeEntry,
  } = useTimeEntriesData({
    from: weekRange.from,
    to: weekRange.to,
    ignoreUrlRange: true,
  })

  const {
    draftEntries,
    editingRows,
    setEditingRows,
    tempData,
    setTempData,
    getRowData,
    rowBeingEdited,
    setRowBeingEdited,
    taskLookupOpen,
    setTaskLookupOpen,
    handleSaveRow,
    handleDirectUpdateRow,
    handleCancelEdit,
    handleDeleteEntry,
    handleDuplicateEntry,
    handleAddNewEntry,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleResolveConflict,
    handleConfirmRetryAmbiguousCreation,
    handleOpenConflictResolution,
  } = useTimeEntryMutations(db, memberIdsByConnection)

  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null)
  const [selectedTaskFocus, setSelectedTaskFocus] =
    React.useState<SelectedTaskFocus | null>(null)
  const [dayDetailsOpen, setDayDetailsOpen] = React.useState(false)
  const [expandedRows, setExpandedRows] = React.useState<ExpandedState>({})

  const handlePrevWeek = () => setCurrentWeekDate((prev) => subWeeks(prev, 1))
  const handleNextWeek = () => setCurrentWeekDate((prev) => addWeeks(prev, 1))
  const handleCurrentWeek = () => setCurrentWeekDate(new Date())

  // Click on a specific task cell: opens modal filtered for THAT task
  const handleCellClick = (day: Date, row: TimesheetRowItem) => {
    setSelectedDay(day)
    setSelectedTaskFocus({
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      activityId: row.activityId,
      dataSourceId: row.dataSourceId,
      connectionInstanceId: row.connectionInstanceId,
    })
    setDayDetailsOpen(true)
  }

  // Click on the day column header: opens modal for that day with all tasks
  const handleDayHeaderClick = (day: Date) => {
    setSelectedDay(day)
    setSelectedTaskFocus(null)
    setDayDetailsOpen(true)
  }

  // Click on "+ Novo Apontamento" on the top of the timesheet: opens modal and adds a new entry
  const handleOpenAddEntry = () => {
    const today = new Date()
    const targetDay = weekDays.some((d) => isSameDay(d, today))
      ? today
      : weekDays[0]
    setSelectedDay(targetDay)
    setSelectedTaskFocus(null)
    handleAddNewEntry(targetDay)
    setDayDetailsOpen(true)
  }

  // Matrix rows calculation with daily entries breakdown
  const timesheetRows = React.useMemo(() => {
    const groupMap = new Map<
      string,
      {
        entries: SyncTimeEntryRxDBDTO[]
        title: string
        taskId?: string
        dataSourceId?: string
        connectionInstanceId?: string
        activityId?: string
      }
    >()

    timeEntries.forEach((entry) => {
      const dateStr = entry.startDate || entry.createdAt
      if (!dateStr) return
      const entryDate = parseISO(dateStr)

      // Only consider entries within the current week interval
      const isInCurrentWeek = weekDays.some((d) => isSameDay(d, entryDate))
      if (!isInCurrentWeek) return

      const isNoTask = hasNoTask(entry)
      const pureTaskId = isNoTask
        ? undefined
        : extractPureTaskId(entry.task?.id)
      const taskDoc = pureTaskId
        ? tasksById?.[pureTaskId] ||
          (entry.task?.id ? tasksById?.[entry.task.id] : undefined)
        : undefined

      const resolvedTitle = isNoTask
        ? entry.comments || 'Sem tarefa vinculada'
        : taskDoc?.title ||
          entry.taskData?.title ||
          (pureTaskId ? `#${pureTaskId}` : 'Tarefa')

      const groupKey = isNoTask
        ? `no-task-${entry.comments || 'geral'}`
        : `${pureTaskId || 'task'}-${resolvedTitle}`

      const resolvedConnectionId =
        entry.connectionInstanceId ||
        taskDoc?.connectionInstanceId ||
        entry.taskData?.connectionInstanceId

      const resolvedDataSourceId =
        entry.dataSourceId ||
        taskDoc?.dataSourceId ||
        entry.taskData?.dataSourceId

      const existing = groupMap.get(groupKey) || {
        entries: [] as SyncTimeEntryRxDBDTO[],
        title: resolvedTitle,
        taskId: isNoTask ? undefined : pureTaskId,
        dataSourceId: resolvedDataSourceId,
        connectionInstanceId: resolvedConnectionId,
        activityId: entry.activity?.id,
      }

      if (!existing.connectionInstanceId && resolvedConnectionId) {
        existing.connectionInstanceId = resolvedConnectionId
      }
      if (!existing.dataSourceId && resolvedDataSourceId) {
        existing.dataSourceId = resolvedDataSourceId
      }

      existing.entries.push(entry)
      groupMap.set(groupKey, existing)
    })

    const rows: TimesheetRowItem[] = []

    groupMap.forEach((val, key) => {
      const activity = activities.find((a) => a.id === val.activityId)
      const activityColor = activity?.colors?.background || '#3b82f6'
      const activityName = activity?.name || 'Geral'

      const dailyEntries = weekDays.map((day) => {
        return val.entries.filter((e) => {
          const d = e.startDate || e.createdAt
          return Boolean(d && isSameDay(parseISO(d), day))
        })
      })

      const dailyHours = dailyEntries.map((dayList) => {
        return dayList.reduce((acc, curr) => acc + (curr.timeSpent || 0), 0)
      })

      const totalHours = dailyHours.reduce((a, b) => a + b, 0)

      rows.push({
        key,
        taskTitle: val.title,
        taskId: val.taskId,
        dataSourceId: val.dataSourceId,
        connectionInstanceId: val.connectionInstanceId,
        activityId: val.activityId,
        activityName,
        activityColor,
        entries: val.entries,
        dailyEntries,
        dailyHours,
        totalHours,
      })
    })

    return rows.sort((a, b) => b.totalHours - a.totalHours)
  }, [timeEntries, weekDays, activities, tasksById])

  // Column totals
  const dailyColumnTotals = React.useMemo(() => {
    return weekDays.map((_, dayIndex) => {
      return timesheetRows.reduce(
        (acc, row) => acc + (row.dailyHours[dayIndex] || 0),
        0,
      )
    })
  }, [weekDays, timesheetRows])

  const totalWeekHours = React.useMemo(() => {
    return dailyColumnTotals.reduce((a, b) => a + b, 0)
  }, [dailyColumnTotals])

  const daysWithEntriesCount = React.useMemo(() => {
    return dailyColumnTotals.filter((h) => h > 0).length
  }, [dailyColumnTotals])

  const dailyAverageHours = React.useMemo(() => {
    return daysWithEntriesCount > 0 ? totalWeekHours / daysWithEntriesCount : 0
  }, [daysWithEntriesCount, totalWeekHours])

  const handleAcceptAllSuggestions = React.useCallback(
    async (suggestions: SuggestionRow[]) => {
      if (!db || suggestions.length === 0) return
      try {
        for (const sug of suggestions) {
          const doc = await db.timeEntries.findOne(sug.id).exec()
          if (doc) {
            const accepted = await requestEntryPersistence(bridge, db, {
              action: 'editRecord',
              entryId: doc.id,
              changes: { timeStatus: 'finished' },
            })
            if (accepted.isFailure()) {
              toast.error(accepted.failure.messageKey)
              return
            }
          }
        }
        toast.success(
          `${suggestions.length} sugestões confirmadas com sucesso!`,
        )
        await queryClient.invalidateQueries({
          queryKey: ['time-entries-range'],
        })
      } catch (err) {
        console.error('Erro ao aceitar todas sugestoes:', err)
        toast.error('Erro ao aceitar sugestões')
      }
    },
    [db, queryClient, bridge],
  )

  const handleDismissAllSuggestions = React.useCallback(
    async (suggestions: SuggestionRow[]) => {
      if (!db || suggestions.length === 0) return
      try {
        for (const sug of suggestions) {
          const doc = await db.timeEntries.findOne(sug.id).exec()
          if (doc) {
            const dismissed = await requestEntryPersistence(bridge, db, {
              action: 'deleteRecord',
              entryId: doc.id,
            })
            if (dismissed.isFailure()) {
              toast.error(dismissed.failure.messageKey)
              return
            }
          }
        }
        toast.info(`${suggestions.length} sugestões descartadas`)
        await queryClient.invalidateQueries({
          queryKey: ['time-entries-range'],
        })
      } catch (err) {
        console.error('Erro ao descartar todas sugestoes:', err)
        toast.error('Erro ao descartar sugestões')
      }
    },
    [db, queryClient, bridge],
  )

  const handlePauseTimer = React.useCallback(
    async (row: SuggestionRow) => {
      if (!db) return
      const doc = await db.timeEntries.findOne(row.id).exec()
      if (doc) {
        setActive(doc.toMutableJSON())
      } else if (activeTimeEntry?.id !== row.id) {
        setActive(row)
      }
      await pauseCurrentTimeEntry(db)
    },
    [db, activeTimeEntry, setActive, pauseCurrentTimeEntry],
  )

  const handleResumeTimer = React.useCallback(
    async (row: SuggestionRow) => {
      if (!db) return
      const doc = await db.timeEntries.findOne(row.id).exec()
      if (doc) {
        setActive(doc.toMutableJSON())
      } else if (activeTimeEntry?.id !== row.id) {
        setActive(row)
      }
      await playCurrentTimeEntry(db)
    },
    [db, activeTimeEntry, setActive, playCurrentTimeEntry],
  )

  const handleStopTimer = React.useCallback(
    async (row?: SuggestionRow) => {
      if (!db) return
      if (row) {
        const doc = await db.timeEntries.findOne(row.id).exec()
        if (doc) {
          setActive(doc.toMutableJSON())
        } else if (activeTimeEntry?.id !== row.id) {
          setActive(row)
        }
      }
      await stopCurrentTimeEntry(db)
    },
    [db, activeTimeEntry, setActive, stopCurrentTimeEntry],
  )

  // Filter entries in modal when focused on a specific task
  const modalEntries = React.useMemo(() => {
    if (!selectedTaskFocus) return timeEntries

    return timeEntries.filter((e) => {
      if (selectedTaskFocus.taskId) {
        return (
          extractPureTaskId(e.task?.id) === selectedTaskFocus.taskId ||
          e.task?.id === selectedTaskFocus.taskId
        )
      }
      const isNoTask = hasNoTask(e)
      return (
        isNoTask &&
        (e.comments === selectedTaskFocus.taskTitle ||
          (!e.comments &&
            selectedTaskFocus.taskTitle === 'Sem tarefa vinculada'))
      )
    })
  }, [timeEntries, selectedTaskFocus])

  const modalDraftEntries = React.useMemo(() => {
    if (!selectedTaskFocus) return draftEntries

    return draftEntries.filter((e) => {
      if (selectedTaskFocus.taskId) {
        return (
          extractPureTaskId(e.task?.id) === selectedTaskFocus.taskId ||
          e.task?.id === selectedTaskFocus.taskId
        )
      }
      const isNoTask = hasNoTask(e)
      return (
        isNoTask &&
        (e.comments === selectedTaskFocus.taskTitle ||
          (!e.comments &&
            selectedTaskFocus.taskTitle === 'Sem tarefa vinculada'))
      )
    })
  }, [draftEntries, selectedTaskFocus])

  // Custom add entry handler when in focused task mode
  const handleAddNewEntryInModal = React.useCallback(
    (day: Date) => {
      const parentTask = selectedTaskFocus?.taskId
        ? { id: selectedTaskFocus.taskId }
        : undefined
      handleAddNewEntry(day, parentTask)
    },
    [handleAddNewEntry, selectedTaskFocus],
  )

  const columnOptions = React.useMemo<CreateColumnsOptions>(() => {
    return {
      activities,
      tasksById,
      mappings,
      editingRows,
      getRowData,
      setEditingRows,
      setTempData,
      tempData,
      setRowBeingEdited,
      setTaskLookupOpen,
      onSaveRow: handleSaveRow,
      onDirectUpdateRow: handleDirectUpdateRow,
      onCancelEdit: handleCancelEdit,
      onDeleteRow: handleDeleteEntry,
      onDuplicateRow: handleDuplicateEntry,
      onAcceptSuggestion: handleAcceptSuggestion,
      onDismissSuggestion: handleDismissSuggestion,
      onTimeChangeDirect: handleDirectUpdateRow,
      onPauseTimer: handlePauseTimer,
      onResumeTimer: handleResumeTimer,
      onStopTimer: handleStopTimer,
      isGrouped: true,
      onAddNewEntry: handleAddNewEntryInModal,
      onResolveConflict: handleResolveConflict,
      onOpenConflict: handleOpenConflictResolution,
      onConfirmRetryAmbiguousCreation: handleConfirmRetryAmbiguousCreation,
      compact,
    }
  }, [
    activities,
    tasksById,
    mappings,
    editingRows,
    tempData,
    compact,
    getRowData,
    setEditingRows,
    setTempData,
    setRowBeingEdited,
    setTaskLookupOpen,
    handleSaveRow,
    handleDirectUpdateRow,
    handleCancelEdit,
    handleDeleteEntry,
    handleDuplicateEntry,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handlePauseTimer,
    handleResumeTimer,
    handleStopTimer,
    handleAddNewEntryInModal,
    handleResolveConflict,
    handleConfirmRetryAmbiguousCreation,
    handleOpenConflictResolution,
  ])
  const columns = React.useMemo(
    () => createTimeEntriesColumns(columnOptions),
    [columnOptions],
  )

  const handleRowDoubleClick = React.useCallback(
    (row: SuggestionRow) => {
      setEditingRows((prev) => ({
        ...prev,
        [row.id]: true,
      }))
    },
    [setEditingRows],
  )

  if (isLoading) return <TimeEntriesLoading />

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'flex h-full flex-col gap-5 px-6',
          compact && 'h-auto min-h-full gap-2 px-1 pb-2',
          className,
        )}
      >
        {/* Weekly Header Controls */}
        <div
          className={cn(
            'border-border/60 bg-card/60 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 shadow-xs backdrop-blur-sm',
            compact && 'gap-1.5 px-3 py-1.5',
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'bg-primary/10 text-primary flex size-9.5 items-center justify-center rounded-lg',
                compact && 'size-7',
              )}
            >
              <CalendarRange className={cn('size-5', compact && 'size-3.5')} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2
                  className={cn(
                    'text-foreground text-lg font-bold',
                    compact && 'text-sm font-bold',
                  )}
                >
                  Semana de{' '}
                  {format(weekDays[0], "dd 'de' MMM", { locale: ptBR })} a{' '}
                  {format(weekDays[6], "dd 'de' MMM, yyyy", { locale: ptBR })}
                </h2>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-mono text-xs',
                    compact && 'h-4 px-1.5 text-[10px]',
                  )}
                >
                  Semana {format(weekDays[0], 'w')}
                </Badge>
              </div>
              {!compact && (
                <p className="text-muted-foreground text-xs">
                  Matriz semanal consolidada de horas por tarefa e dia
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Total Week Badge */}
            <div
              className={cn(
                'border-border/60 bg-muted/40 text-foreground/90 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold',
                compact && 'px-2 py-1 text-xs',
              )}
            >
              <Clock
                className={cn('text-primary size-3.5', compact && 'size-3')}
              />
              <span>Total:</span>
              <span className="text-primary font-bold">
                {formatHours(totalWeekHours)}
              </span>
            </div>

            {/* Daily Average Badge */}
            {!compact && dailyAverageHours > 0 && (
              <div className="border-border/60 bg-muted/20 text-muted-foreground hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs md:flex">
                <Activity className="text-muted-foreground size-3" />
                <span>Média:</span>
                <span className="text-foreground font-semibold">
                  {formatHours(dailyAverageHours)}/dia
                </span>
              </div>
            )}

            {/* Active Days Badge */}
            {!compact && (
              <div className="border-border/60 bg-muted/20 text-muted-foreground hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs sm:flex">
                <CalendarCheck className="text-muted-foreground size-3" />
                <span>Dias ativos:</span>
                <span className="text-foreground font-semibold">
                  {daysWithEntriesCount}/7
                </span>
              </div>
            )}

            {/* Action: + Novo Apontamento */}
            <Button
              size="sm"
              className={cn(
                'h-8 gap-1.5 px-3 text-xs font-semibold shadow-xs',
                compact && 'h-7 gap-1 px-2.5 text-xs font-medium',
              )}
              onClick={handleOpenAddEntry}
            >
              <Plus className={cn('size-3.5', compact && 'size-3')} />
              <span>Novo Apontamento</span>
            </Button>

            {/* Week Navigator */}
            <div className="border-border/60 bg-muted/30 ml-1 flex items-center rounded-lg border p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-8 rounded-md', compact && 'size-7')}
                onClick={handlePrevWeek}
                title="Semana anterior"
              >
                <ChevronLeft className={cn('size-4', compact && 'size-3.5')} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 px-3 text-xs font-semibold',
                  compact && 'h-7 px-2.5 text-xs font-medium',
                )}
                onClick={handleCurrentWeek}
              >
                Esta Semana
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-8 rounded-md', compact && 'size-7')}
                onClick={handleNextWeek}
                title="Próxima semana"
              >
                <ChevronRight className={cn('size-4', compact && 'size-3.5')} />
              </Button>
            </div>
          </div>
        </div>

        {/* Consolidated Timesheet Matrix Table */}
        <div
          className={cn(
            'border-border/60 bg-card/40 flex-1 overflow-x-auto rounded-lg border shadow-xs',
            compact && 'flex-initial overflow-x-hidden',
          )}
        >
          <Table className={cn('table-fixed', compact && 'w-full')}>
            <TableHeader className="bg-muted/40 border-border/60 border-b">
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className={cn(
                    'text-muted-foreground w-[320px] min-w-[200px] pl-4 text-xs font-bold',
                    compact &&
                      'w-[210px] max-w-[210px] min-w-[210px] pl-2 text-xs',
                  )}
                >
                  Tarefa / Atividade
                </TableHead>
                {weekDays.map((day) => {
                  const isDayToday = isToday(day)
                  return (
                    <TableHead
                      key={day.toISOString()}
                      className={cn(
                        'text-muted-foreground w-[110px] text-center text-xs font-bold transition-colors',
                        compact && 'w-[72px]',
                        isDayToday &&
                          'bg-primary/10 text-primary font-extrabold',
                      )}
                    >
                      <div
                        className="hover:text-primary flex cursor-pointer flex-col items-center py-0.5 transition-colors"
                        onClick={() => handleDayHeaderClick(day)}
                        title="Ver apontamentos deste dia"
                      >
                        <span
                          className={cn(
                            'tracking-wider uppercase',
                            compact ? 'text-[10px]' : 'text-[10px]',
                          )}
                        >
                          {format(day, 'EEE', { locale: ptBR })}
                        </span>
                        <span
                          className={cn(
                            'font-mono',
                            compact ? 'text-[11px]' : 'text-xs',
                          )}
                        >
                          {format(day, 'dd/MM')}
                        </span>
                      </div>
                    </TableHead>
                  )
                })}
                <TableHead
                  className={cn(
                    'text-muted-foreground w-[130px] pr-4 text-center font-mono text-xs font-bold',
                    compact && 'w-[72px] pr-2 text-xs',
                  )}
                >
                  Total
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {timesheetRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground py-24 text-center text-xs"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="bg-muted/40 text-muted-foreground flex size-12 items-center justify-center rounded-full">
                        <Sparkles className="size-6 opacity-40" />
                      </div>
                      <div>
                        <p className="text-foreground text-sm font-semibold">
                          Nenhum apontamento nesta semana
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          Inicie um apontamento para visualizar a matriz
                          consolidada
                        </p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={handleOpenAddEntry}
                        >
                          <Plus className="size-3.5" />
                          <span>Adicionar Apontamento</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={handleCurrentWeek}
                        >
                          Ir para Esta Semana
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                timesheetRows.map((row) => {
                  return (
                    <TableRow
                      key={row.key}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      {/* Task Info Cell */}
                      <TableCell
                        className={cn(
                          'max-w-[320px] min-w-0 overflow-hidden py-3 pl-4 text-xs font-medium',
                          compact &&
                            'w-[210px] max-w-[210px] min-w-[210px] py-1 pl-2',
                        )}
                      >
                        <TimesheetTaskChip
                          row={row}
                          tasksById={tasksById}
                          mappings={mappings}
                          compact={compact}
                        />
                      </TableCell>

                      {/* Day Cells with Hover Affordance, Pencil Icon and Click to Edit only this task */}
                      {row.dailyHours.map((hours, dIdx) => {
                        const day = weekDays[dIdx]
                        const isDayToday = isToday(day)
                        const entriesForDay = row.dailyEntries[dIdx]

                        return (
                          <TableCell
                            key={dIdx}
                            onClick={() => handleCellClick(day, row)}
                            className={cn(
                              'group relative cursor-pointer px-1 py-2 text-center font-mono text-xs transition-all',
                              compact && 'px-0.5 py-1',
                              isDayToday && 'bg-primary/5',
                              'hover:bg-primary/10 hover:shadow-inner',
                            )}
                            title={`Editar apontamentos de "${row.taskTitle}" neste dia`}
                          >
                            <div
                              className={cn(
                                'relative flex min-h-[38px] items-center justify-center rounded-md px-1.5 py-1',
                                compact && 'min-h-[28px] px-1 py-0.5',
                              )}
                            >
                              {/* Hover Pencil Action in Top-Right Corner */}
                              <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <div className="bg-background/90 text-foreground border-border/60 rounded border p-0.5 shadow-xs">
                                  {hours > 0 ? (
                                    <Pencil className="text-primary size-2.5" />
                                  ) : (
                                    <Plus className="text-muted-foreground size-2.5" />
                                  )}
                                </div>
                              </div>

                              {hours > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className={cn(
                                        'bg-muted/70 group-hover:bg-primary/20 text-foreground group-hover:text-primary border-border/40 group-hover:border-primary/40 inline-flex items-center justify-center rounded border px-2.5 py-1 font-bold shadow-xs transition-colors',
                                        compact && 'px-1.5 py-0.5 text-[11px]',
                                      )}
                                    >
                                      {formatHours(hours)}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="max-w-xs space-y-1.5 p-2.5 text-xs"
                                  >
                                    <div className="text-foreground flex items-center justify-between border-b pb-1 font-bold">
                                      <span>
                                        {format(day, 'EEEE, dd/MM', {
                                          locale: ptBR,
                                        })}
                                      </span>
                                      <span className="text-primary font-mono">
                                        {formatHours(hours)}
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      {entriesForDay.map((e) => (
                                        <div
                                          key={e.id}
                                          className="text-muted-foreground flex items-start gap-1 text-[11px]"
                                        >
                                          <span className="text-primary shrink-0 font-mono">
                                            {formatHours(e.timeSpent || 0)}:
                                          </span>
                                          <span className="truncate">
                                            {e.comments ||
                                              'Apontamento de horas'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="text-primary border-t pt-1 text-center text-[10px] font-semibold">
                                      Clique para editar esta tarefa
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground/30 group-hover:text-foreground/60 font-medium transition-colors">
                                  -
                                </span>
                              )}
                            </div>
                          </TableCell>
                        )
                      })}

                      {/* Row Total */}
                      <TableCell
                        className={cn(
                          'text-primary bg-primary/5 py-3 pr-4 text-center font-mono text-xs font-bold',
                          compact && 'py-1 pr-2 text-xs',
                        )}
                      >
                        <span
                          className={cn(
                            'bg-primary/10 rounded px-2.5 py-1 font-extrabold',
                            compact && 'px-1.5 py-0.5 text-[11px]',
                          )}
                        >
                          {formatHours(row.totalHours)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}

              {/* Total Footer Row */}
              {timesheetRows.length > 0 && (
                <TableRow className="bg-muted/50 border-border/80 border-t-2 font-bold">
                  <TableCell
                    className={cn(
                      'text-muted-foreground py-3.5 pl-4 text-xs font-bold tracking-wider uppercase',
                      compact && 'py-1.5 pl-2 text-[10px]',
                    )}
                  >
                    Total do Dia
                  </TableCell>
                  {dailyColumnTotals.map((colHours, idx) => (
                    <TableCell
                      key={idx}
                      className={cn(
                        'py-3.5 text-center font-mono text-xs font-bold',
                        compact && 'py-1.5 text-xs',
                        colHours > 0
                          ? 'font-extrabold text-emerald-500'
                          : 'text-muted-foreground/40',
                      )}
                    >
                      {colHours > 0 ? (
                        <span
                          className={cn(
                            'rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5',
                            compact && 'px-1.5 py-0.5 text-[10px]',
                          )}
                        >
                          {formatHours(colHours)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  ))}
                  <TableCell
                    className={cn(
                      'text-primary bg-primary/10 py-3.5 pr-4 text-center font-mono text-xs font-extrabold',
                      compact && 'py-1.5 pr-2',
                    )}
                  >
                    <span
                      className={cn(
                        'bg-primary text-primary-foreground rounded px-2.5 py-1 shadow-xs',
                        compact && 'px-2 py-0.5 text-[11px]',
                      )}
                    >
                      {formatHours(totalWeekHours)}
                    </span>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Selected Day / Task Details Dialog */}
        <Dialog open={dayDetailsOpen} onOpenChange={setDayDetailsOpen}>
          <DialogContent className="flex max-h-[90vh] w-[94vw] max-w-6xl flex-col overflow-hidden rounded-lg p-6 sm:max-w-6xl">
            <DialogHeader className="shrink-0 border-b pr-10 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                    {selectedTaskFocus ? (
                      <div className="flex items-center gap-2 truncate">
                        {selectedTaskFocus.taskId && (
                          <span className="text-primary bg-primary/10 shrink-0 rounded px-2 py-0.5 font-mono text-sm font-bold">
                            #{cleanTaskId(selectedTaskFocus.taskId)}
                          </span>
                        )}
                        {selectedTaskFocus.taskTitle &&
                          selectedTaskFocus.taskTitle !==
                            selectedTaskFocus.taskId &&
                          selectedTaskFocus.taskTitle !==
                            `#${selectedTaskFocus.taskId}` && (
                            <span className="truncate">
                              {selectedTaskFocus.taskTitle}
                            </span>
                          )}
                      </div>
                    ) : (
                      <span>Apontamentos</span>
                    )}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs">
                    {selectedDay && (
                      <span className="text-foreground/85 font-semibold capitalize">
                        {format(selectedDay, "EEEE, dd 'de' MMMM 'de' yyyy", {
                          locale: ptBR,
                        })}
                      </span>
                    )}
                    {selectedTaskFocus
                      ? ' • Exibindo somente apontamentos desta tarefa'
                      : ' • Gerencie, edite ou adicione apontamentos'}
                  </DialogDescription>
                </div>

                {/* Day Switcher Bar (Seg a Dom) */}
                {selectedDay && (
                  <div className="border-border/60 bg-muted/40 flex items-center gap-1 rounded-lg border p-1">
                    {weekDays.map((day) => {
                      const isSelected = isSameDay(day, selectedDay)
                      const isDayToday = isToday(day)
                      return (
                        <Button
                          key={day.toISOString()}
                          variant={isSelected ? 'default' : 'ghost'}
                          size="sm"
                          className={cn(
                            'h-7 rounded-md px-2 text-xs font-semibold transition-all',
                            isSelected && 'font-bold shadow-xs',
                            !isSelected &&
                              isDayToday &&
                              'text-primary bg-primary/5 font-bold',
                          )}
                          onClick={() => setSelectedDay(day)}
                          title={format(day, 'EEEE, dd/MM', { locale: ptBR })}
                        >
                          <span className="capitalize">
                            {format(day, 'EEE', { locale: ptBR })}
                          </span>
                          <span className="ml-1 font-mono text-[10px] opacity-80">
                            {format(day, 'dd')}
                          </span>
                        </Button>
                      )
                    })}
                  </div>
                )}
              </div>
            </DialogHeader>

            <ScrollArea className="mt-3 flex-1 overflow-y-auto pr-2">
              {selectedDay && (
                <div className="py-2">
                  <TimeEntriesColumnsProvider value={columnOptions}>
                    <TimeEntriesDayCard
                      day={selectedDay}
                      entries={modalEntries}
                      draftEntries={modalDraftEntries}
                      tempData={tempData}
                      columns={columns}
                      expandedRows={expandedRows}
                      onExpandedChange={setExpandedRows}
                      isGrouped={true}
                      onAcceptAllSuggestions={handleAcceptAllSuggestions}
                      onDismissAllSuggestions={handleDismissAllSuggestions}
                      onAddNewEntry={handleAddNewEntryInModal}
                      onRowDoubleClick={handleRowDoubleClick}
                    />
                  </TimeEntriesColumnsProvider>
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Task Lookup Modal Integration */}
        {rowBeingEdited && (
          <TaskLookup
            open={taskLookupOpen}
            onOpenChange={(open) => {
              setTaskLookupOpen(open)
              if (!open) setRowBeingEdited(null)
            }}
            onSelect={(task: SyncTaskRxDBDTO) => {
              setTempData((prev) => ({
                ...prev,
                [rowBeingEdited]: {
                  ...prev[rowBeingEdited],
                  task: { id: task.id },
                  taskData: task,
                  connectionInstanceId: task.connectionInstanceId,
                  dataSourceId: task.dataSourceId,
                },
              }))
              setTaskLookupOpen(false)
              setRowBeingEdited(null)
            }}
          />
        )}
      </div>
    </TooltipProvider>
  )
}
