import { eachDayOfInterval, isValid, parseISO, subDays } from 'date-fns'
import { useMemo } from 'react'
import { DateRange } from 'react-day-picker'
import { useSearchParams } from 'react-router-dom'

import { useDataSourceConnections } from '@/hooks'
import {
  useActivitiesQuery,
  useTasksQuery,
  useTimeEntriesQuery,
} from '@/hooks/queries'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { useSyncStore } from '@/stores/syncStore'
import { useTimeEntryStore } from '@/stores/timeEntryStore'

export function useTimeEntriesData() {
  const db = useSyncStore((state) => state?.db)
  const { connections } = useDataSourceConnections()
  const [searchParams, setSearchParams] = useSearchParams()

  const memberIdsByConnection = useMemo(() => {
    const next: Record<string, string> = {}
    for (const conn of connections) {
      if (conn.connectionId && conn.member?.id) {
        next[conn.connectionId] = String(conn.member.id)
      }
    }
    return next
  }, [connections])

  const range = useMemo(() => {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const parsedFrom = from ? parseISO(from) : null
    const parsedTo = to ? parseISO(to) : null

    if (parsedFrom && isValid(parsedFrom) && parsedTo && isValid(parsedTo)) {
      return { from: parsedFrom, to: parsedTo }
    }

    return {
      from: subDays(new Date(), 6),
      to: new Date(),
    }
  }, [searchParams])

  const handleRangeChange = (newRange: DateRange | undefined) => {
    if (newRange?.from && newRange.to) {
      setSearchParams({
        from: newRange.from.toISOString(),
        to: newRange.to.toISOString(),
      })
    }
  }

  const activeTimeEntry = useTimeEntryStore((s) => s.active)
  const setActive = useTimeEntryStore((s) => s.setActive)
  const createNewTimeEntry = useTimeEntryStore((s) => s.createNewTimeEntry)
  const pauseCurrentTimeEntry = useTimeEntryStore(
    (s) => s.pauseCurrentTimeEntry,
  )
  const playCurrentTimeEntry = useTimeEntryStore((s) => s.playCurrentTimeEntry)
  const stopCurrentTimeEntry = useTimeEntryStore((s) => s.stopCurrentTimeEntry)

  const {
    data: timeEntries,
    isLoading,
    isSyncing,
    isPulling,
    isPushing,
    syncResult,
    syncErrorMessage,
  } = useTimeEntriesQuery({
    from: range.from,
    to: range.to,
  })

  const { data: activities } = useActivitiesQuery()
  const { data: tasks = [] } = useTasksQuery()

  const tasksById = useMemo(() => {
    const map: Record<string, SyncTaskRxDBDTO> = {}
    for (const t of tasks) {
      if (t.id) map[t.id] = t
      if (t.sourceId) map[t.sourceId] = t
    }
    return map
  }, [tasks])

  const daysInRange = useMemo(() => {
    return eachDayOfInterval({ start: range.from, end: range.to }).reverse()
  }, [range])

  return {
    db,
    range,
    handleRangeChange,
    memberIdsByConnection,
    timeEntries: timeEntries ? timeEntries : [],
    isLoading,
    isSyncing,
    isPulling,
    isPushing,
    syncResult,
    syncErrorMessage,
    activities: activities ? activities : [],
    tasks,
    tasksById,
    daysInRange,
    activeTimeEntry,
    setActive,
    createNewTimeEntry,
    pauseCurrentTimeEntry,
    playCurrentTimeEntry,
    stopCurrentTimeEntry,
  }
}
