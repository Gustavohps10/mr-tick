import { AlertTriangle } from 'lucide-react'
import React from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useSystemDiagnostics } from '@/hooks/use-system-diagnostics'
import { useSettingsModalStore } from '@/stores/settingsModalStore'

export function RuntimeStatusIndicator() {
  const { isRuntimeUnavailable, snapshot } = useSystemDiagnostics()
  const openModal = useSettingsModalStore((s) => s.openModal)

  if (!isRuntimeUnavailable) return null

  const failure = snapshot?.dispatcher?.lastStartupFailure
  const tooltipText = failure
    ? `Motor local indisponível: ${failure.messageKey} (${failure.kind})`
    : 'Motor local indisponível — clique para abrir diagnóstico'

  const handleClick = () => {
    openModal('system-data')
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid="runtime-status-indicator-btn"
            onClick={handleClick}
            className="text-destructive hover:bg-destructive/10 relative flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors"
            aria-label="Alerta de diagnóstico do motor local"
          >
            <span className="bg-destructive/40 absolute size-2 animate-ping rounded-full" />
            <AlertTriangle className="size-4 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
