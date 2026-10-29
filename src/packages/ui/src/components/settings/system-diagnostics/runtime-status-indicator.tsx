import { AlertTriangle } from 'lucide-react'
import React, { useEffect } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { useSystemDiagnostics } from '@/hooks/use-system-diagnostics'
import { useSettingsModalStore } from '@/stores/settingsModalStore'
import { useSyncInitializationError } from '@/stores/syncStore'

export function RuntimeStatusIndicator() {
  const { isRuntimeUnavailable, snapshot, runManualChecks } =
    useSystemDiagnostics()
  const initializationError = useSyncInitializationError()
  const bridge = useHostBridge()
  const openModal = useSettingsModalStore((s) => s.openModal)

  useEffect(() => {
    if (initializationError === null) return
    void runManualChecks()
  }, [initializationError, runManualChecks])

  useEffect(
    () =>
      bridge.events.on('local-runtime:diagnostics-invalidated', () => {
        void runManualChecks()
      }),
    [bridge, runManualChecks],
  )

  const unavailableWorkspace = snapshot?.workspaces.find(
    (workspace) => workspace.status === 'unavailable',
  )

  if (
    !isRuntimeUnavailable &&
    initializationError === null &&
    unavailableWorkspace === undefined
  )
    return null

  const failure = snapshot?.dispatcher?.lastStartupFailure
  const getTooltipText = (): string => {
    if (initializationError !== null)
      return `Workspace indisponível: ${initializationError} — clique para abrir diagnóstico`

    if (!isRuntimeUnavailable)
      return 'Workspace indisponível — clique para abrir diagnóstico'

    if (failure)
      return `Motor local indisponível: ${failure.messageKey} (${failure.kind})`

    return 'Motor local indisponível — clique para abrir diagnóstico'
  }

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
          {getTooltipText()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
