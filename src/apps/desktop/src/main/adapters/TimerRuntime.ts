import type { TimerStateDTO } from '@mr-tick/application'
import { isNonEmptyString, isRecord } from '@mr-tick/shared/helpers'
import { BrowserWindow, ipcMain } from 'electron'

import type { AddonLoader } from '@/main/services/AddonLoader'
import { formatTrayTime, updateTrayTimer } from '@/main/tray'

interface TimerProjection {
  workspaceId: string
  timer: TimerStateDTO | null
  entryId?: string
  taskId?: string
  taskName?: string
  comments?: string
  action?: 'timerStart' | 'timerPause' | 'timerResume' | 'timerStop' | 'update'
}

interface ProjectedTimer {
  snapshot: TimerStateDTO
  receivedAt: number
}

interface BroadcastMessage {
  channel: string
  workspaceId?: string
  generation?: string
  data?: object | string | number | boolean | null
}

function workspaceOf(window: BrowserWindow): string | null {
  const url = window.webContents.getURL()
  if (!url) return null
  const match = new URL(url).hash.match(/#\/workspaces\/([^/?#]+)/)
  if (!match) return null
  return decodeURIComponent(match[1])
}

/** Native UI projection. It never starts, stops or persists a time entry. */
export class TimerRuntime {
  private readonly timers = new Map<string, ProjectedTimer>()
  private interval: NodeJS.Timeout | null = null

  init(
    addonLoader: AddonLoader,
    acceptsGeneration: (generation: string) => boolean,
  ): void {
    ipcMain.on('events:broadcast', (event, payload: BroadcastMessage) => {
      if (!isRecord(payload) || !isNonEmptyString(payload.channel)) return
      const sender = BrowserWindow.fromWebContents(event.sender)
      if (!sender) return
      if (
        payload.channel.startsWith('local-runtime:') &&
        (sender.windowType !== 'runtime' ||
          !payload.generation ||
          !acceptsGeneration(payload.generation))
      )
        return
      if (payload.channel === 'local-runtime:timer-projection') return
      for (const client of BrowserWindow.getAllWindows()) {
        if (!['main', 'widget'].includes(client.windowType ?? '')) continue
        if (
          payload.channel !== 'workspace:switched' &&
          payload.workspaceId &&
          workspaceOf(client) !== payload.workspaceId
        )
          continue
        client.webContents.send(payload.channel, payload.data)
      }
    })
    ipcMain.on(
      'events:broadcast',
      (
        event,
        payload: { channel: string; generation: string; data: TimerProjection },
      ) => {
        if (!payload || payload.channel !== 'local-runtime:timer-projection')
          return
        const sender = BrowserWindow.fromWebContents(event.sender)
        if (
          !sender ||
          sender.windowType !== 'runtime' ||
          !acceptsGeneration(payload.generation)
        )
          return
        const projection = payload.data
        if (!isRecord(projection) || !isNonEmptyString(projection.workspaceId))
          return
        const previous = this.timers.get(projection.workspaceId)
        if (projection.timer) {
          this.timers.set(projection.workspaceId, {
            snapshot: projection.timer,
            receivedAt: Date.now(),
          })
        }
        if (!projection.timer) this.timers.delete(projection.workspaceId)
        this.publishTicks()
        const timer = projection.timer
        const details = {
          workspaceId: projection.workspaceId,
          taskId: projection.taskId ?? previous?.snapshot.taskId,
          taskName: projection.taskName,
          comments: projection.comments ?? previous?.snapshot.comments,
        }
        if (projection.action === 'timerStart' && timer)
          addonLoader.systemEventEmitter.emit('timer:start', {
            ...details,
            mode: timer.mode,
            baseSeconds: timer.baseSeconds,
          })
        if (projection.action === 'timerPause' && timer)
          addonLoader.systemEventEmitter.emit('timer:pause', {
            ...details,
            currentSeconds: timer.currentSeconds,
          })
        if (projection.action === 'timerResume' && timer)
          addonLoader.systemEventEmitter.emit('timer:resume', {
            ...details,
            currentSeconds: timer.currentSeconds,
          })
        if (projection.action === 'timerStop')
          addonLoader.systemEventEmitter.emit('timer:stop', {
            ...details,
            currentSeconds: previous ? this.seconds(previous) : 0,
          })
        if (projection.action === 'update')
          addonLoader.systemEventEmitter.emit('timer:update', details)
      },
    )
    this.interval = setInterval(() => this.publishTicks(), 1000)
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval)
    this.interval = null
    this.timers.clear()
  }

  private seconds(timer: ProjectedTimer): number {
    if (timer.snapshot.status !== 'running')
      return timer.snapshot.currentSeconds
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - timer.receivedAt) / 1000),
    )
    if (timer.snapshot.mode === 'countdown')
      return timer.snapshot.currentSeconds - elapsed
    return timer.snapshot.currentSeconds + elapsed
  }

  private publishTicks(): void {
    for (const client of BrowserWindow.getAllWindows()) {
      if (!['main', 'widget'].includes(client.windowType ?? '')) continue
      const workspaceId = workspaceOf(client)
      if (!workspaceId) continue
      const timer = this.timers.get(workspaceId)
      if (!timer) continue
      const seconds = this.seconds(timer)
      client.webContents.send('timer:tick', { seconds, workspaceId })
    }
    const running = Array.from(this.timers.values()).find(
      (timer) => timer.snapshot.status === 'running',
    )
    if (running) {
      void updateTrayTimer({
        elapsedText: formatTrayTime(this.seconds(running)),
        status: 'running',
      }).catch(console.error)
      return
    }
    const paused = Array.from(this.timers.values()).find(
      (timer) => timer.snapshot.status === 'paused',
    )
    if (paused) {
      void updateTrayTimer({
        elapsedText: formatTrayTime(this.seconds(paused)),
        status: 'paused',
      }).catch(console.error)
      return
    }
    void updateTrayTimer({
      elapsedText: formatTrayTime(0),
      status: 'idle',
    }).catch(console.error)
  }
}
