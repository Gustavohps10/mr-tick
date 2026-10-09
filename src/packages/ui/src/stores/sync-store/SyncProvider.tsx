'use client'

import type { IHostBridge, LocalRuntimeSyncStatus } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { type QueryFilters, useQueryClient } from '@tanstack/react-query'
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
import { toast } from 'sonner'
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
import { registerDatabaseScope } from '@/local-runtime/persistence-client'

import { createSyncStore } from './createSyncStore'
import { ReplicationError } from './ReplicationError'
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
  const [runtimeGeneration, setRuntimeGeneration] = useState('')

  useEffect(
    () =>
      bridge.events.on<{ generation: string; state: string }>(
        'local-runtime:state',
        (state) => {
          if (state.state !== 'ready') return
          startedConnections.current.clear()
          setRuntimeGeneration(state.generation)
        },
      ),
    [bridge],
  )

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
    const close = bridge.events.on<{ workspaceId: string; requestId: string }>(
      'local-runtime:close-readers',
      (request) => {
        if (request.workspaceId !== workspace?.id) return
        enqueueTransition(async () => {
          const databaseName = activeStoreRef.current?.getState().db?.name
          await releaseActiveStore()
          if (databaseName) {
            const scope: QueryFilters = {
              predicate: (query) => query.queryKey[1] === databaseName,
            }
            await queryClient.cancelQueries(scope)
            queryClient.removeQueries(scope)
          }
          bridge.events.emit('local-runtime:reader-closed', request)
        })
      },
    )
    const reopen = bridge.events.on<{ workspaceId: string; requestId: string }>(
      'local-runtime:workspace-reopened',
      (request) => {
        if (request.workspaceId !== workspace?.id) return
        setRuntimeGeneration(request.requestId)
      },
    )
    return () => {
      close()
      reopen()
    }
  }, [
    bridge,
    workspace?.id,
    enqueueTransition,
    releaseActiveStore,
    queryClient,
  ])

  useEffect(() => {
    let cancelled = false
    const workspaceId = workspace?.id

    enqueueTransition(async () => {
      if (cancelled) return
      await releaseActiveStore()
      if (cancelled || !workspaceId) return

      const readiness = await bridge.localSync.request({
        action: 'status',
        workspaceId,
      })
      if (!readiness.ok || cancelled) return

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
      registerDatabaseScope(db, workspaceId)
      store.setState({
        forceSync: async (connectionInstanceId, direction) => {
          const response = await bridge.localSync.request({
            action: 'forceSync',
            workspaceId,
            connectionInstanceId,
            direction,
          })
          if (!response.ok)
            console.error(
              '[SYNC][reader] forceSync:',
              response.error.messageKey,
            )
        },
        reconcile: async (connectionInstanceId, windowDays) => {
          const response = await bridge.localSync.request({
            action: 'reconcile',
            workspaceId,
            connectionInstanceId,
            windowDays,
          })
          if (!response.ok)
            console.error(
              '[SYNC][reader] reconcile:',
              response.error.messageKey,
            )
        },
        connectDataSource: async (connection) => {
          const response = await bridge.localSync.request({
            action: 'connect',
            workspaceId,
            ...connection,
          })
          if (!response.ok) toast.error(response.error.messageKey)
        },
        disconnectDataSource: async (connectionInstanceId) => {
          const response = await bridge.localSync.request({
            action: 'disconnect',
            workspaceId,
            connectionInstanceId,
          })
          if (!response.ok) toast.error(response.error.messageKey)
        },
        resetDatabase: async () => {
          const response = await bridge.localSync.request({
            action: 'reset',
            workspaceId,
          })
          if (!response.ok) toast.error(response.error.messageKey)
        },
        drop: async () => {
          const response = await bridge.localSync.request({
            action: 'drop',
            workspaceId,
          })
          if (!response.ok)
            console.error('[SYNC][reader] drop:', response.error.messageKey)
        },
      })
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
    runtimeGeneration,
  ])

  useEffect(() => {
    let cancelled = false
    const store = activeStore
    enqueueTransition(async () => {
      if (cancelled || !store || store !== activeStoreRef.current) return
      const { isInitialized } = store.getState()
      const workspaceId = workspace?.id
      if (!workspaceId) return
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
        const response = await bridge.localSync.request({
          action: 'connect',
          workspaceId,
          connectionInstanceId: id,
          dataSourceId: connection.dataSourceId,
        })
        if (!response.ok) startedConnections.current.delete(id)
      }

      for (const [id] of startedConnections.current) {
        if (cancelled) return
        const connection = connections.find(
          (candidate) => candidate.connectionId === id,
        )
        if (connection?.status === 'connected') continue
        startedConnections.current.delete(id)
        const response = await bridge.localSync.request({
          action: 'disconnect',
          workspaceId,
          connectionInstanceId: id,
        })
        if (!response.ok)
          console.error('[SYNC][reader] disconnect:', response.error.messageKey)
      }
    })
    return () => {
      cancelled = true
    }
  }, [connections, activeStore, enqueueTransition, bridge, workspace?.id])

  useEffect(() => {
    const store = activeStore
    const workspaceId = workspace?.id
    if (!store || !workspaceId) return
    let cancelled = false
    let receivedEvents = 0
    const apply = (updates: LocalRuntimeSyncStatus[]) => {
      if (cancelled || activeStoreRef.current !== store) return
      store.setState((state) => {
        const statuses = { ...state.statuses }
        for (const update of updates) {
          statuses[update.key] = {
            ...EMPTY_STATUS,
            ...statuses[update.key],
            isActive: update.isActive,
            isPulling: update.isPulling,
            isPushing: update.isPushing,
            isReconciling: update.isReconciling,
            lastPulledAt: update.lastPulledAt
              ? new Date(update.lastPulledAt)
              : null,
            lastPushedAt: update.lastPushedAt
              ? new Date(update.lastPushedAt)
              : null,
            lastReconciledAt: update.lastReconciledAt
              ? new Date(update.lastReconciledAt)
              : null,
            lastReplication: update.lastReplication
              ? new Date(update.lastReplication)
              : null,
            lastPushResult: update.lastPushResult,
            lastPullResult: update.lastPullResult,
            error: update.error
              ? new ReplicationError(update.error, update.failures ?? [])
              : null,
          }
        }
        return { statuses }
      })
    }
    const unsubscribe = bridge.events.on<{
      workspaceId: string
      statuses: LocalRuntimeSyncStatus[]
    }>('local-runtime:sync-status', (event) => {
      if (event.workspaceId !== workspaceId) return
      receivedEvents += 1
      apply(event.statuses)
    })
    void bridge.localSync
      .request({ action: 'status', workspaceId })
      .then((response) => {
        if (!response.ok || !response.statuses || receivedEvents > 0) return
        apply(response.statuses)
      })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [activeStore, bridge, workspace?.id, runtimeGeneration])

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
  const bridge = useHostBridge()
  const { workspace } = useWorkspace()
  return async () => {
    if (!workspace?.id) return false
    const result = await dropWorkspaceStorage(bridge, workspace.id)
    if (result.isFailure()) {
      toast.error(result.failure.messageKey)
      return false
    }
    return true
  }
}

export async function dropWorkspaceStorage(
  bridge: IHostBridge,
  workspaceId: string,
): Promise<Either<AppError, void>> {
  const response = await bridge.localSync.request({
    action: 'drop',
    workspaceId,
  })
  if (!response.ok)
    return Either.failure(
      AppError.Http(response.error.statusCode, response.error.messageKey),
    )
  return Either.success()
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
