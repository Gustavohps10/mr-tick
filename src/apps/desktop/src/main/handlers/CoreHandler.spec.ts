import {
  type CoreTaskListRequest,
  type CoreTaskReference,
  type IAddonConnectionProfilesRegistry,
  type ICoreCacheTransport,
  type IWorkspacesRepository,
} from '@mr-tick/application'
import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { describe, expect, it, vi } from 'vitest'

import type { AddonLoader } from '@/main/services/addons/loader/AddonLoader'

import { CoreHandler } from './CoreHandler'

function createFixture() {
  const ws = Workspace.create({ name: 'CoreHandler Test Workspace' }).success!
  ws.createConnection('conn-1', 'addon-a', {
    connectionProfileId: 'profile-a',
    cardinality: 'single',
    default: true,
  })
  ws.createConnection('conn-2', 'addon-b', {
    connectionProfileId: 'profile-b',
    cardinality: 'multi',
    default: false,
  })

  const workspacesRepository: IWorkspacesRepository = {
    create: vi.fn(),
    getById: vi.fn(async (id: string) => {
      if (id === ws.id) return Either.success(ws)
      return Either.failure(AppError.NotFound('WORKSPACE_NOT_FOUND'))
    }),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }

  const profilesResolver: IAddonConnectionProfilesRegistry = {
    getConnectionProfiles: vi.fn<
      IAddonConnectionProfilesRegistry['getConnectionProfiles']
    >(async (addonId) => {
      if (addonId === 'addon-a') {
        return Either.success([
          {
            connectionProfileId: 'profile-a',
            cardinality: 'single',
            default: true,
            capability: 'dataSource',
          },
        ])
      }
      return Either.success([
        {
          connectionProfileId: 'profile-b',
          cardinality: 'multi',
          default: false,
          capability: 'watcher',
        },
      ])
    }),
    getConnectionSchema: vi.fn(),
    registerProfiles: vi.fn(),
    unregisterProfiles: vi.fn(),
    registerSchema: vi.fn(),
    unregisterSchema: vi.fn(),
  }

  const localRuntime: ICoreCacheTransport = {
    queryCore: vi.fn<ICoreCacheTransport['queryCore']>(async (query) => {
      if (query.action === 'tasks') {
        return {
          ok: true,
          value: {
            kind: 'tasks',
            tasks: [
              {
                workspaceId: query.workspaceId,
                connectionInstanceId: query.connectionInstanceId,
                taskId: 'task-100',
                dataSourceId: 'addon-a',
                title: 'Sample Task',
                status: { id: 'open', name: 'Open' },
                createdAt: '2026-10-28T09:00:00.000Z',
                updatedAt: '2026-10-28T09:00:00.000Z',
              },
            ],
            hasMore: true,
            nextCursor: 'cursor-page-2',
          },
        }
      }
      if (query.action === 'task') {
        return {
          ok: true,
          value: {
            kind: 'task',
            task: {
              workspaceId: query.workspaceId,
              connectionInstanceId: query.connectionInstanceId,
              taskId: 'task-100',
              dataSourceId: 'addon-a',
              title: 'Sample Task',
              status: { id: 'open', name: 'Open' },
              createdAt: '2026-10-28T09:00:00.000Z',
              updatedAt: '2026-10-28T09:00:00.000Z',
            },
          },
        }
      }
      if (query.action === 'metadata') {
        return {
          ok: true,
          value: {
            kind: 'metadata',
            metadata: {
              workspaceId: query.workspaceId,
              connectionInstanceId: query.connectionInstanceId,
              dataSourceId: 'addon-a',
              lastPulledAt: null,
              values: {
                taskStatuses: [],
                taskPriorities: [],
                activities: [],
                trackStatuses: [],
                participantRoles: [],
                estimationTypes: [],
              },
            },
          },
        }
      }
      return {
        ok: false,
        error: { messageKey: 'UNKNOWN_QUERY', statusCode: 400 },
      }
    }),
    getState: vi.fn<ICoreCacheTransport['getState']>(() => 'ready'),
    onStateChanged: vi.fn(() => () => {}),
  }

  const handler = new CoreHandler(
    workspacesRepository,
    profilesResolver,
    localRuntime,
    { dataSourceRegistry: { getItems: () => [] } } as unknown as AddonLoader,
  )

  return { handler, ws, workspacesRepository, profilesResolver, localRuntime }
}

describe('CoreHandler', () => {
  it('lists connections and filters by capability when requested', async () => {
    const { handler, ws } = createFixture()
    const mockEvent = {} as Electron.IpcMainInvokeEvent

    const all = await handler.listConnections(mockEvent, {
      body: { workspaceId: ws.id },
    })
    expect(all.isSuccess).toBe(true)
    expect(all.data).toHaveLength(2)
    expect(all.data?.[0].capability).toBe('dataSource')
    expect(all.data?.[1].capability).toBe('watcher')

    const filtered = await handler.listConnections(mockEvent, {
      body: { workspaceId: ws.id, capability: 'dataSource' },
    })
    expect(filtered.isSuccess).toBe(true)
    expect(filtered.data).toHaveLength(1)
    expect(filtered.data?.[0].connectionInstanceId).toBe('conn-1')
    expect(filtered.data?.[0].capability).toBe('dataSource')
  })

  it('lists tasks with cursor pagination', async () => {
    const { handler, ws, localRuntime } = createFixture()
    const mockEvent = {} as Electron.IpcMainInvokeEvent
    const req: CoreTaskListRequest = {
      workspaceId: ws.id,
      connectionInstanceId: 'conn-1',
      limit: 10,
      cursor: 'cursor-1',
    }

    const res = await handler.listTasks(mockEvent, { body: req })
    expect(res.isSuccess).toBe(true)
    expect(res.data?.tasks).toHaveLength(1)
    expect(res.data?.hasMore).toBe(true)
    expect(res.data?.nextCursor).toBe('cursor-page-2')
    expect(localRuntime.queryCore).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tasks',
        workspaceId: ws.id,
        connectionInstanceId: 'conn-1',
        limit: 10,
        cursor: 'cursor-1',
      }),
    )
  })

  it('gets a single task by reference', async () => {
    const { handler, ws } = createFixture()
    const mockEvent = {} as Electron.IpcMainInvokeEvent
    const req: CoreTaskReference = {
      workspaceId: ws.id,
      connectionInstanceId: 'conn-1',
      taskId: 'task-100',
    }

    const res = await handler.getTask(mockEvent, { body: req })
    expect(res.isSuccess).toBe(true)
    expect(res.data?.title).toBe('Sample Task')
  })

  it('gets metadata by connection scope', async () => {
    const { handler, ws } = createFixture()
    const mockEvent = {} as Electron.IpcMainInvokeEvent

    const res = await handler.getMetadata(mockEvent, {
      body: { workspaceId: ws.id, connectionInstanceId: 'conn-1' },
    })
    expect(res.isSuccess).toBe(true)
    expect(res.data?.values.activities).toEqual([])
  })

  it('fails with validation error on empty workspace', async () => {
    const { handler } = createFixture()
    const mockEvent = {} as Electron.IpcMainInvokeEvent

    const res = await handler.listConnections(mockEvent, {
      body: { workspaceId: '' },
    })
    expect(res.isSuccess).toBe(false)
    expect(res.statusCode).toBe(422)
    expect(res.error).toBe('WORKSPACE_REQUIRED')
  })
})
