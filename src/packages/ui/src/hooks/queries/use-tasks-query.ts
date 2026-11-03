'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { MangoQuerySelector } from 'rxdb'

import {
  ConnectionScope,
  connectionScopeKey,
  DEFAULT_CONNECTION_SCOPE,
  extractScopeSubsetIds,
  isNoneScope,
} from '@/lib/connection-scope'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { useSyncStore } from '@/stores/syncStore'

export interface UseTasksQueryOptions {
  search?: string
  scope?: ConnectionScope
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
  const { search, scope = DEFAULT_CONNECTION_SCOPE, enabled = true } = options
  const queryClient = useQueryClient()
  const db = useSyncStore((state) => state?.db)
  const dbName = db?.name ? db.name : 'no-db'
  const scopeKey = useMemo(() => connectionScopeKey(scope), [scope])
  const searchKey = search ? search : ''
  const isNone = isNoneScope(scope)

  const queryKey = useMemo(
    () => ['tasks', dbName, scopeKey, searchKey],
    [dbName, scopeKey, searchKey],
  )

  useEffect(() => {
    if (!db?.tasks || !enabled || isNone) return

    const selector: MangoQuerySelector<SyncTaskRxDBDTO> = {
      _deleted: { $ne: true },
    }

    const subsetIds = extractScopeSubsetIds(scopeKey)
    if (subsetIds) {
      selector.connectionInstanceId = { $in: subsetIds }
    }

    const query = db.tasks.find({ selector, sort: [{ updatedAt: 'desc' }] })
    const subscription = query.$.subscribe((docs) => {
      const data = docs.map((doc) => doc.toMutableJSON())
      queryClient.setQueryData(queryKey, data)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [db, scopeKey, isNone, enabled, queryKey, queryClient])

  const query = useQuery<SyncTaskRxDBDTO[]>({
    queryKey,
    queryFn: async () => {
      if (!db?.tasks || isNone) return []
      const selector: MangoQuerySelector<SyncTaskRxDBDTO> = {
        _deleted: { $ne: true },
      }
      if (scope.kind === 'subset') {
        selector.connectionInstanceId = { $in: scope.ids }
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
