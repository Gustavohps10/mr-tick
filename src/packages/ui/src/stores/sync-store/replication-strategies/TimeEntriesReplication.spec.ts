import { IHostBridge } from '@mr-tick/application'
import { TimeEntryViewModel } from '@mr-tick/shared/view-models'
import { describe, expect, it } from 'vitest'

import {
  ensurePlugins,
  getOrCreateDatabase,
  removeDatabaseFromCache,
} from '@/stores/sync-store/storage'

import { TimeEntriesReplication } from './TimeEntriesReplication'

describe('TimeEntriesReplication Pull (STR-06)', () => {
  it('deve mapear apontamentos com comments null ou preenchidos e permitir inserção na collection', async () => {
    const workspaceId = `ws-repl-test-${Date.now()}`
    await ensurePlugins(false)

    const db = await getOrCreateDatabase(workspaceId, false, true)
    const collection = db.collections.timeEntries

    const mockEntries: TimeEntryViewModel[] = [
      {
        id: '212575',
        task: { id: '77773' },
        activity: { id: '9', name: 'Desenvolvimento' },
        user: { id: '230', name: 'Gustavo Henrique' },
        timeSpent: 0.83,
        comments: null as unknown as string,
        startDate: new Date('2026-09-24T17:01:54.000Z'),
        endDate: null as unknown as Date,
        createdAt: new Date('2026-09-25T17:51:42.000Z'),
        updatedAt: new Date('2026-09-25T17:51:42.000Z'),
      },
      {
        id: '212576',
        task: { id: '77774' },
        activity: { id: '9', name: 'Desenvolvimento' },
        user: { id: '230', name: 'Gustavo Henrique' },
        timeSpent: 1.5,
        comments: 'Correção de bug em produção',
        startDate: new Date('2026-09-24T18:00:00.000Z'),
        endDate: new Date('2026-09-24T19:30:00.000Z'),
        createdAt: new Date('2026-09-25T19:30:00.000Z'),
        updatedAt: new Date('2026-09-25T19:30:00.000Z'),
      },
    ]

    const mockBridge = {
      timeEntries: {
        pull: async () => ({
          isSuccess: true,
          data: mockEntries,
        }),
      },
    } as unknown as IHostBridge

    const strategy = new TimeEntriesReplication(
      mockBridge,
      workspaceId,
      'gustavohps10-redmine-b32834d1',
      'gustavohps10-redmine',
      collection,
    )

    const result = await strategy.pull(undefined, 50)
    expect(result.documents).toHaveLength(2)

    const firstDoc = result.documents[0]
    expect(firstDoc.comments).toBeNull()
    expect(firstDoc.endDate).toBeNull()
    expect(firstDoc.remoteId).toBe('212575')

    const secondDoc = result.documents[1]
    expect(secondDoc.comments).toBe('Correção de bug em produção')
    expect(secondDoc.endDate).toBe('2026-09-24T19:30:00.000Z')

    // Inserção em lote na collection para validar Ajv em cascata
    const inserted = await collection.bulkInsert(result.documents)
    expect(inserted.success).toHaveLength(2)
    expect(inserted.error).toHaveLength(0)

    await db.close()
    removeDatabaseFromCache(workspaceId, true)
  })
})
