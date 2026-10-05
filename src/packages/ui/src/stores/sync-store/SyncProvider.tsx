'use client'

import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type StoreApi, useStore } from 'zustand'

import {
  type ConnectionInstanceId,
  useDataSourceConnections,
} from '@/contexts/DataSourceConnectionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useEnvironment } from '@/hooks'
import { useHostBridge } from '@/hooks/use-host-bridge'
import {
  type RxDBQueryCacheSyncHandle,
  setupRxDBQueryCacheSync,
} from '@/local-db/rxdb-query-cache-sync'
import { createTimeEntryStore } from '@/stores/timeEntryStore'

import { createSyncStore } from './createSyncStore'
import { dropAppStorage } from './storage'
import { ReplicationStatus, SyncStore } from './types'

export interface SyncProviderProps {
  children: ReactNode
  useMemoryStorage?: boolean
  retryTime?: number
}

export const SyncProvider: React.FC<SyncProviderProps> = ({
  children,
  useMemoryStorage = false,
  retryTime,
}) => {
  const { isDevelopment, isTest } = useEnvironment()
  const { workspace } = useWorkspace()
  const bridge = useHostBridge()
  const { connections } = useDataSourceConnections()
  const queryClient = useQueryClient()
  const [activeStore, setActiveStore] = useState<StoreApi<SyncStore> | null>(
    null,
  )
  const activeStoreRef = useRef<StoreApi<SyncStore> | null>(null)
  const cacheSyncHandleRef = useRef<RxDBQueryCacheSyncHandle | null>(null)
  const startedConnections = useRef<
    Map<ConnectionInstanceId, { dataSourceId: string }>
  >(new Map())
  const transitionTail = useRef<Promise<void>>(Promise.resolve())

  // Opening, closing and connecting share one owner. An old teardown must finish
  // before a new store can open the same RxDB database.
  const enqueueTransition = useCallback((operation: () => Promise<void>) => {
    transitionTail.current = transitionTail.current
      .then(operation)
      .catch((error: Error) => {
        console.error(
          '[SYNC][provider] Falha na transição de sincronização:',
          error,
        )
      })
  }, [])

  const releaseActiveStore = useCallback(async () => {
    const previous = activeStoreRef.current
    activeStoreRef.current = null
    startedConnections.current.clear()
    cacheSyncHandleRef.current?.unsubscribe()
    cacheSyncHandleRef.current = null
    setActiveStore(null)
    if (previous) await previous.getState().destroy()
  }, [])

  useEffect(() => {
    let cancelled = false
    const workspaceId = workspace?.id

    enqueueTransition(async () => {
      if (cancelled) return
      await releaseActiveStore()
      if (cancelled || !workspaceId) return

      const resolvedRetryTime = retryTime ?? (isTest ? 3000 : 30000)
      const store = createSyncStore(
        workspaceId,
        bridge,
        isDevelopment,
        useMemoryStorage,
        resolvedRetryTime,
      )
      await store.getState().init()
      if (cancelled || !store.getState().isInitialized) {
        await store.getState().destroy()
        return
      }

      activeStoreRef.current = store
      setActiveStore(store)
      const db = store.getState().db
      if (!db) return
      cacheSyncHandleRef.current = setupRxDBQueryCacheSync(db, queryClient)
      const timeEntryStore = createTimeEntryStore(bridge)
      await timeEntryStore.getState().recoverRunningEntry(db)
    })

    return () => {
      cancelled = true
      cacheSyncHandleRef.current?.unsubscribe()
      cacheSyncHandleRef.current = null
      enqueueTransition(releaseActiveStore)
    }
  }, [
    workspace?.id,
    bridge,
    isDevelopment,
    isTest,
    retryTime,
    useMemoryStorage,
    queryClient,
    enqueueTransition,
    releaseActiveStore,
  ])

  useEffect(() => {
    let cancelled = false
    const store = activeStore
    enqueueTransition(async () => {
      if (cancelled || !store || store !== activeStoreRef.current) return
      const { isInitialized, connectDataSource, disconnectDataSource } =
        store.getState()
      if (!isInitialized) return

      for (const connection of connections) {
        if (cancelled) return
        const id = connection.connectionId
        if (
          connection.status !== 'connected' ||
          startedConnections.current.has(id) ||
          !connection.dataSourceId
        )
          continue
        startedConnections.current.set(id, {
          dataSourceId: connection.dataSourceId,
        })
        await connectDataSource({
          connectionInstanceId: id,
          dataSourceId: connection.dataSourceId,
        })
      }

      for (const [id] of startedConnections.current) {
        if (cancelled) return
        const connection = connections.find(
          (candidate) => candidate.connectionId === id,
        )
        if (connection?.status === 'connected') continue
        startedConnections.current.delete(id)
        await disconnectDataSource(id)
      }
    })
    return () => {
      cancelled = true
    }
  }, [connections, activeStore, enqueueTransition])

  if (!activeStore) return <>{children}</>
  return (
    <SyncStoreContext.Provider value={activeStore}>
      {children}
    </SyncStoreContext.Provider>
  )
}
const SyncStoreContext = createContext<StoreApi<SyncStore> | undefined>(
  undefined,
)

export const useSyncStore = <T,>(
  selector: (store: SyncStore) => T,
): T | undefined => {
  const storeApi = useContext(SyncStoreContext)
  return storeApi ? useStore(storeApi, selector) : undefined
}

export function useSyncDrop() {
  const storeApi = useContext(SyncStoreContext)
  return () => storeApi?.getState().drop()
}

export async function dropWorkspaceStorage(workspaceId: string) {
  await dropAppStorage(`db-${workspaceId}`)
}

const EMPTY_STATUS: ReplicationStatus = {
  isActive: false,
  isPulling: false,
  isPushing: false,
  isReconciling: false,
  lastPulledAt: null,
  lastPushedAt: null,
  lastReconciledAt: null,
  lastReplication: null,
  lastPushResult: null,
  lastPullResult: null,
  error: null,
}

export function useConnectionsWithSync() {
  const { connections } = useDataSourceConnections()
  const statuses = useSyncStore((s) => s.statuses) ?? {}

  return useMemo(() => {
    return connections.map((conn) => {
      const id = conn.connectionId

      return {
        ...conn,
        sync: {
          metadata: statuses[`metadata_${id}`] ?? EMPTY_STATUS,
          tasks: statuses[`tasks_${id}`] ?? EMPTY_STATUS,
          timeEntries: statuses[`timeEntries_${id}`] ?? EMPTY_STATUS,
        },
      }
    })
  }, [connections, statuses])
}
