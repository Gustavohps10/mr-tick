import { IHostBridge } from '@mr-tick/application'
import { RXDB_VERSION, RxError } from 'rxdb'
import { createStore, type StoreApi } from 'zustand'

import { ConnectionInstanceId } from '@/contexts/DataSourceConnectionsContext'

import {
  COLLECTION_CONFIGS,
  CollectionConfig,
  IReplicationModule,
  ReplicationModule,
} from './module'
import { reconcileTimeEntries } from './reconcileTimeEntries'
import {
  dropAppStorage,
  ensurePlugins,
  getDatabaseName,
  getOrCreateDatabase,
  removeDatabaseFromCache,
} from './storage'
import { AppDatabase, ReplicationCheckpoint, SyncStore } from './types'

type ReplicationMap = Map<ConnectionInstanceId, Map<string, IReplicationModule>>

export const createSyncStore = (
  workspaceId: string,
  client: IHostBridge,
  isDevelopment: boolean,
  useMemoryStorage: boolean = false,
  retryTime?: number,
): StoreApi<SyncStore> => {
  const replications: ReplicationMap = new Map()

  const initialCheckpoint: ReplicationCheckpoint = {
    updatedAt: new Date(Date.now() - 5184000000).toISOString(), // 60 dias
    id: '',
  }

  const createReplicationModule = (
    db: AppDatabase,
    config: CollectionConfig,
    connectionInstanceId: ConnectionInstanceId,
    dataSourceId: string,
    set: (fn: (state: SyncStore) => Partial<SyncStore>) => void,
  ): IReplicationModule => {
    if (config.name === 'metadata') {
      const strategy = config.strategyFactory(
        client,
        workspaceId,
        connectionInstanceId,
        dataSourceId,
      )
      return new ReplicationModule(db.metadata, strategy, {
        identifier: `rep_metadata_${workspaceId}_${connectionInstanceId}`,
        resyncSeconds: config.interval,
        batchSize: config.batch,
        retryTime,
        hasPush: config.hasPush,
        initialCheckpoint,
        onStatusChange: (status) =>
          set((state) => ({
            statuses: {
              ...state.statuses,
              [`metadata_${connectionInstanceId}`]: {
                ...state.statuses[`metadata_${connectionInstanceId}`],
                ...status,
              },
            },
          })),
      })
    }
    if (config.name === 'tasks') {
      const strategy = config.strategyFactory(
        client,
        workspaceId,
        connectionInstanceId,
        dataSourceId,
      )
      return new ReplicationModule(db.tasks, strategy, {
        identifier: `rep_tasks_${workspaceId}_${connectionInstanceId}`,
        resyncSeconds: config.interval,
        batchSize: config.batch,
        retryTime,
        hasPush: config.hasPush,
        initialCheckpoint,
        onStatusChange: (status) =>
          set((state) => ({
            statuses: {
              ...state.statuses,
              [`tasks_${connectionInstanceId}`]: {
                ...state.statuses[`tasks_${connectionInstanceId}`],
                ...status,
              },
            },
          })),
      })
    }
    const strategy = config.strategyFactory(
      client,
      workspaceId,
      connectionInstanceId,
      dataSourceId,
      db.timeEntries,
    )
    return new ReplicationModule(db.timeEntries, strategy, {
      identifier: `rep_timeEntries_${workspaceId}_${connectionInstanceId}`,
      resyncSeconds: config.interval,
      batchSize: config.batch,
      retryTime,
      hasPush: config.hasPush,
      initialCheckpoint,
      onStatusChange: (status) =>
        set((state) => ({
          statuses: {
            ...state.statuses,
            [`timeEntries_${connectionInstanceId}`]: {
              ...state.statuses[`timeEntries_${connectionInstanceId}`],
              ...status,
            },
          },
        })),
    })
  }

  const startConnectionModules = async (
    db: AppDatabase,
    connectionInstanceId: ConnectionInstanceId,
    dataSourceId: string,
    set: (fn: (state: SyncStore) => Partial<SyncStore>) => void,
  ) => {
    const connectionModules = new Map<string, IReplicationModule>()

    set((state) => {
      const nextStatuses = { ...state.statuses }
      COLLECTION_CONFIGS.forEach((config) => {
        const key = `${config.name}_${connectionInstanceId}`
        if (!nextStatuses[key]) {
          nextStatuses[key] = {
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
        }
      })
      return { statuses: nextStatuses }
    })

    for (const config of COLLECTION_CONFIGS) {
      const module = createReplicationModule(
        db,
        config,
        connectionInstanceId,
        dataSourceId,
        set,
      )
      await module.start()
      connectionModules.set(config.name, module)
    }

    replications.set(connectionInstanceId, connectionModules)
  }

  const destroyConnectionModules = async (
    connectionInstanceId: ConnectionInstanceId,
    set: (fn: (state: SyncStore) => Partial<SyncStore>) => void,
  ) => {
    const connectionModules = replications.get(connectionInstanceId)
    if (!connectionModules) return

    await Promise.all(
      Array.from(connectionModules.values()).map((m) => m.destroy()),
    )
    replications.delete(connectionInstanceId)

    set((state) => {
      const nextStatuses = { ...state.statuses }
      COLLECTION_CONFIGS.forEach((config) => {
        delete nextStatuses[`${config.name}_${connectionInstanceId}`]
      })
      return { statuses: nextStatuses }
    })
  }

  const destroyAllModules = async () => {
    await Promise.all(
      Array.from(replications.values()).flatMap((connectionModules) =>
        Array.from(connectionModules.values()).map((m) => m.destroy()),
      ),
    )
    replications.clear()
  }

  return createStore<SyncStore>((set, get) => ({
    db: null,
    statuses: {},
    isInitialized: false,

    connectDataSource: async ({ connectionInstanceId, dataSourceId }) => {
      const { db } = get()
      if (!db) return
      await destroyConnectionModules(connectionInstanceId, set)
      await startConnectionModules(db, connectionInstanceId, dataSourceId, set)
      // Dispara a reconciliação (sweep window) logo após conectar
      get().reconcile(connectionInstanceId).catch(console.error)
    },

    disconnectDataSource: async (connectionInstanceId) => {
      await destroyConnectionModules(connectionInstanceId, set)
    },

    forceSync: async (
      connectionInstanceId?: string,
      direction: 'pull' | 'push' | 'both' = 'both',
    ) => {
      const targetLabel = connectionInstanceId
        ? connectionInstanceId
        : 'TODAS AS FONTES'
      console.log(
        '[SYNC] Forçando sincronização manual...',
        targetLabel,
        '| Direção:',
        direction,
      )
      if (connectionInstanceId) {
        const modules = replications.get(connectionInstanceId)
        if (modules) {
          await Promise.all(
            Array.from(modules.values()).map((moduleItem) =>
              moduleItem.forceSync(direction),
            ),
          )
        }
        if (direction === 'pull' || direction === 'both') {
          await get().reconcile(connectionInstanceId)
        }
      } else {
        await Promise.all(
          Array.from(replications.entries()).map(async ([connId, modules]) => {
            await Promise.all(
              Array.from(modules.values()).map((moduleItem) =>
                moduleItem.forceSync(direction),
              ),
            )
            if (direction === 'pull' || direction === 'both') {
              await get().reconcile(connId)
            }
          }),
        )
      }
    },

    reconcile: async (
      connectionInstanceId?: string,
      windowDays: number = 30,
    ) => {
      if (!connectionInstanceId) {
        const connectionIds = Array.from(replications.keys())
        if (connectionIds.length === 0) return
        await Promise.all(
          connectionIds.map((connId) => get().reconcile(connId, windowDays)),
        )
        return
      }
      const { db } = get()
      if (!db || db.closed) return

      const timeEntriesCol = db.timeEntries
      if (!timeEntriesCol) {
        console.warn(
          '[SYNC][reconcile] Coleção timeEntries ainda não disponível no db',
        )
        return
      }

      set((state) => ({
        statuses: {
          ...state.statuses,
          [`timeEntries_${connectionInstanceId}`]: {
            ...state.statuses[`timeEntries_${connectionInstanceId}`],
            isReconciling: true,
          },
        },
      }))

      console.log(
        `[SYNC][reconcile] Iniciando varredura (Sweep Window: ${windowDays} dias) para ${connectionInstanceId}...`,
      )
      let completed = false
      try {
        const startDate = new Date(Date.now() - windowDays * 86400000)
        startDate.setHours(0, 0, 0, 0)

        const endDate = new Date()
        endDate.setDate(endDate.getDate() + 1)
        endDate.setHours(23, 59, 59, 999)

        const result = await reconcileTimeEntries(timeEntriesCol, client, {
          workspaceId,
          connectionInstanceId,
          startDate,
          endDate,
        })
        if (result.isFailure()) {
          const failure = result.failure
          set((state) => ({
            statuses: {
              ...state.statuses,
              [`timeEntries_${connectionInstanceId}`]: {
                ...state.statuses[`timeEntries_${connectionInstanceId}`],
                error: Object.assign(new Error(failure.messageKey), {
                  statusCode: failure.statusCode,
                }),
              },
            },
          }))
          return
        }
        completed = true
      } catch (err) {
        console.error('[SYNC][reconcile] Erro durante a varredura:', err)
      } finally {
        set((state) => ({
          statuses: {
            ...state.statuses,
            [`timeEntries_${connectionInstanceId}`]: {
              ...state.statuses[`timeEntries_${connectionInstanceId}`],
              isReconciling: false,
              lastReconciledAt: completed
                ? new Date()
                : state.statuses[`timeEntries_${connectionInstanceId}`]
                    .lastReconciledAt,
            },
          },
        }))
      }
    },

    drop: async () => {
      const { db } = get()
      if (!db) return
      await destroyAllModules()

      const dbName = getDatabaseName(workspaceId, useMemoryStorage)
      removeDatabaseFromCache(workspaceId, useMemoryStorage)
      await db.remove()
      await dropAppStorage(dbName)

      set({ db: null, isInitialized: false, statuses: {} })
    },

    destroy: async () => {
      const { db } = get()
      await destroyAllModules()

      if (db) {
        removeDatabaseFromCache(workspaceId, useMemoryStorage)
        await db.close()
      }

      set({ db: null, isInitialized: false, statuses: {} })
    },

    resetDatabase: async () => {
      console.log('[SYNC] Iniciando reset manual do banco local...')
      const { drop, init } = get()
      try {
        await drop()
        await init()
      } catch (err) {
        console.error(
          '[SYNC] Falha ao resetar banco, recarregando processo...',
          err,
        )
        window.location.reload()
      }
    },

    init: async () => {
      console.log('SYCRONIZADOR INICIALIZANDO....', {
        workspaceId,
        isDevelopment,
        rxdbVersion: RXDB_VERSION,
        ambienteNodeEnv:
          typeof process !== 'undefined'
            ? process.env.NODE_ENV
            : 'desconhecido',
      })

      if (get().isInitialized) {
        console.log('[SYNC][init] já estava inicializado, ignorando chamada')
        return
      }

      try {
        console.log('[SYNC][init] passo 1/2: ensurePlugins')
        await ensurePlugins(isDevelopment)

        console.log('[SYNC][init] passo 2/2: getOrCreateDatabase', {
          useMemoryStorage,
        })
        const db = await getOrCreateDatabase(
          workspaceId,
          isDevelopment,
          useMemoryStorage,
        )

        console.log('[SYNC][init] concluído com sucesso', { workspaceId })
        set({ db, isInitialized: true })
      } catch (err) {
        if (err instanceof RxError) {
          console.error(
            `[SYNC][init] Erro FATAL ao inicializar [${err.code}]: ${err.message}`,
            err,
          )
          if (err.code === 'DB9' && !isDevelopment) {
            console.error(
              '[SYNC][init] DICA: para ver a mensagem completa deste erro em produção, ' +
                'acesse a página com ?rxdbDebug=1 na URL (ou rode localStorage.setItem("RXDB_DEBUG","1") ' +
                'e recarregue) e reproduza o erro de novo. Isso carrega o dev-mode plugin do RxDB só para diagnóstico.',
            )
          }
        } else if (err instanceof Error) {
          console.error(
            `[SYNC][init] Erro FATAL ao inicializar: ${err.message}`,
            err,
          )
        } else {
          console.error('[SYNC][init] Erro FATAL ao inicializar:', err)
        }
        removeDatabaseFromCache(workspaceId, useMemoryStorage)
        throw err
      }
    },
  }))
}
