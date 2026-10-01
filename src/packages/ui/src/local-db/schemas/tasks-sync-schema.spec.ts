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

    // Testar query do TaskPopover sem busca
    const selector: any = {
      _deleted: { $eq: false },
      connectionInstanceId: { $eq: 'gustavohps10-redmine-2df61e0d' },
    }
    const docs = await collection.find({ selector, limit: 30 }).exec()
    expect(docs.length).toBe(1)
    expect(docs[0].id).toBe('gustavohps10-redmine-2df61e0d::76314')

    // Testar query com busca por ID '76314'
    const searchSelector: any = {
      _deleted: { $eq: false },
      connectionInstanceId: { $eq: 'gustavohps10-redmine-2df61e0d' },
      $or: [
        { sourceId: { $regex: '76314', $options: 'i' } },
        { id: { $regex: '76314', $options: 'i' } },
        { title: { $regex: '76314', $options: 'i' } },
      ],
    }
    const searchDocs = await collection
      .find({ selector: searchSelector, limit: 30 })
      .exec()
    expect(searchDocs.length).toBe(1)

    // Testar query com busca por texto 'DAILY'
    const textSelector: any = {
      _deleted: { $eq: false },
      connectionInstanceId: { $eq: 'gustavohps10-redmine-2df61e0d' },
      $or: [
        { sourceId: { $regex: 'DAILY', $options: 'i' } },
        { id: { $regex: 'DAILY', $options: 'i' } },
        { title: { $regex: 'DAILY', $options: 'i' } },
      ],
    }
    const textDocs = await collection
      .find({ selector: textSelector, limit: 30 })
      .exec()
    expect(textDocs.length).toBe(1)

    await db.close()
    removeDatabaseFromCache(workspaceId, true)
  })
})
