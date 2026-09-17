import { addRxPlugin, createRxDatabase, RXDB_VERSION } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'

import { automationsSchema } from '@/local-db/schemas/automations-schema'
import { kanbanColumnsSchema } from '@/local-db/schemas/kanban-column-schema'
import { kanbanTaskColumnsSchema } from '@/local-db/schemas/kanban-task-columns-schema'
import { metadataSyncSchema } from '@/local-db/schemas/metadata-sync-schema'
import { tasksSyncSchema } from '@/local-db/schemas/tasks-sync-schema'
import { timeEntriesSyncSchema } from '@/local-db/schemas/time-entries-sync-schema'

import { AppDatabase } from './types'

// --- DEBUG HELPERS ---
const shouldForceRxDBDebug = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    const byQuery = new URLSearchParams(window.location.search).get('rxdbDebug')
    const byStorage = window.localStorage.getItem('RXDB_DEBUG')
    if (byQuery === '1') return true
    if (byStorage === '1') return true
    return false
  } catch {
    return false
  }
}

// --- PLUGINS INIT (Executado apenas 1x globalmente) ---
let devModePluginPromise: Promise<void> | null = null
let queryBuilderPluginPromise: Promise<void> | null = null
let leaderElectionPluginPromise: Promise<void> | null = null

export const ensurePlugins = async (isDevelopment: boolean): Promise<void> => {
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

  if (!leaderElectionPluginPromise) {
    leaderElectionPluginPromise = (async () => {
      console.log('[SYNC][plugins] carregando RxDBLeaderElectionPlugin')
      const { RxDBLeaderElectionPlugin } =
        await import('rxdb/plugins/leader-election')
      addRxPlugin(RxDBLeaderElectionPlugin)
      console.log(
        '[SYNC][plugins] RxDBLeaderElectionPlugin carregado com sucesso',
      )
    })()
  }

  const isDevModeActive = isDevelopment ? true : forceDebug

  if (isDevModeActive && !devModePluginPromise) {
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
  await leaderElectionPluginPromise
  if (devModePluginPromise) {
    await devModePluginPromise
  }
}

// --- STORAGE ---
const createAppStorage = (useMemoryStorage: boolean) => {
  if (useMemoryStorage) {
    console.log(
      '[SYNC][storage] criando storage in-memory (Memory + validate-ajv)',
    )
    return wrappedValidateAjvStorage({ storage: getRxStorageMemory() })
  }
  console.log('[SYNC][storage] criando storage (Dexie + validate-ajv)')
  return wrappedValidateAjvStorage({ storage: getRxStorageDexie() })
}

export const dropAppStorage = async (dbName: string): Promise<void> => {
  if (typeof window === 'undefined') return
  if (typeof indexedDB === 'undefined') return
  try {
    const allDbs = await indexedDB.databases()
    console.log('[SYNC][storage] deletando bancos matching:', dbName, allDbs)
    await Promise.all(
      allDbs
        .filter((d) => {
          if (!d.name) return false
          return d.name.includes(dbName)
        })
        .map(
          (d) =>
            new Promise<void>((resolve) => {
              if (!d.name) {
                resolve()
                return
              }
              const req = indexedDB.deleteDatabase(d.name)
              req.onsuccess = () => resolve()
              req.onerror = () => resolve()
              req.onblocked = () => resolve()
            }),
        ),
    )
  } catch (dropErr) {
    console.warn('[SYNC][storage] erro ao deletar banco IndexedDB:', dropErr)
  }
}

// --- DATABASE CACHE (Singleton para evitar DB9) ---
export const dbPromiseCache = new Map<string, Promise<AppDatabase>>()

export const getOrCreateDatabase = async (
  workspaceId: string,
  isDevelopment: boolean,
  useMemoryStorage: boolean = false,
): Promise<AppDatabase> => {
  const dbName = useMemoryStorage
    ? `db-memory-${workspaceId}`
    : `db-${workspaceId}`

  console.log('[SYNC][db] getOrCreateDatabase chamado', {
    dbName,
    isDevelopment,
    useMemoryStorage,
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
    if (!useMemoryStorage && typeof indexedDB !== 'undefined') {
      try {
        const existingDbs = await indexedDB.databases()
        console.log('[SYNC][db] bancos existentes no IndexedDB:', {
          dbName,
          total: existingDbs.length,
          nomes: existingDbs.map((d) => d.name),
        })
      } catch (checkErr) {
        console.warn(
          '[SYNC][db] não foi possível listar bancos do IndexedDB:',
          checkErr,
        )
      }
    }

    console.log('[SYNC][db] chamando createRxDatabase...', {
      name: dbName,
      rxdbVersion: RXDB_VERSION,
      useMemoryStorage,
    })

    const isDevModeActive = isDevelopment ? true : shouldForceRxDBDebug()

    const db = await createRxDatabase<AppDatabase['collections']>({
      name: dbName,
      storage: createAppStorage(useMemoryStorage),
      ignoreDuplicate: isDevModeActive,
      closeDuplicates: true,
      multiInstance: false,
    })

    console.log('[SYNC][db] createRxDatabase OK, adicionando coleções...', {
      name: dbName,
      colecoes: ['timeEntries', 'tasks', 'metadata'],
    })

    try {
      await db.addCollections({
        timeEntries: {
          schema: timeEntriesSyncSchema,
        },
        tasks: {
          schema: tasksSyncSchema,
        },
        metadata: {
          schema: metadataSyncSchema,
        },
        kanbanColumns: {
          schema: kanbanColumnsSchema,
        },
        kanbanTaskColumns: {
          schema: kanbanTaskColumnsSchema,
        },
        automations: {
          schema: automationsSchema,
        },
      })
      console.log('[SYNC][db] addCollections OK', { name: dbName })
    } catch (colErr) {
      console.error(
        '[SYNC][db] FALHA em addCollections, fechando banco...',
        colErr,
      )
      try {
        await db.close()
      } catch {
        // Ignora erro ao fechar após falha
      }
      throw colErr
    }

    return db
  })()

  dbPromiseCache.set(dbName, promise)

  promise.catch(() => {
    console.log('[SYNC][db] removendo entrada do cache após falha:', dbName)
    if (dbPromiseCache.get(dbName) === promise) {
      dbPromiseCache.delete(dbName)
    }
  })

  return promise
}
