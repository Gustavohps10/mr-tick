'use client'

import { IOpenAPI } from '@mr-tick/sdk'
import { TaskViewModel, TimeEntryViewModel } from '@mr-tick/shared/view-models'
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  addRxPlugin,
  createRxDatabase,
  RxCollection,
  RxDatabase,
  RXDB_VERSION,
  RxError,
} from 'rxdb'
import {
  replicateRxCollection,
  RxReplicationState,
} from 'rxdb/plugins/replication'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import { Subscription } from 'rxjs'
import { createStore, type StoreApi, useStore } from 'zustand'

import {
  type ConnectionInstanceId,
  useDataSourceConnections,
} from '@/contexts/DataSourceConnectionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useEnvironment } from '@/hooks'
import { useOpenAPI } from '@/hooks/use-open-api'
import { automationsSchema } from '@/local-db/schemas/automations-schema'
import { kanbanColumnsSchema } from '@/local-db/schemas/kanban-column-schema'
import { kanbanTaskColumnsSchema } from '@/local-db/schemas/kanban-task-columns-schema'
import {
  metadataSyncSchema,
  SyncMetadataRxDBDTO,
} from '@/local-db/schemas/metadata-sync-schema'
import {
  SyncTaskRxDBDTO,
  tasksSyncSchema,
} from '@/local-db/schemas/tasks-sync-schema'
import {
  SyncTimeEntryRxDBDTO,
  timeEntriesSyncSchema,
} from '@/local-db/schemas/time-entries-sync-schema'
import { createTimeEntryStore } from '@/stores/timeEntryStore'

// --- DEBUG HELPERS ---
// DB9 (e outros códigos do RxDB) são reaproveitados entre versões da lib e,
// em build de produção, a mensagem completa some (só sobra o código). Para
// diagnosticar de verdade precisamos, em algum momento, carregar o
// dev-mode plugin também fora do ambiente de dev — só assim o RxDB devolve
// o texto humano do erro. Ativamos isso via flag manual (localStorage ou
// query string), NUNCA automaticamente em produção normal.
const shouldForceRxDBDebug = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    const byQuery = new URLSearchParams(window.location.search).get('rxdbDebug')
    const byStorage = window.localStorage.getItem('RXDB_DEBUG')
    return byQuery === '1' || byStorage === '1'
  } catch {
    return false
  }
}

// --- PLUGINS INIT (Executado apenas 1x globalmente) ---
let devModePluginPromise: Promise<void> | null = null
let queryBuilderPluginPromise: Promise<void> | null = null

const ensurePlugins = async (isDevelopment: boolean): Promise<void> => {
  const forceDebug = shouldForceRxDBDebug()

  if (!queryBuilderPluginPromise) {
    queryBuilderPluginPromise = (async () => {
      console.log('[SYNC][plugins] carregando RxDBQueryBuilderPlugin')
      const { RxDBQueryBuilderPlugin } =
        await import('rxdb/plugins/query-builder')
      addRxPlugin(RxDBQueryBuilderPlugin)
      console.log(
        '[SYNC][plugins] RxDBQueryBuilderPlugin carregado com sucesso',
      )
    })()
  }

  if ((isDevelopment || forceDebug) && !devModePluginPromise) {
    devModePluginPromise = (async () => {
      console.log('[SYNC][plugins] carregando RxDBDevModePlugin', {
        motivo: isDevelopment
          ? 'isDevelopment=true'
          : 'forceDebug=true (?rxdbDebug=1 ou localStorage.RXDB_DEBUG=1)',
      })
      const { RxDBDevModePlugin } = await import('rxdb/plugins/dev-mode')
      addRxPlugin(RxDBDevModePlugin)
      console.log('[SYNC][plugins] RxDBDevModePlugin carregado com sucesso')
    })()
  }

  await queryBuilderPluginPromise
  if (devModePluginPromise) {
    await devModePluginPromise
  }
}

// --- TYPES ---
export type ReplicationCheckpoint = { updatedAt: string; id: string }
export type AppCollections = {
  timeEntries: RxCollection<SyncTimeEntryRxDBDTO>
  tasks: RxCollection<SyncTaskRxDBDTO>
  metadata: RxCollection<SyncMetadataRxDBDTO>
  kanbanColumns: RxCollection<any>
  kanbanTaskColumns: RxCollection<any>
  automations: RxCollection<any>
}
export type AppDatabase = RxDatabase<AppCollections>
export interface ReplicationStatus {
  isActive: boolean
  isPulling: boolean
  isPushing: boolean
  lastReplication: Date | null
  error: Error | RxError | null
}
export interface IReplicationStrategy<T, C> {
  pull: (
    checkpoint: C | undefined,
    batchSize: number,
  ) => Promise<{ documents: T[]; checkpoint: C }>
  push: (rows: unknown[]) => Promise<unknown[]>
}
export interface SyncState {
  db: AppDatabase | null
  statuses: Record<string, ReplicationStatus>
  isInitialized: boolean
}
export type SyncStore = SyncState & {
  init: () => Promise<void>
  destroy: () => Promise<void>
  drop: () => Promise<void>
  resetDatabase: () => Promise<void>
  forceSync: (
    connectionInstanceId?: string,
    direction?: 'pull' | 'push' | 'both',
  ) => void
  connectDataSource: (params: {
    connectionInstanceId: ConnectionInstanceId
    dataSourceId: string
  }) => Promise<void>
  disconnectDataSource: (
    connectionInstanceId: ConnectionInstanceId,
  ) => Promise<void>
}
export interface DataSourceRef {
  id: string
  dataSourceId: string
}

// --- STORAGE ---
const createAppStorage = () => {
  console.log('[SYNC][storage] criando storage (Dexie + validate-ajv)')
  return wrappedValidateAjvStorage({ storage: getRxStorageDexie() })
}

const dropAppStorage = async (dbName: string) => {
  const allDbs = await indexedDB.databases()
  console.log('DELETANDO', allDbs)
  await Promise.all(
    allDbs
      .filter((d) => d.name?.includes(dbName))
      .map(
        (d) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(d.name!)
            req.onsuccess = () => resolve()
            req.onerror = () => resolve()
            req.onblocked = () => resolve()
          }),
      ),
  )
}

// --- HELPERS ---
const compositeId = (connId: string, extId: string) => `${connId}::${extId}`
const dateToISO = (
  val: Date | string | null | undefined,
): string | undefined =>
  val instanceof Date ? val.toISOString() : val ? String(val) : undefined

// --- STRATEGIES ---
class MetadataStrategy implements IReplicationStrategy<
  SyncMetadataRxDBDTO,
  ReplicationCheckpoint
> {
  constructor(
    private client: IOpenAPI,
    private workspaceId: string,
    private connectionInstanceId: string,
    private pluginId: string,
  ) {}

  async pull(
    checkpoint: ReplicationCheckpoint | undefined,
    batchSize: number,
  ): Promise<{
    documents: SyncMetadataRxDBDTO[]
    checkpoint: ReplicationCheckpoint
  }> {
    const syncId = `metadata_sync_${this.connectionInstanceId}`
    if (checkpoint?.id === syncId) return { documents: [], checkpoint }

    const res = await this.client.services.metadata.pull({
      body: {
        workspaceId: this.workspaceId,
        connectionInstanceId: this.connectionInstanceId,
        batch: batchSize,
        checkpoint: {
          id: checkpoint?.id || '',
          updatedAt: new Date(checkpoint?.updatedAt || 0),
        },
      },
    })

    if (!res.data)
      return {
        documents: [],
        checkpoint: checkpoint ?? {
          updatedAt: new Date(0).toISOString(),
          id: '',
        },
      }

    const now = new Date().toISOString()
    const doc: SyncMetadataRxDBDTO = {
      _id: compositeId(this.connectionInstanceId, 'metadata'),
      _deleted: false,
      dataSourceId: this.pluginId,
      connectionInstanceId: this.connectionInstanceId,
      id: 'metadata',
      participantRoles: res.data.participantRoles || [],
      estimationTypes: res.data.estimationTypes || [],
      trackStatuses: res.data.trackStatuses || [],
      taskStatuses: res.data.taskStatuses || [],
      taskPriorities: res.data.taskPriorities || [],
      activities: res.data.activities || [],
      syncedAt: now,
    }
    return { documents: [doc], checkpoint: { updatedAt: now, id: syncId } }
  }

  async push(): Promise<unknown[]> {
    return []
  }
}

class TasksStrategy implements IReplicationStrategy<
  SyncTaskRxDBDTO,
  ReplicationCheckpoint
> {
  constructor(
    private client: IOpenAPI,
    private workspaceId: string,
    private connectionInstanceId: string,
    private pluginId: string,
  ) {}

  async pull(
    checkpoint: ReplicationCheckpoint | undefined,
    batchSize: number,
  ): Promise<{
    documents: SyncTaskRxDBDTO[]
    checkpoint: ReplicationCheckpoint
  }> {
    const res = await this.client.services.tasks.pull({
      body: {
        workspaceId: this.workspaceId,
        connectionInstanceId: this.connectionInstanceId,
        batch: batchSize,
        checkpoint: {
          id: checkpoint?.id || '',
          updatedAt: new Date(checkpoint?.updatedAt || 0),
        },
      },
    })

    const data = res.data || []
    if (data.length === 0) return { documents: [], checkpoint: checkpoint! }
    const last = data[data.length - 1]
    const docs: SyncTaskRxDBDTO[] = data.map((item: TaskViewModel) => ({
      ...item,
      _id: compositeId(this.connectionInstanceId, String(item.id)),
      dataSourceId: this.pluginId,
      connectionInstanceId: this.connectionInstanceId,
      _deleted: false,
      createdAt: dateToISO(item.createdAt)!,
      updatedAt: dateToISO(item.updatedAt)!,
      startDate: dateToISO(item.startDate),
      dueDate: dateToISO(item.dueDate),
      timeEntryIds: [],
      statusChanges: item.statusChanges?.map((c) => ({
        fromStatus: c.fromStatus,
        toStatus: c.toStatus,
        description: c.description,
        changedBy: c.changedBy,
        changedAt: dateToISO(c.changedAt)!,
      })),
    }))
    return {
      documents: docs,
      checkpoint: {
        updatedAt: dateToISO(last.updatedAt)!,
        id: String(last.id),
      },
    }
  }

  async push(): Promise<unknown[]> {
    return []
  }
}

class TimeEntriesStrategy implements IReplicationStrategy<
  SyncTimeEntryRxDBDTO,
  ReplicationCheckpoint
> {
  constructor(
    private client: IOpenAPI,
    private workspaceId: string,
    private connectionInstanceId: string,
    private pluginId: string,
  ) {}

  async pull(
    checkpoint: ReplicationCheckpoint | undefined,
    batchSize: number,
  ): Promise<{
    documents: SyncTimeEntryRxDBDTO[]
    checkpoint: ReplicationCheckpoint
  }> {
    console.log('ATIVADO PULL', this)
    const res = await this.client.services.timeEntries.pull({
      body: {
        workspaceId: this.workspaceId,
        connectionInstanceId: this.connectionInstanceId,
        batch: batchSize,
        checkpoint: {
          id: checkpoint?.id || '',
          updatedAt: new Date(checkpoint?.updatedAt || 0),
        },
      },
    })

    const data: TimeEntryViewModel[] = res.data || []
    if (data.length === 0) return { documents: [], checkpoint: checkpoint! }
    const last = data[data.length - 1]

    const docs: SyncTimeEntryRxDBDTO[] = data.map(
      (item: TimeEntryViewModel): SyncTimeEntryRxDBDTO => ({
        _id: compositeId(this.connectionInstanceId, String(item.id)),
        _deleted: false,
        id: String(item.id),
        dataSourceId: this.pluginId,
        connectionInstanceId: this.connectionInstanceId,
        task: item.task,
        activity: item.activity,
        user: item.user,
        timeSpent: item.timeSpent,
        comments: item.comments,
        startDate: dateToISO(item.startDate),
        endDate: dateToISO(item.endDate),
        createdAt: dateToISO(item.createdAt)!,
        updatedAt: dateToISO(item.updatedAt)!,
        syncedAt: new Date().toISOString(),
      }),
    )

    return {
      documents: docs,
      checkpoint: {
        updatedAt: dateToISO(last.updatedAt)!,
        id: String(last.id),
      },
    }
  }

  async push(): Promise<unknown[]> {
    return []
  }
}

// --- MODULE ---
class ReplicationModule {
  private instance?: RxReplicationState<unknown, unknown>
  private subs: Subscription[] = []
  private resyncInterval?: NodeJS.Timeout

  constructor(
    private collection: RxCollection,
    private strategy: IReplicationStrategy<unknown, unknown>,
    private options: {
      identifier: string
      batchSize?: number
      resyncSeconds?: number
      initialCheckpoint?: ReplicationCheckpoint
      onStatusChange: (s: Partial<ReplicationStatus>) => void
    },
  ) {}

  async start() {
    if (this.instance) return
    this.instance = replicateRxCollection({
      collection: this.collection,
      replicationIdentifier: this.options.identifier,
      live: true,
      retryTime: 30000,
      pull: {
        batchSize: this.options.batchSize || 25,
        initialCheckpoint: this.options.initialCheckpoint,
        handler: async (cp, batch) => {
          this.options.onStatusChange({ isPulling: true, error: null })
          try {
            return await this.strategy.pull(cp, batch)
          } catch (err) {
            throw err
          }
        },
      },
      push: {
        batchSize: 20,
        handler: (rows) => {
          this.options.onStatusChange({ isPushing: true, error: null })
          return this.strategy.push(rows)
        },
      },
    })
    this.subs.push(
      this.instance.active$.subscribe((isActive) => {
        if (!isActive)
          this.options.onStatusChange({
            isActive,
            isPulling: false,
            isPushing: false,
            lastReplication: new Date(),
          })
        else this.options.onStatusChange({ isActive })
      }),
      this.instance.error$.subscribe((error) =>
        this.options.onStatusChange({
          error,
          isPulling: false,
          isPushing: false,
        }),
      ),
    )
    if (this.options.resyncSeconds && this.options.resyncSeconds > 0) {
      this.resyncInterval = setInterval(
        () => this.instance?.reSync(),
        this.options.resyncSeconds * 1000,
      )
    }
  }

  forceSync(direction: 'pull' | 'push' | 'both' = 'both') {
    if (!this.instance) return
    this.instance.reSync()
  }

  async destroy() {
    if (this.resyncInterval) clearInterval(this.resyncInterval)
    this.subs.forEach((s) => s.unsubscribe())
    if (this.instance) await this.instance.cancel()
    this.instance = undefined
  }
}

// --- REPLICATION MAP ---
type ReplicationMap = Map<ConnectionInstanceId, Map<string, ReplicationModule>>

// --- COLLECTION CONFIGS ---
type CollectionConfig = {
  name: keyof Pick<AppCollections, 'metadata' | 'tasks' | 'timeEntries'>
  strategyFactory: (
    client: IOpenAPI,
    workspaceId: string,
    connectionInstanceId: string,
    dataSourceId: string,
  ) => IReplicationStrategy<unknown, unknown>
  interval: number
  batch: number
}

const COLLECTION_CONFIGS: CollectionConfig[] = [
  {
    name: 'metadata',
    strategyFactory: (client, workspaceId, connId, dsId) =>
      new MetadataStrategy(
        client,
        workspaceId,
        connId,
        dsId,
      ) as IReplicationStrategy<unknown, unknown>,
    interval: 3600,
    batch: 1,
  },
  {
    name: 'tasks',
    strategyFactory: (client, workspaceId, connId, dsId) =>
      new TasksStrategy(
        client,
        workspaceId,
        connId,
        dsId,
      ) as IReplicationStrategy<unknown, unknown>,
    interval: 300,
    batch: 30,
  },
  {
    name: 'timeEntries',
    strategyFactory: (client, workspaceId, connId, dsId) =>
      new TimeEntriesStrategy(
        client,
        workspaceId,
        connId,
        dsId,
      ) as IReplicationStrategy<unknown, unknown>,
    interval: 60,
    batch: 30,
  },
]

// --- DATABASE CACHE (Singleton para evitar DB9) ---
const dbPromiseCache = new Map<string, Promise<AppDatabase>>()

const getOrCreateDatabase = async (
  workspaceId: string,
  isDevelopment: boolean,
): Promise<AppDatabase> => {
  const dbName = `db-${workspaceId}`

  console.log('[SYNC][db] getOrCreateDatabase chamado', {
    dbName,
    isDevelopment,
    jaEstaNoCache: dbPromiseCache.has(dbName),
    chavesNoCache: Array.from(dbPromiseCache.keys()),
  })

  const cachedPromise = dbPromiseCache.get(dbName)
  if (cachedPromise) {
    try {
      const cachedDb = await cachedPromise
      if (!cachedDb.closed) {
        console.log('[SYNC][db] retornando database ativa do cache', dbName)
        return cachedDb
      }
    } catch {
      // Se a promise falhou, expurga do cache e recria
    }
    dbPromiseCache.delete(dbName)
  }

  const promise = (async () => {
    // Checa se já existem bancos com esse nome no IndexedDB antes de criar.
    // Ajuda a identificar se o problema é uma instância "fantasma" (aba
    // antiga, service worker, etc) que não foi fechada corretamente.
    try {
      if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
        const existing = await indexedDB.databases()
        console.log(
          '[SYNC][db] bancos existentes no IndexedDB antes de criar:',
          existing.map((d) => d.name).filter((n) => n?.includes(dbName)),
        )
      }
    } catch (e) {
      console.log('[SYNC][db] não foi possível listar indexedDB.databases()', e)
    }

    const rxDatabaseConfig = {
      name: dbName,
      storage: createAppStorage(),
      closeDuplicates: true,
      multiInstance: true,
      eventReduce: true,
      allowSlowCount: true,
    }

    console.log('[SYNC][db] chamando createRxDatabase com config:', {
      ...rxDatabaseConfig,
      storage: '<<RxStorage instance>>',
    })

    let db: AppDatabase
    try {
      db = await createRxDatabase<AppCollections>(rxDatabaseConfig)
      console.log('[SYNC][db] createRxDatabase OK', {
        dbName,
        name: db.name,
        colecoesExistentes: Object.keys(db.collections ?? {}),
      })
    } catch (err) {
      if (err instanceof RxError) {
        console.error('[SYNC][db] ERRO em createRxDatabase', {
          dbName,
          isDevelopment,
          code: err.code,
          message: err.message,
          parameters: err.parameters,
          errorCompleto: err,
        })
      } else if (err instanceof Error) {
        console.error('[SYNC][db] ERRO em createRxDatabase', {
          dbName,
          isDevelopment,
          message: err.message,
          errorCompleto: err,
        })
      }
      throw err
    }

    const collectionsToCreate: Record<string, any> = {}
    if (!db.metadata)
      collectionsToCreate.metadata = { schema: metadataSyncSchema }
    if (!db.tasks) collectionsToCreate.tasks = { schema: tasksSyncSchema }
    if (!db.timeEntries)
      collectionsToCreate.timeEntries = { schema: timeEntriesSyncSchema }
    if (!db.kanbanColumns)
      collectionsToCreate.kanbanColumns = { schema: kanbanColumnsSchema }
    if (!db.kanbanTaskColumns)
      collectionsToCreate.kanbanTaskColumns = {
        schema: kanbanTaskColumnsSchema,
      }
    if (!db.automations)
      collectionsToCreate.automations = { schema: automationsSchema }

    console.log(
      '[SYNC][db] coleções a criar nesta chamada:',
      Object.keys(collectionsToCreate),
    )

    if (Object.keys(collectionsToCreate).length > 0) {
      try {
        await db.addCollections(collectionsToCreate)
        console.log(
          '[SYNC][db] addCollections OK',
          Object.keys(collectionsToCreate),
        )
      } catch (err) {
        if (err instanceof RxError) {
          console.error('[SYNC][db] ERRO em addCollections', {
            code: err.code,
            message: err.message,
            parameters: err.parameters,
            errorCompleto: err,
          })
        } else if (err instanceof Error) {
          console.error('[SYNC][db] ERRO em addCollections', {
            message: err.message,
            errorCompleto: err,
          })
        }
        throw err
      }
    }

    return db
  })()

  dbPromiseCache.set(dbName, promise)

  // Se a criação falhar, remove do cache para não deixar uma promise
  // rejeitada presa lá (isso faria toda tentativa futura falhar igual,
  // mesmo corrigindo a causa raiz).
  promise.catch(() => {
    console.log('[SYNC][db] removendo entrada do cache após falha:', dbName)
    if (dbPromiseCache.get(dbName) === promise) {
      dbPromiseCache.delete(dbName)
    }
  })

  return promise
}

// --- STORE CORE ---
export const createSyncStore = (
  workspaceId: string,
  client: IOpenAPI,
  isDevelopment: boolean,
): StoreApi<SyncStore> => {
  const replications: ReplicationMap = new Map()

  const initialCheckpoint: ReplicationCheckpoint = {
    updatedAt: new Date(Date.now() - 5184000000).toISOString(), // 60 dias
    id: '',
  }

  const startConnectionModules = async (
    db: AppDatabase,
    connectionInstanceId: ConnectionInstanceId,
    dataSourceId: string,
    set: (fn: (state: SyncStore) => Partial<SyncStore>) => void,
  ) => {
    const connectionModules = new Map<string, ReplicationModule>()

    for (const config of COLLECTION_CONFIGS) {
      const strategy = config.strategyFactory(
        client,
        workspaceId,
        connectionInstanceId,
        dataSourceId,
      )

      const module = new ReplicationModule(
        db[config.name] as RxCollection,
        strategy,
        {
          identifier: `rep_${config.name}_${workspaceId}_${connectionInstanceId}`,
          resyncSeconds: config.interval,
          batchSize: config.batch,
          initialCheckpoint,
          onStatusChange: (status) =>
            set((state) => ({
              statuses: {
                ...state.statuses,
                [`${config.name}_${connectionInstanceId}`]: {
                  ...state.statuses[`${config.name}_${connectionInstanceId}`],
                  ...status,
                },
              },
            })),
        },
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
    },

    disconnectDataSource: async (connectionInstanceId) => {
      await destroyConnectionModules(connectionInstanceId, set)
    },

    forceSync: (
      connectionInstanceId?: string,
      direction: 'pull' | 'push' | 'both' = 'both',
    ) => {
      console.log(
        '[SYNC] Forçando sincronização manual...',
        connectionInstanceId || 'TODAS AS FONTES',
        '| Direção:',
        direction,
      )
      if (connectionInstanceId) {
        const modules = replications.get(connectionInstanceId)
        if (modules) {
          Array.from(modules.values()).forEach((m) => m.forceSync(direction))
        }
      } else {
        Array.from(replications.values()).forEach((modules) => {
          Array.from(modules.values()).forEach((m) => m.forceSync(direction))
        })
      }
    },

    drop: async () => {
      const { db } = get()
      if (!db) return
      await destroyAllModules()

      // Limpa do cache e remove de fato
      dbPromiseCache.delete(`db-${workspaceId}`)
      await db.remove()
      await dropAppStorage(`db-${workspaceId}`)

      set({ db: null, isInitialized: false, statuses: {} })
    },

    destroy: async () => {
      const { db } = get()
      await destroyAllModules()

      // Limpa do cache e fecha conexões
      if (db) {
        dbPromiseCache.delete(`db-${workspaceId}`)
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

        console.log('[SYNC][init] passo 2/2: getOrCreateDatabase')
        // Chama pelo Helper com Cache global para evitar erro DB9
        const db = await getOrCreateDatabase(workspaceId, isDevelopment)

        console.log('[SYNC][init] concluído com sucesso', { workspaceId })
        set({ db, isInitialized: true })
      } catch (err) {
        if (err instanceof RxError) {
          console.error('[SYNC][init] Erro FATAL ao inicializar', {
            workspaceId,
            isDevelopment,
            code: err.code,
            message: err.message,
            parameters: err.parameters,
            errorCompleto: err,
          })
          if (err.code === 'DB9' && !isDevelopment) {
            console.error(
              '[SYNC][init] DICA: para ver a mensagem completa deste erro em produção, ' +
                'acesse a página com ?rxdbDebug=1 na URL (ou rode localStorage.setItem("RXDB_DEBUG","1") ' +
                'e recarregue) e reproduza o erro de novo. Isso carrega o dev-mode plugin do RxDB só para diagnóstico.',
            )
          }
        } else if (err instanceof Error) {
          console.error('[SYNC][init] Erro FATAL ao inicializar', {
            workspaceId,
            isDevelopment,
            message: err.message,
            errorCompleto: err,
          })
        }
        // Limpa cache se falhar
        dbPromiseCache.delete(`db-${workspaceId}`)
        throw err
      }
    },
  }))
}

// --- PROVIDER ---
export const SyncProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { isDevelopment } = useEnvironment()
  const { workspace } = useWorkspace()
  const openAPI = useOpenAPI()
  const { connections } = useDataSourceConnections()

  const [activeStore, setActiveStore] = useState<StoreApi<SyncStore> | null>(
    null,
  )

  const currentWorkspaceId = useRef<string | null>(null)
  const activeStoreRef = useRef<StoreApi<SyncStore> | null>(null)
  activeStoreRef.current = activeStore

  const startedConnections = useRef<
    Map<ConnectionInstanceId, { dataSourceId: string }>
  >(new Map())

  // Workspace muda → recria o banco do zero e recupera entradas ativas
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

      // 1. Destrói e aguarda a limpeza completa da instância anterior
      if (activeStoreRef.current) {
        console.log('[SYNC][provider] destruindo store anterior', { runId })
        const storeToDestroy = activeStoreRef.current
        activeStoreRef.current = null
        setActiveStore(null)
        startedConnections.current.clear()
        await storeToDestroy.getState().destroy()
        console.log('[SYNC][provider] store anterior destruída', { runId })
      }

      currentWorkspaceId.current = nextWorkspaceId

      if (!nextWorkspaceId || isCancelled) {
        console.log(
          '[SYNC][provider] abortando (sem workspaceId ou effect cancelado)',
          {
            runId,
            nextWorkspaceId,
            isCancelled,
          },
        )
        return
      }

      try {
        console.log('[SYNC][provider] criando nova store e chamando init()', {
          runId,
          nextWorkspaceId,
        })
        const newStore = createSyncStore(
          nextWorkspaceId,
          openAPI,
          isDevelopment,
        )
        await newStore.getState().init()

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
        activeStoreRef.current = newStore
        setActiveStore(newStore)

        const db = newStore.getState().db
        if (db) {
          const tempTimeEntryStore = createTimeEntryStore(openAPI)
          await tempTimeEntryStore.getState().recoverRunningEntry(db)
          console.log('[SYNC][provider] recoverRunningEntry concluído', {
            runId,
          })
        }
      } catch (err) {
        console.error('[SYNC][provider] Erro ao inicializar store:', {
          runId,
          nextWorkspaceId,
          err,
        })
      }
    }

    handleWorkspaceChange()

    return () => {
      console.log('[SYNC][provider] cleanup do effect disparado', { runId })
      isCancelled = true
    }
  }, [workspace?.id, openAPI, isDevelopment])

  // Connections mudam → liga/desliga motores individualmente
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
  lastReplication: null,
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
