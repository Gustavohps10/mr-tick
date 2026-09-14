import React from 'react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useOpenAPI } from '@/hooks'
import { useUpdaterStore } from '@/stores/updaterStore'

export function UpdateSettingsTab() {
  const openAPI = useOpenAPI()
  const {
    version,
    isPortable,
    allowBeta,
    setAllowBeta,
    setUpdaterState,
    setShowModal,
    setErrorMessage,
  } = useUpdaterStore()

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
    </div>
  )
}
