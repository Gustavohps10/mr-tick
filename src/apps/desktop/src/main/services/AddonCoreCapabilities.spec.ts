import type {
  CoreCacheQuery,
  CoreCacheResponse,
  ICoreCacheTransport,
  IWorkspacesRepository,
} from '@mr-tick/application'
import { Workspace } from '@mr-tick/domain'
import { describe, expect, it, vi } from 'vitest'

import { AddonCoreCapabilities } from './AddonCoreCapabilities'

function fixture() {
  const created = Workspace.create({ name: 'SDK fixture' })
  if (created.isFailure()) return expect.fail(created.failure.messageKey)
  const workspace = created.success
  workspace.linkDataSource('connection', 'provider')
  workspace.connectDataSource(
    'connection',
    { id: 'member', name: 'Name', login: 'private' },
    { privateToken: 'secret' },
  )
  const repository: IWorkspacesRepository = {
    findById: async (id) => {
      if (id === workspace.id) return workspace
      return undefined
    },
    findAll: async () => ({
      items: [workspace],
      total: 1,
      page: 1,
      pageSize: 1,
    }),
    create: async () => {},
    update: async () => {},
    delete: async () => {},
  }
  const queryCore = vi.fn<
    (query: CoreCacheQuery) => Promise<CoreCacheResponse>
  >(async () => ({
    ok: true,
    value: { kind: 'tasks', tasks: [], hasMore: false },
  }))
  const transport: ICoreCacheTransport = {
    queryCore,
    getState: () => 'ready',
    onStateChanged: (listener) => {
      listener('ready')
      return () => {}
    },
  }
  return {
    workspace,
    repository,
    queryCore,
    core: new AddonCoreCapabilities(repository, transport),
  }
}
describe('Public core read capabilities', () => {
  it('exposes safe identity DTOs and never grants repository or transport access', async () => {
    const { workspace, core } = fixture()
    const result = await core.workspaces.list()
    expect(result.isSuccess()).toBe(true)
    if (result.isFailure()) return expect.fail(result.failure.messageKey)
    expect(result.success).toEqual([
      { id: workspace.id, name: workspace.name, status: workspace.status },
    ])
    const connections = await core.connections.list(workspace.id)
    expect(connections.isSuccess()).toBe(true)
    if (connections.isFailure())
      return expect.fail(connections.failure.messageKey)
    expect(connections.success).toEqual([
      {
        workspaceId: workspace.id,
        connectionInstanceId: 'connection',
        dataSourceId: 'provider',
        status: 'connected',
      },
    ])
    expect(core.runtime).not.toHaveProperty('queryCore')
  })
  it('rejects cross-workspace connections and invalid limits before transport and preserves provider errors', async () => {
    const { core, queryCore, workspace } = fixture()
    const scope = {
      workspaceId: workspace.id,
      connectionInstanceId: 'connection',
    }
    expect((await core.tasks.list({ ...scope, limit: 0 })).isFailure()).toBe(
      true,
    )
    expect(
      (
        await core.tasks.get({
          ...scope,
          connectionInstanceId: 'wrong',
          taskId: 'task',
        })
      ).isFailure(),
    ).toBe(true)
    expect(
      (
        await core.tasks.get({
          ...scope,
          workspaceId: 'another-workspace',
          taskId: 'task',
        })
      ).isFailure(),
    ).toBe(true)
    expect(queryCore).not.toHaveBeenCalled()
    queryCore.mockResolvedValue({
      ok: false,
      error: { messageKey: 'DATABASE_CLOSED', statusCode: 503 },
    })
    const result = await core.tasks.get({ ...scope, taskId: 'task' })
    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return expect.fail('Expected cache failure')
    expect(result.failure.messageKey).toBe('DATABASE_CLOSED')
    expect(queryCore).toHaveBeenCalledWith({
      action: 'task',
      ...scope,
      taskId: 'task',
    })
  })
  it('converts repository read failures at the adapter boundary', async () => {
    const { core, repository } = fixture()
    vi.spyOn(repository, 'findAll').mockRejectedValue(
      new Error('WORKSPACES_READ_DENIED'),
    )
    const result = await core.workspaces.list()
    expect(result.isFailure()).toBe(true)
    if (result.isSuccess()) return expect.fail('Expected repository failure')
    expect(result.failure.messageKey).toBe('WORKSPACES_READ_DENIED')
  })
})
