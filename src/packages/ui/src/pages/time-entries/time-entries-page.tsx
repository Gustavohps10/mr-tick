'use client'

import { useQueryClient } from '@tanstack/react-query'
import { ExpandedState } from '@tanstack/react-table'
import { format, isSameDay, parseISO } from 'date-fns'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { TaskLookup } from '@/components/task-lookup'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { TimeEntriesDayCard } from '@/pages/time-entries/components/time-entries-day-card'
import { TimeEntriesHeader } from '@/pages/time-entries/components/time-entries-header'
import { TimeEntriesSkeleton } from '@/pages/time-entries/components/time-entries-skeleton'
import { createTimeEntriesColumns } from '@/pages/time-entries/components/time-entries-table-columns'
import { useTimeEntriesData } from '@/pages/time-entries/hooks/use-time-entries-data'
import { useTimeEntryMutations } from '@/pages/time-entries/hooks/use-time-entry-mutations'
import {
  hasNoTask,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'

export function TimeEntries() {
  const queryClient = useQueryClient()

  const {
    db,
    range,
    handleRangeChange,
    memberIdsByConnection,
    timeEntries,
    isLoading,
    isSyncing,
    isPulling,
    activities,
    daysInRange,
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
    handleStartDuplicate,
    handleAddNewEntry,
    handleAcceptSuggestion,
    handleDismissSuggestion,
  } = useTimeEntryMutations(db, memberIdsByConnection)

  const [isGrouped, setIsGrouped] = useState(true)
  const [expandedRows, setExpandedRows] = useState<ExpandedState>({})

  // Expand ticket groups by default
  useEffect(() => {
    const allEntries = [...timeEntries, ...draftEntries]
    if (allEntries.length > 0) {
      setExpandedRows((prev) => {
        const nextExpanded = { ...(typeof prev === 'object' ? prev : {}) }
        daysInRange.forEach((day) => {
          const dayKey = format(day, 'yyyy-MM-dd')
          const entries = allEntries.filter(
            (e) => e.startDate && isSameDay(parseISO(e.startDate), day),
          )
          const groupKeys = new Set(
            entries.map(
              (e) =>
                `${dayKey}-${hasNoTask(e) ? 'sem-issue' : (e.task?.id ?? 'sem-issue')}`,
            ),
          )
          groupKeys.forEach((key) => {
            if (!(key in nextExpanded)) {
              nextExpanded[key] = true
            }
          })
        })
        console.log('🔍 [TimeEntries] Auto-expanded row keys:', nextExpanded)
        return nextExpanded
      })
    }
  }, [timeEntries, draftEntries, daysInRange])

  const handleTimeChangeDirect = useCallback(
    async (id: string, updates: Partial<SyncTimeEntryRxDBDTO>) => {
      if (!db) return
      try {
        const doc = await db.timeEntries.findOne(id).exec()
        if (doc) {
          await doc.patch({
            ...updates,
            updatedAt: new Date().toISOString(),
          })
          toast.success('Tempo atualizado')
        }
      } catch {
        toast.error('Erro ao atualizar tempo')
      }
    },
    [db, queryClient],
  )

  const handleAcceptAllSuggestions = useCallback(
    async (suggestions: SuggestionRow[]) => {
      if (!db || suggestions.length === 0) return
      try {
        for (const sug of suggestions) {
          const doc = await db.timeEntries
            .findOne({
              selector: {
                connectionInstanceId: sug.connectionInstanceId,
                sourceId: sug.sourceId,
              },
            })
            .exec()
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
      } catch (err) {
        console.error('Erro ao aceitar todas sugestoes:', err)
        toast.error('Erro ao aceitar sugestões')
      }
    },
    [db],
  )

  const handleDismissAllSuggestions = useCallback(
    async (suggestions: SuggestionRow[]) => {
      if (!db || suggestions.length === 0) return
      try {
        for (const sug of suggestions) {
          const doc = await db.timeEntries
            .findOne({
              selector: {
                connectionInstanceId: sug.connectionInstanceId,
                sourceId: sug.sourceId,
              },
            })
            .exec()
          if (doc) {
            await doc.remove()
          }
        }
        toast.info(`${suggestions.length} sugestões descartadas`)
      } catch (err) {
        console.error('Erro ao descartar todas sugestoes:', err)
        toast.error('Erro ao descartar sugestões')
      }
    },
    [db],
  )

  const handlePauseTimer = useCallback(
    async (row: SuggestionRow) => {
      if (!db) return
      const doc = await db.timeEntries
        .findOne({
          selector: {
            connectionInstanceId: row.connectionInstanceId,
            sourceId: row.sourceId,
          },
        })
        .exec()
      if (doc) {
        setActive(doc.toMutableJSON())
      } else if (
        activeTimeEntry?.connectionInstanceId !== row.connectionInstanceId ||
        activeTimeEntry?.sourceId !== row.sourceId
      ) {
        setActive(row)
      }
      await pauseCurrentTimeEntry(db)
    },
    [db, activeTimeEntry, setActive, pauseCurrentTimeEntry],
  )

  const handleResumeTimer = useCallback(
    async (row: SuggestionRow) => {
      if (!db) return
      const doc = await db.timeEntries
        .findOne({
          selector: {
            connectionInstanceId: row.connectionInstanceId,
            sourceId: row.sourceId,
          },
        })
        .exec()
      if (doc) {
        setActive(doc.toMutableJSON())
      } else if (
        activeTimeEntry?.connectionInstanceId !== row.connectionInstanceId ||
        activeTimeEntry?.sourceId !== row.sourceId
      ) {
        setActive(row)
      }
      await playCurrentTimeEntry(db)
    },
    [db, activeTimeEntry, setActive, playCurrentTimeEntry],
  )

  const handleStopTimer = useCallback(
    async (row?: SuggestionRow) => {
      if (!db) return
      if (row) {
        const doc = await db.timeEntries
          .findOne({
            selector: {
              connectionInstanceId: row.connectionInstanceId,
              sourceId: row.sourceId,
            },
          })
          .exec()
        if (doc) {
          setActive(doc.toMutableJSON())
        } else if (
          activeTimeEntry?.connectionInstanceId !== row.connectionInstanceId ||
          activeTimeEntry?.sourceId !== row.sourceId
        ) {
          setActive(row)
        }
      }
      await stopCurrentTimeEntry(db)
    },
    [db, activeTimeEntry, setActive, stopCurrentTimeEntry],
  )

  const columns = useMemo(() => {
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
      isGrouped,
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
    isGrouped,
    handleAddNewEntry,
  ])

  const handleRowDoubleClick = useCallback((row: SuggestionRow) => {
    setEditingRows((prev) => ({
      ...prev,
      [row.id]: true,
    }))
  }, [])

  return (
    <div className="flex h-full flex-col gap-6 px-6">
      <TimeEntriesHeader
        range={range}
        onRangeChange={handleRangeChange}
        isSyncing={isSyncing}
        isPulling={isPulling}
        isGrouped={isGrouped}
        onToggleGrouped={setIsGrouped}
      />

      {isLoading || (timeEntries.length === 0 && isPulling) ? (
        <TimeEntriesSkeleton
          message={
            isPulling
              ? 'Sincronizando apontamentos do período com as fontes remotas...'
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {isPulling && (
            <div className="border-primary/20 bg-primary/5 text-primary flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
              </span>
              <span className="font-medium">
                Sincronizando apontamentos do período com as fontes remotas...
              </span>
            </div>
          )}
          {daysInRange.map((day) => (
            <TimeEntriesDayCard
              key={day.toISOString()}
              day={day}
              entries={timeEntries}
              draftEntries={draftEntries}
              columns={columns}
              expandedRows={expandedRows}
              onExpandedChange={setExpandedRows}
              isGrouped={isGrouped}
              isPulling={isPulling}
              onAcceptAllSuggestions={handleAcceptAllSuggestions}
              onDismissAllSuggestions={handleDismissAllSuggestions}
              onAddNewEntry={handleAddNewEntry}
              onRowDoubleClick={handleRowDoubleClick}
            />
          ))}
        </div>
      )}

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
  )
}
