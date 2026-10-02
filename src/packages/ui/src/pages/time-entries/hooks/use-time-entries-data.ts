import { eachDayOfInterval, isValid, parseISO, subDays } from 'date-fns'
import { useEffect, useMemo, useRef } from 'react'
import { DateRange } from 'react-day-picker'
import { useSearchParams } from 'react-router-dom'

import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useDataSourceConnections, useHostBridge } from '@/hooks'
import {
  useActivitiesQuery,
  useTasksQuery,
  useTimeEntriesQuery,
} from '@/hooks/queries'
import { fetchAndPersistTasks } from '@/lib/tasks-enrichment'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { extractPureTaskId } from '@/pages/time-entries/lib/time-entries-utils'
import { useSyncStore } from '@/stores/syncStore'
import { useTimeEntryStore } from '@/stores/timeEntryStore'

export interface UseTimeEntriesDataOptions {
  from?: Date
  to?: Date
  ignoreUrlRange?: boolean
}

export function useTimeEntriesData(options?: UseTimeEntriesDataOptions) {
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
    if (options?.ignoreUrlRange && options.from && options.to) {
      return { from: options.from, to: options.to }
    }
    if (options?.from && options.to) {
      return { from: options.from, to: options.to }
    }

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
  }, [options?.ignoreUrlRange, options?.from, options?.to, searchParams])

  const handleRangeChange = (newRange: DateRange | undefined) => {
    if (options?.ignoreUrlRange) return
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

  const hostBridge = useHostBridge()
  const { workspace } = useWorkspace()
  const requestedTaskIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!db || !workspace?.id || !timeEntries || timeEntries.length === 0)
      return

    const missingByConnection = new Map<string, string[]>()

    for (const entry of timeEntries) {
      const connId = entry.connectionInstanceId
      if (!connId) continue
      const rawTaskId = entry.task?.id
      if (!rawTaskId) continue
      const pureId = extractPureTaskId(rawTaskId)
      if (!pureId) continue
      if (tasksById[pureId]?.title) continue

      const cacheKey = `${connId}::${pureId}`
      if (requestedTaskIdsRef.current.has(cacheKey)) continue
      requestedTaskIdsRef.current.add(cacheKey)

      const currentList = missingByConnection.get(connId)
      if (currentList) {
        currentList.push(pureId)
        continue
      }
      missingByConnection.set(connId, [pureId])
    }

    if (missingByConnection.size === 0) return

    missingByConnection.forEach((ids, connId) => {
      const conn = connections.find((c) => c.connectionId === connId)
      const dsId = conn?.dataSourceId ? conn.dataSourceId : 'datasource'

      fetchAndPersistTasks({
        hostBridge,
        db,
        workspaceId: workspace.id,
        connectionInstanceId: connId,
        dataSourceId: dsId,
        ids,
      })
    })
  }, [db, workspace?.id, timeEntries, tasksById, connections, hostBridge])

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
