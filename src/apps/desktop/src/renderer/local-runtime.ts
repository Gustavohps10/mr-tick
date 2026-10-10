import type { IHostBridge } from '@mr-tick/application'
import { isWorkspaceScoped } from '@mr-tick/shared/helpers'
import { createBrowserLocalRuntime } from '@mr-tick/ui/local-runtime'

import type {
  RuntimeCorePacket,
  RuntimePersistencePacket,
  RuntimeRequestPacket,
  RuntimeSyncPacket,
} from '../runtime-protocol'

/** Same document origin as the UI; no React tree is mounted in this process. */
export async function startLocalRuntimeRenderer(): Promise<void> {
  const environment = await window.api.system.getEnvironment()
  const generation: string = await window.electron.ipcRenderer.invoke(
    'local-runtime:begin',
  )
  let sequence = 0
  const bridge: IHostBridge = {
    ...window.api,
    events: {
      on: window.api.events.on,
      emit<T = void>(channel: string, data?: T) {
        let workspaceId: string | undefined
        if (isWorkspaceScoped(data)) workspaceId = data.workspaceId
        window.electron.ipcRenderer.send('events:broadcast', {
          channel,
          data,
          workspaceId,
          generation,
        })
      },
    },
  }
  const owner = createBrowserLocalRuntime(
    bridge,
    {
      isDevelopment: environment.isDevelopment,
      useMemoryStorage: false,
      retryTime: environment.isTest ? 3000 : 30000,
    },
    {
      committed(command, result) {
        if (!generation) return
        sequence += 1
        window.electron.ipcRenderer.send('local-runtime:committed', {
          generation,
          sequence,
          command,
          result,
        })
      },
    },
  )
  const started = await owner.start()
  if (started.isFailure()) {
    console.error('[LocalRuntime] Startup failed:', started.failure.messageKey)
    return
  }
  window.electron.ipcRenderer.on(
    'local-runtime:execute',
    async (event, packet: RuntimeRequestPacket) => {
      if (packet.generation !== generation) return
      const response = await executeSafely(() =>
        owner.runtime.request(packet.input),
      )
      window.electron.ipcRenderer.send('local-runtime:reply', {
        requestId: packet.requestId,
        generation,
        response,
      })
    },
  )
  window.electron.ipcRenderer.on(
    'local-runtime:execute-persistence',
    async (event, packet: RuntimePersistencePacket) => {
      if (packet.generation !== generation) return
      const response = await executeSafely(() =>
        owner.requestInternal(packet.input),
      )
      window.electron.ipcRenderer.send('local-runtime:persistence-reply', {
        requestId: packet.requestId,
        generation,
        response,
      })
    },
  )
  window.electron.ipcRenderer.on(
    'local-runtime:execute-sync',
    async (event, packet: RuntimeSyncPacket) => {
      if (packet.generation !== generation) return
      const response = await executeSafely(() =>
        owner.requestSync(packet.input),
      )
      window.electron.ipcRenderer.send('local-runtime:sync-reply', {
        requestId: packet.requestId,
        generation,
        response,
      })
    },
  )
  window.electron.ipcRenderer.on(
    'local-runtime:execute-core',
    async (event, packet: RuntimeCorePacket) => {
      if (packet.generation !== generation) return
      const response = await executeSafely(() => owner.queryCore(packet.input))
      window.electron.ipcRenderer.send('local-runtime:core-reply', {
        requestId: packet.requestId,
        generation,
        response,
      })
    },
  )
  await window.electron.ipcRenderer.invoke('local-runtime:ready', generation)
  window.addEventListener('beforeunload', () => {
    void owner.close()
  })
}

async function executeSafely<T>(
  operation: () => Promise<T>,
): Promise<
  T | { ok: false; error: { messageKey: string; statusCode: number } }
> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Error)
      return {
        ok: false,
        error: { messageKey: error.message, statusCode: 500 },
      }
    return {
      ok: false,
      error: {
        messageKey: 'LOCAL_RUNTIME_UNEXPECTED_FAILURE',
        statusCode: 500,
      },
    }
  }
}
