'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { useSyncStore } from '@/stores/syncStore'

export interface UseTasksQueryOptions {
  search?: string
  connectionInstanceId?: string
  enabled?: boolean
}

export interface UseTasksQueryResult {
  data: SyncTaskRxDBDTO[]
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => Promise<unknown>
}

export function useTasksQuery(
  options: UseTasksQueryOptions = {},
): UseTasksQueryResult {
  const { search, connectionInstanceId, enabled = true } = options
  const queryClient = useQueryClient()
  const db = useSyncStore((state) => state?.db)
  const dbName = db?.name ? db.name : 'no-db'
  const connectionKey = connectionInstanceId ? connectionInstanceId : 'all'
  const searchKey = search ? search : ''
  const queryKey = useMemo(
    () => ['tasks', dbName, connectionKey, searchKey],
    [dbName, connectionKey, searchKey],
  )

  useEffect(() => {
    if (!db?.tasks || !enabled) return

    const selector: Record<string, any> = { _deleted: { $ne: true } }
    if (connectionInstanceId) {
      selector.connectionInstanceId = connectionInstanceId
    }

    const query = db.tasks.find({ selector, sort: [{ updatedAt: 'desc' }] })
    const subscription = query.$.subscribe((docs) => {
      const data = docs.map((doc) => doc.toMutableJSON())
      queryClient.setQueryData(queryKey, data)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [db, connectionInstanceId, search, enabled, queryKey, queryClient])

  const query = useQuery<SyncTaskRxDBDTO[]>({
    queryKey,
    queryFn: async () => {
      if (!db?.tasks) return []
      const selector: Record<string, any> = { _deleted: { $ne: true } }
      if (connectionInstanceId) {
        selector.connectionInstanceId = connectionInstanceId
      }

      const results = await db.tasks
        .find({ selector, sort: [{ updatedAt: 'desc' }] })
        .exec()
      return results.map((doc) => doc.toMutableJSON())
    },
    enabled: !!db?.tasks && enabled,
    staleTime: 1000 * 60 * 5,
  })

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
