import { useEffect } from 'react'

import { useHostBridge } from '@/hooks'
import { type UpdateInfoData, useUpdaterStore } from '@/stores/updaterStore'

export function useAutoUpdater() {
  const bridge = useHostBridge()
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
      try {
        const v = await bridge.system.getAppVersion()
        setVersion(v)
        const env = await bridge.system.getEnvironment()
        setIsPortable(Boolean(env.isPortable))
        setInstallPath(env.installPath || '')
        const settings = await bridge.system.getSettings()
        setAllowBeta(Boolean(settings.allowBeta))
      } catch (err) {
        console.error('[useAutoUpdater] Failed to load initial app info:', err)
      }
    }
    loadAppInfo()
  }, [bridge, setVersion, setIsPortable, setInstallPath, setAllowBeta])

  // 2. Listen for updater events from main process
  useEffect(() => {
    const unsubChecking = bridge.events.on('updater:checking', () => {
      console.log('[useAutoUpdater] received updater:checking')
      setUpdaterState('checking')
    })

    const unsubAvailable = bridge.events.on<UpdateInfoData>(
      'updater:update-available',
      (info: UpdateInfoData) => {
        console.log('[useAutoUpdater] received updater:update-available', info)
        setUpdaterState('available')
        setUpdateInfo(info)

        // Determine if modal should pop up automatically
        const isSkipped =
          Boolean(info.version) && skippedVersion === info.version
        const isRemindCooldown =
          remindLaterUntil !== null && Date.now() < remindLaterUntil

        if (!isSkipped && !isRemindCooldown) {
          setShowModal(true)
          return
        }
        console.log(
          `[useAutoUpdater] Modal auto-popup suppressed: isSkipped=${isSkipped}, isRemindCooldown=${isRemindCooldown}`,
        )
      },
    )

    const unsubNotAvailable = bridge.events.on<UpdateInfoData | undefined>(
      'updater:update-not-available',
      (info?: UpdateInfoData) => {
        console.log(
          '[useAutoUpdater] received updater:update-not-available',
          info,
        )
        setUpdaterState('idle')
      },
    )

    const unsubProgress = bridge.events.on<{ percent: number }>(
      'updater:download-progress',
      (data: { percent: number }) => {
        setUpdaterState('downloading')
        setProgress(data.percent || 0)
      },
    )

    const unsubDownloaded = bridge.events.on<UpdateInfoData>(
      'updater:update-downloaded',
      (info: UpdateInfoData) => {
        console.log('[useAutoUpdater] received updater:update-downloaded', info)
        setUpdaterState('ready')
      },
    )

    const unsubError = bridge.events.on<string>(
      'updater:error',
      (err: string) => {
        console.error('[useAutoUpdater] received updater:error', err)
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
  }, [
    bridge,
    setUpdaterState,
    setUpdateInfo,
    setShowModal,
    setProgress,
    setErrorMessage,
    skippedVersion,
    remindLaterUntil,
  ])
}
