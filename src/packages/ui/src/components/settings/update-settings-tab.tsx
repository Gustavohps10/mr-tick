import React, { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { useOpenAPI } from '@/hooks'

type UpdaterState =
  'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

export function UpdateSettingsTab() {
  const openAPI = useOpenAPI()
  const [allowBeta, setAllowBeta] = useState(false)
  const [version, setVersion] = useState<string>('')
  const [updaterState, setUpdaterState] = useState<UpdaterState>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadSettings() {
      if (openAPI?.modules?.system) {
        const v = await openAPI.modules.system.getAppVersion()
        setVersion(v)
        const settings = await openAPI.modules.system.getSettings()
        setAllowBeta(!!settings.allowBeta)
      }
    }
    loadSettings()
  }, [openAPI])

  useEffect(() => {
    if (!openAPI?.events) return

    const unsubChecking = openAPI.events.on('updater:checking', () => {
      console.log('[UpdateSettingsTab] received updater:checking')
      setUpdaterState('checking')
    })
    const unsubAvailable = openAPI.events.on(
      'updater:update-available',
      (info) => {
        console.log(
          '[UpdateSettingsTab] received updater:update-available',
          info,
        )
        setUpdaterState('available')
        setStatusMessage('A new update is available!')
      },
    )
    const unsubNotAvailable = openAPI.events.on(
      'updater:update-not-available',
      (info) => {
        console.log(
          '[UpdateSettingsTab] received updater:update-not-available',
          info,
        )
        setUpdaterState('idle')
        setStatusMessage('You are up to date.')
      },
    )
    const unsubProgress = openAPI.events.on<{ percent: number }>(
      'updater:download-progress',
      (data: { percent: number }) => {
        console.log(
          '[UpdateSettingsTab] received updater:download-progress',
          data,
        )
        setUpdaterState('downloading')
        setProgress(data.percent || 0)
      },
    )
    const unsubDownloaded = openAPI.events.on(
      'updater:update-downloaded',
      (info) => {
        console.log(
          '[UpdateSettingsTab] received updater:update-downloaded',
          info,
        )
        setUpdaterState('ready')
      },
    )
    const unsubError = openAPI.events.on<string>(
      'updater:error',
      (err: string) => {
        console.error('[UpdateSettingsTab] received updater:error', err)
        setUpdaterState('error')
        setErrorMessage(err)
      },
    )

    return () => {
      unsubChecking()
      unsubAvailable()
      unsubNotAvailable()
      unsubProgress()
      unsubDownloaded()
      unsubError()
    }
  }, [openAPI])

  const handleToggleBeta = async (checked: boolean) => {
    setAllowBeta(checked)
    if (openAPI?.modules?.system) {
      const settings = await openAPI.modules.system.getSettings()
      await openAPI.modules.system.saveSettings({
        ...settings,
        allowBeta: checked,
      })
    }
  }

  const handleCheckUpdates = async () => {
    if (openAPI?.modules?.updater) {
      console.log(
        '[UpdateSettingsTab] Calling openAPI.modules.updater.checkForUpdates()',
      )
      setUpdaterState('checking')
      setStatusMessage(null)
      try {
        const res = await openAPI.modules.updater.checkForUpdates()
        console.log('[UpdateSettingsTab] checkForUpdates resolved', res)
      } catch (error) {
        console.error('[UpdateSettingsTab] checkForUpdates rejected', error)
        setUpdaterState('error')
        setErrorMessage(error instanceof Error ? error.message : String(error))
      }
    }
  }

  const handleDownload = async () => {
    if (openAPI?.modules?.updater) {
      setUpdaterState('downloading')
      setProgress(0)
      await openAPI.modules.updater.downloadUpdate()
    }
  }

  const handleInstall = async () => {
    if (openAPI?.modules?.updater) {
      await openAPI.modules.updater.quitAndInstall()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Updates</h3>
        <p className="text-muted-foreground text-sm">
          Current version: {version || 'Loading...'}
        </p>
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <label className="text-sm font-medium">Beta Channel</label>
            <p className="text-muted-foreground text-xs">
              Receive early access to new features and bug fixes.
            </p>
          </div>
          <Switch checked={allowBeta} onCheckedChange={handleToggleBeta} />
        </div>

        <div className="bg-muted/50 flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Auto Updater</span>
            {updaterState === 'idle' && (
              <Button size="sm" variant="outline" onClick={handleCheckUpdates}>
                Check for Updates
              </Button>
            )}
            {updaterState === 'checking' && (
              <Button size="sm" variant="outline" disabled>
                Checking...
              </Button>
            )}
            {updaterState === 'available' && (
              <Button size="sm" onClick={handleDownload}>
                Download Update
              </Button>
            )}
            {updaterState === 'downloading' && (
              <span className="text-muted-foreground text-sm">
                Downloading {Math.round(progress)}%
              </span>
            )}
            {updaterState === 'ready' && (
              <Button size="sm" onClick={handleInstall}>
                Restart and Install
              </Button>
            )}
          </div>

          {statusMessage && updaterState === 'idle' && (
            <p className="text-muted-foreground mt-1 text-xs">
              {statusMessage}
            </p>
          )}

          {updaterState === 'downloading' && (
            <Progress value={progress} className="mt-2 h-2 w-full" />
          )}

          {updaterState === 'error' && (
            <div className="text-destructive mt-2 flex items-center justify-between text-sm">
              <span>Error: {errorMessage}</span>
              <Button size="sm" variant="outline" onClick={handleCheckUpdates}>
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
