import { RxError } from 'rxdb'
import { describe, expect, it } from 'vitest'

import {
  dbPromiseCache,
  ensurePlugins,
  getDatabaseName,
  getOrCreateDatabase,
  isDb6Error,
  removeDatabaseFromCache,
} from './storage'

describe('Storage DB6 Auto-Healing (STR-05)', () => {
  it('deve identificar erro DB6 vindo de instância RxError', () => {
    const rxErr = new RxError('DB6', 'Schema version mismatch for collection')
    expect(isDb6Error(rxErr)).toBe(true)
  })

  it('deve identificar erro com propriedade code DB6', () => {
    const customErr = new Error('Schema mismatch')
    Object.assign(customErr, { code: 'DB6' })
    expect(isDb6Error(customErr)).toBe(true)
  })

  it('deve identificar erro contendo DB6 na mensagem', () => {
    const msgErr = new Error(
      'RxError (DB6): Another version of the schema was already added',
    )
    expect(isDb6Error(msgErr)).toBe(true)
  })

  it('deve retornar false para outros tipos de erro', () => {
    const regularErr = new Error('Network timeout')
    expect(isDb6Error(regularErr)).toBe(false)
  })
})

describe('Storage Database Lifecycle & Helpers (DB9 Prevention)', () => {
  it('deve gerar nomes de banco consistentes para armazenamento persistente e em memória', () => {
    const workspaceId = 'ws-test-123'
    expect(getDatabaseName(workspaceId, false)).toBe('db-ws-test-123')
    expect(getDatabaseName(workspaceId, true)).toBe('db-memory-ws-test-123')
  })

  it('deve remover a promise do cache corretamente via removeDatabaseFromCache', async () => {
    const workspaceId = `ws-cache-test-${Date.now()}`
    const dbName = getDatabaseName(workspaceId, true)

    await ensurePlugins(false)
    const db = await getOrCreateDatabase(workspaceId, false, true)

    expect(dbPromiseCache.has(dbName)).toBe(true)
    removeDatabaseFromCache(workspaceId, true)
    expect(dbPromiseCache.has(dbName)).toBe(false)

    await db.close()
  })

  it('deve inicializar banco com sucesso em modo de produção (isDevelopment=false) sem erro DB9', async () => {
    const workspaceId = `ws-prod-test-${Date.now()}`
    await ensurePlugins(false)

    const db = await getOrCreateDatabase(workspaceId, false, true)
    expect(db).toBeDefined()
    expect(db.name).toBe(`db-memory-${workspaceId}`)
    expect(db.collections.timeEntries).toBeDefined()
    expect(db.collections.tasks).toBeDefined()

    const cachedDb = await getOrCreateDatabase(workspaceId, false, true)
    expect(cachedDb).toBe(db)

    await db.close()
    removeDatabaseFromCache(workspaceId, true)
  })
})
