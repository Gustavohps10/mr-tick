'use client'

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

interface TimesheetRowItem {
  key: string
  taskTitle: string
  taskId?: string
  dataSourceId?: string
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
}

export function TimeEntriesTimesheetView() {
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

  const [currentWeekDate, setCurrentWeekDate] = React.useState<Date>(
    () => new Date(),
  )
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null)
  const [selectedTaskFocus, setSelectedTaskFocus] =
    React.useState<SelectedTaskFocus | null>(null)
  const [dayDetailsOpen, setDayDetailsOpen] = React.useState(false)
  const [expandedRows, setExpandedRows] = React.useState<ExpandedState>({})

  // 7 days interval of the active week (Segunda a Domingo)
  const weekDays = React.useMemo(() => {
    const start = startOfWeek(currentWeekDate, { weekStartsOn: 1 })
    const end = endOfWeek(start, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentWeekDate])

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
      const groupKey = isNoTask
        ? `no-task-${entry.comments || 'geral'}`
        : `${entry.task?.id || 'task'}-${entry.taskData?.title || ''}`

      const existing = groupMap.get(groupKey) || {
        entries: [] as SyncTimeEntryRxDBDTO[],
        title: isNoTask
          ? entry.comments || 'Sem tarefa vinculada'
          : entry.taskData?.title || entry.task?.id || 'Tarefa',
        taskId: isNoTask ? undefined : entry.task?.id,
        dataSourceId: entry.dataSourceId,
        activityId: entry.activity?.id,
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
  }, [timeEntries, weekDays, activities])

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

  // Filter entries in modal when focused on a specific task
  const modalEntries = React.useMemo(() => {
    if (!selectedTaskFocus) return timeEntries

    return timeEntries.filter((e) => {
      if (selectedTaskFocus.taskId) {
        return e.task?.id === selectedTaskFocus.taskId
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
        return e.task?.id === selectedTaskFocus.taskId
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
      onAddNewEntry: handleAddNewEntryInModal,
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
    handleAddNewEntryInModal,
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
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col gap-5 px-6">
        {/* Weekly Header Controls */}
        <div className="border-border/60 bg-card/60 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 shadow-xs backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-9.5 items-center justify-center rounded-lg">
              <CalendarRange className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-foreground text-lg font-bold">
                  Semana de{' '}
                  {format(weekDays[0], "dd 'de' MMM", { locale: ptBR })} a{' '}
                  {format(weekDays[6], "dd 'de' MMM, yyyy", { locale: ptBR })}
                </h2>
                <Badge variant="outline" className="font-mono text-xs">
                  Semana {format(weekDays[0], 'w')}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                Matriz semanal consolidada de horas por tarefa e dia
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Total Week Badge */}
            <div className="border-border/60 bg-muted/40 text-foreground/90 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold">
              <Clock className="text-primary size-3.5" />
              <span>Total Semana:</span>
              <span className="text-primary font-bold">
                {formatHours(totalWeekHours)}
              </span>
            </div>

            {/* Daily Average Badge */}
            {dailyAverageHours > 0 && (
              <div className="border-border/60 bg-muted/20 text-muted-foreground hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs md:flex">
                <Activity className="text-muted-foreground size-3" />
                <span>Média:</span>
                <span className="text-foreground font-semibold">
                  {formatHours(dailyAverageHours)}/dia
                </span>
              </div>
            )}

            {/* Active Days Badge */}
            <div className="border-border/60 bg-muted/20 text-muted-foreground hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs sm:flex">
              <CalendarCheck className="text-muted-foreground size-3" />
              <span>Dias ativos:</span>
              <span className="text-foreground font-semibold">
                {daysWithEntriesCount}/7
              </span>
            </div>

            {/* Action: + Novo Apontamento */}
            <Button
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs font-semibold shadow-xs"
              onClick={handleOpenAddEntry}
            >
              <Plus className="size-3.5" />
              <span>Novo Apontamento</span>
            </Button>

            {/* Week Navigator */}
            <div className="border-border/60 bg-muted/30 ml-1 flex items-center rounded-lg border p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-md"
                onClick={handlePrevWeek}
                title="Semana anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs font-semibold"
                onClick={handleCurrentWeek}
              >
                Esta Semana
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-md"
                onClick={handleNextWeek}
                title="Próxima semana"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Consolidated Timesheet Matrix Table */}
        <div className="border-border/60 bg-card/40 flex-1 overflow-hidden rounded-lg border shadow-xs">
          <Table>
            <TableHeader className="bg-muted/40 border-border/60 border-b">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-muted-foreground w-[360px] pl-4 text-xs font-bold">
                  Tarefa / Atividade
                </TableHead>
                {weekDays.map((day) => {
                  const isDayToday = isToday(day)
                  return (
                    <TableHead
                      key={day.toISOString()}
                      className={cn(
                        'text-muted-foreground w-[110px] text-center text-xs font-bold transition-colors',
                        isDayToday &&
                          'bg-primary/10 text-primary font-extrabold',
                      )}
                    >
                      <div
                        className="hover:text-primary flex cursor-pointer flex-col items-center py-0.5 transition-colors"
                        onClick={() => handleDayHeaderClick(day)}
                        title="Ver apontamentos deste dia"
                      >
                        <span className="text-[10px] tracking-wider uppercase">
                          {format(day, 'EEE', { locale: ptBR })}
                        </span>
                        <span className="font-mono text-xs">
                          {format(day, 'dd/MM')}
                        </span>
                      </div>
                    </TableHead>
                  )
                })}
                <TableHead className="text-muted-foreground w-[130px] pr-4 text-center font-mono text-xs font-bold">
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
                      <TableCell className="py-3 pl-4 text-xs font-medium">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: row.activityColor }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {row.taskId && (
                                <span className="text-primary bg-primary/10 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold">
                                  #{row.taskId}
                                </span>
                              )}
                              <span
                                className="text-foreground truncate text-xs font-bold"
                                title={row.taskTitle}
                              >
                                {row.taskTitle}
                              </span>
                            </div>
                            <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[10px]">
                              <span>{row.activityName}</span>
                              {row.dataSourceId && (
                                <span className="font-mono uppercase opacity-70">
                                  &bull; {row.dataSourceId}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
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
                              isDayToday && 'bg-primary/5',
                              'hover:bg-primary/10 hover:shadow-inner',
                            )}
                            title={`Editar apontamentos de "${row.taskTitle}" neste dia`}
                          >
                            <div className="relative flex min-h-[38px] items-center justify-center rounded-md px-1.5 py-1">
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
                                    <div className="bg-muted/70 group-hover:bg-primary/20 text-foreground group-hover:text-primary border-border/40 group-hover:border-primary/40 inline-flex items-center justify-center rounded border px-2.5 py-1 font-bold shadow-xs transition-colors">
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
                                          key={e._id || e.id}
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
                      <TableCell className="text-primary bg-primary/5 py-3 pr-4 text-center font-mono text-xs font-bold">
                        <span className="bg-primary/10 rounded px-2.5 py-1 font-extrabold">
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
                  <TableCell className="text-muted-foreground py-3.5 pl-4 text-xs font-bold tracking-wider uppercase">
                    Total do Dia
                  </TableCell>
                  {dailyColumnTotals.map((colHours, idx) => (
                    <TableCell
                      key={idx}
                      className={cn(
                        'py-3.5 text-center font-mono text-xs font-bold',
                        colHours > 0
                          ? 'font-extrabold text-emerald-500'
                          : 'text-muted-foreground/40',
                      )}
                    >
                      {colHours > 0 ? (
                        <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5">
                          {formatHours(colHours)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-primary bg-primary/10 py-3.5 pr-4 text-center font-mono text-xs font-extrabold">
                    <span className="bg-primary text-primary-foreground rounded px-2.5 py-1 shadow-xs">
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
                            #{selectedTaskFocus.taskId}
                          </span>
                        )}
                        <span className="truncate">
                          {selectedTaskFocus.taskTitle}
                        </span>
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
                  <TimeEntriesDayCard
                    day={selectedDay}
                    entries={modalEntries}
                    draftEntries={modalDraftEntries}
                    columns={columns}
                    expandedRows={expandedRows}
                    onExpandedChange={setExpandedRows}
                    isGrouped={true}
                    onAcceptAllSuggestions={handleAcceptAllSuggestions}
                    onDismissAllSuggestions={handleDismissAllSuggestions}
                    onAddNewEntry={handleAddNewEntryInModal}
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
