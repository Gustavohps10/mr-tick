import { electronAPI } from '@electron-toolkit/preload'
import { IOpenAPI } from '@mr-tick/application'
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

const api: IOpenAPI = {
  services: {
    workspaces: workspacesInvoker,
    session: sessionInvoker,
    tasks: tasksInvoker,
    timeEntries: timeEntriesInvoker,
    metadata: metadataInvoker,
  },
  modules: {
    headers: headersInvoker,
    tokenStorage: tokenStorageInvoker,
    system: systemInvoker,
    updater: updaterInvoker,
  },
  integrations: {
    addons: addonsInvoker,
  },
  events: {
    on: <T = unknown>(channel: string, handler: (data: T) => void) => {
      const unsubscribe = electronAPI.ipcRenderer.on(
        channel,
        (_event, data: T) => {
          handler(data)
        },
      )

      return unsubscribe
    },
    emit: <T = unknown>(channel: string, data?: T) => {
      let workspaceId = 'default'
      if (typeof window !== 'undefined') {
        const match = window.location.hash.match(/#\/workspaces\/([^\/]+)/)
        if (match) {
          workspaceId = match[1]
        }
      }
      ipcRenderer.send('events:broadcast', { channel, data, workspaceId })
    },
  },

  timer: {
    start: (input) => {
      let workspaceId = 'default'
      if (typeof window !== 'undefined') {
        const match = window.location.hash.match(/#\/workspaces\/([^\/]+)/)
        if (match) workspaceId = match[1]
      }
      ipcRenderer.send('timer:start', { ...input, workspaceId })
    },
    pause: () => {
      let workspaceId = 'default'
      if (typeof window !== 'undefined') {
        const match = window.location.hash.match(/#\/workspaces\/([^\/]+)/)
        if (match) workspaceId = match[1]
      }
      ipcRenderer.send('timer:pause', { workspaceId })
    },
    resume: (input) => {
      let workspaceId = 'default'
      if (typeof window !== 'undefined') {
        const match = window.location.hash.match(/#\/workspaces\/([^\/]+)/)
        if (match) workspaceId = match[1]
      }
      ipcRenderer.send('timer:resume', { ...input, workspaceId })
    },
    stop: () => {
      let workspaceId = 'default'
      if (typeof window !== 'undefined') {
        const match = window.location.hash.match(/#\/workspaces\/([^\/]+)/)
        if (match) workspaceId = match[1]
      }
      ipcRenderer.send('timer:stop', { workspaceId })
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
