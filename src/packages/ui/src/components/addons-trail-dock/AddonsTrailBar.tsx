import type { AddonManifestViewModel } from '@mr-tick/shared/view-models'
import type { AddonLoadFailureViewModel } from '@mr-tick/shared/view-models'
import { AlertTriangle, Database } from 'lucide-react'
import React, { useMemo, useState } from 'react'

import { SafeAddonLogo } from '@/components/addons-manager/addons-manager-view'
import { LottieJumpArrow } from '@/components/lottie-jump-arrow'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useGlobalSyncState } from '@/hooks/use-global-sync-state'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib/utils'
import { useAddonSettingsDialogStore } from '@/stores/addonSettingsDialogStore'
import { useAddonsModalStore } from '@/stores/addonsModalStore'
import { useConnectionsWithSync } from '@/stores/syncStore'

import { AddonsDiagnosticsDrawer } from './AddonsDiagnosticsDrawer'
import { resolveTrailStatus, TrailStatus } from './resolve-trail-status'

export interface AddonsTrailBarProps {
  failures: AddonLoadFailureViewModel[]
  isFailureServiceError?: boolean
  failureServiceErrorMessage?: string | null
}

export function AddonsTrailBar({
  failures,
  isFailureServiceError = false,
  failureServiceErrorMessage = null,
}: AddonsTrailBarProps) {
  const hostBridge = useHostBridge()
  const connectionsWithSync = useConnectionsWithSync()
  const globalSync = useGlobalSyncState()
  const openSettingsDialog = useAddonSettingsDialogStore((s) => s.open)
  const openAddonsModal = useAddonsModalStore((s) => s.openModal)

  const [installedAddons, setInstalledAddons] = useState<
    AddonManifestViewModel[]
  >([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [focusedFailureAddonId, setFocusedFailureAddonId] = useState<
    string | null
  >(null)

  React.useEffect(() => {
    let isMounted = true

    const loadInstalled = () => {
      if (hostBridge.addons?.listInstalled) {
        hostBridge.addons.listInstalled().then((res) => {
          if (isMounted && res && res.isSuccess && res.data) {
            setInstalledAddons(res.data)
          }
        })
      }
    }

    loadInstalled()

    let unsubscribeFailures: (() => void) | undefined

    if (hostBridge.events?.on) {
      unsubscribeFailures = hostBridge.events.on(
        'addons:load-failures-changed',
        () => {
          loadInstalled()
        },
      )
    }

    return () => {
      isMounted = false

      if (unsubscribeFailures) {
        unsubscribeFailures()
      }
    }
  }, [hostBridge, failures])

  const failedAddonIds = useMemo(() => {
    return new Set(failures.map((f) => f.addonId))
  }, [failures])

  const openDrawerFocused = (addonId?: string) => {
    setFocusedFailureAddonId(addonId ?? null)
    setDrawerOpen(true)
  }

  const handleAddonClick = (addon: AddonManifestViewModel) => {
    if (failedAddonIds.has(addon.id)) {
      openDrawerFocused(addon.id)
      return
    }

    // Spec §6.6.6: Addons ativos abrem AddonSettingsDialog em 1 clique
    openSettingsDialog(addon)
  }

  const renderStatusDot = (status: TrailStatus) => {
    if (status === 'load_failure') {
      return (
        <span
          data-testid="status-dot"
          className="bg-destructive text-destructive-foreground ring-background absolute -top-1 -right-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8.5px] font-bold shadow-xs ring-2"
        >
          !
        </span>
      )
    }

    if (status === 'auth_error' || status === 'sync_error') {
      return (
        <span
          data-testid="status-dot"
          className="bg-destructive ring-background absolute -top-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full shadow-xs ring-2"
        />
      )
    }

    if (status === 'disabled') {
      return (
        <span
          data-testid="status-dot"
          className="bg-muted-foreground ring-background absolute -top-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full shadow-xs ring-2"
        />
      )
    }

    if (status === 'syncing') {
      return (
        <span
          data-testid="status-dot"
          className="ring-background absolute -top-0.5 -right-0.5 z-10 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500 shadow-xs ring-2"
        />
      )
    }

    if (status === 'connected') {
      return (
        <span
          data-testid="status-dot"
          className="ring-background absolute -top-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs ring-2"
        />
      )
    }

    return null
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        data-testid="addons-trail-dock"
        className="bg-background/95 border-border/60 z-30 flex h-full w-12 shrink-0 flex-col items-center border-l py-2.5 backdrop-blur-sm select-none"
      >
        {/* Botão Local Database & Diagnóstico */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="sync-status-indicator"
              data-status={globalSync.status}
              aria-label={`Local Database: ${globalSync.label}`}
              onClick={() => openDrawerFocused()}
              className={cn(
                'group border-border/40 bg-card/60 hover:border-border/80 hover:bg-accent/80 relative flex h-7.5 w-7.5 cursor-pointer items-center justify-center rounded-lg border shadow-2xs backdrop-blur-xs transition-all duration-150 hover:scale-[1.04] active:scale-[0.98]',
                isFailureServiceError
                  ? 'border-destructive/50 text-destructive bg-destructive/10 hover:bg-destructive/20'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <div className="relative flex items-center justify-center">
                <Database className="h-4 w-4 transition-transform duration-150 group-hover:scale-105" />

                {(globalSync.isAnyPulling || globalSync.isAnyPushing) && (
                  <div className="bg-background/95 border-border/40 absolute -right-2.5 -bottom-2 flex items-center rounded-xs border px-0.5 shadow-2xs">
                    <LottieJumpArrow
                      direction="down"
                      animating={globalSync.isAnyPulling}
                      style={{ width: 6, height: 9 }}
                      className={cn(
                        globalSync.isAnyPulling
                          ? 'text-blue-500'
                          : 'text-muted-foreground/30',
                      )}
                    />
                    <LottieJumpArrow
                      direction="up"
                      animating={globalSync.isAnyPushing}
                      style={{ width: 6, height: 9 }}
                      className={cn(
                        globalSync.isAnyPushing
                          ? 'text-amber-500'
                          : 'text-muted-foreground/30',
                      )}
                    />
                  </div>
                )}

                <span
                  data-testid="database-status-dot"
                  className={cn(
                    'border-background ring-background absolute -top-1 -right-1 z-10 h-2 w-2 rounded-full border ring-1',
                    globalSync.color,
                  )}
                />
              </div>

              {isFailureServiceError && (
                <span
                  data-testid="service-error-dot"
                  className="bg-destructive text-destructive-foreground ring-background absolute -top-1 -right-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold shadow-xs ring-2"
                >
                  !
                </span>
              )}
              {!isFailureServiceError && failures.length > 0 && (
                <span className="bg-destructive text-destructive-foreground ring-background absolute -top-1 -right-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold shadow-xs ring-2">
                  {failures.length}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            {isFailureServiceError
              ? `Diagnóstico indisponível: ${failureServiceErrorMessage || 'Falha na consulta'}`
              : `Local Database (${globalSync.label})`}
          </TooltipContent>
        </Tooltip>

        <div className="bg-border/50 my-2 h-px w-5 shrink-0" />

        {/* Lista de Addons e Falhas */}
        <div className="no-scrollbar flex w-full flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto px-1.5 pt-1 pb-3">
          {/* Addons com Falha que não constam em instalados */}
          {failures
            .filter((f) => !installedAddons.some((a) => a.id === f.addonId))
            .map((failure) => (
              <Tooltip key={failure.addonId}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={failure.addonName || failure.addonId}
                    data-addon-id={failure.addonId}
                    onClick={() => openDrawerFocused(failure.addonId)}
                    className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 group relative flex h-7.5 w-7.5 cursor-pointer items-center justify-center rounded-lg border shadow-2xs transition-all duration-150 hover:scale-[1.04] active:scale-[0.98]"
                  >
                    <AlertTriangle className="h-4 w-4 transition-transform duration-150 group-hover:scale-105" />
                    <span className="sr-only">
                      {failure.addonName || failure.addonId}
                    </span>
                    {renderStatusDot('load_failure')}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[200px] text-xs">
                  <p className="text-destructive font-semibold">
                    {failure.addonName || failure.addonId}
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {failure.reason}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}

          {/* Addons Instalados */}
          {installedAddons.map((addon) => {
            const hasFailure = failedAddonIds.has(addon.id)
            const addonConnections = connectionsWithSync.filter(
              (c) => c.addon?.id === addon.id || c.dataSourceId === addon.id,
            )
            const hasActive = addonConnections.length > 0

            const hasAuthErr = addonConnections.some(
              (c) => c.status === 'disconnected',
            )
            const isDis =
              addonConnections.length > 0 &&
              addonConnections.some(
                (c) => c.status === 'disabled' || c.status === 'archived',
              )

            const hasSyncErr = addonConnections.some((c) => {
              const metaErr = Boolean(
                c.sync.metadata?.error ||
                c.sync.metadata?.lastPullResult === 'error',
              )
              const tasksErr = Boolean(
                c.sync.tasks?.error ||
                c.sync.tasks?.lastPullResult === 'error' ||
                c.sync.tasks?.lastPushResult === 'error',
              )
              const timeErr = Boolean(
                c.sync.timeEntries?.error ||
                c.sync.timeEntries?.lastPullResult === 'error' ||
                c.sync.timeEntries?.lastPushResult === 'error',
              )
              return metaErr || tasksErr || timeErr
            })

            const isSync = addonConnections.some((c) => {
              const metaSync = Boolean(
                c.sync.metadata?.isPulling ||
                c.sync.metadata?.isPushing ||
                c.sync.metadata?.isReconciling,
              )
              const tasksSync = Boolean(
                c.sync.tasks?.isPulling ||
                c.sync.tasks?.isPushing ||
                c.sync.tasks?.isReconciling,
              )
              const timeSync = Boolean(
                c.sync.timeEntries?.isPulling ||
                c.sync.timeEntries?.isPushing ||
                c.sync.timeEntries?.isReconciling,
              )
              return metaSync || tasksSync || timeSync
            })

            const status = resolveTrailStatus({
              hasLoadFailure: hasFailure,
              hasAuthError: hasAuthErr,
              isDisabled: isDis,
              hasSyncError: hasSyncErr,
              isSyncing: isSync,
              hasActiveConnections: hasActive,
            })

            return (
              <Tooltip key={addon.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={addon.name}
                    data-addon-id={addon.id}
                    onClick={() => handleAddonClick(addon)}
                    className={cn(
                      'group border-border/30 bg-card/60 hover:border-border/70 hover:bg-accent/80 relative flex h-7.5 w-7.5 cursor-pointer items-center justify-center rounded-lg border p-1 shadow-2xs backdrop-blur-xs transition-all duration-150 hover:scale-[1.04] active:scale-[0.98]',
                      hasActive && 'border-border/50 shadow-xs',
                      hasFailure &&
                        'border-destructive/50 bg-destructive/10 text-destructive',
                    )}
                  >
                    <SafeAddonLogo
                      src={addon.logo}
                      alt={addon.name}
                      className="h-4 w-4 rounded-xs object-contain transition-transform duration-150 group-hover:scale-105"
                      fallbackIconClassName="w-4 h-4 text-muted-foreground"
                    />
                    <span className="sr-only">{addon.name}</span>
                    {renderStatusDot(status)}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  <p className="font-semibold">{addon.name}</p>
                  <p className="text-muted-foreground text-[11px] capitalize">
                    Status: {status.replace('_', ' ')}
                  </p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* Drawer de Diagnóstico Integrado */}
        <AddonsDiagnosticsDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          focusedAddonId={focusedFailureAddonId}
          failures={failures}
          isServiceError={isFailureServiceError}
          serviceErrorMessage={failureServiceErrorMessage}
        />
      </aside>
    </TooltipProvider>
  )
}
