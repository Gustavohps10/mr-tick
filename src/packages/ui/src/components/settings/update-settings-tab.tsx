import { Download, Loader2, Sparkles, TagIcon } from 'lucide-react'
import { motion } from 'motion/react'
import React, { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  const [isPortable, setIsPortable] = useState(false)
  const [installPath, setInstallPath] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{
    version?: string
    releaseDate?: string
    releaseNotes?: string | any[]
  } | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      if (openAPI?.modules?.system) {
        const v = await openAPI.modules.system.getAppVersion()
        setVersion(v)
        const env = await openAPI.modules.system.getEnvironment()
        setIsPortable(!!env.isPortable)
        setInstallPath(env.installPath || '')
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
      (info: any) => {
        console.log(
          '[UpdateSettingsTab] received updater:update-available',
          info,
        )
        setUpdaterState('available')
        setUpdateInfo(info)
        setShowModal(true)
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
      setShowModal(true)
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

  const [isInstalling, setIsInstalling] = useState(false)

  const handleInstall = async () => {
    if (openAPI?.modules?.updater) {
      try {
        setIsInstalling(true)
        await openAPI.modules.updater.quitAndInstall()
      } catch (error) {
        console.error('[UpdateSettingsTab] quitAndInstall failed', error)
        setIsInstalling(false)
        setUpdaterState('error')
        setErrorMessage(error instanceof Error ? error.message : String(error))
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Updates</h3>
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
            {isPortable ? 'Portable' : 'Instalado'}
          </span>
        </div>
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
            <Button size="sm" variant="outline" onClick={handleCheckUpdates}>
              Check for Updates
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-[650px]">
          <DialogHeader>
            <DialogTitle>
              {updaterState === 'checking' && 'Checking for Updates'}
              {updaterState === 'idle' && 'Up to Date'}
              {updaterState === 'error' && 'Update Error'}
              {updaterState === 'available' && 'Update Available'}
              {updaterState === 'downloading' && 'Downloading Update'}
              {updaterState === 'ready' && 'Ready to Install'}
            </DialogTitle>
            <DialogDescription>
              {updaterState === 'checking' &&
                'Please wait while we check for the latest versions...'}
              {updaterState === 'idle' &&
                'You are already running the latest version.'}
              {updaterState === 'error' && errorMessage}
              {updaterState === 'available' &&
                'A new version of Mr. Tick is available for download.'}
              {updaterState === 'downloading' &&
                'Please wait while the update is being downloaded.'}
              {updaterState === 'ready' &&
                'The update has been downloaded and is ready to be installed.'}
            </DialogDescription>
          </DialogHeader>

          {updaterState === 'checking' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="relative flex items-center justify-center">
                <motion.div
                  className="border-primary/20 absolute h-16 w-16 rounded-full border-2"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.3, 0.8, 0.3] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
                <motion.div
                  className="border-primary/40 border-t-primary absolute h-12 w-12 rounded-full border-2"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
                <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Buscando atualizações...</p>
                <p className="text-muted-foreground text-xs">
                  Conectando aos servidores de release
                </p>
              </div>
            </div>
          )}

          {(updaterState === 'available' ||
            updaterState === 'downloading' ||
            updaterState === 'ready') && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Current Version:</span>
                <span>{version}</span>
              </div>

              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">New Version:</span>
                <div className="flex items-center gap-2 font-medium">
                  <span className="flex items-center gap-1 text-emerald-500">
                    <TagIcon className="h-4 w-4" />
                    {updateInfo?.version || 'Unknown'}
                  </span>
                  {updateInfo?.version?.toLowerCase().includes('beta') ||
                  updateInfo?.version?.toLowerCase().includes('alpha') ? (
                    <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-yellow-600 uppercase dark:text-yellow-400">
                      Beta
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-600 uppercase dark:text-emerald-400">
                      Stable
                    </span>
                  )}
                </div>
              </div>

              {updateInfo?.releaseNotes && updaterState === 'available' && (
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Changes:</span>
                  <div
                    className="[&_a]:text-primary bg-muted max-h-60 overflow-y-auto rounded-md p-2 text-xs [&_a]:underline"
                    onClick={(e) => {
                      const target = (e.target as HTMLElement).closest('a')
                      if (target && target.href) {
                        e.preventDefault()
                        window.open(target.href, '_blank')
                      }
                    }}
                  >
                    {Array.isArray(updateInfo.releaseNotes) ? (
                      updateInfo.releaseNotes.map((note, i) => (
                        <div
                          key={i}
                          dangerouslySetInnerHTML={{
                            __html: note?.note || note,
                          }}
                        />
                      ))
                    ) : (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: updateInfo.releaseNotes,
                        }}
                      />
                    )}
                  </div>
                </div>
              )}

              {updaterState === 'available' && (
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">
                    Installation Path:
                  </span>
                  <div className="border-input bg-muted text-muted-foreground flex h-8 w-full cursor-not-allowed items-center rounded-md border px-3 text-xs opacity-50 shadow-sm select-none">
                    {installPath}
                  </div>
                </div>
              )}

              {updaterState === 'downloading' && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {Math.round(progress)}%
                  </span>
                  <Progress value={progress} className="h-2 w-full" />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            {(updaterState === 'idle' || updaterState === 'error') && (
              <Button size="sm" onClick={() => setShowModal(false)}>
                Close
              </Button>
            )}

            {updaterState === 'available' && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowModal(false)}
                >
                  Remind Me Later
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                >
                  Skip This Update
                </Button>
                <Button size="sm" onClick={handleDownload} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download and Install
                </Button>
              </>
            )}

            {updaterState === 'ready' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isInstalling}
                  onClick={() => setShowModal(false)}
                >
                  Later
                </Button>
                <Button
                  size="sm"
                  disabled={isInstalling}
                  onClick={handleInstall}
                  className="gap-2"
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reiniciando...
                    </>
                  ) : (
                    'Restart and Install'
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
