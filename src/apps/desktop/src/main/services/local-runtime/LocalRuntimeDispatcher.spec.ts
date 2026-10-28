import type {
  CoreCacheQuery,
  CoreCacheResponse,
  LocalPersistenceCommand,
  LocalPersistenceResponse,
  LocalRuntimeRequest,
  LocalRuntimeResponse,
  LocalSyncRequest,
  LocalSyncResponse,
} from '@mr-tick/application'
import { Either } from '@mr-tick/shared/helpers'
import { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  RuntimeDiagnosticProbeResponse,
  RuntimeDiagnosticProbeResult,
  RuntimeStartupFailurePacket,
} from '../../../runtime-protocol'
import { LocalRuntimeDispatcher } from './LocalRuntimeDispatcher'

type TestInput =
  | CoreCacheQuery
  | LocalPersistenceCommand
  | LocalRuntimeRequest
  | LocalSyncRequest
  | RuntimeStartupFailurePacket
  | string
interface TestEvent {
  sender: TestContents
}
type TestResponse =
  | CoreCacheResponse
  | LocalPersistenceResponse
  | LocalRuntimeResponse
  | LocalSyncResponse
  | string
  | null
type Handler = (
  event: TestEvent,
  input?: TestInput,
) => TestResponse | Promise<TestResponse>
interface TestPacket {
  requestId: string
  generation: string
  response:
    | CoreCacheResponse
    | LocalPersistenceResponse
    | LocalRuntimeResponse
    | LocalSyncResponse
    | RuntimeDiagnosticProbeResult
    | RuntimeDiagnosticProbeResponse
  channel: string
  data: { requestId: string; workspaceId: string }
}
type Listener = (event: TestEvent, packet: TestPacket) => void
interface SentPacket {
  requestId?: string
  generation?: string
  workspaceId?: string
  state?: string
  input?:
    | CoreCacheQuery
    | LocalPersistenceCommand
    | LocalRuntimeRequest
    | LocalSyncRequest
}
interface TestContents {
  id: number
  messages: { channel: string; packet: SentPacket }[]
  getURL(): string
  send(channel: string, packet: SentPacket): void
  on(channel: string, listener: Listener): void
  reload(): void
}

const world = vi.hoisted(() => {
  const windowListeners = new Map<string, () => void>()
  const contentsListeners = new Map<string, (...args: any[]) => void>()
  const handlers = new Map<string, Handler>()
  const listeners = new Map<string, Listener[]>()
  function contents(id: number, url: string): TestContents {
    return {
      id,
      messages: [],
      getURL: () => url,
      send(channel, packet) {
        this.messages.push({ channel, packet })
      },
      on: (event: string, listener: (...args: any[]) => void) => {
        contentsListeners.set(event, listener)
      },
      reload: () => undefined,
    }
  }
  const runtime = {
    webContents: contents(1, 'http://localhost/#/runtime'),
    windowType: 'runtime',
    isDestroyed: () => false,
    on: (channel: string, listener: () => void) => {
      windowListeners.set(channel, listener)
    },
  }
  const main = {
    webContents: contents(2, 'http://localhost/#/workspaces/ws-1/time-entries'),
    windowType: 'main',
    isDestroyed: () => false,
    on: () => undefined,
  }
  return {
    handlers,
    listeners,
    runtime,
    main,
    windowListeners,
    contentsListeners,
  }
})

vi.mock('electron', () => ({
  BrowserWindow: Object.assign(
    function MockBrowserWindow() {
      return world.runtime
    },
    { getAllWindows: () => [world.runtime, world.main] },
  ),
  ipcMain: {
    handle(channel: string, handler: Handler) {
      world.handlers.set(channel, handler)
    },
    on(channel: string, listener: Listener) {
      const listeners = world.listeners.get(channel)
      if (listeners !== undefined) {
        listeners.push(listener)
        return
      }
      world.listeners.set(channel, [listener])
    },
  },
}))

function route(channel: string): Handler {
  const handler = world.handlers.get(channel)
  if (handler === undefined) return expect.fail(`Handler missing: ${channel}`)
  return handler
}
function emit(channel: string, sender: TestContents, packet: TestPacket): void {
  const listeners = world.listeners.get(channel)
  if (listeners === undefined)
    return expect.fail(`Listener missing: ${channel}`)
  for (const listener of listeners) listener({ sender }, packet)
}
function releaseReader(): void {
  const message = world.main.webContents.messages.find(
    (item) => item.channel === 'local-runtime:close-readers',
  )
  if (
    message === undefined ||
    message.packet.requestId === undefined ||
    message.packet.workspaceId === undefined
  )
    return expect.fail('Expected explicit reader release request')
  emit('events:broadcast', world.main.webContents, {
    requestId: message.packet.requestId,
    generation: '',
    response: { ok: true },
    channel: 'local-runtime:reader-closed',
    data: {
      requestId: message.packet.requestId,
      workspaceId: message.packet.workspaceId,
    },
  })
}
function syncReply(response: LocalSyncResponse): void {
  const message = world.runtime.webContents.messages.find(
    (item) => item.channel === 'local-runtime:execute-sync',
  )
  if (
    message === undefined ||
    message.packet.requestId === undefined ||
    message.packet.generation === undefined
  )
    return expect.fail('Expected owner sync request')
  emit('local-runtime:sync-reply', world.runtime.webContents, {
    requestId: message.packet.requestId,
    generation: message.packet.generation,
    response,
    channel: '',
    data: { requestId: '', workspaceId: '' },
  })
}
async function ready(dispatcher: LocalRuntimeDispatcher): Promise<void> {
  const generation = await route('local-runtime:begin')(
    { sender: world.runtime.webContents },
    '',
  )
  if (typeof generation !== 'string')
    return expect.fail('Expected executor generation')
  await route('local-runtime:ready')(
    { sender: world.runtime.webContents },
    generation,
  )
  expect(await dispatcher.whenReady()).toBe(true)
  world.main.webContents.messages.length = 0
}
function resultError(response: TestResponse): string {
  if (response === null || typeof response === 'string' || response.ok)
    return expect.fail('Expected operation failure')
  return response.error.messageKey
}

beforeEach(() => {
  world.windowListeners.clear()
  world.handlers.clear()
  world.listeners.clear()
  world.runtime.webContents.messages.length = 0
  world.main.webContents.messages.length = 0
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('LocalRuntimeDispatcher maintenance ownership', () => {
  it('fails closed when the runtime cannot report persisted sync status', async () => {
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    let archiveStarted = false

    const result = await dispatcher.withNoPendingWrites(
      'ws-1',
      ['connection-a'],
      async () => {
        archiveStarted = true
        return Either.success(undefined)
      },
    )

    expect(result.isFailure()).toBe(true)
    expect(result.isFailure() && result.failure.statusCode).toBe(503)
    expect(archiveStarted).toBe(false)
  })

  it('blocks archive when persisted records for the connection have pending sync status', async () => {
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    await ready(dispatcher)
    let archiveStarted = false
    const archive = dispatcher.withNoPendingWrites(
      'ws-1',
      ['connection-a'],
      async () => {
        archiveStarted = true
        return Either.success(undefined)
      },
    )
    await Promise.resolve()
    const query = world.runtime.webContents.messages.find(
      (item) => item.channel === 'local-runtime:execute',
    )
    if (
      query === undefined ||
      query.packet.requestId === undefined ||
      query.packet.generation === undefined
    )
      return expect.fail('Expected persisted pending-write query')
    expect(query.packet.input).toMatchObject({
      action: 'list',
      workspaceId: 'ws-1',
      filter: { connectionInstanceId: 'connection-a' },
    })
    emit('local-runtime:reply', world.runtime.webContents, {
      requestId: query.packet.requestId,
      generation: query.packet.generation,
      response: {
        ok: true,
        value: {
          entry: null,
          entries: [],
          timer: null,
          deleted: false,
          pendingWrites: true,
        },
      },
      channel: '',
      data: { requestId: '', workspaceId: '' },
    })

    const result = await archive

    expect(result.isFailure()).toBe(true)
    expect(result.isFailure() && result.failure.messageKey).toBe(
      'CONNECTION_PENDING_WRITES',
    )
    expect(archiveStarted).toBe(false)
  })

  it('fences runtime, persistence and sync writes for the whole archive operation', async () => {
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    await ready(dispatcher)
    let signalArchiveStarted: (() => void) | undefined
    const archiveStarted = new Promise<void>((resolve) => {
      signalArchiveStarted = resolve
    })
    let releaseArchive: (() => void) | undefined
    const archiveGate = new Promise<void>((resolve) => {
      releaseArchive = resolve
    })
    const archive = dispatcher.withNoPendingWrites(
      'ws-1',
      ['connection-a'],
      async () => {
        if (signalArchiveStarted) signalArchiveStarted()
        await archiveGate
        return Either.success(undefined)
      },
    )
    await Promise.resolve()
    const query = world.runtime.webContents.messages.find(
      (item) => item.channel === 'local-runtime:execute',
    )
    if (
      query === undefined ||
      query.packet.requestId === undefined ||
      query.packet.generation === undefined
    )
      return expect.fail('Expected persisted pending-write query')
    emit('local-runtime:reply', world.runtime.webContents, {
      requestId: query.packet.requestId,
      generation: query.packet.generation,
      response: {
        ok: true,
        value: {
          entry: null,
          entries: [],
          timer: null,
          deleted: false,
          pendingWrites: false,
        },
      },
      channel: '',
      data: { requestId: '', workspaceId: '' },
    })
    await archiveStarted

    expect(
      resultError(
        await dispatcher.request({
          action: 'create',
          workspaceId: 'ws-1',
          commandId: 'during-archive',
          entryId: 'entry-a',
          payload: { taskId: 'task-a', timeSpentSeconds: 60 },
        }),
      ),
    ).toBe('localRuntime.workspaceMaintenance')
    expect(
      resultError(
        await route('local-runtime:persistence')(
          { sender: world.main.webContents },
          {
            action: 'deleteRecord',
            workspaceId: 'ws-1',
            commandId: 'during-archive-persistence',
            entryId: 'entry-a',
          },
        ),
      ),
    ).toBe('localRuntime.workspaceMaintenance')
    expect(
      resultError(
        await route('local-runtime:sync')(
          { sender: world.main.webContents },
          {
            action: 'forceSync',
            workspaceId: 'ws-1',
            connectionInstanceId: 'connection-a',
          },
        ),
      ),
    ).toBe('localRuntime.workspaceMaintenance')
    expect(
      world.runtime.webContents.messages.some(
        (item) => item.channel === 'local-runtime:execute-persistence',
      ),
    ).toBe(false)
    expect(
      world.runtime.webContents.messages.some(
        (item) => item.channel === 'local-runtime:execute-sync',
      ),
    ).toBe(false)
    if (releaseArchive) releaseArchive()
    const result = await archive
    expect(result.isSuccess()).toBe(true)
  })

  it('rejects public and private CRUD from reader release until owner reset completes', async () => {
    vi.useFakeTimers()
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    await ready(dispatcher)
    const reset = route('local-runtime:sync')(
      { sender: world.main.webContents },
      { action: 'reset', workspaceId: 'ws-1' },
    )
    const blockedQuery = dispatcher.request({
      action: 'get',
      workspaceId: 'ws-1',
      entryId: 'entry-1',
    })
    expect(
      world.runtime.webContents.messages.some(
        (item) => item.channel === 'local-runtime:execute',
      ),
    ).toBe(false)
    expect(resultError(await blockedQuery)).toBe(
      'localRuntime.workspaceMaintenance',
    )
    expect(
      resultError(
        await route('local-runtime:persistence')(
          { sender: world.main.webContents },
          {
            action: 'deleteRecord',
            workspaceId: 'ws-1',
            entryId: 'entry-1',
            commandId: 'delete-1',
          },
        ),
      ),
    ).toBe('localRuntime.workspaceMaintenance')
    expect(world.runtime.webContents.messages).toHaveLength(0)
    const duplicateReset = await route('local-runtime:sync')(
      { sender: world.main.webContents },
      { action: 'reset', workspaceId: 'ws-1' },
    )
    expect(resultError(duplicateReset)).toBe(
      'localRuntime.workspaceMaintenance',
    )
    expect(
      world.main.webContents.messages.filter(
        (item) => item.channel === 'local-runtime:close-readers',
      ),
    ).toHaveLength(1)
    expect(
      world.main.webContents.messages.some(
        (item) => item.channel === 'local-runtime:workspace-reopened',
      ),
    ).toBe(false)
    releaseReader()
    await vi.advanceTimersByTimeAsync(0)
    expect(
      world.runtime.webContents.messages.some(
        (item) => item.channel === 'local-runtime:execute-sync',
      ),
    ).toBe(true)
    const blockedAfterReaders = dispatcher.request({
      action: 'get',
      workspaceId: 'ws-1',
      entryId: 'entry-1',
    })
    expect(
      world.runtime.webContents.messages.some(
        (item) => item.channel === 'local-runtime:execute',
      ),
    ).toBe(false)
    expect(resultError(await blockedAfterReaders)).toBe(
      'localRuntime.workspaceMaintenance',
    )
    syncReply({ ok: true, statuses: [] })
    expect(await reset).toEqual({ ok: true, statuses: [] })
    expect(
      world.main.webContents.messages.filter(
        (item) => item.channel === 'local-runtime:workspace-reopened',
      ),
    ).toHaveLength(1)
  })

  it('independently rejects private persistence before readers acknowledge maintenance', async () => {
    vi.useFakeTimers()
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    await ready(dispatcher)
    const reset = route('local-runtime:sync')(
      { sender: world.main.webContents },
      { action: 'reset', workspaceId: 'ws-1' },
    )
    const persistence = route('local-runtime:persistence')(
      { sender: world.main.webContents },
      {
        action: 'deleteRecord',
        workspaceId: 'ws-1',
        entryId: 'entry-1',
        commandId: 'private-delete-1',
      },
    )
    expect(
      world.runtime.webContents.messages.some(
        (item) => item.channel === 'local-runtime:execute-persistence',
      ),
    ).toBe(false)
    expect(resultError(await persistence)).toBe(
      'localRuntime.workspaceMaintenance',
    )
    releaseReader()
    await vi.advanceTimersByTimeAsync(0)
    syncReply({ ok: true, statuses: [] })
    expect(await reset).toEqual({ ok: true, statuses: [] })
  })
  it('keeps maintenance fenced after caller deadline and finishes only on the late owner reply', async () => {
    vi.useFakeTimers()
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    await ready(dispatcher)
    const reset = route('local-runtime:sync')(
      { sender: world.main.webContents },
      { action: 'reset', workspaceId: 'ws-1' },
    )
    releaseReader()
    await vi.advanceTimersByTimeAsync(0)
    expect(
      world.runtime.webContents.messages.some(
        (item) => item.channel === 'local-runtime:execute-sync',
      ),
    ).toBe(true)
    await vi.advanceTimersByTimeAsync(30001)
    expect(resultError(await reset)).toBe(
      'localRuntime.responseDeadlineExceeded',
    )
    expect(
      world.main.webContents.messages.some(
        (item) => item.channel === 'local-runtime:workspace-reopened',
      ),
    ).toBe(false)
    const blockedQuery = dispatcher.request({
      action: 'get',
      workspaceId: 'ws-1',
      entryId: 'entry-1',
    })
    expect(
      world.runtime.webContents.messages.some(
        (item) => item.channel === 'local-runtime:execute',
      ),
    ).toBe(false)
    expect(resultError(await blockedQuery)).toBe(
      'localRuntime.workspaceMaintenance',
    )
    syncReply({ ok: true, statuses: [] })
    expect(
      world.main.webContents.messages.filter(
        (item) => item.channel === 'local-runtime:workspace-reopened',
      ),
    ).toHaveLength(1)
    const query = dispatcher.request({
      action: 'get',
      workspaceId: 'ws-1',
      entryId: 'entry-1',
    })
    const message = world.runtime.webContents.messages.find(
      (item) => item.channel === 'local-runtime:execute',
    )
    if (
      message === undefined ||
      message.packet.requestId === undefined ||
      message.packet.generation === undefined
    )
      return expect.fail('Maintenance gate was not released')
    emit('local-runtime:reply', world.runtime.webContents, {
      requestId: message.packet.requestId,
      generation: message.packet.generation,
      response: {
        ok: true,
        value: {
          entry: null,
          entries: [],
          timer: null,
          deleted: false,
          pendingWrites: false,
        },
      },
      channel: '',
      data: { requestId: '', workspaceId: '' },
    })
    expect(await query).toMatchObject({ ok: true })
  })

  it('does not send drop to the owner if a reader fails to close', async () => {
    vi.useFakeTimers()
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    await ready(dispatcher)
    const drop = route('local-runtime:sync')(
      { sender: world.main.webContents },
      { action: 'drop', workspaceId: 'ws-1' },
    )
    await vi.advanceTimersByTimeAsync(10001)
    expect(resultError(await drop)).toBe('localRuntime.readersStillOpen')
    expect(world.runtime.webContents.messages).toHaveLength(0)
    expect(
      world.main.webContents.messages.filter(
        (item) => item.channel === 'local-runtime:workspace-reopened',
      ),
    ).toHaveLength(1)
  })
})

describe('Core read transport availability', () => {
  it('reports readiness without blocking addon activation and removes listeners explicitly', async () => {
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    const states: string[] = []
    const unsubscribe = dispatcher.onStateChanged((state) => states.push(state))
    expect(states).toEqual(['starting'])
    const input: CoreCacheQuery = {
      action: 'tasks',
      workspaceId: 'ws-1',
      connectionInstanceId: 'connection',
      limit: 5,
    }
    expect(await dispatcher.queryCore(input)).toEqual({
      ok: false,
      error: { messageKey: 'localRuntime.notReady', statusCode: 503 },
    })
    await ready(dispatcher)
    expect(states).toEqual(['starting', 'ready'])
    unsubscribe()
    expect(await dispatcher.queryCore({ ...input, limit: 0 })).toEqual({
      ok: false,
      error: { messageKey: 'TASK_LIMIT_INVALID', statusCode: 422 },
    })
    const request = dispatcher.queryCore(input)
    const packet = world.runtime.webContents.messages.find(
      (item) => item.channel === 'local-runtime:execute-core',
    )?.packet
    if (
      packet === undefined ||
      packet.requestId === undefined ||
      packet.generation === undefined
    )
      return expect.fail('Missing core query packet')
    emit('local-runtime:core-reply', world.runtime.webContents, {
      requestId: packet.requestId,
      generation: packet.generation,
      response: {
        ok: true,
        value: { kind: 'tasks', tasks: [], hasMore: false },
      },
      channel: '',
      data: { requestId: '', workspaceId: '' },
    })
    expect(await request).toEqual({
      ok: true,
      value: { kind: 'tasks', tasks: [], hasMore: false },
    })
    expect(states).toEqual(['starting', 'ready'])
  })
})

it('invalidates outstanding core reads when the owner closes and ignores obsolete replies', async () => {
  const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
  const states: string[] = []
  dispatcher.onStateChanged((state) => states.push(state))
  await ready(dispatcher)
  const request = dispatcher.queryCore({
    action: 'metadata',
    workspaceId: 'ws-1',
    connectionInstanceId: 'connection',
  })
  const packet = world.runtime.webContents.messages.find(
    (item) => item.channel === 'local-runtime:execute-core',
  )?.packet
  if (
    packet === undefined ||
    packet.requestId === undefined ||
    packet.generation === undefined
  )
    return expect.fail('Missing packet')
  world.windowListeners.get('closed')?.()
  expect(await request).toEqual({
    ok: false,
    error: { messageKey: 'localRuntime.executorClosed', statusCode: 503 },
  })
  expect(states).toEqual(['starting', 'ready', 'closed'])
  emit('local-runtime:core-reply', world.runtime.webContents, {
    requestId: packet.requestId,
    generation: packet.generation,
    response: { ok: true, value: { kind: 'tasks', tasks: [], hasMore: false } },
    channel: '',
    data: { requestId: '', workspaceId: '' },
  })
  expect(dispatcher.getState()).toBe('closed')
})

it('blocks lifecycle mutation when the selected connection has local pending writes', async () => {
  const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
  await ready(dispatcher)
  const operation = vi.fn(async () => Either.success(undefined))
  const guarded = dispatcher.withNoPendingWrites(
    'ws-1',
    ['connection-pending'],
    operation,
  )
  const packet = world.runtime.webContents.messages.find(
    (item) => item.channel === 'local-runtime:execute',
  )?.packet
  if (
    packet === undefined ||
    packet.requestId === undefined ||
    packet.generation === undefined
  )
    return expect.fail('Missing pending work query')
  expect(packet.input).toEqual({
    action: 'list',
    workspaceId: 'ws-1',
    filter: { connectionInstanceId: 'connection-pending' },
  })
  emit('local-runtime:reply', world.runtime.webContents, {
    requestId: packet.requestId,
    generation: packet.generation,
    response: {
      ok: true,
      value: {
        entry: null,
        entries: [],
        timer: null,
        deleted: false,
        pendingWrites: true,
      },
    },
    channel: '',
    data: { requestId: '', workspaceId: '' },
  })
  const result = await guarded
  expect(result.isFailure()).toBe(true)
  expect(operation).not.toHaveBeenCalled()
})

describe('LocalRuntimeDispatcher diagnostic lifecycle (Block A)', () => {
  it('resolves whenReady with false and records explicit failure when executor fails before deadline', async () => {
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    const generation = (await route('local-runtime:begin')(
      { sender: world.runtime.webContents },
      '',
    )) as string
    expect(typeof generation).toBe('string')

    const readyPromise = dispatcher.whenReady()

    const failurePacket: RuntimeStartupFailurePacket = {
      generation,
      stage: 'owner.start',
      error: {
        messageKey: 'WORKSPACE_REGISTRY_OPEN_FAILED',
        statusCode: 500,
      },
    }
    const result = await route('local-runtime:failed')(
      { sender: world.runtime.webContents },
      failurePacket,
    )
    expect(result).toBe(generation)

    const readyResult = await readyPromise
    expect(readyResult).toBe(false)

    const diagnostic = dispatcher.getDiagnosticState()
    expect(diagnostic.startupStage).toBe('failed')
    expect(diagnostic.lastStartupFailure).toMatchObject({
      kind: 'explicit',
      stage: 'owner.start',
      messageKey: 'WORKSPACE_REGISTRY_OPEN_FAILED',
      statusCode: 500,
    })
  })

  it('ignores failure packets and ready packets from unauthorized sender or obsolete generation', async () => {
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    const generation = (await route('local-runtime:begin')(
      { sender: world.runtime.webContents },
      '',
    )) as string

    const wrongSender = await route('local-runtime:failed')(
      { sender: world.main.webContents },
      {
        generation,
        stage: 'owner.start',
        error: { messageKey: 'UNAUTHORIZED_FAIL', statusCode: 500 },
      },
    )
    expect(wrongSender).toBeNull()
    expect(dispatcher.getDiagnosticState().lastStartupFailure).toBeUndefined()

    const wrongGeneration = await route('local-runtime:failed')(
      { sender: world.runtime.webContents },
      {
        generation: 'stale-generation-uuid',
        stage: 'owner.start',
        error: { messageKey: 'STALE_FAIL', statusCode: 500 },
      },
    )
    expect(wrongGeneration).toBeNull()
    expect(dispatcher.getDiagnosticState().lastStartupFailure).toBeUndefined()

    const wrongSenderReady = await route('local-runtime:ready')(
      { sender: world.main.webContents },
      generation,
    )
    expect(wrongSenderReady).toBeNull()
    expect(dispatcher.getState()).toBe('starting')
  })

  it('distinguishes deadline expiration from explicit failure and records kind: deadline_exceeded', async () => {
    vi.useFakeTimers()
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    await route('local-runtime:begin')(
      { sender: world.runtime.webContents },
      '',
    )

    const readyPromise = dispatcher.whenReady()
    vi.advanceTimersByTime(30000)

    const readyResult = await readyPromise
    expect(readyResult).toBe(false)

    const diagnostic = dispatcher.getDiagnosticState()
    expect(diagnostic.startupStage).toBe('timed_out')
    expect(diagnostic.lastStartupFailure).toMatchObject({
      kind: 'deadline_exceeded',
      stage: 'startup_timeout',
      messageKey: 'localRuntime.startupDeadlineExceeded',
    })
  })

  it('allows current generation to complete readiness after invalidation', async () => {
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    const gen1 = (await route('local-runtime:begin')(
      { sender: world.runtime.webContents },
      '',
    )) as string

    await route('local-runtime:failed')(
      { sender: world.runtime.webContents },
      {
        generation: gen1,
        stage: 'owner.start',
        error: { messageKey: 'INITIAL_FAIL', statusCode: 500 },
      },
    )
    expect(dispatcher.getDiagnosticState().startupStage).toBe('failed')

    world.contentsListeners.get('did-start-navigation')?.({}, '', false, true)
    expect(dispatcher.getDiagnosticState().startupStage).toBe('restarting')
    expect(dispatcher.getDiagnosticState().lastStartupFailure).toBeUndefined()

    const gen2 = (await route('local-runtime:begin')(
      { sender: world.runtime.webContents },
      '',
    )) as string
    expect(gen2).not.toBe(gen1)

    await route('local-runtime:ready')(
      { sender: world.runtime.webContents },
      gen2,
    )

    expect(await dispatcher.whenReady()).toBe(true)
    expect(dispatcher.getState()).toBe('ready')
    expect(dispatcher.getDiagnosticState().startupStage).toBe('ready')
    expect(dispatcher.getDiagnosticState().lastStartupFailure).toBeUndefined()
  })

  it('dispatches diagnostic probe to executor and receives reply', async () => {
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    await ready(dispatcher)

    const probePromise = dispatcher.probeExecutor(5000)

    const probeMessage = world.runtime.webContents.messages.find(
      (item) => item.channel === 'local-runtime:execute-diagnostic-probe',
    )
    if (
      probeMessage === undefined ||
      probeMessage.packet.requestId === undefined ||
      probeMessage.packet.generation === undefined
    ) {
      return expect.fail('Expected diagnostic probe request')
    }

    emit('local-runtime:diagnostic-probe-reply', world.runtime.webContents, {
      requestId: probeMessage.packet.requestId,
      generation: probeMessage.packet.generation,
      response: {
        ok: true,
        value: {
          observedGeneration: probeMessage.packet.generation,
          workspaces: [
            {
              workspaceId: 'ws-1',
              status: 'ready',
              hasDb: true,
            },
          ],
          storageEstimate: {
            status: 'available',
            bytes: 1048576,
            precision: 'estimated',
            coverage: 'origin',
            unit: 'bytes',
            collectedAt: '2026-10-27T00:00:00.000Z',
          },
          operationalReadChecks: [],
        },
      },
      channel: '',
      data: { requestId: '', workspaceId: '' },
    })

    const probeResult = await probePromise
    expect(probeResult).toEqual({
      ok: true,
      value: {
        observedGeneration: probeMessage.packet.generation,
        workspaces: [
          {
            workspaceId: 'ws-1',
            status: 'ready',
            hasDb: true,
          },
        ],
        storageEstimate: {
          status: 'available',
          bytes: 1048576,
          precision: 'estimated',
          coverage: 'origin',
          unit: 'bytes',
          collectedAt: '2026-10-27T00:00:00.000Z',
        },
        operationalReadChecks: [],
      },
    })
  })

  it('recovers to ready state when delayed ready arrives from the same generation after timeout', async () => {
    vi.useFakeTimers()
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())

    const gen = (await route('local-runtime:begin')({
      sender: world.runtime.webContents,
    })) as string

    const whenReadyPromise = dispatcher.whenReady()
    vi.advanceTimersByTime(30000)

    const readyBeforeDelayed = await whenReadyPromise
    expect(readyBeforeDelayed).toBe(false)
    expect(dispatcher.getDiagnosticState().startupStage).toBe('timed_out')
    expect(dispatcher.getDiagnosticState().lastStartupFailure?.kind).toBe(
      'deadline_exceeded',
    )

    await route('local-runtime:ready')(
      { sender: world.runtime.webContents },
      gen,
    )

    expect(dispatcher.getState()).toBe('ready')
    expect(dispatcher.getDiagnosticState().startupStage).toBe('ready')
    expect(dispatcher.getDiagnosticState().lastStartupFailure).toBeUndefined()
    expect(await dispatcher.whenReady()).toBe(true)

    vi.useRealTimers()
  })

  it('notifies registered diagnostic event listeners on failure and recovery', async () => {
    const dispatcher = new LocalRuntimeDispatcher(new BrowserWindow())
    const events: unknown[] = []
    dispatcher.onDiagnosticEvent((event) => {
      events.push(event)
    })

    const gen = (await route('local-runtime:begin')({
      sender: world.runtime.webContents,
    })) as string

    await route('local-runtime:failed')(
      { sender: world.runtime.webContents },
      {
        generation: gen,
        stage: 'owner.start',
        error: { messageKey: 'CUSTOM_BOOT_ERROR', statusCode: 500 },
      },
    )

    expect(events).toHaveLength(2)
    expect((events[0] as { stage: string })?.stage).toBe('bootstrapping')
    expect((events[1] as { stage: string; code?: string })?.stage).toBe(
      'failed',
    )
    expect((events[1] as { stage: string; code?: string })?.code).toBe(
      'CUSTOM_BOOT_ERROR',
    )

    await route('local-runtime:ready')(
      { sender: world.runtime.webContents },
      gen,
    )

    expect(events).toHaveLength(3)
    expect((events[2] as { stage: string })?.stage).toBe('ready')
  })
})
