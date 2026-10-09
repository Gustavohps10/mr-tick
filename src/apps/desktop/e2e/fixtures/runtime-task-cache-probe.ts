import type { Page } from '@playwright/test'

interface StoredTaskProbe {
  sourceId?: string
  connectionInstanceId?: string
  title?: string
}
interface CachedTaskProbe {
  sourceId: string
  connectionInstanceId: string
  title: string
}
export async function inspectCachedTasks(
  page: Page,
  connectionInstanceId: string,
): Promise<CachedTaskProbe[]> {
  return page.evaluate(async (connectionId) => {
    const tasks: CachedTaskProbe[] = []
    for (const description of await indexedDB.databases()) {
      const databaseName = description.name
      if (databaseName === undefined) continue
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
        request.onupgradeneeded = () => {
          request.transaction?.abort()
          reject(new Error('TASK_PROBE_DATABASE_DISAPPEARED'))
        }
      })
      try {
        for (const storeName of Array.from(database.objectStoreNames)) {
          const documents = await new Promise<StoredTaskProbe[]>(
            (resolve, reject) => {
              const transaction = database.transaction(storeName, 'readonly')
              const request: IDBRequest<StoredTaskProbe[]> = transaction
                .objectStore(storeName)
                .getAll()
              transaction.onerror = () => reject(transaction.error)
              transaction.onabort = () => reject(transaction.error)
              transaction.oncomplete = () => resolve(request.result)
            },
          )
          for (const document of documents) {
            if (document === null || typeof document !== 'object') continue
            if (document.connectionInstanceId !== connectionId) continue
            if (
              typeof document.title !== 'string' ||
              typeof document.sourceId !== 'string'
            )
              continue
            tasks.push({
              sourceId: document.sourceId,
              connectionInstanceId: document.connectionInstanceId,
              title: document.title,
            })
          }
        }
      } finally {
        database.close()
      }
    }
    return tasks
  }, connectionInstanceId)
}
