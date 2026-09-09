import { app, BrowserWindow } from 'electron'
import pkg, { type UpdateInfo } from 'electron-updater'
const { autoUpdater } = pkg

import { getSettings } from '@/main/settings'

export class UpdaterService {
  public init(): void {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    const settings = getSettings()
    autoUpdater.allowPrerelease = !!settings.allowBeta

    autoUpdater.on('checking-for-update', () => {
      console.log('[UpdaterService] checking-for-update event fired')
      this.broadcast('updater:checking', undefined)
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      console.log('[UpdaterService] update-available event fired:', info)
      this.broadcast('updater:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    })

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      console.log('[UpdaterService] update-not-available event fired:', info)
      this.broadcast('updater:update-not-available', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    })

    autoUpdater.on('error', (err) => {
      console.error('[UpdaterService] error event fired:', err)
      this.broadcast('updater:error', err.message || err.toString())
    })

    autoUpdater.on('download-progress', (progressObj) => {
      console.log(
        '[UpdaterService] download-progress event fired:',
        progressObj.percent,
      )
      this.broadcast('updater:download-progress', {
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond,
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      console.log('[UpdaterService] update-downloaded event fired:', info)
      this.broadcast('updater:update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    })
  }

  private broadcast(channel: string, data: any) {
    console.log(`[UpdaterService] Broadcasting ${channel}`)
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    })
  }

  public async checkForUpdates(): Promise<void> {
    console.log('[UpdaterService] checkForUpdates called')
    const settings = getSettings()
    autoUpdater.allowPrerelease = !!settings.allowBeta
    console.log('[UpdaterService] allowBeta =', autoUpdater.allowPrerelease)

    if (!app.isPackaged) {
      console.log(
        '[UpdaterService] Skipped in dev mode. Simulating update-not-available in 3s.',
      )
      setTimeout(() => {
        this.broadcast('updater:update-not-available', {
          version: app.getVersion(),
          releaseDate: new Date().toISOString(),
        })
      }, 3000)
      return
    }

    try {
      await autoUpdater.checkForUpdates()
      console.log('[UpdaterService] checkForUpdates finished')
    } catch (err) {
      console.error('[UpdaterService] checkForUpdates threw an error:', err)
      throw err
    }
  }

  public async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate()
  }

  public quitAndInstall(): void {
    autoUpdater.quitAndInstall()
  }
}
