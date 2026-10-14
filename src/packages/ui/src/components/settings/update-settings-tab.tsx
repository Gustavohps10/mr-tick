import { RefreshCw } from 'lucide-react'
import React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useHostBridge } from '@/hooks'
import { useUpdaterStore } from '@/stores/updaterStore'

export function UpdateSettingsTab() {
  const bridge = useHostBridge()
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
    const settings = await bridge.system.getSettings()
    await bridge.system.saveSettings({
      ...settings,
      allowBeta: checked,
    })
  }

  const handleCheckUpdates = async () => {
    setUpdaterState('checking')
    setShowModal(true)
    try {
      await bridge.updater.checkForUpdates()
    } catch (error) {
      setUpdaterState('error')
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        {/* Versão Atual */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-foreground text-sm font-medium">
                Versão do Mr. Tick
              </h4>
              <Badge
                variant="outline"
                className="px-1.5 py-0 font-mono text-[10px]"
              >
                {isPortable ? 'Portable' : 'Instalado'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Versão instalada: {version || '1.0.0'}
            </p>
          </div>
          <div className="shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckUpdates}
              className="h-8 cursor-pointer gap-1.5 text-xs"
            >
              <RefreshCw className="size-3.5" />
              <span>Verificar Atualizações</span>
            </Button>
          </div>
        </div>

        {/* Canal Beta */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-foreground text-sm font-medium">Canal Beta</h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Receba acesso antecipado a novos recursos, melhorias e correções
              antes do lançamento oficial.
            </p>
          </div>
          <div className="shrink-0">
            <Switch checked={allowBeta} onCheckedChange={handleToggleBeta} />
          </div>
        </div>
      </div>
    </div>
  )
}
