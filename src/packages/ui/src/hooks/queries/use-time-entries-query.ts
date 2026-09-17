'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfDay, startOfDay } from 'date-fns'
import { useEffect, useMemo } from 'react'

import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { useSyncStore } from '@/stores/syncStore'

export interface UseTimeEntriesQueryOptions {
  from: Date
  to: Date
  enabled?: boolean
}

export interface UseTimeEntriesQueryResult {
  data: SyncTimeEntryRxDBDTO[]
  isLoading: boolean
  isError: boolean
  error: unknown
  isSyncing: boolean
  isPulling: boolean
  refetch: () => Promise<unknown>
}

export function useTimeEntriesQuery({
  from,
  to,
  enabled = true,
}: UseTimeEntriesQueryOptions): UseTimeEntriesQueryResult {
  const queryClient = useQueryClient()
  const db = useSyncStore((state) => state?.db)
  const statuses = useSyncStore((state) => state?.statuses ?? {})

  const fromIso = useMemo(() => startOfDay(from).toISOString(), [from])
  const toIso = useMemo(() => endOfDay(to).toISOString(), [to])
  const queryKey = useMemo(
    () => ['time-entries-range', fromIso, toIso],
    [fromIso, toIso],
  )

  const isSyncing = useMemo(() => {
    const safeStatuses = statuses ?? {}
    return Object.values(safeStatuses).some((s) => s?.isPulling || s?.isPushing)
  }, [statuses])

  const isPulling = useMemo(() => {
    const safeStatuses = statuses ?? {}
    return Object.entries(safeStatuses).some(
      ([key, s]) => key.startsWith('timeEntries') && s?.isPulling,
    )
  }, [statuses])

  // Reactive subscription: live update TanStack Query cache on any RxDB change
  useEffect(() => {
    if (!db?.timeEntries || !enabled) return

    const query = db.timeEntries.find({
      selector: {
        startDate: {
          $gte: fromIso,
          $lte: toIso,
        },
      },
      sort: [{ startDate: 'desc' }],
    })

    const subscription = query.$.subscribe((docs) => {
      const data = docs.map((doc) => doc.toMutableJSON())
      queryClient.setQueryData(queryKey, data)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [db, fromIso, toIso, enabled, queryKey, queryClient])

  const query = useQuery<SyncTimeEntryRxDBDTO[]>({
    queryKey,
    queryFn: async () => {
      if (!db?.timeEntries) return []
      const results = await db.timeEntries
        .find({
          selector: {
            startDate: {
              $gte: fromIso,
              $lte: toIso,
            },
          },
          sort: [{ startDate: 'desc' }],
        })
        .exec()
      return results.map((doc) => doc.toMutableJSON())
    },
    enabled: !!db?.timeEntries && enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  })

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isSyncing,
    isPulling,
    refetch: query.refetch,
  }
}
