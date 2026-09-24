import { useEffect, useState } from 'react'

import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { useSyncStore } from '@/stores/syncStore'

export interface WorkspaceConflictsResult {
  conflictedEntries: SyncTimeEntryRxDBDTO[]
  conflictCount: number
  isLoading: boolean
}

export function useWorkspaceConflicts(): WorkspaceConflictsResult {
  const db = useSyncStore((state) => state.db)
  const isInitialized = useSyncStore((state) => state.isInitialized)
  const [conflictedEntries, setConflictedEntries] = useState<
    SyncTimeEntryRxDBDTO[]
  >([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!db || !isInitialized) {
      setConflictedEntries([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const query = db.timeEntries.find({
      selector: {
        syncStatus: 'conflict',
      },
    })

    const subscription = query.$.subscribe((docs) => {
      const entries = docs.map((doc) => doc.toMutableJSON())
      setConflictedEntries(entries)
      setIsLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [db, isInitialized])

  return {
    conflictedEntries,
    conflictCount: conflictedEntries.length,
    isLoading,
  }
}
