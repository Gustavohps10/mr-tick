import type {
  LocalPersistenceCommand,
  LocalPersistenceResponse,
  LocalRuntimeRequest,
  LocalRuntimeResponse,
  LocalSyncRequest,
  LocalSyncResponse,
} from '@mr-tick/application'
import { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalRuntimeDispatcher } from './LocalRuntimeDispatcher'

type TestInput =
  LocalPersistenceCommand | LocalRuntimeRequest | LocalSyncRequest | string
interface TestEvent {
  sender: TestContents
}
type TestResponse =
  | LocalPersistenceResponse
  | LocalRuntimeResponse
  | LocalSyncResponse
  | string
  | null
type Handler = (
  event: TestEvent,
  input: TestInput,
) => TestResponse | Promise<TestResponse>
interface TestPacket {
  requestId: string
  generation: string
  response: LocalPersistenceResponse | LocalRuntimeResponse | LocalSyncResponse
  channel: string
  data: { requestId: string; workspaceId: string }
}
type Listener = (event: TestEvent, packet: TestPacket) => void
interface SentPacket {
  requestId?: string
  generation?: string
  workspaceId?: string
  state?: string
  input?: LocalPersistenceCommand | LocalRuntimeRequest | LocalSyncRequest
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
      on: () => undefined,
      reload: () => undefined,
    }
  }
  const runtime = {
    webContents: contents(1, 'http://localhost/#/runtime'),
    windowType: 'runtime',
    isDestroyed: () => false,
    on: () => undefined,
  }
  const main = {
    webContents: contents(2, 'http://localhost/#/workspaces/ws-1/time-entries'),
    windowType: 'main',
    isDestroyed: () => false,
    on: () => undefined,
  }
  return { handlers, listeners, runtime, main }
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
        value: { entry: null, entries: [], timer: null, deleted: false },
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
