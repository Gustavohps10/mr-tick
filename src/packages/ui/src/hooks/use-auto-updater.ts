import { useEffect } from 'react'

import { useOpenAPI } from '@/hooks'
import { type UpdateInfoData, useUpdaterStore } from '@/stores/updaterStore'

export function useAutoUpdater() {
  const openAPI = useOpenAPI()
  const {
    setVersion,
    setIsPortable,
    setInstallPath,
    setAllowBeta,
    setUpdaterState,
    setProgress,
    setErrorMessage,
    setUpdateInfo,
    setShowModal,
    skippedVersion,
    remindLaterUntil,
  } = useUpdaterStore()

  // 1. Load initial environment & settings
  useEffect(() => {
    async function loadAppInfo() {
      if (!openAPI?.modules?.system) return
      try {
        const v = await openAPI.modules.system.getAppVersion()
        setVersion(v)
        const env = await openAPI.modules.system.getEnvironment()
        setIsPortable(!!env.isPortable)
        setInstallPath(env.installPath || '')
        const settings = await openAPI.modules.system.getSettings()
        setAllowBeta(!!settings.allowBeta)
      } catch (err) {
        console.error('[useAutoUpdater] Failed to load initial app info:', err)
      }
    }
    loadAppInfo()
  }, [openAPI, setVersion, setIsPortable, setInstallPath, setAllowBeta])

  // 2. Listen for updater events from main process
  useEffect(() => {
    if (!openAPI?.events) return

    const unsubChecking = openAPI.events.on('updater:checking', () => {
      console.log('[useAutoUpdater] received updater:checking')
      setUpdaterState('checking')
    })

    const unsubAvailable = openAPI.events.on<UpdateInfoData>(
      'updater:update-available',
      (info: UpdateInfoData) => {
        console.log('[useAutoUpdater] received updater:update-available', info)
        setUpdaterState('available')
        setUpdateInfo(info)

        // Determine if modal should pop up automatically
        const isSkipped = !!info.version && skippedVersion === info.version
        const isRemindCooldown =
          !!remindLaterUntil && Date.now() < remindLaterUntil

        if (!isSkipped && !isRemindCooldown) {
          setShowModal(true)
        } else {
          console.log(
            `[useAutoUpdater] Modal auto-popup suppressed: isSkipped=${isSkipped}, isRemindCooldown=${isRemindCooldown}`,
          )
        }
      },
    )

    const unsubNotAvailable = openAPI.events.on<UpdateInfoData | undefined>(
      'updater:update-not-available',
      (info?: UpdateInfoData) => {
        console.log(
          '[useAutoUpdater] received updater:update-not-available',
          info,
        )
        setUpdaterState('idle')
      },
    )

    const unsubProgress = openAPI.events.on<{ percent: number }>(
      'updater:download-progress',
      (data: { percent: number }) => {
        setUpdaterState('downloading')
        setProgress(data.percent || 0)
      },
    )

    const unsubDownloaded = openAPI.events.on<UpdateInfoData>(
      'updater:update-downloaded',
      (info: UpdateInfoData) => {
        console.log('[useAutoUpdater] received updater:update-downloaded', info)
        setUpdaterState('ready')
      },
    )

    const unsubError = openAPI.events.on<string>(
      'updater:error',
      (err: string) => {
        console.error('[useAutoUpdater] received updater:error', err)
        setUpdaterState('error')
        setErrorMessage(err)
      },
    )

    return () => {
      unsubChecking?.()
      unsubAvailable?.()
      unsubNotAvailable?.()
      unsubProgress?.()
      unsubDownloaded?.()
      unsubError?.()
    }
  }, [
    openAPI,
    setUpdaterState,
    setUpdateInfo,
    setShowModal,
    setProgress,
    setErrorMessage,
    skippedVersion,
    remindLaterUntil,
  ])
}
