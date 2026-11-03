'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfDay, startOfDay } from 'date-fns'
import { useEffect, useMemo } from 'react'

import {
  ConnectionScope,
  connectionScopeKey,
  DEFAULT_CONNECTION_SCOPE,
  extractScopeSubsetIds,
  isNoneScope,
} from '@/lib/connection-scope'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { useSyncStore } from '@/stores/syncStore'

export interface UseTimeEntriesQueryOptions {
  from: Date
  to: Date
  enabled?: boolean
  scope?: ConnectionScope
}

export interface UseTimeEntriesQueryResult {
  data: SyncTimeEntryRxDBDTO[]
  isLoading: boolean
  isError: boolean
  error: unknown
  isSyncing: boolean
  isPulling: boolean
  isPushing: boolean
  syncResult: 'success' | 'error' | null
  syncErrorMessage: string | null
  refetch: () => Promise<unknown>
}

export function useTimeEntriesQuery({
  from,
  to,
  enabled = true,
  scope = DEFAULT_CONNECTION_SCOPE,
}: UseTimeEntriesQueryOptions): UseTimeEntriesQueryResult {
  const queryClient = useQueryClient()
  const db = useSyncStore((state) => state?.db)
  const statuses = useSyncStore((state) => state?.statuses ?? {})

  const dbName = db?.name ? db.name : 'no-db'
  const fromIso = useMemo(() => startOfDay(from).toISOString(), [from])
  const toIso = useMemo(() => endOfDay(to).toISOString(), [to])
  const scopeKey = useMemo(() => connectionScopeKey(scope), [scope])
  const queryKey = useMemo(
    () => ['time-entries-range', dbName, fromIso, toIso, scopeKey],
    [dbName, fromIso, toIso, scopeKey],
  )

  const isSyncing = useMemo(() => {
    const safeStatuses = statuses ?? {}
    return Object.values(safeStatuses).some(
      (s) => s?.isPulling || s?.isPushing || s?.isReconciling,
    )
  }, [statuses])

  const isPulling = useMemo(() => {
    const safeStatuses = statuses ?? {}
    return Object.entries(safeStatuses).some(
      ([key, s]) =>
        key.startsWith('timeEntries') && (s?.isPulling || s?.isReconciling),
    )
  }, [statuses])

  const isPushing = useMemo(() => {
    const safeStatuses = statuses ?? {}
    return Object.entries(safeStatuses).some(
      ([key, s]) => key.startsWith('timeEntries') && s?.isPushing,
    )
  }, [statuses])

  const syncResult = useMemo((): 'success' | 'error' | null => {
    const safeStatuses = statuses ?? {}
    const timeEntriesStatuses = Object.entries(safeStatuses)
      .filter(([key]) => key.startsWith('timeEntries'))
      .map(([, s]) => s)

    if (timeEntriesStatuses.length === 0) return null

    const isCurrentlyActive = timeEntriesStatuses.some(
      (s) => s?.isPulling || s?.isPushing || s?.isReconciling,
    )
    if (isCurrentlyActive) return null

    const hasError = timeEntriesStatuses.some(
      (s) =>
        Boolean(s.error) ||
        s.lastPushResult === 'error' ||
        s.lastPullResult === 'error',
    )
    if (hasError) return 'error'

    const hasSuccess = timeEntriesStatuses.some(
      (s) => s.lastPushResult === 'success' || s.lastPullResult === 'success',
    )
    if (hasSuccess) return 'success'

    return null
  }, [statuses])

  const isNone = isNoneScope(scope)

  const query = useQuery<SyncTimeEntryRxDBDTO[]>({
    queryKey,
    queryFn: async () => {
      if (!db?.timeEntries || isNone) return []

      const selector: Record<string, unknown> = {
        _deleted: { $ne: true },
        startDate: {
          $gte: fromIso,
          $lte: toIso,
        },
      }

      if (scope.kind === 'subset') {
        selector.connectionInstanceId = { $in: scope.ids }
      }

      const results = await db.timeEntries
        .find({
          selector,
          sort: [{ startDate: 'desc' }],
        })
        .exec()
      return results.map((doc) => doc.toMutableJSON())
    },
    enabled: !!db?.timeEntries && enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  })

  // Reactive subscription: live update TanStack Query cache on any RxDB change
  useEffect(() => {
    if (!db?.timeEntries || !enabled || isNone) return

    const selector: Record<string, unknown> = {
      _deleted: { $ne: true },
      startDate: {
        $gte: fromIso,
        $lte: toIso,
      },
    }

    const subsetIds = extractScopeSubsetIds(scopeKey)
    if (subsetIds) {
      selector.connectionInstanceId = { $in: subsetIds }
    }

    const rxQuery = db.timeEntries.find({
      selector,
      sort: [{ startDate: 'desc' }],
    })

    const subscription = rxQuery.$.subscribe((docs) => {
      const data = docs.map((doc) => doc.toMutableJSON())
      queryClient.setQueryData(queryKey, data)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [db, fromIso, toIso, enabled, isNone, scopeKey, queryKey, queryClient])

  const syncErrorMessage = useMemo((): string | null => {
    const safeStatuses = statuses ? statuses : {}
    for (const [key, s] of Object.entries(safeStatuses)) {
      if (key.startsWith('timeEntries')) {
        if (s.error) {
          return s.error.message ? s.error.message : String(s.error)
        }
        if (s.lastPullResult === 'error') {
          return 'Falha ao sincronizar com o provedor remoto'
        }
        if (s.lastPushResult === 'error') {
          return 'Falha ao enviar apontamentos para o provedor remoto'
        }
      }
    }
    const queryData = query.data ? query.data : []
    const failedEntry = queryData.find(
      (entry) => entry.syncStatus === 'error' && entry.syncError,
    )
    if (failedEntry && failedEntry.syncError) {
      return failedEntry.syncError
    }
    return null
  }, [statuses, query.data])

  const isDbReady = Boolean(db?.timeEntries)
  const isQueryLoading =
    !isDbReady ||
    query.isLoading ||
    Boolean(enabled && query.isPending && !query.data)

  const timeEntriesData = query.data ? query.data : []

  return {
    data: timeEntriesData,
    isLoading: isQueryLoading,
    isError: query.isError,
    error: query.error,
    isSyncing,
    isPulling,
    isPushing,
    syncResult,
    syncErrorMessage,
    refetch: query.refetch,
  }
}
