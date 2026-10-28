import { randomUUID } from 'node:crypto'

import type {
  CoreCacheQuery,
  CoreCacheResponse,
  CoreRuntimeState,
  DiagnosticDispatcherState,
  DiagnosticEvent,
  DiagnosticStartupFailure,
  IConnectionPendingWorkGuard,
  ICoreCacheTransport,
  ILocalRuntimeAPI,
  LocalEntryFilter,
  LocalPersistenceCommand,
  LocalPersistenceResponse,
  LocalRuntimeRequest,
  LocalRuntimeResponse,
  LocalSyncRequest,
  LocalSyncResponse,
} from '@mr-tick/application'
import { validateCoreCacheQuery } from '@mr-tick/application'
import { AppError, Either, isRecord } from '@mr-tick/shared/helpers'
import { BrowserWindow, ipcMain } from 'electron'

import type {
  RuntimeCommitPacket,
  RuntimeDiagnosticProbeResponse,
  RuntimePersistenceReply,
  RuntimeReplyPacket,
  RuntimeStartupFailurePacket,
  RuntimeSyncReply,
} from '../../../runtime-protocol'

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
export class LocalRuntimeDispatcher
  implements ILocalRuntimeAPI, ICoreCacheTransport, IConnectionPendingWorkGuard
{
  private readonly corePending = new Map<
    string,
    PendingRuntimeRequest<CoreCacheResponse>
  >()
  private runtimeState: CoreRuntimeState = 'starting'
  private readonly stateListeners = new Set<(state: CoreRuntimeState) => void>()
  private readonly diagnosticListeners = new Set<
    (event: DiagnosticEvent) => void
  >()
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
  private readonly diagnosticProbePending = new Map<
    string,
    PendingRuntimeRequest<RuntimeDiagnosticProbeResponse>
  >()
  private readonly readerReleases = new Map<string, PendingReaderRelease>()
  private readonly maintenanceWorkspaces = new Set<string>()
  private readonly workspaceTails = new Map<string, Promise<void>>()
  private generation = randomUUID()
  private ready = false
  private lastSequence = 0
  private readonly startupWaiters = new Set<(ready: boolean) => void>()
  private lastStartupFailure: DiagnosticStartupFailure | undefined
  private startupStage = 'initialized'

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
        return this.queueWorkspaceRequest(
          input.workspaceId,
          () =>
            this.dispatch(
              this.persistencePending,
              'local-runtime:execute-persistence',
              input,
            ),
          () => unavailable('localRuntime.workspaceMaintenance'),
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
        const workspaceQueue = this.waitForWorkspaceQueue(input.workspaceId)
        if (workspaceQueue !== undefined) await workspaceQueue
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
      this.startupStage = 'bootstrapping'
      this.lastStartupFailure = undefined
      this.notifyDiagnosticEvent('bootstrapping', 'Executor began bootstrap')
      return this.generation
    })
    ipcMain.handle(
      'local-runtime:failed',
      (event, packet: RuntimeStartupFailurePacket) => {
        if (!isRecord(packet)) return null
        if (
          typeof packet.generation !== 'string' ||
          typeof packet.stage !== 'string'
        )
          return null
        if (!isRecord(packet.error)) return null
        if (
          typeof packet.error.messageKey !== 'string' ||
          typeof packet.error.statusCode !== 'number'
        )
          return null
        if (
          event.sender !== this.window.webContents ||
          packet.generation !== this.generation
        )
          return null
        this.ready = false
        this.startupStage = 'failed'
        this.lastStartupFailure = {
          kind: 'explicit',
          stage: packet.stage,
          messageKey: packet.error.messageKey,
          statusCode: packet.error.statusCode,
          timestamp: new Date().toISOString(),
        }
        for (const waiter of this.startupWaiters) waiter(false)
        this.startupWaiters.clear()
        this.notifyDiagnosticEvent(
          'failed',
          `Startup failed at ${packet.stage}: ${packet.error.messageKey}`,
          packet.error.messageKey,
        )
        for (const client of BrowserWindow.getAllWindows()) {
          if (!this.isClient(client.webContents.id)) continue
          client.webContents.send('local-runtime:state', {
            generation: this.generation,
            state: this.runtimeState,
            failure: this.lastStartupFailure,
          })
        }
        return this.generation
      },
    )
    ipcMain.handle('local-runtime:ready', (event, generation: string) => {
      if (
        event.sender !== this.window.webContents ||
        typeof generation !== 'string' ||
        generation !== this.generation
      )
        return null
      this.ready = true
      this.startupStage = 'ready'
      this.lastStartupFailure = undefined
      this.setRuntimeState('ready')
      for (const waiter of this.startupWaiters) waiter(true)
      this.startupWaiters.clear()
      this.notifyDiagnosticEvent('ready', 'Executor became ready')
      for (const client of BrowserWindow.getAllWindows()) {
        if (!this.isClient(client.webContents.id)) continue
        client.webContents.send('local-runtime:state', {
          generation: this.generation,
          state: 'ready',
        })
      }
      return this.generation
    })
    ipcMain.on(
      'local-runtime:core-reply',
      (event, packet: RuntimeReplyPacket<CoreCacheResponse>) => {
        if (event.sender !== this.window.webContents) return
        this.complete(this.corePending, packet)
      },
    )
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
      'local-runtime:diagnostic-probe-reply',
      (event, packet: RuntimeReplyPacket<RuntimeDiagnosticProbeResponse>) => {
        if (event.sender !== this.window.webContents) return
        if (!isRecord(packet) || packet.generation !== this.generation) return
        if (typeof packet.requestId !== 'string' || !isRecord(packet.response))
          return
        this.complete(this.diagnosticProbePending, packet)
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

  getState(): CoreRuntimeState {
    return this.runtimeState
  }

  getDiagnosticState(): DiagnosticDispatcherState {
    const pendingRequestsByChannel: Record<string, number> = {
      core: this.corePending.size,
      runtime: this.pending.size,
      persistence: this.persistencePending.size,
      sync: this.syncPending.size,
      diagnosticProbe: this.diagnosticProbePending.size,
    }
    return {
      state: this.runtimeState,
      generation: this.generation,
      startupStage: this.startupStage,
      lastStartupFailure: this.lastStartupFailure,
      pendingRequestsByChannel,
    }
  }

  onStateChanged(listener: (state: CoreRuntimeState) => void): () => void {
    this.stateListeners.add(listener)
    try {
      listener(this.runtimeState)
    } catch (error) {
      console.error('[LocalRuntime] Availability listener failed:', error)
    }
    return () => this.stateListeners.delete(listener)
  }

  onDiagnosticEvent(listener: (event: DiagnosticEvent) => void): () => void {
    this.diagnosticListeners.add(listener)
    return () => this.diagnosticListeners.delete(listener)
  }

  private setRuntimeState(state: CoreRuntimeState): void {
    this.runtimeState = state
    for (const listener of this.stateListeners) {
      try {
        listener(state)
      } catch (error) {
        console.error('[LocalRuntime] Availability listener failed:', error)
      }
    }
  }

  private notifyDiagnosticEvent(
    stage: string,
    message: string,
    code?: string,
  ): void {
    const level =
      stage === 'failed' ? 'error' : stage === 'timed_out' ? 'warn' : 'info'
    const event: DiagnosticEvent = {
      sequence: 0,
      sessionId: '',
      generation: this.generation,
      origin: 'dispatcher',
      level,
      stage,
      code,
      message,
      timestamp: new Date().toISOString(),
    }
    for (const listener of this.diagnosticListeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[LocalRuntime] Diagnostic observer failed:', error)
      }
    }
  }

  queryCore(input: CoreCacheQuery): Promise<CoreCacheResponse> {
    const valid = validateCoreCacheQuery(input)
    if (valid.isFailure())
      return Promise.resolve({
        ok: false,
        error: {
          messageKey: valid.failure.messageKey,
          statusCode: valid.failure.statusCode,
        },
      })
    if (this.maintenanceWorkspaces.has(input.workspaceId))
      return Promise.resolve(unavailable('localRuntime.workspaceMaintenance'))
    return this.queueWorkspaceRequest(
      input.workspaceId,
      () =>
        this.dispatch(this.corePending, 'local-runtime:execute-core', input),
      () => ({
        ok: false,
        error: {
          messageKey: 'localRuntime.workspaceMaintenance',
          statusCode: 503,
        },
      }),
    )
  }

  acceptsGeneration(generation: string): boolean {
    return generation === this.generation
  }

  whenReady(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true)
    if (
      this.lastStartupFailure !== undefined &&
      this.lastStartupFailure.kind === 'explicit'
    ) {
      return Promise.resolve(false)
    }
    return new Promise((resolve) => {
      const finish = (ready: boolean) => {
        clearTimeout(deadline)
        this.startupWaiters.delete(finish)
        resolve(ready)
      }
      const deadline = setTimeout(() => {
        if (!this.ready && this.lastStartupFailure === undefined) {
          this.startupStage = 'timed_out'
          this.lastStartupFailure = {
            kind: 'deadline_exceeded',
            stage: 'startup_timeout',
            messageKey: 'localRuntime.startupDeadlineExceeded',
            timestamp: new Date().toISOString(),
          }
          this.notifyDiagnosticEvent(
            'timed_out',
            'Startup deadline exceeded',
            'localRuntime.startupDeadlineExceeded',
          )
        }
        finish(false)
      }, 30000)
      this.startupWaiters.add(finish)
    })
  }

  probeExecutor(
    timeoutMs: number = 5000,
  ): Promise<RuntimeDiagnosticProbeResponse> {
    if (!this.ready || this.window.isDestroyed())
      return Promise.resolve({
        ok: false,
        error: { messageKey: 'localRuntime.notReady', statusCode: 503 },
      })
    return this.dispatch(
      this.diagnosticProbePending,
      'local-runtime:execute-diagnostic-probe',
      {},
      undefined,
      timeoutMs,
    )
  }

  request(input: LocalRuntimeRequest): Promise<LocalRuntimeResponse> {
    if (input && this.maintenanceWorkspaces.has(input.workspaceId))
      return Promise.resolve(unavailable('localRuntime.workspaceMaintenance'))
    return this.queueWorkspaceRequest(
      input.workspaceId,
      () => this.dispatch(this.pending, 'local-runtime:execute', input),
      () => unavailable('localRuntime.workspaceMaintenance'),
    )
  }

  async withNoPendingWrites<T>(
    workspaceId: string,
    connectionInstanceIds: readonly string[],
    operation: () => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    if (!workspaceId.trim() || connectionInstanceIds.some((id) => !id.trim()))
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    if (this.maintenanceWorkspaces.has(workspaceId))
      return Either.failure(AppError.Http(409, 'WORKSPACE_MAINTENANCE'))
    this.maintenanceWorkspaces.add(workspaceId)
    try {
      const workspaceQueue = this.waitForWorkspaceQueue(workspaceId)
      if (workspaceQueue !== undefined) await workspaceQueue
      let filter: LocalEntryFilter = {}
      if (connectionInstanceIds.length === 1) {
        const connectionInstanceId = connectionInstanceIds[0]
        if (connectionInstanceId === undefined)
          return Either.failure(
            AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
          )
        filter = { connectionInstanceId }
      }
      const response = await this.dispatch(
        this.pending,
        'local-runtime:execute',
        {
          action: 'list',
          workspaceId,
          filter,
        },
      )
      if (!response.ok)
        return Either.failure(
          AppError.Http(response.error.statusCode, response.error.messageKey),
        )
      if (response.value.pendingWrites)
        return Either.failure(AppError.Http(409, 'CONNECTION_PENDING_WRITES'))
      return await operation()
    } finally {
      this.maintenanceWorkspaces.delete(workspaceId)
    }
  }

  private async queueWorkspaceRequest<T>(
    workspaceId: string,
    operation: () => Promise<T>,
    blocked: () => T,
  ): Promise<T> {
    if (this.maintenanceWorkspaces.has(workspaceId)) return blocked()
    const previous = this.workspaceTails.get(workspaceId)
    let release: () => void = () => undefined
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous === undefined ? current : previous.then(() => current)
    this.workspaceTails.set(workspaceId, tail)
    try {
      if (previous !== undefined) await previous
      if (this.maintenanceWorkspaces.has(workspaceId)) return blocked()
      return await operation()
    } finally {
      release()
      if (this.workspaceTails.get(workspaceId) === tail)
        this.workspaceTails.delete(workspaceId)
    }
  }

  private waitForWorkspaceQueue(
    workspaceId: string,
  ): Promise<void> | undefined {
    return this.workspaceTails.get(workspaceId)
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
      | LocalRuntimeResponse
      | LocalPersistenceResponse
      | LocalSyncResponse
      | CoreCacheResponse
      | RuntimeDiagnosticProbeResponse,
  >(
    pendingRequests: Map<string, PendingRuntimeRequest<TResponse>>,
    channel: string,
    input: TRequest,
    completed?: (response: TResponse | ReturnType<typeof unavailable>) => void,
    timeoutMs: number = 30000,
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
        if (!completed) pendingRequests.delete(requestId)
        resolve(unavailable('localRuntime.responseDeadlineExceeded'))
      }, timeoutMs)
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
      | LocalRuntimeResponse
      | LocalPersistenceResponse
      | LocalSyncResponse
      | CoreCacheResponse
      | RuntimeDiagnosticProbeResponse,
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
    this.startupStage =
      messageKey === 'localRuntime.restarting' ? 'restarting' : 'invalidated'
    if (messageKey === 'localRuntime.executorUnavailable') {
      this.lastStartupFailure = {
        kind: 'process_gone',
        stage: 'invalidation',
        messageKey,
        timestamp: new Date().toISOString(),
      }
    }
    if (messageKey !== 'localRuntime.executorUnavailable') {
      this.lastStartupFailure = undefined
    }
    this.setRuntimeState(
      messageKey === 'localRuntime.executorClosed' ? 'closed' : 'restarting',
    )
    this.notifyDiagnosticEvent(
      this.startupStage,
      `Dispatcher invalidated: ${messageKey}`,
      messageKey,
    )
    this.rejectPending(this.corePending, messageKey)
    this.rejectPending(this.pending, messageKey)
    this.rejectPending(this.persistencePending, messageKey)
    this.rejectPending(this.syncPending, messageKey)
    this.rejectPending(this.diagnosticProbePending, messageKey)
    for (const release of this.readerReleases.values()) {
      clearTimeout(release.deadline)
      release.resolve(false)
    }
    this.readerReleases.clear()
  }
}
