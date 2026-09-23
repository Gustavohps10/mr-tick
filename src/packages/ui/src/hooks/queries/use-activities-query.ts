'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { SyncMetadataItem } from '@/local-db/schemas/metadata-sync-schema'
import { useSyncStore } from '@/stores/syncStore'

export interface UseActivitiesQueryResult {
  data: SyncMetadataItem[]
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => Promise<unknown>
}

export function useActivitiesQuery(enabled = true): UseActivitiesQueryResult {
  const queryClient = useQueryClient()
  const db = useSyncStore((state) => state?.db)
  const dbName = db?.name ? db.name : 'no-db'
  const queryKey = useMemo(() => ['activities', dbName], [dbName])

  useEffect(() => {
    if (!db?.metadata || !enabled) return

    const query = db.metadata.findOne()
    const subscription = query.$.subscribe((doc) => {
      if (doc) {
        const metadata = doc.toMutableJSON()
        queryClient.setQueryData(queryKey, metadata.activities || [])
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [db, enabled, queryClient])

  const query = useQuery<SyncMetadataItem[]>({
    queryKey,
    queryFn: async () => {
      if (!db?.metadata) return []
      const doc = await db.metadata.findOne().exec()
      if (!doc) return []
      return doc.toMutableJSON().activities || []
    },
    enabled: !!db?.metadata && enabled,
    staleTime: 1000 * 60 * 15,
  })

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
