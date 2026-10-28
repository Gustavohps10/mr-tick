import 'fake-indexeddb/auto'

import { LocalRuntime } from '@mr-tick/application/local-runtime'
import type { WorkspaceViewModel } from '@mr-tick/shared/view-models'
import { describe, expect, it, vi } from 'vitest'

import type { BrowserRuntimeBridge } from './browser-workspace-registry'
import {
  BrowserWorkspaceRegistry,
  createBrowserLocalRuntime,
} from './browser-workspace-registry'

function bridgeFor(
  workspaceId: string,
  connections: WorkspaceViewModel['connections'] = [],
) {
  const workspace: WorkspaceViewModel = {
    id: workspaceId,
    name: 'Lifecycle fixture',
    status: 'configured',
    connections,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const getById = vi.fn<BrowserRuntimeBridge['workspaces']['getById']>(
    async () => ({
      isSuccess: true,
      statusCode: 200,
      data: workspace,
    }),
  )
  const bridge: BrowserRuntimeBridge = {
    workspaces: {
      getById,
      listAll: async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [workspace],
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
      }),
    },
    events: { emit: vi.fn() },
    tasks: {
      listTasks: async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
      }),
      pull: async () => ({ isSuccess: true, statusCode: 200, data: [] }),
    },
    metadata: {
      pull: async () => ({
        isSuccess: false,
        statusCode: 503,
        error: 'UNUSED_FIXTURE_PROVIDER',
      }),
    },
    timeEntries: {
      listTimeEntries: async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
      }),
      pull: async () => ({
        isSuccess: false,
        statusCode: 503,
        error: 'UNUSED_FIXTURE_PROVIDER',
      }),
      push: async () => ({ isSuccess: true, statusCode: 200, data: [] }),
    },
  }
  return { bridge, getById, workspace }
}

const options = { isDevelopment: false, useMemoryStorage: true }
const remoteActions: ('forceSync' | 'reconcile')[] = ['forceSync', 'reconcile']

describe('Browser workspace owner lifecycle', () => {
  it('does not initialize storage or contact a provider during a cache query', async () => {
    const workspaceId = crypto.randomUUID()
    const { bridge, workspace } = bridgeFor(workspaceId)
    workspace.connections.push({
      id: 'connection',
      dataSourceId: 'source',
      status: 'disconnected',
    })
    const registry = new BrowserWorkspaceRegistry(bridge, options)
    const open = vi.spyOn(registry, 'open')
    const tasks = vi.spyOn(bridge.tasks, 'pull')
    const metadata = vi.spyOn(bridge.metadata, 'pull')
    const query: import('@mr-tick/application').CoreCacheQuery = {
      action: 'tasks',
      workspaceId,
      connectionInstanceId: 'connection',
      limit: 10,
    }
    const unavailable = await registry.queryCore(query)
    expect(unavailable).toEqual({
      ok: false,
      error: { messageKey: 'CORE_CACHE_UNAVAILABLE', statusCode: 503 },
    })
    expect(open).not.toHaveBeenCalled()
    expect(tasks).not.toHaveBeenCalled()
    expect(metadata).not.toHaveBeenCalled()
    expect(
      await registry.queryCore({ ...query, connectionInstanceId: 'wrong' }),
    ).toEqual({
      ok: false,
      error: { messageKey: 'CONNECTION_NOT_FOUND', statusCode: 404 },
    })
    expect(await registry.queryCore({ ...query, limit: 101 })).toEqual({
      ok: false,
      error: { messageKey: 'TASK_LIMIT_INVALID', statusCode: 422 },
    })
  })
  it('resets physical storage and invalidates the logical cached executor', async () => {
    const workspaceId = crypto.randomUUID()
    const { bridge } = bridgeFor(workspaceId)
    const owner = createBrowserLocalRuntime(bridge, options, {
      committed: vi.fn(),
    })
    try {
      expect(
        (
          await owner.runtime.request({
            action: 'create',
            workspaceId,
            commandId: 'before-reset',
            entryId: 'old-entry',
            payload: { taskId: '', timeSpentSeconds: 60 },
          })
        ).ok,
      ).toBe(true)
      expect(
        (await owner.requestSync({ action: 'reset', workspaceId })).ok,
      ).toBe(true)
      const empty = await owner.runtime.request({
        action: 'list',
        workspaceId,
        filter: {},
      })
      expect(empty.ok).toBe(true)
      if (empty.ok) expect(empty.value.entries).toEqual([])
      expect(
        (
          await owner.runtime.request({
            action: 'create',
            workspaceId,
            commandId: 'before-reset',
            entryId: 'new-entry',
            payload: { taskId: '', timeSpentSeconds: 120 },
          })
        ).ok,
      ).toBe(true)
      const list = await owner.runtime.request({
        action: 'list',
        workspaceId,
        filter: {},
      })
      if (list.ok)
        expect(list.value.entries.map((entry) => entry.id)).toEqual([
          'new-entry',
        ])
      expect(list.ok).toBe(true)
    } finally {
      await owner.close()
    }
  })

  it('reports unsynchronized writes scoped to the selected connection', async () => {
    const workspaceId = crypto.randomUUID()
    const { bridge } = bridgeFor(workspaceId, [
      {
        id: 'connection-pending',
        addonId: 'provider',
        connectionProfileId: 'primary',
        cardinality: 'single',
        status: 'connected',
      },
    ])
    const owner = createBrowserLocalRuntime(bridge, options, {
      committed: vi.fn(),
    })
    try {
      const created = await owner.runtime.request({
        action: 'create',
        workspaceId,
        commandId: 'pending-connection-write',
        entryId: 'pending-entry',
        payload: {
          taskId: '42',
          timeSpentSeconds: 60,
          connectionInstanceId: 'connection-pending',
          dataSourceId: 'provider',
          userId: 'member-7',
          activityId: 'activity-1',
        },
      })
      expect(created.ok).toBe(true)

      const pending = await owner.runtime.request({
        action: 'list',
        workspaceId,
        filter: { connectionInstanceId: 'connection-pending' },
      })
      expect(pending.ok).toBe(true)
      if (pending.ok) {
        expect(pending.value.entries.map((entry) => entry.id)).toEqual([
          'pending-entry',
        ])
        expect(pending.value.pendingWrites).toBe(true)
      }

      const unrelated = await owner.runtime.request({
        action: 'list',
        workspaceId,
        filter: { connectionInstanceId: 'another-connection' },
      })
      expect(unrelated.ok).toBe(true)
      if (unrelated.ok) expect(unrelated.value.pendingWrites).toBe(false)
    } finally {
      await owner.close()
    }
  })

  it('drops a cached workspace after its metadata was removed without reopening it', async () => {
    const workspaceId = crypto.randomUUID()
    const { bridge, getById } = bridgeFor(workspaceId)
    const owner = createBrowserLocalRuntime(bridge, options, {
      committed: vi.fn(),
    })
    try {
      expect(
        (
          await owner.runtime.request({
            action: 'create',
            workspaceId,
            commandId: 'create',
            entryId: 'entry',
            payload: { taskId: '', timeSpentSeconds: 60 },
          })
        ).ok,
      ).toBe(true)
      getById.mockResolvedValue({
        isSuccess: false,
        statusCode: 404,
        error: 'WORKSPACE_NOT_FOUND',
      })
      const callsBeforeDrop = getById.mock.calls.length
      expect(
        (await owner.requestSync({ action: 'drop', workspaceId })).ok,
      ).toBe(true)
      expect(getById.mock.calls.length).toBe(callsBeforeDrop)
      const list = await owner.runtime.request({
        action: 'list',
        workspaceId,
        filter: {},
      })
      expect(list.ok).toBe(false)
      if (!list.ok) expect(list.error.statusCode).toBe(404)
    } finally {
      await owner.close()
    }
  })

  it('rejects malformed scope before consulting the workspace source', async () => {
    const { bridge, getById } = bridgeFor('valid')
    const registry = new BrowserWorkspaceRegistry(bridge, options)
    expect((await registry.open(' ')).isFailure()).toBe(true)
    expect(getById).not.toHaveBeenCalled()
    await registry.close()
  })

  it.each(remoteActions)(
    'keeps local commands and status available while %s waits for a remote provider',
    async (action) => {
      const workspaceId = crypto.randomUUID()
      const { bridge } = bridgeFor(workspaceId)
      const registry = new BrowserWorkspaceRegistry(bridge, options)
      const runtime = new LocalRuntime(registry, { committed: vi.fn() })
      let releaseRemote: () => void = () => undefined
      let remoteStarted: () => void = () => undefined
      const remotePending = new Promise<void>((resolve) => {
        releaseRemote = resolve
      })
      const started = new Promise<void>((resolve) => {
        remoteStarted = resolve
      })
      const opened = await registry.open(workspaceId)
      expect(opened.isSuccess()).toBe(true)
      if (opened.isFailure())
        return expect.fail('Fixture workspace failed to open')
      const executor = opened.success
      executor.store.setState({
        [action]: async () => {
          remoteStarted()
          await remotePending
        },
      })
      const forget = (
        id: string,
        dispose: () => ReturnType<typeof executor.close>,
      ) => runtime.forgetWorkspace(id, dispose)
      const sync = registry.requestSync({ action, workspaceId }, forget)
      try {
        await started
        let localCompleted = false
        let statusCompleted = false
        const local = runtime
          .request({
            action: 'create',
            workspaceId,
            commandId: 'offline-create',
            entryId: 'offline-entry',
            payload: { taskId: '', timeSpentSeconds: 60 },
          })
          .then((response) => {
            expect(response.ok).toBe(true)
            localCompleted = true
          })
        const status = registry
          .requestSync({ action: 'status', workspaceId }, forget)
          .then((response) => {
            expect(response.ok).toBe(true)
            statusCompleted = true
          })
        await vi.waitFor(
          () => {
            expect(
              localCompleted,
              'local mutation waited for remote completion',
            ).toBe(true)
            expect(statusCompleted, 'status waited for remote completion').toBe(
              true,
            )
          },
          { timeout: 1000 },
        )
        await Promise.all([local, status])
        const list = await runtime.request({
          action: 'list',
          workspaceId,
          filter: {},
        })
        expect(list.ok).toBe(true)
        if (list.ok)
          expect(list.value.entries.map((entry) => entry.id)).toEqual([
            'offline-entry',
          ])
        let resetCompleted = false
        const reset = registry
          .requestSync({ action: 'reset', workspaceId }, forget)
          .then((response) => {
            expect(response.ok).toBe(true)
            resetCompleted = true
          })
        const rejected = await registry.requestSync(
          { action: 'reconcile', workspaceId },
          forget,
        )
        expect(rejected.ok).toBe(false)
        expect(
          resetCompleted,
          'reset deleted storage while remote operation was active',
        ).toBe(false)
        releaseRemote()
        expect((await sync).ok).toBe(true)
        await reset
        expect(resetCompleted).toBe(true)
      } finally {
        releaseRemote()
        await sync
        await runtime.close()
        await registry.close()
      }
    },
  )
  it('drains an admitted remote operation before disposing storage during close', async () => {
    const workspaceId = crypto.randomUUID()
    const { bridge } = bridgeFor(workspaceId)
    const registry = new BrowserWorkspaceRegistry(bridge, options)
    let releaseRemote: () => void = () => undefined
    let remoteStarted: () => void = () => undefined
    const remotePending = new Promise<void>((resolve) => {
      releaseRemote = resolve
    })
    const started = new Promise<void>((resolve) => {
      remoteStarted = resolve
    })
    const opened = await registry.open(workspaceId)
    expect(opened.isSuccess()).toBe(true)
    if (opened.isFailure())
      return expect.fail('Fixture workspace failed to open')
    const executor = opened.success
    const destroy = vi.spyOn(executor.store.getState(), 'destroy')
    executor.store.setState({
      forceSync: async () => {
        remoteStarted()
        await remotePending
      },
    })
    const sync = registry.requestSync(
      { action: 'forceSync', workspaceId },
      async (id, dispose) => {
        expect(id).toBe(workspaceId)
        return dispose()
      },
    )
    try {
      await started
      const closing = registry.close()
      expect((await registry.open(workspaceId)).isFailure()).toBe(true)
      expect(
        destroy,
        'storage disposed while remote operation was active',
      ).not.toHaveBeenCalled()
      releaseRemote()
      expect((await sync).ok).toBe(true)
      expect((await closing).isSuccess()).toBe(true)
      expect(destroy).toHaveBeenCalledTimes(1)
    } finally {
      releaseRemote()
      await sync
      await registry.close()
    }
  })
  it('allows timerStart without connection, starting a local-first timer', async () => {
    const workspaceId = crypto.randomUUID()
    const { bridge } = bridgeFor(workspaceId)
    const registry = new BrowserWorkspaceRegistry(bridge, options)
    const opened = await registry.open(workspaceId)
    expect(opened.isSuccess()).toBe(true)
    if (opened.isFailure()) return expect.fail('Failed to open workspace')
    const executor = opened.success
    try {
      const res = await executor.execute({
        action: 'timerStart',
        workspaceId,
        commandId: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
        payload: {
          mode: 'countup',
          timeSpentSeconds: 0,
          taskId: '',
        },
      })
      expect(res.isSuccess()).toBe(true)
      if (res.isSuccess()) {
        expect(res.success.timer).not.toBeNull()
        expect(res.success.timer?.status).toBe('running')
        expect(res.success.entry?.connectionInstanceId).toBe('')
        expect(res.success.entry?.status).toBe('running')
      }
    } finally {
      await executor.close()
      await registry.close()
    }
  })

  it('allows timerStart on connection without authenticated user, starting local-first timer without USER_CONTEXT_REQUIRED', async () => {
    const workspaceId = crypto.randomUUID()
    const connectionId = 'conn-unauth'
    const { bridge } = bridgeFor(workspaceId, [
      {
        id: connectionId,
        addonId: 'redmine',
        connectionProfileId: 'redmine-instance',
        cardinality: 'multi',
        status: 'connected',
      },
    ])
    const registry = new BrowserWorkspaceRegistry(bridge, options)
    const opened = await registry.open(workspaceId)
    expect(opened.isSuccess()).toBe(true)
    if (opened.isFailure()) return expect.fail('Failed to open workspace')
    const executor = opened.success
    try {
      const res = await executor.execute({
        action: 'timerStart',
        workspaceId,
        commandId: crypto.randomUUID(),
        entryId: crypto.randomUUID(),
        payload: {
          mode: 'countup',
          timeSpentSeconds: 0,
          taskId: '',
          connectionInstanceId: connectionId,
        },
      })
      expect(res.isSuccess()).toBe(true)
      if (res.isSuccess()) {
        expect(res.success.timer).not.toBeNull()
        expect(res.success.timer?.status).toBe('running')
        expect(res.success.entry?.connectionInstanceId).toBe('')
        expect(res.success.entry?.status).toBe('running')
      }
    } finally {
      await executor.close()
      await registry.close()
    }
  })

  it('binds connection.identity on timerStart when connection has authenticated identity', async () => {
    const workspaceId = crypto.randomUUID()
    const connectionId = 'conn-auth'
    const entryId = crypto.randomUUID()
    const { bridge } = bridgeFor(workspaceId, [
      {
        id: connectionId,
        addonId: 'redmine',
        connectionProfileId: 'redmine-instance',
        cardinality: 'multi',
        status: 'connected',
        identity: {
          kind: 'human',
          providerId: 'redmine',
          tenantId: 'https://redmine.org',
          providerSubjectId: 'user-42',
          displayName: 'John Doe',
        },
      },
    ])
    const registry = new BrowserWorkspaceRegistry(bridge, options)
    const opened = await registry.open(workspaceId)
    expect(opened.isSuccess()).toBe(true)
    if (opened.isFailure()) return expect.fail('Failed to open workspace')
    const executor = opened.success
    try {
      const res = await executor.execute({
        action: 'timerStart',
        workspaceId,
        commandId: crypto.randomUUID(),
        entryId,
        payload: {
          mode: 'countup',
          timeSpentSeconds: 0,
          taskId: '123',
          connectionInstanceId: connectionId,
        },
      })
      expect(res.isSuccess()).toBe(true)
      if (res.isSuccess()) {
        expect(res.success.timer).not.toBeNull()
        expect(res.success.timer?.status).toBe('running')
        expect(res.success.entry?.connectionInstanceId).toBe(connectionId)
        expect(res.success.entry?.dataSourceId).toBe('redmine')
        const db = executor.store.getState().db
        const doc = await db?.timeEntries.findOne(entryId).exec()
        expect(doc?.user.id).toBe('user-42')
        expect(doc?.user.name).toBe('John Doe')
      }
    } finally {
      await executor.close()
      await registry.close()
    }
  })

  it('ignores connections whose addon does not have the dataSource capability when addons.listInstalled is provided', async () => {
    const workspaceId = crypto.randomUUID()
    const discordConnId = 'conn-discord'
    const redmineConnId = 'conn-redmine'
    const { bridge } = bridgeFor(workspaceId, [
      {
        id: discordConnId,
        addonId: 'discord-watcher',
        connectionProfileId: 'discord-profile',
        cardinality: 'single',
        status: 'connected',
      },
      {
        id: redmineConnId,
        addonId: 'redmine',
        connectionProfileId: 'redmine-instance',
        cardinality: 'multi',
        status: 'connected',
      },
    ])
    bridge.addons = {
      listInstalled: async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            id: 'discord-watcher',
            name: 'Discord',
            creator: 'Community',
            description: '',
            path: '',
            logo: '',
            downloads: 0,
            version: '1.0.0',
            stars: 0,
            installed: true,
            capabilities: ['watcher'],
          },
          {
            id: 'redmine',
            name: 'Redmine',
            creator: 'Official',
            description: '',
            path: '',
            logo: '',
            downloads: 0,
            version: '1.0.0',
            stars: 0,
            installed: true,
            capabilities: ['dataSource'],
          },
        ],
        totalItems: 2,
        totalPages: 1,
        currentPage: 1,
      }),
    }
    const registry = new BrowserWorkspaceRegistry(bridge, options)
    const opened = await registry.open(workspaceId)
    expect(opened.isSuccess()).toBe(true)
    if (opened.isFailure()) return expect.fail('Failed to open workspace')
    const executor = opened.success
    try {
      const statusKeys = Object.keys(executor.store.getState().statuses)
      expect(statusKeys.some((key) => key.includes(discordConnId))).toBe(false)
      expect(statusKeys.some((key) => key.includes(redmineConnId))).toBe(true)
    } finally {
      await executor.close()
      await registry.close()
    }
  })

  it('diagnoses open workspaces with operationalReadChecks without reading cached document layer', async () => {
    const workspaceId = crypto.randomUUID()
    const { bridge } = bridgeFor(workspaceId)
    const registry = new BrowserWorkspaceRegistry(bridge, options)
    const opened = await registry.open(workspaceId)
    expect(opened.isSuccess()).toBe(true)

    const diag = await registry.diagnose()
    expect(diag.workspaces).toHaveLength(1)
    expect(diag.workspaces[0]?.workspaceId).toBe(workspaceId)
    expect(diag.workspaces[0]?.hasDb).toBe(true)
    expect(diag.workspaces[0]?.receipts?.status).toBe('not-supported')

    expect(diag.operationalReadChecks).toHaveLength(1)
    const check = diag.operationalReadChecks[0]
    expect(check?.id).toBe(`probe-workspace-storage-${workspaceId}`)
    expect(check?.status).toBe('pass')
    expect(check?.provenOperation).toBe('timeEntries.storageInstance.query')

    await registry.close()
  })

  it('opens workspaces on demand and caps concurrent open instances to prevent RxDB collection limits', async () => {
    const ws1 = crypto.randomUUID()
    const ws2 = crypto.randomUUID()
    const ws3 = crypto.randomUUID()

    const workspaces: WorkspaceViewModel[] = [
      {
        id: ws1,
        name: 'Workspace 1',
        status: 'configured',
        connections: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: ws2,
        name: 'Workspace 2',
        status: 'configured',
        connections: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: ws3,
        name: 'Workspace 3',
        status: 'configured',
        connections: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const bridge: BrowserRuntimeBridge = {
      workspaces: {
        getById: vi.fn(async ({ body }) => {
          const found = workspaces.find((w) => w.id === body.workspaceId)
          if (!found)
            return { isSuccess: false, statusCode: 404, error: 'NOT_FOUND' }
          return { isSuccess: true, statusCode: 200, data: found }
        }),
        listAll: async () => ({
          isSuccess: true,
          statusCode: 200,
          data: workspaces,
          totalItems: 3,
          totalPages: 1,
          currentPage: 1,
        }),
      },
      events: { emit: vi.fn() },
      tasks: {
        listTasks: async () => ({
          isSuccess: true,
          statusCode: 200,
          data: [],
          totalItems: 0,
          totalPages: 0,
          currentPage: 1,
        }),
        pull: async () => ({ isSuccess: true, statusCode: 200, data: [] }),
      },
      metadata: {
        pull: async () => ({
          isSuccess: false,
          statusCode: 503,
          error: 'UNUSED',
        }),
      },
      timeEntries: {
        listTimeEntries: async () => ({
          isSuccess: true,
          statusCode: 200,
          data: [],
          totalItems: 0,
          totalPages: 0,
          currentPage: 1,
        }),
        pull: async () => ({
          isSuccess: false,
          statusCode: 503,
          error: 'UNUSED',
        }),
        push: async () => ({ isSuccess: true, statusCode: 200, data: [] }),
      },
    }

    const registry = new BrowserWorkspaceRegistry(bridge, options)

    const started = await registry.start()
    expect(started.isSuccess()).toBe(true)

    const diagInitial = await registry.diagnose()
    expect(diagInitial.workspaces).toHaveLength(0)

    const opened1 = await registry.open(ws1)
    expect(opened1.isSuccess()).toBe(true)
    const diag1 = await registry.diagnose()
    expect(diag1.workspaces).toHaveLength(1)

    const opened2 = await registry.open(ws2)
    expect(opened2.isSuccess()).toBe(true)
    const diag2 = await registry.diagnose()
    expect(diag2.workspaces).toHaveLength(2)

    const opened3 = await registry.open(ws3)
    expect(opened3.isSuccess()).toBe(true)
    const diag3 = await registry.diagnose()
    expect(diag3.workspaces).toHaveLength(2)
    const openIds = diag3.workspaces.map((w) => w.workspaceId)
    expect(openIds).toContain(ws2)
    expect(openIds).toContain(ws3)
    expect(openIds).not.toContain(ws1)

    await registry.close()
  })
})
