import { app, BrowserWindow, net } from 'electron'
import pkg, { type UpdateInfo } from 'electron-updater'
const { autoUpdater } = pkg
import fs from 'node:fs'
import path from 'node:path'

import { getSettings } from '@/main/settings'

export class UpdaterService {
  private isPortable: boolean = false
  private latestUpdateInfo: UpdateInfo | null = null
  private portableZipPath: string | null = null

  public init(): void {
    // Detect if we are running from a Setup installation or Portable using the NSIS uninstaller
    const rootPath = path.dirname(process.execPath)
    if (!app.isPackaged) {
      this.isPortable = false // Em desenvolvimento, simularemos ambiente padrão (setup/idle)
    } else {
      this.isPortable =
        !fs.existsSync(path.join(rootPath, 'Uninstall mr-tick.exe')) &&
        process.platform === 'win32'
    }

    console.log(
      `[UpdaterService] Mode detected: ${this.isPortable ? 'Portable' : 'Setup'}`,
    )

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.logger = console

    const settings = getSettings()
    autoUpdater.allowPrerelease = !!settings.allowBeta
    autoUpdater.channel = 'latest'

    autoUpdater.on('checking-for-update', () => {
      console.log('[UpdaterService] checking-for-update event fired')
      this.broadcast('updater:checking', undefined)
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      console.log('[UpdaterService] update-available event fired:', info)
      this.latestUpdateInfo = info
      this.broadcast('updater:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
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
      if (this.isPortable) return // Prevent double broadcast if somehow triggered

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
      if (this.isPortable) return
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
    autoUpdater.channel = 'latest'
    console.log('[UpdaterService] allowBeta =', autoUpdater.allowPrerelease)

    if (!app.isPackaged) {
      console.log(
        '[UpdaterService] Skipped in dev mode. Simulating update-available in 1.5s. allowBeta =',
        autoUpdater.allowPrerelease,
      )
      setTimeout(() => {
        const isBeta = autoUpdater.allowPrerelease
        this.broadcast('updater:update-available', {
          version: isBeta ? '9.9.9-beta.1 (Dev Mock)' : '9.9.9 (Dev Mock)',
          releaseDate: new Date().toISOString(),
          releaseNotes: [
            '<ul>',
            `<li><strong>Status:</strong> ${isBeta ? 'Versão BETA de teste experimental.' : 'Versão STABLE estável de produção.'}</li>`,
            '<li><strong>Core:</strong> Rewrote the entire universe in Rust for performance. (<em>JohnDoe</em>)</li>',
            '<li><strong>UI:</strong> Added 50 new animations to the settings tab. (<em>JaneDoe</em>)</li>',
            '<li><strong>Fix:</strong> Corrected a typo in the word "update".</li>',
            '<li><strong>Misc:</strong> Lots of other minor fixes and improvements.</li>',
            '<li><strong>Feature:</strong> Telepathy mode enabled by default.</li>',
            '<li><strong>Performance:</strong> Reduced memory usage by downloading more RAM.</li>',
            '<li><strong>Security:</strong> Patched vulnerability by unplugging the server.</li>',
            '<li><strong>Network:</strong> Switched to carrier pigeons for packet delivery.</li>',
            '<li><strong>i18n:</strong> Added support for ancient Sumerian.</li>',
            '<li><strong>Fix:</strong> Fixed a bug where the app would become sentient.</li>',
            '<li><strong>Core:</strong> Added 10 more layers of abstraction.</li>',
            '<li><strong>UI:</strong> The settings tab now has a dark mode for its dark mode.</li>',
            '<li><strong>Fix:</strong> Fixed an issue causing time travel loops.</li>',
            '<li><strong>Misc:</strong> Removed Herobrine.</li>',
            '<li><strong>Feature:</strong> Coffee maker integration added.</li>',
            '</ul>',
          ],
        })
      }, 1500)
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

      throw err
    }
  }

  public async downloadUpdate(): Promise<void> {
    if (!this.isPortable) {
      await autoUpdater.downloadUpdate()
      return
    }

    // --- Custom Portable Download Logic ---
    if (!this.latestUpdateInfo) {
      throw new Error('Informações da atualização não disponíveis.')
    }

    const version = this.latestUpdateInfo.version
    const fileName = `mr-tick-${version}-portable.zip`
    const url = `https://github.com/Gustavohps10/mr-tick/releases/download/%40mr-tick/desktop%40${version}/${fileName}`

    const tempDir = path.join(app.getPath('temp'), 'mr-tick-update')
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

    this.portableZipPath = path.join(tempDir, fileName)
    console.log('[UpdaterService] Downloading portable zip from:', url)

    try {
      const response = await net.fetch(url, { redirect: 'follow' })
      if (!response.ok) {
        throw new Error(
          `Falha no download (HTTP ${response.status}: ${response.statusText})`,
        )
      }

      const total = Number(response.headers.get('content-length') || 0)
      let transferred = 0

      const dest = fs.createWriteStream(this.portableZipPath)
      const reader = response.body?.getReader()

      if (!reader) throw new Error('Não foi possível ler o fluxo de download.')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        dest.write(value)
        transferred += value.length

        this.broadcast('updater:download-progress', {
          percent: total ? (transferred / total) * 100 : 0,
          transferred,
          total,
          bytesPerSecond: 0,
        })
      }

      dest.end()

      this.broadcast('updater:update-downloaded', {
        version,
        releaseDate: this.latestUpdateInfo.releaseDate,
      })
      console.log('[UpdaterService] Portable download complete.')
    } catch (err: any) {
      console.error('[UpdaterService] Portable download error:', err)
      this.broadcast(
        'updater:error',
        'Falha ao baixar atualização portátil: ' + (err?.message || err),
      )
      throw err
    }
  }

  public async quitAndInstall(): Promise<void> {
    if (!this.isPortable) {
      try {
        console.log('[UpdaterService] quitAndInstall invoked')
        autoUpdater.quitAndInstall(false, true)
      } catch (err: any) {
        console.error('[UpdaterService] quitAndInstall error:', err)
        this.broadcast(
          'updater:error',
          `Falha ao reiniciar e instalar: ${err?.message || err?.toString() || 'Erro desconhecido'}`,
        )
        throw err
      }
      return
    }

    // --- Custom Portable Install Logic ---
    try {
      console.log('[UpdaterService] quitAndInstall portable invoked')
      const { spawn } = require('node:child_process')

      if (!this.portableZipPath || !fs.existsSync(this.portableZipPath)) {
        throw new Error('Arquivo ZIP da atualização não encontrado.')
      }

      const tempBase = path.join(
        app.getPath('temp'),
        'mr-tick-update-extracted-',
      )
      const extractDir = fs.mkdtempSync(tempBase)

      console.log(`[UpdaterService] Extracting zip to ${extractDir}...`)

      await new Promise<void>((resolve, reject) => {
        const process = spawn(
          'tar',
          ['-xf', this.portableZipPath!, '-C', extractDir],
          {
            stdio: 'ignore',
          },
        )

        process.on('close', (code: number) => {
          if (code === 0) resolve()
          else reject(new Error(`Falha na extração (tar exit code: ${code})`))
        })
        process.on('error', reject)
      })

      const targetDir = path.dirname(process.execPath)
      const exePath = process.execPath
      const pid = process.pid.toString()

      const updaterExePath = app.isPackaged
        ? path.join(process.resourcesPath, 'native-prebuilds/updater.exe')
        : path.join(__dirname, '../../native-prebuilds/updater.exe')

      if (!fs.existsSync(updaterExePath)) {
        throw new Error('C++ updater.exe não encontrado em ' + updaterExePath)
      }

      console.log(`[UpdaterService] Spawning native C++ updater.`)
      spawn(updaterExePath, [pid, targetDir, extractDir, exePath], {
        detached: true,
        stdio: 'ignore',
      })

      app.quit()
    } catch (err: any) {
      console.error('[UpdaterService] quitAndInstall portable error:', err)
      this.broadcast(
        'updater:error',
        `Falha na instalação portátil: ${err?.message || err?.toString() || 'Erro desconhecido'}`,
      )
      throw err
    }
  }
}
