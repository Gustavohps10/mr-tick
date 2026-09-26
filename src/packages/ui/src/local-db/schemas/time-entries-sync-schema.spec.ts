import { describe, expect, it } from 'vitest'

import {
  ensurePlugins,
  getOrCreateDatabase,
  removeDatabaseFromCache,
} from '@/stores/sync-store/storage'

describe('TimeEntries Schema Validation (STR-06)', () => {
  it('deve aceitar time entry com comments null e endDate null sem erro de validação Ajv', async () => {
    const workspaceId = `ws-schema-test-${Date.now()}`
    await ensurePlugins(false)

    const db = await getOrCreateDatabase(workspaceId, false, true)
    const collection = db.collections.timeEntries

    // Documento com comments: null e endDate: null (cenário real de provedores como Redmine/Jira)
    const testDoc = {
      id: crypto.randomUUID(),
      remoteId: '212575',
      dataSourceId: 'gustavohps10-redmine',
      connectionInstanceId: 'gustavohps10-redmine-b32834d1',
      _deleted: false,
      syncStatus: 'synced' as const,
      lastPulledAt: '2026-09-26T02:43:56.088Z',
      lastPushedAt: null,
      task: { id: '77773' },
      activity: { id: '9', name: 'Desenvolvimento' },
      user: { id: '230', name: 'Gustavo Henrique' },
      timeSpent: 0.83,
      comments: null,
      startDate: '2026-09-24T17:01:54.000Z',
      endDate: null,
      createdAt: '2026-09-25T17:51:42.000Z',
      updatedAt: '2026-09-25T17:51:42.000Z',
      timeStatus: 'finished' as const,
      source: 'manual' as const,
      type: 'manual' as const,
    }

    // Inserção deve suceder sem lançar RxError (status 422 - must be string)
    const inserted = await collection.insert(testDoc)
    expect(inserted).toBeDefined()
    expect(inserted.comments).toBeNull()
    expect(inserted.endDate).toBeNull()

    // Documento com comments preenchido como string
    const testDocWithString = {
      ...testDoc,
      id: crypto.randomUUID(),
      remoteId: '212576',
      comments: 'Implementação de feature e testes unitários',
      endDate: '2026-09-24T18:00:00.000Z',
    }

    const insertedString = await collection.insert(testDocWithString)
    expect(insertedString).toBeDefined()
    expect(insertedString.comments).toBe(
      'Implementação de feature e testes unitários',
    )
    expect(insertedString.endDate).toBe('2026-09-24T18:00:00.000Z')

    await db.close()
    removeDatabaseFromCache(workspaceId, true)
  })
})
