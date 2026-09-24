import { Download, Loader2, RefreshCw, TagIcon } from 'lucide-react'
import { motion } from 'motion/react'
import React, { useState } from 'react'

import { Badge } from '@/components/ui/badge'
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
import { useHostBridge } from '@/hooks'
import { cn } from '@/lib/utils'
import { useUpdaterStore } from '@/stores/updaterStore'

export function UpdateModal() {
  const bridge = useHostBridge()
  const {
    version,
    updaterState,
    progress,
    errorMessage,
    installPath,
    updateInfo,
    showModal,
    setShowModal,
    setUpdaterState,
    setProgress,
    setErrorMessage,
    skipCurrentUpdate,
    remindMeLater,
  } = useUpdaterStore()

  const [isInstalling, setIsInstalling] = useState(false)

  const isNewVersionBeta = updateInfo?.version
    ? updateInfo.version.toLowerCase().includes('beta') ||
      updateInfo.version.toLowerCase().includes('alpha')
    : false

  const handleDownload = async () => {
    setUpdaterState('downloading')
    setProgress(0)
    try {
      await bridge.updater.downloadUpdate()
    } catch (err) {
      console.error('[UpdateModal] downloadUpdate failed', err)
      setUpdaterState('error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const handleInstall = async () => {
    try {
      setIsInstalling(true)
      await bridge.updater.quitAndInstall()
    } catch (error) {
      console.error('[UpdateModal] quitAndInstall failed', error)
      setIsInstalling(false)
      setUpdaterState('error')
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="w-full sm:max-w-[640px] md:max-w-[700px]">
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
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="flex items-center justify-center"
                >
                  <RefreshCw className="h-5 w-5" />
                </motion.div>
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
              <div className="flex items-center gap-2">
                <TagIcon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isNewVersionBeta
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-emerald-500 dark:text-emerald-400',
                  )}
                />
                <span className="text-foreground font-medium">
                  {updateInfo?.version || 'Unknown'}
                </span>
                {isNewVersionBeta ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-600 uppercase dark:text-amber-400"
                  >
                    Beta
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="rounded-full border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-600 uppercase dark:text-emerald-400"
                  >
                    Stable
                  </Badge>
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
                          __html:
                            typeof note === 'string'
                              ? note
                              : (note?.note ?? ''),
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
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>Downloading update...</span>
                  <span className="text-foreground font-medium">
                    {Math.round(progress)}%
                  </span>
                </div>
                <Progress
                  value={progress}
                  className="h-2.5 w-full [&>[data-slot=progress-indicator]]:transition-all [&>[data-slot=progress-indicator]]:duration-300 [&>[data-slot=progress-indicator]]:ease-out"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2.5 sm:justify-end sm:gap-3">
          {(updaterState === 'idle' || updaterState === 'error') && (
            <Button size="sm" onClick={() => setShowModal(false)}>
              Close
            </Button>
          )}

          {updaterState === 'available' && (
            <>
              <Button size="sm" variant="ghost" onClick={remindMeLater}>
                Remind Me Later
              </Button>
              <Button size="sm" variant="outline" onClick={skipCurrentUpdate}>
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
  )
}
