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
      const rawMsg = err?.message || err?.toString() || ''

      // "No published versions on GitHub" is actually normal when there are no releases newer than current
      if (rawMsg.includes('No published versions on GitHub')) {
        console.log(
          '[UpdaterService] No published versions found. Treating as update-not-available.',
        )
        this.broadcast('updater:update-not-available', {
          version: app.getVersion(),
          releaseDate: new Date().toISOString(),
        })
        return
      }

      // Format technical HttpError 404 for missing manifest files (latest.yml / beta.yml) into user-friendly message
      if (
        rawMsg.includes('Cannot find latest.yml') ||
        rawMsg.includes('Cannot find beta.yml') ||
        rawMsg.includes('HttpError: 404')
      ) {
        this.broadcast(
          'updater:error',
          'Manifesto da versão não encontrado no repositório. Verifique se o arquivo latest.yml ou beta.yml foi publicado com a release.',
        )
        return
      }

      this.broadcast('updater:error', rawMsg)
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
    } catch (err: any) {
      console.error('[UpdaterService] checkForUpdates threw an error:', err)
      const rawMsg = err?.message || err?.toString() || ''

      if (rawMsg.includes('No published versions on GitHub')) {
        console.log(
          '[UpdaterService] Caught No published versions in checkForUpdates, treating as update-not-available.',
        )
        this.broadcast('updater:update-not-available', {
          version: app.getVersion(),
          releaseDate: new Date().toISOString(),
        })
        return
      }

      // Re-throw so UpdaterHandler returns the failure or let the event handle it
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
