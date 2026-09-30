import { useQueryClient } from '@tanstack/react-query'
import { ExpandedState } from '@tanstack/react-table'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { TaskLookup } from '@/components/task-lookup'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useFieldMappings } from '@/hooks/use-field-mappings'
import { cn } from '@/lib/utils'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { TimeEntriesDayCard } from '@/pages/time-entries/components/time-entries-day-card'
import { createTimeEntriesColumns } from '@/pages/time-entries/components/time-entries-table-columns'
import { useTimeEntriesData } from '@/pages/time-entries/hooks/use-time-entries-data'
import { useTimeEntryMutations } from '@/pages/time-entries/hooks/use-time-entry-mutations'
import {
  cleanTaskId,
  extractPureTaskId,
  formatHours,
  hasNoTask,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export interface TimeEntriesCalendarViewProps {
  className?: string
  compact?: boolean
}

export function TimeEntriesCalendarView({
  className,
  compact = false,
}: TimeEntriesCalendarViewProps = {}) {
  const queryClient = useQueryClient()
  const { mappings } = useFieldMappings()
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => new Date())

  // Calculate days matrix for the visible calendar
  const calendarDays = React.useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

    return eachDayOfInterval({ start: startDate, end: endDate })
  }, [currentMonth])

  const calendarRange = React.useMemo(() => {
    return {
      from: calendarDays[0],
      to: calendarDays[calendarDays.length - 1],
    }
  }, [calendarDays])

  const {
    db,
    memberIdsByConnection,
    timeEntries,
    activities,
    tasksById,
    activeTimeEntry,
    setActive,
    pauseCurrentTimeEntry,
    playCurrentTimeEntry,
    stopCurrentTimeEntry,
  } = useTimeEntriesData({
    from: calendarRange.from,
    to: calendarRange.to,
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
    handleOpenConflictResolution,
  } = useTimeEntryMutations(db, memberIdsByConnection)

  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null)
  const [dayDetailsOpen, setDayDetailsOpen] = React.useState(false)
  const [expandedRows, setExpandedRows] = React.useState<ExpandedState>({})

  // Group entries by date string (yyyy-MM-dd)
  const entriesByDate = React.useMemo(() => {
    const map = new Map<string, SyncTimeEntryRxDBDTO[]>()

    timeEntries.forEach((entry) => {
      const dateStr = entry.startDate || entry.createdAt
      if (!dateStr) return
      const dateKey = format(parseISO(dateStr), 'yyyy-MM-dd')
      const list = map.get(dateKey) || []
      list.push(entry)
      map.set(dateKey, list)
    })

    return map
  }, [timeEntries])

  // Calculate total monthly hours
  const totalMonthHours = React.useMemo(() => {
    let total = 0
    timeEntries.forEach((entry) => {
      const dateStr = entry.startDate || entry.createdAt
      if (!dateStr) return
      const entryDate = parseISO(dateStr)
      if (isSameMonth(entryDate, currentMonth)) {
        total += entry.timeSpent || 0
      }
    })
    return total
  }, [timeEntries, currentMonth])

  const handlePrevMonth = () => setCurrentMonth((prev) => subMonths(prev, 1))
  const handleNextMonth = () => setCurrentMonth((prev) => addMonths(prev, 1))
  const handleToday = () => setCurrentMonth(new Date())

  const handleDayClick = (day: Date) => {
    setSelectedDay(day)
    setDayDetailsOpen(true)
  }

  const handleAcceptAllSuggestions = React.useCallback(
    async (suggestions: SuggestionRow[]) => {
      if (!db || suggestions.length === 0) return
      try {
        for (const sug of suggestions) {
          const doc = await db.timeEntries.findOne(sug.id).exec()
          if (doc) {
            await doc.patch({
              timeStatus: 'finished',
              updatedAt: new Date().toISOString(),
            })
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
    [db, queryClient],
  )

  const handleDismissAllSuggestions = React.useCallback(
    async (suggestions: SuggestionRow[]) => {
      if (!db || suggestions.length === 0) return
      try {
        for (const sug of suggestions) {
          const doc = await db.timeEntries.findOne(sug.id).exec()
          if (doc) {
            await doc.remove()
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
    [db, queryClient],
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

  const columns = React.useMemo(() => {
    return createTimeEntriesColumns({
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
      onAddNewEntry: handleAddNewEntry,
      onResolveConflict: handleResolveConflict,
      onOpenConflict: handleOpenConflictResolution,
      compact,
    })
  }, [
    activities,
    tasksById,
    mappings,
    editingRows,
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
    handleAddNewEntry,
    handleResolveConflict,
    handleOpenConflictResolution,
  ])

  const handleRowDoubleClick = React.useCallback(
    (row: SuggestionRow) => {
      setEditingRows((prev) => ({
        ...prev,
        [row.id]: true,
      }))
    },
    [setEditingRows],
  )

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'flex h-full flex-col gap-5 px-6',
          compact && 'h-auto min-h-full gap-2 px-1 pb-2',
          className,
        )}
      >
        {/* Calendar Header Controls */}
        <div
          className={cn(
            'border-border/60 bg-card/60 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 backdrop-blur-sm',
            compact && 'gap-1.5 px-3 py-1.5',
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg',
                compact && 'size-7',
              )}
            >
              <CalendarIcon className={cn('size-4.5', compact && 'size-3.5')} />
            </div>
            <div>
              <h2
                className={cn(
                  'text-foreground text-lg font-bold capitalize',
                  compact && 'text-sm font-bold',
                )}
              >
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </h2>
              {!compact && (
                <p className="text-muted-foreground text-xs">
                  Visão mensal de horas e distribuição diária
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Total Month Hours Badge */}
            <div
              className={cn(
                'border-border/60 bg-muted/40 text-foreground/80 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold',
                compact && 'px-2 py-1 text-xs',
              )}
            >
              <Clock
                className={cn('text-primary size-3.5', compact && 'size-3')}
              />
              <span>Total:</span>
              <span className="text-primary font-bold">
                {formatHours(totalMonthHours)}
              </span>
            </div>

            {/* Month Navigation */}
            <div className="border-border/60 bg-muted/30 flex items-center rounded-lg border p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-8 rounded-md', compact && 'size-7')}
                onClick={handlePrevMonth}
                title="Mês anterior"
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
                onClick={handleToday}
              >
                Hoje
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-8 rounded-md', compact && 'size-7')}
                onClick={handleNextMonth}
                title="Próximo mês"
              >
                <ChevronRight className={cn('size-4', compact && 'size-3.5')} />
              </Button>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div
          className={cn(
            'border-border/60 bg-card/40 flex-1 overflow-hidden rounded-lg border shadow-xs',
            compact && 'flex-initial',
          )}
        >
          {/* Weekday headers */}
          <div
            className={cn(
              'border-border/60 bg-muted/40 text-muted-foreground grid grid-cols-7 border-b text-center text-xs font-bold',
              compact && 'py-1 text-[11px] font-semibold',
            )}
          >
            {WEEK_DAYS.map((day) => (
              <div
                key={day}
                className={cn(
                  'py-2.5 tracking-wider uppercase',
                  compact && 'py-0.5 tracking-normal',
                )}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Cells */}
          <div
            className={cn(
              'divide-border/40 grid min-h-[580px] auto-rows-fr grid-cols-7 divide-x divide-y',
              compact && 'min-h-[420px]',
            )}
          >
            {calendarDays.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd')
              const dayEntries = entriesByDate.get(dayKey) || []
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isDayToday = isToday(day)

              const dayHours = dayEntries.reduce(
                (acc, curr) => acc + (curr.timeSpent || 0),
                0,
              )

              const maxVisibleEntries = compact ? 2 : 3
              const visibleEntries = dayEntries.slice(0, maxVisibleEntries)
              const remainingCount = dayEntries.length - visibleEntries.length

              return (
                <div
                  key={dayKey}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    'group relative flex min-h-[105px] cursor-pointer flex-col p-2 transition-all select-none',
                    compact && 'min-h-[72px] p-1.5',
                    isCurrentMonth ? 'bg-card/20' : 'bg-muted/10 opacity-40',
                    isDayToday && 'bg-primary/5 ring-primary/30 inset-0 ring-1',
                    'hover:bg-muted/40 hover:border-primary/40',
                  )}
                  title={`Ver apontamentos de ${format(day, "dd 'de' MMMM", { locale: ptBR })}`}
                >
                  {/* Top Day Header */}
                  <div
                    className={cn(
                      'mb-1 flex items-center justify-between',
                      compact && 'mb-1',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full font-mono text-xs font-bold',
                        compact && 'size-5 text-[11px]',
                        isDayToday
                          ? 'bg-primary text-primary-foreground font-extrabold shadow-sm'
                          : isCurrentMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground/60',
                      )}
                    >
                      {format(day, 'd')}
                    </span>

                    {dayHours > 0 && (
                      <span
                        className={cn(
                          'rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-500 shadow-xs',
                          compact && 'px-1.5 py-0.5 text-[10px]',
                        )}
                      >
                        {formatHours(dayHours)}
                      </span>
                    )}
                  </div>

                  {/* Day Entry Chips */}
                  <div
                    className={cn(
                      'no-scrollbar flex flex-1 flex-col gap-1 overflow-hidden',
                      compact && 'gap-1',
                    )}
                  >
                    {visibleEntries.map((entry) => {
                      const activity = activities.find(
                        (a) => a.id === entry.activity?.id,
                      )
                      const activityColor =
                        activity?.colors?.background || '#3b82f6'
                      const isNoTask = hasNoTask(entry)
                      const pureTaskId = isNoTask
                        ? undefined
                        : extractPureTaskId(entry.task?.id)
                      const taskDoc = pureTaskId
                        ? tasksById?.[pureTaskId] ||
                          (entry.task?.id
                            ? tasksById?.[entry.task.id]
                            : undefined)
                        : undefined
                      const cleanId = pureTaskId
                        ? cleanTaskId(pureTaskId)
                        : undefined
                      const rawTitle = taskDoc?.title || entry.taskData?.title

                      let displayLabel = 'Apontamento'
                      if (isNoTask) {
                        displayLabel = entry.comments || 'Sem tarefa'
                      }
                      if (
                        !isNoTask &&
                        cleanId &&
                        rawTitle &&
                        rawTitle !== cleanId
                      ) {
                        displayLabel = `#${cleanId} ${rawTitle}`
                      }
                      if (
                        !isNoTask &&
                        cleanId &&
                        (!rawTitle || rawTitle === cleanId)
                      ) {
                        displayLabel = `#${cleanId}`
                      }
                      if (!isNoTask && !cleanId && rawTitle) {
                        displayLabel = rawTitle
                      }

                      return (
                        <Tooltip key={entry.id}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                'bg-muted/60 hover:bg-muted border-border/40 flex items-center gap-1.5 truncate rounded border px-1.5 py-0.5 text-xs transition-colors',
                                compact && 'gap-1 px-1 py-0.5 text-[10px]',
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDayClick(day)
                              }}
                            >
                              <span
                                className={cn(
                                  'size-1.5 shrink-0 rounded-full',
                                  compact && 'size-1.5',
                                )}
                                style={{ backgroundColor: activityColor }}
                              />
                              <span className="text-foreground/90 min-w-0 flex-1 truncate font-medium">
                                {displayLabel}
                              </span>
                              <span
                                className={cn(
                                  'text-muted-foreground shrink-0 font-mono text-[10px] font-semibold',
                                  compact && 'text-[9px]',
                                )}
                              >
                                {formatHours(entry.timeSpent || 0)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-xs space-y-1 p-2 text-xs"
                          >
                            <p className="font-bold">{displayLabel}</p>
                            {entry.comments && (
                              <p className="text-muted-foreground text-[11px]">
                                {entry.comments}
                              </p>
                            )}
                            <div className="text-primary flex items-center gap-2 font-mono text-[10px]">
                              <span>{formatHours(entry.timeSpent || 0)}</span>
                              {activity && <span>&bull; {activity.name}</span>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}

                    {remainingCount > 0 && (
                      <span
                        className={cn(
                          'text-muted-foreground/80 pl-1 font-mono text-[10px] font-semibold',
                          compact && 'pl-0.5 text-[9px]',
                        )}
                      >
                        +{remainingCount} mais
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected Day Details Dialog with Full Day Card Table */}
        <Dialog open={dayDetailsOpen} onOpenChange={setDayDetailsOpen}>
          <DialogContent className="flex max-h-[90vh] w-[94vw] max-w-6xl flex-col overflow-hidden rounded-lg p-6 sm:max-w-6xl">
            <DialogHeader className="shrink-0 border-b pr-10 pb-3">
              <DialogTitle className="text-lg font-bold">
                {selectedDay
                  ? format(selectedDay, "EEEE, dd 'de' MMMM 'de' yyyy", {
                      locale: ptBR,
                    })
                  : 'Apontamentos do Dia'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Gerencie, edite ou adicione apontamentos com todas as ações do
                modo lista
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="mt-3 flex-1 overflow-y-auto pr-2">
              {selectedDay && (
                <div className="py-2">
                  <TimeEntriesDayCard
                    day={selectedDay}
                    entries={timeEntries}
                    draftEntries={draftEntries}
                    tempData={tempData}
                    columns={columns}
                    expandedRows={expandedRows}
                    onExpandedChange={setExpandedRows}
                    isGrouped={true}
                    onAcceptAllSuggestions={handleAcceptAllSuggestions}
                    onDismissAllSuggestions={handleDismissAllSuggestions}
                    onAddNewEntry={handleAddNewEntry}
                    onRowDoubleClick={handleRowDoubleClick}
                  />
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
