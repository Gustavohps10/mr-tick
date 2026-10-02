import { IHostBridge } from '@mr-tick/application'
import { TaskViewModel } from '@mr-tick/shared/view-models'
import { describe, expect, it, vi } from 'vitest'

import {
  fetchAndPersistTasks,
  mapTaskViewModelToRxDB,
} from '@/lib/tasks-enrichment'
import { AppDatabase } from '@/stores/sync-store/types'

describe('tasks-enrichment', () => {
  describe('mapTaskViewModelToRxDB', () => {
    it('should map TaskViewModel correctly to SyncTaskRxDBDTO with composite key', () => {
      const taskVm: TaskViewModel = {
        id: '77657',
        title: 'Corrigir bug no login',
        description: 'Detalhes da falha',
        projectName: 'Projeto Principal',
        url: 'https://redmine.corp/issues/77657',
        status: { id: '1', name: 'Nova' },
        priority: { id: '2', name: 'Alta' },
        tracker: { id: '3' },
        assignedTo: { id: '10', name: 'Dev 1' },
        author: { id: '5', name: 'Gestor' },
        createdAt: new Date('2026-01-10T10:00:00.000Z'),
        updatedAt: new Date('2026-01-11T12:00:00.000Z'),
        startDate: new Date('2026-01-10T00:00:00.000Z'),
        dueDate: new Date('2026-01-15T00:00:00.000Z'),
        doneRatio: 50,
        spentHours: 4.5,
        estimatedTimes: [],
        participants: [{ id: '10', name: 'Dev 1', role: { id: 'assignee' } }],
        statusChanges: [],
      }

      const mapped = mapTaskViewModelToRxDB(taskVm, 'conn-redmine-1', 'redmine')

      expect(mapped.id).toBe('conn-redmine-1::77657')
      expect(mapped.sourceId).toBe('77657')
      expect(mapped.connectionInstanceId).toBe('conn-redmine-1')
      expect(mapped.dataSourceId).toBe('redmine')
      expect(mapped.title).toBe('Corrigir bug no login')
      expect(mapped.description).toBe('Detalhes da falha')
      expect(mapped.projectName).toBe('Projeto Principal')
      expect(mapped.tracker).toEqual({ id: '3' })
      expect(mapped.status).toEqual({ id: '1', name: 'Nova' })
      expect(mapped.priority).toEqual({ id: '2', name: 'Alta' })
      expect(mapped.assignedTo).toEqual({ id: '10', name: 'Dev 1' })
      expect(mapped.author).toEqual({ id: '5', name: 'Gestor' })
      expect(mapped.doneRatio).toBe(50)
      expect(mapped.spentHours).toBe(4.5)
      expect(mapped.syncStatus).toBe('synced')
      expect(mapped._deleted).toBe(false)
    })

    it('should handle minimal TaskViewModel with null/undefined optional fields', () => {
      const minimalVm: TaskViewModel = {
        id: '123',
        title: 'Tarefa Simples',
        status: { id: '1', name: 'Aberta' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }

      const mapped = mapTaskViewModelToRxDB(minimalVm, 'conn-jira-2', 'jira')

      expect(mapped.id).toBe('conn-jira-2::123')
      expect(mapped.sourceId).toBe('123')
      expect(mapped.description).toBeNull()
      expect(mapped.projectName).toBeNull()
      expect(mapped.url).toBeNull()
      expect(mapped.tracker).toBeUndefined()
      expect(mapped.priority).toBeUndefined()
      expect(mapped.assignedTo).toBeUndefined()
      expect(mapped.author).toBeUndefined()
      expect(mapped.doneRatio).toBeNull()
      expect(mapped.spentHours).toBeNull()
      expect(mapped.startDate).toBeNull()
      expect(mapped.dueDate).toBeNull()
    })
  })

  describe('fetchAndPersistTasks', () => {
    it('should return early when required identifiers are missing', async () => {
      const mockBridge = {
        tasks: { listTasks: vi.fn() },
      } as unknown as IHostBridge
      const mockDb = {
        tasks: { bulkUpsert: vi.fn() },
      } as unknown as AppDatabase

      const result = await fetchAndPersistTasks({
        hostBridge: mockBridge,
        db: mockDb,
        workspaceId: '',
        connectionInstanceId: 'conn-1',
        dataSourceId: 'redmine',
        ids: ['77657'],
      })

      expect(result).toEqual([])
      expect(mockBridge.tasks.listTasks).not.toHaveBeenCalled()
    })

    it('should return early when both ids and search are empty', async () => {
      const mockBridge = {
        tasks: { listTasks: vi.fn() },
      } as unknown as IHostBridge
      const mockDb = {
        tasks: { bulkUpsert: vi.fn() },
      } as unknown as AppDatabase

      const result = await fetchAndPersistTasks({
        hostBridge: mockBridge,
        db: mockDb,
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        dataSourceId: 'redmine',
        ids: [],
        search: '',
      })

      expect(result).toEqual([])
      expect(mockBridge.tasks.listTasks).not.toHaveBeenCalled()
    })

    it('should sanitize task IDs, call hostBridge, and persist to RxDB', async () => {
      const listTasksMock = vi.fn().mockResolvedValue({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            id: '77657',
            title: 'Tarefa Encontrada On Demand',
            status: { id: '1', name: 'Em Andamento' },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      })
      const bulkUpsertMock = vi.fn().mockResolvedValue([])

      const mockBridge = {
        tasks: { listTasks: listTasksMock },
      } as unknown as IHostBridge
      const mockDb = {
        tasks: { bulkUpsert: bulkUpsertMock },
      } as unknown as AppDatabase

      const result = await fetchAndPersistTasks({
        hostBridge: mockBridge,
        db: mockDb,
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        dataSourceId: 'redmine',
        ids: ['#77657', 'conn-1::77657'],
      })

      expect(listTasksMock).toHaveBeenCalledWith({
        body: {
          workspaceId: 'ws-1',
          connectionInstanceId: 'conn-1',
          ids: ['77657'],
          search: undefined,
          page: 1,
          pageSize: 50,
        },
      })

      expect(bulkUpsertMock).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('conn-1::77657')
      expect(result[0].title).toBe('Tarefa Encontrada On Demand')
    })

    it('should handle API failure without throwing exceptions', async () => {
      const listTasksMock = vi.fn().mockResolvedValue({
        isSuccess: false,
        statusCode: 500,
        error: 'NETWORK_ERROR',
      })
      const bulkUpsertMock = vi.fn()

      const mockBridge = {
        tasks: { listTasks: listTasksMock },
      } as unknown as IHostBridge
      const mockDb = {
        tasks: { bulkUpsert: bulkUpsertMock },
      } as unknown as AppDatabase

      const result = await fetchAndPersistTasks({
        hostBridge: mockBridge,
        db: mockDb,
        workspaceId: 'ws-1',
        connectionInstanceId: 'conn-1',
        dataSourceId: 'redmine',
        search: 'termo inexistente',
      })

      expect(result).toEqual([])
      expect(bulkUpsertMock).not.toHaveBeenCalled()
    })
  })
})
