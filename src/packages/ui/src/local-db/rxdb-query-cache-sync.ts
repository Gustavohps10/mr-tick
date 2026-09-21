import { QueryClient } from '@tanstack/react-query'
import { isValid, parseISO } from 'date-fns'
import { Subscription } from 'rxjs'

import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { AppDatabase } from '@/stores/sync-store/types'

export interface RxDBQueryCacheSyncHandle {
  unsubscribe: () => void
}

export function setupRxDBQueryCacheSync(
  db: AppDatabase,
  queryClient: QueryClient,
): RxDBQueryCacheSyncHandle {
  const subscriptions: Subscription[] = []

  // Sincronização cirúrgica de timeEntries
  const timeEntriesSubscription = db.timeEntries.$.subscribe((changeEvent) => {
    const matchingQueries = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['time-entries-range'] })

    for (const query of matchingQueries) {
      const queryKey = query.queryKey
      if (queryKey.length < 3) {
        continue
      }

      const rawFrom = queryKey[1]
      const rawTo = queryKey[2]
      if (typeof rawFrom !== 'string' || typeof rawTo !== 'string') {
        continue
      }

      const fromIso = rawFrom
      const toIso = rawTo
      const documentId = changeEvent.documentId

      if (changeEvent.operation === 'DELETE') {
        queryClient.setQueryData<SyncTimeEntryRxDBDTO[]>(
          queryKey,
          (previousData) => {
            if (!previousData) {
              return previousData
            }
            return previousData.filter((entry) => entry.id !== documentId)
          },
        )
        continue
      }

      const documentData = changeEvent.documentData
      if (!documentData) {
        continue
      }

      if (documentData._deleted) {
        queryClient.setQueryData<SyncTimeEntryRxDBDTO[]>(
          queryKey,
          (previousData) => {
            if (!previousData) {
              return previousData
            }
            return previousData.filter(
              (entry) =>
                entry.id !== documentId && entry.id !== documentData.id,
            )
          },
        )
        continue
      }

      const entryDateObj = parseISO(documentData.startDate)
      const fromObj = parseISO(fromIso)
      const toObj = parseISO(toIso)
      const isInRange =
        isValid(entryDateObj) &&
        isValid(fromObj) &&
        isValid(toObj) &&
        entryDateObj.getTime() >= fromObj.getTime() &&
        entryDateObj.getTime() <= toObj.getTime()

      queryClient.setQueryData<SyncTimeEntryRxDBDTO[]>(
        queryKey,
        (previousData) => {
          if (!previousData) {
            return previousData
          }
          const existingIndex = previousData.findIndex(
            (entry) => entry.id === documentId || entry.id === documentData.id,
          )

          if (!isInRange) {
            if (existingIndex >= 0) {
              return previousData.filter(
                (entry) =>
                  entry.id !== documentId && entry.id !== documentData.id,
              )
            }
            return previousData
          }

          if (existingIndex >= 0) {
            const nextList = [...previousData]
            nextList[existingIndex] = documentData
            return nextList
          }

          const nextList = [documentData, ...previousData]
          nextList.sort((first, second) => {
            if (first.startDate > second.startDate) {
              return -1
            }
            if (first.startDate < second.startDate) {
              return 1
            }
            return 0
          })
          return nextList
        },
      )
    }
  })
  subscriptions.push(timeEntriesSubscription)

  // Sincronização cirúrgica de tasks
  const tasksSubscription = db.tasks.$.subscribe((changeEvent) => {
    const matchingQueries = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['tasks'] })

    for (const query of matchingQueries) {
      const queryKey = query.queryKey
      const rawConnId = queryKey[1]
      const connectionInstanceId =
        typeof rawConnId === 'string' ? rawConnId : 'all'
      const documentId = changeEvent.documentId

      if (changeEvent.operation === 'DELETE') {
        queryClient.setQueryData<SyncTaskRxDBDTO[]>(
          queryKey,
          (previousData) => {
            if (!previousData) {
              return previousData
            }
            return previousData.filter((task) => task.id !== documentId)
          },
        )
        continue
      }

      const documentData = changeEvent.documentData
      if (!documentData) {
        continue
      }

      if (documentData._deleted) {
        queryClient.setQueryData<SyncTaskRxDBDTO[]>(
          queryKey,
          (previousData) => {
            if (!previousData) {
              return previousData
            }
            return previousData.filter((task) => task.id !== documentId)
          },
        )
        continue
      }

      const matchesConnection =
        connectionInstanceId === 'all' ||
        documentData.connectionInstanceId === connectionInstanceId

      queryClient.setQueryData<SyncTaskRxDBDTO[]>(queryKey, (previousData) => {
        if (!previousData) {
          return previousData
        }
        const existingIndex = previousData.findIndex(
          (task) => task.id === documentId,
        )

        if (!matchesConnection) {
          if (existingIndex >= 0) {
            return previousData.filter((task) => task.id !== documentId)
          }
          return previousData
        }

        if (existingIndex >= 0) {
          const nextList = [...previousData]
          nextList[existingIndex] = documentData
          return nextList
        }

        return [documentData, ...previousData]
      })
    }
  })
  subscriptions.push(tasksSubscription)

  return {
    unsubscribe: () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
    },
  }
}
