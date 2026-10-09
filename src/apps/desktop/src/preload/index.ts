import { electronAPI } from '@electron-toolkit/preload'
import type { IHostBridge } from '@mr-tick/application'
import { isWorkspaceScoped } from '@mr-tick/shared/helpers'
import { contextBridge, ipcRenderer } from 'electron'

import {
  addonsInvoker,
  headersInvoker,
  metadataInvoker,
  sessionInvoker,
  systemInvoker,
  tasksInvoker,
  timeEntriesInvoker,
  tokenStorageInvoker,
  updaterInvoker,
  workspacesInvoker,
} from '@/main/invokers'

const api: IHostBridge = {
  localPersistence: {
    request: (input) => ipcRenderer.invoke('local-runtime:persistence', input),
  },
  localSync: {
    request: (input) => ipcRenderer.invoke('local-runtime:sync', input),
  },
  localRuntime: {
    request: (input) => ipcRenderer.invoke('local-runtime:request', input),
  },
  workspaces: workspacesInvoker,
  session: sessionInvoker,
  tasks: tasksInvoker,
  timeEntries: timeEntriesInvoker,
  metadata: metadataInvoker,
  tokens: tokenStorageInvoker,
  headers: headersInvoker,
  system: systemInvoker,
  updater: updaterInvoker,
  addons: addonsInvoker,

  events: {
    on: <T = void>(channel: string, handler: (data: T) => void) => {
      const unsubscribe = electronAPI.ipcRenderer.on(
        channel,
        (event, data: T) => {
          handler(data)
        },
      )

      return unsubscribe
    },
    emit: <T = void>(channel: string, data?: T) => {
      let workspaceId: string | undefined
      if (typeof window !== 'undefined') {
        const match = window.location.hash.match(/#\/workspaces\/([^\/]+)/)
        if (match) workspaceId = match[1]
      }
      if (isWorkspaceScoped(data)) workspaceId = data.workspaceId
      ipcRenderer.send('events:broadcast', { channel, data, workspaceId })
    },
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Error while exposing API:', error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
