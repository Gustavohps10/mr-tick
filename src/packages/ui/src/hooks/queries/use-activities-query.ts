'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { SyncMetadataItem } from '@/local-db/schemas/metadata-sync-schema'
import { useSyncStore } from '@/stores/syncStore'

export interface UseActivitiesQueryResult {
  data: SyncMetadataItem[]
  activitiesByConnection: Record<string, SyncMetadataItem[]>
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => Promise<unknown>
}

interface ActivitiesQueryPayload {
  activities: SyncMetadataItem[]
  activitiesByConnection: Record<string, SyncMetadataItem[]>
}

function extractActivitiesPayload(
  docs: Array<{
    connectionInstanceId?: string
    activities?: SyncMetadataItem[]
  }>,
): ActivitiesQueryPayload {
  const activitiesByConnection: Record<string, SyncMetadataItem[]> = {}
  const allActivities: SyncMetadataItem[] = []
  const seenActivityIds = new Set<string>()

  for (const doc of docs) {
    const connId = doc.connectionInstanceId
    const acts = doc.activities ?? []

    if (connId) {
      activitiesByConnection[connId] = acts
    }

    for (const act of acts) {
      if (!seenActivityIds.has(act.id)) {
        seenActivityIds.add(act.id)
        allActivities.push(act)
      }
    }
  }

  return {
    activities: allActivities,
    activitiesByConnection,
  }
}

export function useActivitiesQuery(enabled = true): UseActivitiesQueryResult {
  const queryClient = useQueryClient()
  const db = useSyncStore((state) => state?.db)
  const dbName = db?.name ? db.name : 'no-db'
  const queryKey = useMemo(() => ['activities', dbName], [dbName])

  useEffect(() => {
    if (!db?.metadata || !enabled) return

    const query = db.metadata.find()
    const subscription = query.$.subscribe((docs) => {
      if (!docs) return

      const plainDocs = docs.map((doc) => doc.toMutableJSON())
      const payload = extractActivitiesPayload(plainDocs)
      queryClient.setQueryData(queryKey, payload)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [db, enabled, queryClient, queryKey])

  const query = useQuery<ActivitiesQueryPayload>({
    queryKey,
    queryFn: async () => {
      if (!db?.metadata) {
        return { activities: [], activitiesByConnection: {} }
      }

      const docs = await db.metadata.find().exec()
      if (!docs || docs.length === 0) {
        return { activities: [], activitiesByConnection: {} }
      }

      const plainDocs = docs.map((doc) => doc.toMutableJSON())
      return extractActivitiesPayload(plainDocs)
    },
    enabled: Boolean(db?.metadata && enabled),
    staleTime: 1000 * 60 * 15,
  })

  return {
    data: query.data?.activities ?? [],
    activitiesByConnection: query.data?.activitiesByConnection ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
