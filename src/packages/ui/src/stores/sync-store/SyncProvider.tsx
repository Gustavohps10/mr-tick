'use client'

import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  ReactNode,
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
import { useOpenAPI } from '@/hooks/use-open-api'
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
}

export const SyncProvider: React.FC<SyncProviderProps> = ({
  children,
  useMemoryStorage = false,
}) => {
  const { isDevelopment } = useEnvironment()
  const { workspace } = useWorkspace()
  const openAPI = useOpenAPI()
  const { connections } = useDataSourceConnections()
  const queryClient = useQueryClient()

  const [activeStore, setActiveStore] = useState<StoreApi<SyncStore> | null>(
    null,
  )

  const currentWorkspaceId = useRef<string | null>(null)
  const activeStoreRef = useRef<StoreApi<SyncStore> | null>(null)
  activeStoreRef.current = activeStore

  const cacheSyncHandleRef = useRef<RxDBQueryCacheSyncHandle | null>(null)

  const startedConnections = useRef<
    Map<ConnectionInstanceId, { dataSourceId: string }>
  >(new Map())

  useEffect(() => {
    let isCancelled = false
    const runId = Math.random().toString(36).slice(2, 8)

    const handleWorkspaceChange = async () => {
      const nextWorkspaceId = workspace?.id ?? null

      console.log('[SYNC][provider] handleWorkspaceChange disparado', {
        runId,
        nextWorkspaceId,
        workspaceIdAnterior: currentWorkspaceId.current,
        jaTemStoreAtiva: !!activeStoreRef.current,
        isDevelopment,
      })

      if (
        currentWorkspaceId.current === nextWorkspaceId &&
        activeStoreRef.current
      ) {
        console.log(
          '[SYNC][provider] mesmo workspace + store já ativa, ignorando',
          { runId, nextWorkspaceId },
        )
        return
      }

      if (activeStoreRef.current) {
        console.log('[SYNC][provider] destruindo store anterior', { runId })
        const storeToDestroy = activeStoreRef.current
        activeStoreRef.current = null
        setActiveStore(null)
        startedConnections.current.clear()
        if (cacheSyncHandleRef.current) {
          cacheSyncHandleRef.current.unsubscribe()
          cacheSyncHandleRef.current = null
        }
        await storeToDestroy.getState().destroy()
        console.log('[SYNC][provider] store anterior destruída', { runId })
      }

      currentWorkspaceId.current = nextWorkspaceId

      if (!nextWorkspaceId) {
        console.log('[SYNC][provider] sem workspace selecionado, encerrando', {
          runId,
        })
        return
      }

      try {
        console.log('[SYNC][provider] criando nova store para workspace', {
          runId,
          nextWorkspaceId,
        })

        const isMemoryActive = useMemoryStorage ? true : false

        const newStore = createSyncStore(
          nextWorkspaceId,
          openAPI,
          isDevelopment,
          isMemoryActive,
        )

        console.log('[SYNC][provider] inicializando nova store...', { runId })
        await newStore.getState().init()

        if (isCancelled) {
          console.log(
            '[SYNC][provider] effect cancelado durante init, destruindo store criada',
            { runId, nextWorkspaceId },
          )
          await newStore.getState().destroy()
          return
        }

        if (currentWorkspaceId.current !== nextWorkspaceId) {
          console.log(
            '[SYNC][provider] workspace mudou durante init, destruindo store obsoleta',
            { runId, nextWorkspaceId, current: currentWorkspaceId.current },
          )
          await newStore.getState().destroy()
          return
        }

        console.log('[SYNC][provider] store pronta, ativando no context', {
          runId,
          nextWorkspaceId,
        })
        startedConnections.current.clear()
        activeStoreRef.current = newStore
        setActiveStore(newStore)

        const db = newStore.getState().db
        if (db) {
          if (cacheSyncHandleRef.current) {
            cacheSyncHandleRef.current.unsubscribe()
          }
          cacheSyncHandleRef.current = setupRxDBQueryCacheSync(db, queryClient)

          const tempTimeEntryStore = createTimeEntryStore(openAPI)
          await tempTimeEntryStore.getState().recoverRunningEntry(db)
          console.log('[SYNC][provider] recoverRunningEntry concluído', {
            runId,
          })
        }
      } catch (err) {
        console.error(
          `[SYNC][provider] Erro ao inicializar store (workspace: ${nextWorkspaceId}, runId: ${runId}):`,
          err,
        )
      }
    }

    handleWorkspaceChange()

    return () => {
      console.log('[SYNC][provider] cleanup do effect disparado', { runId })
      isCancelled = true
      if (cacheSyncHandleRef.current) {
        cacheSyncHandleRef.current.unsubscribe()
        cacheSyncHandleRef.current = null
      }
    }
  }, [workspace?.id, openAPI, isDevelopment, useMemoryStorage])

  useEffect(() => {
    const handleConnectionsChange = async () => {
      const store = activeStoreRef.current
      if (!store) return

      const { isInitialized, connectDataSource, disconnectDataSource } =
        store.getState()
      if (!isInitialized) return

      for (const conn of connections) {
        const connId = conn.connectionId
        const isAlreadyStarted = startedConnections.current.has(connId)

        if (conn.status === 'connected' && !isAlreadyStarted) {
          if (!conn.dataSourceId) continue

          startedConnections.current.set(connId, {
            dataSourceId: conn.dataSourceId,
          })

          console.log('[SYNC] STARTING', connId)

          try {
            await connectDataSource({
              connectionInstanceId: connId,
              dataSourceId: conn.dataSourceId,
            })
          } catch (err) {
            console.error(`[SYNC] Erro ao conectar ${connId}:`, err)
          }
        }
      }

      for (const [connId] of startedConnections.current.entries()) {
        const currentConn = connections.find((c) => c.connectionId === connId)

        if (!currentConn || currentConn.status !== 'connected') {
          startedConnections.current.delete(connId)

          console.log('[SYNC] STOPPING', connId)

          try {
            await disconnectDataSource(connId)
          } catch (err) {
            console.error(`[SYNC] Erro ao desconectar ${connId}:`, err)
          }
        }
      }
    }

    handleConnectionsChange()
  }, [connections, activeStore])

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
