'use client'

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
import { cn } from '@/lib/utils'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { TimeEntriesDayCard } from '@/pages/time-entries/components/time-entries-day-card'
import { createTimeEntriesColumns } from '@/pages/time-entries/components/time-entries-table-columns'
import { useTimeEntriesData } from '@/pages/time-entries/hooks/use-time-entries-data'
import { useTimeEntryMutations } from '@/pages/time-entries/hooks/use-time-entry-mutations'
import {
  formatHours,
  hasNoTask,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export function TimeEntriesCalendarView() {
  const queryClient = useQueryClient()
  const {
    db,
    memberIdsByConnection,
    timeEntries,
    activities,
    activeTimeEntry,
    setActive,
    pauseCurrentTimeEntry,
    playCurrentTimeEntry,
    stopCurrentTimeEntry,
  } = useTimeEntriesData()

  const {
    draftEntries,
    editingRows,
    setEditingRows,
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
    handleStartDuplicate,
    handleAddNewEntry,
    handleAcceptSuggestion,
    handleDismissSuggestion,
  } = useTimeEntryMutations(db, memberIdsByConnection)

  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => new Date())
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null)
  const [dayDetailsOpen, setDayDetailsOpen] = React.useState(false)
  const [expandedRows, setExpandedRows] = React.useState<ExpandedState>({})

  // Calculate days matrix for the visible calendar
  const calendarDays = React.useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

    return eachDayOfInterval({ start: startDate, end: endDate })
  }, [currentMonth])

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

  const handleTimeChangeDirect = React.useCallback(
    async (id: string, updates: Partial<SyncTimeEntryRxDBDTO>) => {
      if (!db) return
      try {
        const doc = await db.timeEntries.findOne(id).exec()
        if (doc) {
          await doc.patch({
            ...updates,
            updatedAt: new Date().toISOString(),
          })
          queryClient.invalidateQueries({ queryKey: ['time-entries-range'] })
          toast.success('Tempo atualizado')
        }
      } catch {
        toast.error('Erro ao atualizar tempo')
      }
    },
    [db, queryClient],
  )

  const handleAcceptAllSuggestions = React.useCallback(
    async (suggestions: SuggestionRow[]) => {
      if (!db || suggestions.length === 0) return
      try {
        for (const sug of suggestions) {
          const docId = sug._id || sug.id
          let doc = await db.timeEntries.findOne(docId).exec()
          if (!doc) {
            doc = await db.timeEntries
              .findOne({
                selector: {
                  $or: [
                    { id: sug.id },
                    { _id: sug._id },
                    { id: sug._id },
                    { _id: sug.id },
                  ],
                },
              })
              .exec()
          }
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
          const docId = sug._id || sug.id
          let doc = await db.timeEntries.findOne(docId).exec()
          if (!doc) {
            doc = await db.timeEntries
              .findOne({
                selector: {
                  $or: [
                    { id: sug.id },
                    { _id: sug._id },
                    { id: sug._id },
                    { _id: sug.id },
                  ],
                },
              })
              .exec()
          }
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
      const rowKey = row._id || row.id
      let doc = await db.timeEntries.findOne(rowKey).exec()
      if (!doc) {
        doc = await db.timeEntries
          .findOne({
            selector: {
              $or: [
                { id: rowKey },
                { _id: rowKey },
                { id: row.id },
                { _id: row._id },
              ],
            },
          })
          .exec()
      }
      if (doc) {
        setActive(doc.toMutableJSON())
      } else if (
        activeTimeEntry?._id !== rowKey &&
        activeTimeEntry?.id !== rowKey
      ) {
        setActive(row)
      }
      await pauseCurrentTimeEntry(db)
    },
    [db, activeTimeEntry, setActive, pauseCurrentTimeEntry],
  )

  const handleResumeTimer = React.useCallback(
    async (row: SuggestionRow) => {
      if (!db) return
      const rowKey = row._id || row.id
      let doc = await db.timeEntries.findOne(rowKey).exec()
      if (!doc) {
        doc = await db.timeEntries
          .findOne({
            selector: {
              $or: [
                { id: rowKey },
                { _id: rowKey },
                { id: row.id },
                { _id: row._id },
              ],
            },
          })
          .exec()
      }
      if (doc) {
        setActive(doc.toMutableJSON())
      } else if (
        activeTimeEntry?._id !== rowKey &&
        activeTimeEntry?.id !== rowKey
      ) {
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
        const rowKey = row._id || row.id
        let doc = await db.timeEntries.findOne(rowKey).exec()
        if (!doc) {
          doc = await db.timeEntries
            .findOne({
              selector: {
                $or: [
                  { id: rowKey },
                  { _id: rowKey },
                  { id: row.id },
                  { _id: row._id },
                ],
              },
            })
            .exec()
        }
        if (doc) {
          setActive(doc.toMutableJSON())
        } else if (
          activeTimeEntry?._id !== rowKey &&
          activeTimeEntry?.id !== rowKey
        ) {
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
      editingRows,
      getRowData,
      setEditingRows,
      setTempData,
      setRowBeingEdited,
      setTaskLookupOpen,
      onSaveRow: handleSaveRow,
      onDirectUpdateRow: handleDirectUpdateRow,
      onCancelEdit: handleCancelEdit,
      onDeleteRow: handleDeleteEntry,
      onDuplicateRow: handleStartDuplicate,
      onAcceptSuggestion: handleAcceptSuggestion,
      onDismissSuggestion: handleDismissSuggestion,
      onTimeChangeDirect: handleTimeChangeDirect,
      onPauseTimer: handlePauseTimer,
      onResumeTimer: handleResumeTimer,
      onStopTimer: handleStopTimer,
      isGrouped: true,
      onAddNewEntry: handleAddNewEntry,
    })
  }, [
    activities,
    editingRows,
    getRowData,
    setEditingRows,
    setTempData,
    setRowBeingEdited,
    setTaskLookupOpen,
    handleSaveRow,
    handleDirectUpdateRow,
    handleCancelEdit,
    handleDeleteEntry,
    handleStartDuplicate,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleTimeChangeDirect,
    handlePauseTimer,
    handleResumeTimer,
    handleStopTimer,
    handleAddNewEntry,
  ])

  const handleRowDoubleClick = React.useCallback(
    (row: SuggestionRow) => {
      const key = row._id || row.id
      setEditingRows((prev) => ({
        ...prev,
        [key]: true,
      }))
    },
    [setEditingRows],
  )

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col gap-5 px-6">
        {/* Calendar Header Controls */}
        <div className="border-border/60 bg-card/60 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <CalendarIcon className="size-4.5" />
            </div>
            <div>
              <h2 className="text-foreground text-lg font-bold capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </h2>
              <p className="text-muted-foreground text-xs">
                Visão mensal de horas e distribuição diária
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Total Month Hours Badge */}
            <div className="border-border/60 bg-muted/40 text-foreground/80 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold">
              <Clock className="text-primary size-3.5" />
              <span>Total no mês:</span>
              <span className="text-primary font-bold">
                {formatHours(totalMonthHours)}
              </span>
            </div>

            {/* Month Navigation */}
            <div className="border-border/60 bg-muted/30 flex items-center rounded-lg border p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-md"
                onClick={handlePrevMonth}
                title="Mês anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs font-semibold"
                onClick={handleToday}
              >
                Hoje
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-md"
                onClick={handleNextMonth}
                title="Próximo mês"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="border-border/60 bg-card/40 flex-1 overflow-hidden rounded-lg border shadow-xs">
          {/* Weekday headers */}
          <div className="border-border/60 bg-muted/40 text-muted-foreground grid grid-cols-7 border-b text-center text-xs font-bold">
            {WEEK_DAYS.map((day) => (
              <div key={day} className="py-2.5 tracking-wider uppercase">
                {day}
              </div>
            ))}
          </div>

          {/* Days Cells */}
          <div className="divide-border/40 grid min-h-[580px] auto-rows-fr grid-cols-7 divide-x divide-y">
            {calendarDays.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd')
              const dayEntries = entriesByDate.get(dayKey) || []
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isDayToday = isToday(day)

              const dayHours = dayEntries.reduce(
                (acc, curr) => acc + (curr.timeSpent || 0),
                0,
              )

              return (
                <div
                  key={dayKey}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    'group relative flex min-h-[105px] cursor-pointer flex-col p-2 transition-colors',
                    isCurrentMonth ? 'bg-card/20' : 'bg-muted/10 opacity-40',
                    isDayToday && 'bg-primary/5 ring-primary/30 inset-0 ring-1',
                    'hover:bg-muted/40',
                  )}
                >
                  {/* Top Day Header */}
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full font-mono text-xs font-bold',
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
                      <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-500">
                        {formatHours(dayHours)}
                      </span>
                    )}
                  </div>

                  {/* Day Entry Chips */}
                  <div className="no-scrollbar flex max-h-[85px] flex-col gap-1 overflow-y-auto">
                    {dayEntries.slice(0, 3).map((entry) => {
                      const activity = activities.find(
                        (a) => a.id === entry.activity?.id,
                      )
                      const activityColor =
                        activity?.colors?.background || '#3b82f6'
                      const isNoTask = hasNoTask(entry)
                      const title = isNoTask
                        ? entry.comments || 'Sem tarefa'
                        : entry.taskData?.title || entry.task?.id || 'Tarefa'

                      return (
                        <Tooltip key={entry._id || entry.id}>
                          <TooltipTrigger asChild>
                            <div
                              className="bg-muted/60 hover:bg-muted border-border/40 flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[11px] transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDayClick(day)
                              }}
                            >
                              <span
                                className="size-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: activityColor }}
                              />
                              <span className="text-foreground/90 truncate font-medium">
                                {title}
                              </span>
                              <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[10px]">
                                {formatHours(entry.timeSpent || 0)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-xs text-xs"
                          >
                            <p className="font-bold">{title}</p>
                            {entry.comments && (
                              <p className="text-muted-foreground mt-0.5 text-[11px]">
                                {entry.comments}
                              </p>
                            )}
                            <div className="text-primary mt-1 flex items-center gap-2 font-mono text-[10px]">
                              <span>{formatHours(entry.timeSpent || 0)}</span>
                              {activity && <span>&bull; {activity.name}</span>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}

                    {dayEntries.length > 3 && (
                      <span className="text-muted-foreground/70 pl-1 font-mono text-[10px] font-semibold">
                        +{dayEntries.length - 3} mais
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
