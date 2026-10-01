import { describe, expect, it } from 'vitest'

import {
  ensurePlugins,
  getOrCreateDatabase,
  removeDatabaseFromCache,
} from '@/stores/sync-store/storage'

describe('Tasks Schema Validation', () => {
  it('deve aceitar tarefa com description null, dueDate null e sem assignedTo sem erro de validação Ajv', async () => {
    const workspaceId = `ws-task-schema-test-${Date.now()}`
    await ensurePlugins(false)

    const db = await getOrCreateDatabase(workspaceId, false, true)
    const collection = db.collections.tasks

    const testDoc = {
      id: 'gustavohps10-redmine-2df61e0d::76314',
      sourceId: '76314',
      dataSourceId: 'gustavohps10-redmine',
      connectionInstanceId: 'gustavohps10-redmine-2df61e0d',
      _deleted: false,
      syncStatus: 'synced' as const,
      lastPulledAt: '2026-10-01T17:18:43.199Z',
      lastPushedAt: null,
      lastReconciledAt: '2026-10-01T17:18:43.199Z',
      title: 'TAREFA - DAILY',
      description: null,
      projectName: 'MOVIMENTAÇÕES',
      url: 'http://redmine.atakone.com.br/issues/76314',
      tracker: { id: '5' },
      status: { id: '1', name: 'Nova' },
      priority: { id: '2', name: 'Normal' },
      author: { id: '142', name: 'Isabela Caetano' },
      doneRatio: 0,
      createdAt: '2026-08-06T17:54:47.000Z',
      updatedAt: '2026-08-06T17:54:47.000Z',
      startDate: '2026-08-06T00:00:00.000Z',
      dueDate: null,
      timeEntryIds: [],
    }

    const inserted = await collection.insert(testDoc)
    expect(inserted).toBeDefined()
    expect(inserted.description).toBeNull()
    expect(inserted.dueDate).toBeNull()

    await db.close()
    removeDatabaseFromCache(workspaceId, true)
  })
})
