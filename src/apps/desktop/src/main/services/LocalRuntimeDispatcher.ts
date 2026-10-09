import { randomUUID } from 'node:crypto'

import type {
  ILocalRuntimeAPI,
  LocalPersistenceCommand,
  LocalPersistenceResponse,
  LocalRuntimeRequest,
  LocalRuntimeResponse,
  LocalSyncRequest,
  LocalSyncResponse,
} from '@mr-tick/application'
import { BrowserWindow, ipcMain } from 'electron'

import type {
  RuntimeCommitPacket,
  RuntimePersistenceReply,
  RuntimeReplyPacket,
  RuntimeSyncReply,
} from '../../runtime-protocol'

interface PendingRuntimeRequest<T> {
  generation: string
  resolve: (response: T | ReturnType<typeof unavailable>) => void
  deadline: NodeJS.Timeout
  completed:
    ((response: T | ReturnType<typeof unavailable>) => void) | undefined
}

interface PendingReaderRelease {
  workspaceId: string
  readers: Set<number>
  resolve: (released: boolean) => void
  deadline: NodeJS.Timeout
}

function unavailable(messageKey: string): {
  ok: false
  error: { messageKey: string; statusCode: number }
} {
  return { ok: false, error: { messageKey, statusCode: 503 } }
}

/** Routes calls to one executor; a reload invalidates its pending replies. */
export class LocalRuntimeDispatcher implements ILocalRuntimeAPI {
  private readonly pending = new Map<
    string,
    PendingRuntimeRequest<LocalRuntimeResponse>
  >()
  private readonly persistencePending = new Map<
    string,
    PendingRuntimeRequest<LocalPersistenceResponse>
  >()
  private readonly syncPending = new Map<
    string,
    PendingRuntimeRequest<LocalSyncResponse>
  >()
  private readonly readerReleases = new Map<string, PendingReaderRelease>()
  private readonly maintenanceWorkspaces = new Set<string>()
  private generation = randomUUID()
  private ready = false
  private lastSequence = 0
  private readonly startupWaiters = new Set<(ready: boolean) => void>()

  constructor(private readonly window: BrowserWindow) {
    ipcMain.handle(
      'local-runtime:request',
      (event, input: LocalRuntimeRequest) => {
        if (!this.isClient(event.sender.id))
          return unavailable('localRuntime.unauthorizedClient')
        return this.request(input)
      },
    )
    ipcMain.handle(
      'local-runtime:persistence',
      (event, input: LocalPersistenceCommand) => {
        if (!this.isClient(event.sender.id))
          return unavailable('localRuntime.unauthorizedClient')
        if (input && this.maintenanceWorkspaces.has(input.workspaceId))
          return unavailable('localRuntime.workspaceMaintenance')
        return this.dispatch(
          this.persistencePending,
          'local-runtime:execute-persistence',
          input,
        )
      },
    )
    ipcMain.handle(
      'local-runtime:sync',
      async (event, input: LocalSyncRequest) => {
        if (!this.isClient(event.sender.id))
          return unavailable('localRuntime.unauthorizedClient')
        if (!input || typeof input.workspaceId !== 'string')
          return unavailable('localRuntime.invalidSyncRequest')
        if (this.maintenanceWorkspaces.has(input.workspaceId))
          return unavailable('localRuntime.workspaceMaintenance')
        if (input.action !== 'drop' && input.action !== 'reset')
          return this.dispatch(
            this.syncPending,
            'local-runtime:execute-sync',
            input,
          )
        this.maintenanceWorkspaces.add(input.workspaceId)
        if (!(await this.releaseReaders(input.workspaceId))) {
          this.maintenanceWorkspaces.delete(input.workspaceId)
          this.resumeReaders(input.workspaceId)
          return unavailable('localRuntime.readersStillOpen')
        }
        return this.dispatch(
          this.syncPending,
          'local-runtime:execute-sync',
          input,
          (response) => {
            this.maintenanceWorkspaces.delete(input.workspaceId)
            if (input.action === 'reset' || !response.ok)
              this.resumeReaders(input.workspaceId)
          },
        )
      },
    )
    ipcMain.on(
      'events:broadcast',
      (
        event,
        payload: {
          channel: string
          data: { requestId: string; workspaceId: string }
        },
      ) => {
        if (
          !payload ||
          payload.channel !== 'local-runtime:reader-closed' ||
          !payload.data
        )
          return
        const release = this.readerReleases.get(payload.data.requestId)
        if (
          !release ||
          release.workspaceId !== payload.data.workspaceId ||
          !release.readers.has(event.sender.id)
        )
          return
        release.readers.delete(event.sender.id)
        if (release.readers.size > 0) return
        clearTimeout(release.deadline)
        this.readerReleases.delete(payload.data.requestId)
        release.resolve(true)
      },
    )
    ipcMain.handle('local-runtime:begin', (event) => {
      if (event.sender !== this.window.webContents) return null
      return this.generation
    })
    ipcMain.handle('local-runtime:ready', (event, generation: string) => {
      if (
        event.sender !== this.window.webContents ||
        generation !== this.generation
      )
        return null
      this.ready = true
      for (const waiter of this.startupWaiters) waiter(true)
      this.startupWaiters.clear()
      for (const client of BrowserWindow.getAllWindows()) {
        if (!this.isClient(client.webContents.id)) continue
        client.webContents.send('local-runtime:state', {
          generation: this.generation,
          state: 'ready',
        })
      }
      return this.generation
    })
    ipcMain.on('local-runtime:reply', (event, packet: RuntimeReplyPacket) => {
      if (event.sender !== this.window.webContents) return
      this.complete(this.pending, packet)
    })
    ipcMain.on(
      'local-runtime:persistence-reply',
      (event, packet: RuntimePersistenceReply) => {
        if (event.sender !== this.window.webContents) return
        this.complete(this.persistencePending, packet)
      },
    )
    ipcMain.on(
      'local-runtime:sync-reply',
      (event, packet: RuntimeSyncReply) => {
        if (event.sender !== this.window.webContents) return
        this.complete(this.syncPending, packet)
      },
    )
    ipcMain.on(
      'local-runtime:committed',
      (event, packet: RuntimeCommitPacket) => {
        if (event.sender !== this.window.webContents) return
        if (
          packet.generation !== this.generation ||
          packet.sequence <= this.lastSequence
        )
          return
        this.lastSequence = packet.sequence
        for (const client of BrowserWindow.getAllWindows()) {
          if (!this.isClient(client.webContents.id)) continue
          const url = client.webContents.getURL()
          if (!url) continue
          const match = new URL(url).hash.match(/#\/workspaces\/([^/?#]+)/)
          if (
            !match ||
            decodeURIComponent(match[1]) !== packet.command.workspaceId
          )
            continue
          client.webContents.send('local-runtime:committed', packet)
        }
      },
    )
    this.window.webContents.on(
      'did-start-navigation',
      (event, url, inPlace, mainFrame) => {
        if (!mainFrame || inPlace) return
        this.invalidate('localRuntime.restarting')
      },
    )
    this.window.webContents.on('render-process-gone', () => {
      this.invalidate('localRuntime.executorUnavailable')
      if (!this.window.isDestroyed()) this.window.webContents.reload()
    })
    this.window.on('closed', () =>
      this.invalidate('localRuntime.executorClosed'),
    )
  }

  acceptsGeneration(generation: string): boolean {
    return generation === this.generation
  }

  whenReady(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true)
    return new Promise((resolve) => {
      const finish = (ready: boolean) => {
        clearTimeout(deadline)
        this.startupWaiters.delete(finish)
        resolve(ready)
      }
      const deadline = setTimeout(() => finish(false), 30000)
      this.startupWaiters.add(finish)
    })
  }

  request(input: LocalRuntimeRequest): Promise<LocalRuntimeResponse> {
    if (input && this.maintenanceWorkspaces.has(input.workspaceId))
      return Promise.resolve(unavailable('localRuntime.workspaceMaintenance'))
    return this.dispatch(this.pending, 'local-runtime:execute', input)
  }

  private isClient(webContentsId: number): boolean {
    return BrowserWindow.getAllWindows().some(
      (client) =>
        client.webContents.id === webContentsId &&
        (client.windowType === 'main' || client.windowType === 'widget'),
    )
  }

  private resumeReaders(workspaceId: string): void {
    for (const client of BrowserWindow.getAllWindows()) {
      if (!this.isClient(client.webContents.id)) continue
      client.webContents.send('local-runtime:workspace-reopened', {
        workspaceId,
        requestId: randomUUID(),
      })
    }
  }

  private releaseReaders(workspaceId: string): Promise<boolean> {
    const clients = BrowserWindow.getAllWindows().filter((client) => {
      if (!this.isClient(client.webContents.id)) return false
      const url = client.webContents.getURL()
      if (!url) return false
      const segment = new URL(url).hash.split('/')[2]
      return Boolean(segment && decodeURIComponent(segment) === workspaceId)
    })
    if (clients.length === 0) return Promise.resolve(true)
    const requestId = randomUUID()
    return new Promise((resolve) => {
      const deadline = setTimeout(() => {
        this.readerReleases.delete(requestId)
        resolve(false)
      }, 10000)
      this.readerReleases.set(requestId, {
        workspaceId,
        readers: new Set(clients.map((client) => client.webContents.id)),
        resolve,
        deadline,
      })
      for (const client of clients)
        client.webContents.send('local-runtime:close-readers', {
          workspaceId,
          requestId,
        })
    })
  }

  private dispatch<
    TRequest,
    TResponse extends
      LocalRuntimeResponse | LocalPersistenceResponse | LocalSyncResponse,
  >(
    pendingRequests: Map<string, PendingRuntimeRequest<TResponse>>,
    channel: string,
    input: TRequest,
    completed?: (response: TResponse | ReturnType<typeof unavailable>) => void,
  ): Promise<TResponse | ReturnType<typeof unavailable>> {
    if (!this.ready || this.window.isDestroyed()) {
      const response = unavailable('localRuntime.notReady')
      completed?.(response)
      return Promise.resolve(response)
    }
    const requestId = randomUUID()
    const generation = this.generation
    return new Promise((resolve) => {
      const deadline = setTimeout(() => {
        // A maintenance timeout does not cancel deletion. Keep its fence until
        // the executor replies or its generation is invalidated.
        if (!completed) pendingRequests.delete(requestId)
        resolve(unavailable('localRuntime.responseDeadlineExceeded'))
      }, 30000)
      pendingRequests.set(requestId, {
        generation,
        resolve,
        deadline,
        completed,
      })
      this.window.webContents.send(channel, { requestId, generation, input })
    })
  }

  private complete<T>(
    pendingRequests: Map<string, PendingRuntimeRequest<T>>,
    packet: RuntimeReplyPacket<T>,
  ): void {
    if (!packet || packet.generation !== this.generation) return
    const pending = pendingRequests.get(packet.requestId)
    if (!pending || pending.generation !== packet.generation) return
    clearTimeout(pending.deadline)
    pendingRequests.delete(packet.requestId)
    pending.completed?.(packet.response)
    pending.resolve(packet.response)
  }

  private rejectPending<
    T extends
      LocalRuntimeResponse | LocalPersistenceResponse | LocalSyncResponse,
  >(
    pendingRequests: Map<string, PendingRuntimeRequest<T>>,
    messageKey: string,
  ): void {
    for (const request of pendingRequests.values()) {
      clearTimeout(request.deadline)
      const response = unavailable(messageKey)
      request.completed?.(response)
      request.resolve(response)
    }
    pendingRequests.clear()
  }

  private invalidate(messageKey: string): void {
    this.ready = false
    this.generation = randomUUID()
    this.lastSequence = 0
    this.rejectPending(this.pending, messageKey)
    this.rejectPending(this.persistencePending, messageKey)
    this.rejectPending(this.syncPending, messageKey)
    for (const release of this.readerReleases.values()) {
      clearTimeout(release.deadline)
      release.resolve(false)
    }
    this.readerReleases.clear()
  }
}
