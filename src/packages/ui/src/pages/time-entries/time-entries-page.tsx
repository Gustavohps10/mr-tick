'use client'

import { ExpandedState } from '@tanstack/react-table'
import { format, isSameDay, parseISO } from 'date-fns'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { TaskLookup } from '@/components/task-lookup'
import { useHostBridge } from '@/hooks'
import { useFieldMappings } from '@/hooks/use-field-mappings'
import { cn } from '@/lib/utils'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { requestEntryPersistence } from '@/local-runtime/persistence-client'
import { TimeEntriesColumnsProvider } from '@/pages/time-entries/components/time-entries-columns-context'
import { TimeEntriesDayCard } from '@/pages/time-entries/components/time-entries-day-card'
import { TimeEntriesHeader } from '@/pages/time-entries/components/time-entries-header'
import { TimeEntriesSkeleton } from '@/pages/time-entries/components/time-entries-skeleton'
import {
  type CreateColumnsOptions,
  createTimeEntriesColumns,
} from '@/pages/time-entries/components/time-entries-table-columns'
import { useTimeEntriesData } from '@/pages/time-entries/hooks/use-time-entries-data'
import { useTimeEntryMutations } from '@/pages/time-entries/hooks/use-time-entry-mutations'
import {
  extractPureTaskId,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'

export interface TimeEntriesProps {
  className?: string
  compact?: boolean
}

export function TimeEntries({ className, compact }: TimeEntriesProps = {}) {
  const bridge = useHostBridge()
  const { mappings } = useFieldMappings()
  const {
    db,
    range,
    handleRangeChange,

    memberIdsByConnection,
    timeEntries,
    isLoading,
    isSyncing,
    isPulling,
    isPushing,
    syncResult,
    syncErrorMessage,
    activities,
    tasksById,
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
    handleDuplicateEntry,
    handleAddNewEntry,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleResolveConflict,
    handleConfirmRetryAmbiguousCreation,
    handleOpenConflictResolution,
  } = useTimeEntryMutations(db, memberIdsByConnection)

  const [isGrouped, setIsGrouped] = useState(true)
  const [collapsedRows, setCollapsedRows] = useState<Record<string, boolean>>(
    {},
  )

  // Compute expanded rows synchronously: all groups expanded by default on frame zero,
  // unless explicitly collapsed by user interaction.
  const expandedRows = useMemo<ExpandedState>(() => {
    const allEntries = [...timeEntries, ...draftEntries]
    const state: Record<string, boolean> = {}

    daysInRange.forEach((day) => {
      const dayKey = format(day, 'yyyy-MM-dd')
      const entries = allEntries.filter(
        (e) => e.startDate && isSameDay(parseISO(e.startDate), day),
      )
      entries.forEach((e) => {
        const pureId = extractPureTaskId(e.task?.id)
        const groupKey = `${dayKey}-${pureId || 'no-task'}`
        state[groupKey] = !collapsedRows[groupKey]
      })
    })

    return state
  }, [timeEntries, draftEntries, daysInRange, collapsedRows])

  const handleExpandedChange: React.Dispatch<
    React.SetStateAction<ExpandedState>
  > = useCallback(
    (updater) => {
      setCollapsedRows((prev) => {
        const nextCollapsed = { ...prev }
        const currentExpanded =
          typeof updater === 'function' ? updater(expandedRows) : updater
        if (typeof currentExpanded === 'object' && currentExpanded !== null) {
          Object.entries(currentExpanded).forEach(([key, isExpanded]) => {
            if (isExpanded) {
              delete nextCollapsed[key]
              return
            }
            nextCollapsed[key] = true
          })
        }
        return nextCollapsed
      })
    },
    [expandedRows],
  )

  const handleAcceptAllSuggestions = useCallback(
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
      } catch (err) {
        console.error('Erro ao aceitar todas sugestoes:', err)
        toast.error('Erro ao aceitar sugestões')
      }
    },
    [db, bridge],
  )

  const handleDismissAllSuggestions = useCallback(
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
      } catch (err) {
        console.error('Erro ao descartar todas sugestoes:', err)
        toast.error('Erro ao descartar sugestões')
      }
    },
    [db, bridge],
  )

  const handlePauseTimer = useCallback(
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

  const handleResumeTimer = useCallback(
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

  const handleStopTimer = useCallback(
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

  const columnOptions = useMemo<CreateColumnsOptions>(() => {
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
      isGrouped,
      onAddNewEntry: handleAddNewEntry,
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
    isGrouped,
    handleAddNewEntry,
    handleResolveConflict,
    handleConfirmRetryAmbiguousCreation,
    handleOpenConflictResolution,
  ])
  const columns = useMemo(
    () => createTimeEntriesColumns(columnOptions),
    [columnOptions],
  )

  const handleRowDoubleClick = useCallback((row: SuggestionRow) => {
    setEditingRows((prev) => ({
      ...prev,
      [row.id]: true,
    }))
  }, [])

  return (
    <div
      className={cn(
        'flex h-full flex-col gap-6 px-6',
        compact && 'gap-3 px-2',
        className,
      )}
    >
      <TimeEntriesHeader
        range={range}
        onRangeChange={handleRangeChange}
        isSyncing={isSyncing}
        isPulling={isPulling}
        isPushing={isPushing}
        syncResult={syncResult}
        syncErrorMessage={syncErrorMessage}
        isGrouped={isGrouped}
        onToggleGrouped={setIsGrouped}
        compact={compact}
      />

      {isLoading ? (
        <TimeEntriesSkeleton />
      ) : (
        <div className={cn('flex flex-col gap-6', compact && 'gap-3')}>
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
            <TimeEntriesColumnsProvider
              value={columnOptions}
              key={day.toISOString()}
            >
              <TimeEntriesDayCard
                key={day.toISOString()}
                day={day}
                entries={timeEntries}
                draftEntries={draftEntries}
                tempData={tempData}
                columns={columns}
                expandedRows={expandedRows}
                onExpandedChange={handleExpandedChange}
                isGrouped={isGrouped}
                isPulling={isPulling}
                compact={compact}
                onAcceptAllSuggestions={handleAcceptAllSuggestions}
                onDismissAllSuggestions={handleDismissAllSuggestions}
                onAddNewEntry={handleAddNewEntry}
                onRowDoubleClick={handleRowDoubleClick}
              />
            </TimeEntriesColumnsProvider>
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
