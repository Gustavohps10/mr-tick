import type { AddonLoadFailureViewModel } from '@mr-tick/shared/view-models'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  CloudOff,
  Database,
  DownloadCloud,
  Filter,
  RefreshCcw,
  Server,
  ShieldAlert,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import React, { useState } from 'react'

import { SafeAddonLogo } from '@/components/addons-manager/addons-manager-view'
import { LottieJumpArrow } from '@/components/lottie-jump-arrow'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useWorkspaceConflicts } from '@/hooks/queries/use-workspace-conflicts'
import { useGlobalSyncState } from '@/hooks/use-global-sync-state'
import { useWorkspaceConnectionsFilter } from '@/hooks/use-workspace-connections-filter'
import { cn } from '@/lib/utils'
import { useConflictModalStore } from '@/stores/conflictModalStore'
import {
  explainReplicationError,
  getReplicationErrorMessage,
  isReplicationAuthError,
  isReplicationForbidden,
  isReplicationUnauthorized,
} from '@/stores/sync-store/ReplicationError'
import {
  ReplicationStatus,
  useConnectionsWithSync,
  useSyncStore,
} from '@/stores/syncStore'

export interface AddonsDiagnosticsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  focusedAddonId?: string | null
  failures: AddonLoadFailureViewModel[]
  isServiceError?: boolean
  serviceErrorMessage?: string | null
}

const COLLECTION_LABELS: Record<'metadata' | 'tasks' | 'timeEntries', string> =
  {
    metadata: 'Metadados',
    tasks: 'Tarefas',
    timeEntries: 'Apontamentos',
  }

function resolveConnectionSourceName(conn: {
  addon?: { name?: string }
  dataSourceId: string
}): string {
  if (conn.addon?.name && conn.addon.name.trim().length > 0) {
    return conn.addon.name
  }

  const id = conn.dataSourceId
  const cleaned = id.includes('-') ? id.split('-').slice(1).join(' ') : id
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function resolveConnectionTitle(conn: {
  addon?: { name?: string }
  dataSourceId: string
  identity?: { displayName?: string }
  member?: { login?: string; name?: string }
}): string {
  const sourceName = resolveConnectionSourceName(conn)
  const handle =
    conn.member?.login || conn.identity?.displayName || conn.member?.name

  if (handle) {
    return `${sourceName} @${handle}`
  }

  return sourceName
}

export function AddonsDiagnosticsDrawer({
  open,
  onOpenChange,
  focusedAddonId,
  failures,
  isServiceError = false,
  serviceErrorMessage = null,
}: AddonsDiagnosticsDrawerProps) {
  const connectionsWithSync = useConnectionsWithSync()
  const globalSync = useGlobalSyncState()
  const dbName = useSyncStore((s) => s.db?.name)
  const isInitialized = useSyncStore((s) => s.isInitialized) ?? false
  const forceSync = useSyncStore((s) => s.forceSync)
  const reconcile = useSyncStore((s) => s.reconcile)
  const resetDatabase = useSyncStore((s) => s.resetDatabase)
  const { conflictCount } = useWorkspaceConflicts()
  const openConflictModal = useConflictModalStore((s) => s.openConflictModal)

  const [isResetting, setIsResetting] = useState(false)

  const { scope, toggleConnection, selectAll, selectNone } =
    useWorkspaceConnectionsFilter()

  const handleReset = async () => {
    setIsResetting(true)
    try {
      await resetDatabase?.()
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="addons-diagnostics-drawer"
        side="right"
        className="bg-background/95 border-border/80 z-50 flex w-[460px] max-w-[95vw] flex-col border-l p-0 shadow-2xl backdrop-blur-md sm:max-w-md"
      >
        <SheetHeader className="border-border/60 border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            <Database className="text-primary h-4 w-4" />
            Local Database
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-xs">
            Banco de dados local (RxDB), sincronização e filtros de conexões.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-5 px-6 py-4">
            {/* Aviso de erro de diagnóstico do Main Process */}
            {isServiceError && (
              <div
                data-testid="addons-diagnostics-service-error"
                className="border-destructive/60 bg-destructive/10 text-destructive space-y-1 rounded-lg border p-3 text-xs"
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Diagnóstico Indisponível
                </div>
                <p className="text-destructive/90 text-[11px]">
                  {serviceErrorMessage ||
                    'Falha ao consultar diagnósticos de addons no processo principal.'}
                </p>
              </div>
            )}

            {/* Conflitos pendentes */}
            {conflictCount > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <div>
                      <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Conflitos Detectados ({conflictCount})
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        Há apontamentos concorrentes para mesclar.
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openConflictModal()}
                    className="bg-background/80 h-6 shrink-0 border-amber-500/40 px-2 text-[10px] font-semibold text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
                  >
                    Resolver
                  </Button>
                </div>
              </div>
            )}

            {/* Seção 1: Painel do Banco Local e Sincronização Geral */}
            <div className="border-border/60 bg-card/60 space-y-3 rounded-lg border p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="bg-background flex h-9 w-9 items-center justify-center rounded-lg border shadow-xs">
                    <Database className="text-primary h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground font-semibold">
                        RxDB Local
                      </span>
                      <span
                        className={cn(
                          'inline-block h-2 w-2 rounded-full',
                          globalSync.color,
                        )}
                      />
                    </div>
                    <div className="text-muted-foreground max-w-[170px] truncate font-mono text-[10px] leading-4">
                      {dbName || 'Inicializando...'}
                    </div>
                  </div>
                </div>

                {globalSync.hasRemote && (
                  <div className="border-border/60 bg-background/80 flex h-8 items-center overflow-hidden rounded-md border shadow-2xs">
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => forceSync?.(undefined, 'both')}
                            disabled={globalSync.isAnySyncingGlobally}
                            aria-label="Sincronizar tudo"
                            data-testid="sync-all-button"
                            className="hover:bg-muted/60 flex h-full cursor-pointer items-center justify-center px-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <RefreshCcw
                              size={13}
                              className={cn(
                                globalSync.isAnySyncingGlobally
                                  ? 'animate-spin text-blue-500'
                                  : 'text-foreground/70 hover:text-foreground',
                              )}
                            />
                            <span className="ml-1.5 text-[11px] font-medium">
                              Sincronizar
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[10px]">
                          {globalSync.isAnySyncingGlobally
                            ? 'Sincronizando todas as instâncias...'
                            : 'Sincronizar tudo (Pull & Push)'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Mais opções de sincronização"
                          className="border-border/40 hover:bg-muted/60 flex h-full cursor-pointer items-center justify-center border-l px-1.5 transition-colors"
                        >
                          <ChevronDown
                            size={10}
                            className="text-muted-foreground"
                          />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => forceSync?.(undefined, 'pull')}
                          className="cursor-pointer text-[11px]"
                        >
                          <DownloadCloud className="mr-2 h-3.5 w-3.5" /> Pull
                          (Baixar)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => forceSync?.(undefined, 'push')}
                          className="cursor-pointer text-[11px]"
                        >
                          <UploadCloud className="mr-2 h-3.5 w-3.5" /> Push
                          (Enviar)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => forceSync?.(undefined, 'both')}
                          className="cursor-pointer text-[11px] font-medium"
                        >
                          <RefreshCcw className="mr-2 h-3.5 w-3.5" />{' '}
                          Sincronizar (Pull e Push)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => reconcile?.()}
                          className="text-destructive hover:text-destructive cursor-pointer text-[11px] font-medium"
                        >
                          <Trash2 className="text-destructive mr-2 h-3.5 w-3.5" />
                          Conciliar excluídos (Todas instâncias)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </div>

            {/* Seção 2: Conexões & Sincronização Detalhada por Coleção */}
            <div className="space-y-3">
              <h4 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                <Server className="h-3.5 w-3.5" />
                Conexões & Sincronização ({connectionsWithSync.length})
              </h4>

              {connectionsWithSync.length === 0 ? (
                <div className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
                  Nenhuma conexão ativa encontrada.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {connectionsWithSync.map((conn) => {
                    const sourceName = resolveConnectionSourceName(conn)
                    const title = resolveConnectionTitle(conn)

                    const syncEntries: Array<{
                      key: 'metadata' | 'tasks' | 'timeEntries'
                      status: ReplicationStatus
                    }> = [
                      { key: 'metadata', status: conn.sync.metadata },
                      { key: 'tasks', status: conn.sync.tasks },
                      { key: 'timeEntries', status: conn.sync.timeEntries },
                    ]

                    const isSyncing = syncEntries.some(
                      (entry) =>
                        entry.status.isPulling || entry.status.isPushing,
                    )

                    const hasConnectionError = syncEntries.some(
                      (entry) =>
                        (entry.status.error &&
                          !isReplicationAuthError(entry.status.error)) ||
                        entry.status.lastPushResult === 'error' ||
                        entry.status.lastPullResult === 'error',
                    )

                    return (
                      <div
                        key={conn.connectionId}
                        className="border-border/60 bg-card/60 space-y-2 rounded-lg border p-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="bg-muted/40 flex h-6 w-6 shrink-0 items-center justify-center rounded p-0.5">
                              <SafeAddonLogo
                                src={conn.addon?.logo}
                                alt={sourceName}
                                className="h-4 w-4 shrink-0 rounded object-contain"
                                fallbackIconClassName="h-3.5 w-3.5 text-muted-foreground"
                              />
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <span className="text-foreground truncate leading-tight font-semibold">
                                {title}
                              </span>
                              <span className="text-muted-foreground font-mono text-[10px] opacity-60">
                                v{conn.addon?.version || '1.0'}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {conn.status === 'connected' && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-foreground h-6 w-6"
                                    disabled={isSyncing}
                                    aria-label={`Opções de sincronização para ${title}`}
                                  >
                                    <RefreshCcw
                                      size={12}
                                      className={cn(
                                        isSyncing &&
                                          'animate-spin text-blue-500',
                                      )}
                                    />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-44"
                                >
                                  <DropdownMenuItem
                                    onClick={() =>
                                      forceSync?.(conn.connectionId, 'pull')
                                    }
                                    className="cursor-pointer text-[11px]"
                                  >
                                    <DownloadCloud className="mr-2 h-3.5 w-3.5" />{' '}
                                    Pull (Baixar)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      forceSync?.(conn.connectionId, 'push')
                                    }
                                    className="cursor-pointer text-[11px]"
                                  >
                                    <UploadCloud className="mr-2 h-3.5 w-3.5" />{' '}
                                    Push (Enviar)
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      forceSync?.(conn.connectionId, 'both')
                                    }
                                    className="cursor-pointer text-[11px] font-medium"
                                  >
                                    <RefreshCcw className="mr-2 h-3.5 w-3.5" />{' '}
                                    Sincronizar (Pull e Push)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      reconcile?.(conn.connectionId)
                                    }
                                    className="text-destructive hover:text-destructive cursor-pointer text-[11px] font-medium"
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />{' '}
                                    Conciliar excluídos
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}

                            {conn.status === 'connected' ? (
                              hasConnectionError ? (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex cursor-help items-center">
                                        <XCircle
                                          size={14}
                                          className="text-destructive shrink-0"
                                        />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="left"
                                      className="max-w-xs text-xs"
                                    >
                                      <p className="text-destructive font-semibold">
                                        Falha na Conexão
                                      </p>
                                      <p className="text-muted-foreground mt-0.5 font-mono text-[10px] break-words">
                                        {syncEntries.find(
                                          (entry) => entry.status.error,
                                        )?.status.error
                                          ? getReplicationErrorMessage(
                                              syncEntries.find(
                                                (entry) => entry.status.error,
                                              )!.status.error,
                                            )
                                          : 'Falha na sincronização dos dados'}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <CheckCircle2
                                  size={14}
                                  className="shrink-0 text-green-500"
                                />
                              )
                            ) : (
                              <CloudOff
                                size={14}
                                className="text-muted-foreground shrink-0"
                              />
                            )}

                            <Badge
                              variant="outline"
                              className="text-[10px] capitalize"
                            >
                              {conn.status}
                            </Badge>
                          </div>
                        </div>

                        {/* Detalhamento das Coleções */}
                        <div className="border-border/40 mt-1 flex flex-col gap-1 border-t pt-1.5">
                          {syncEntries.map(({ key, status }) => {
                            const explanation = status.error
                              ? explainReplicationError(
                                  status.error,
                                  status.lastPushResult === 'error'
                                    ? 'push'
                                    : 'pull',
                                )
                              : null

                            const isUnauthorized =
                              explanation?.kind === 'unauthorized' ||
                              isReplicationUnauthorized(status.error)

                            const isForbidden =
                              explanation?.kind === 'forbidden' ||
                              isReplicationForbidden(status.error)

                            const isGeneralError =
                              (status.error &&
                                !isUnauthorized &&
                                !isForbidden) ||
                              status.lastPushResult === 'error' ||
                              status.lastPullResult === 'error'

                            const isAnyFailure =
                              isUnauthorized || isForbidden || isGeneralError

                            let statusText = 'Sincronizado'
                            let textClass = 'text-foreground/80'
                            let StatusIcon = (
                              <CheckCircle
                                size={11}
                                className="shrink-0 text-green-500"
                              />
                            )

                            if (status.isReconciling) {
                              statusText = 'Conciliando...'
                              textClass = 'text-destructive'
                              StatusIcon = (
                                <Trash2
                                  size={11}
                                  className="text-destructive shrink-0 animate-pulse"
                                />
                              )
                            } else if (status.isPulling) {
                              statusText = 'Baixando...'
                              textClass = 'text-blue-500'
                              StatusIcon = (
                                <LottieJumpArrow
                                  direction="down"
                                  animating={true}
                                  size={11}
                                  className="shrink-0 text-blue-500"
                                />
                              )
                            } else if (status.isPushing) {
                              statusText = 'Enviando...'
                              textClass = 'text-amber-500'
                              StatusIcon = (
                                <LottieJumpArrow
                                  direction="up"
                                  animating={true}
                                  size={11}
                                  className="shrink-0 text-amber-500"
                                />
                              )
                            } else if (isUnauthorized) {
                              statusText = explanation
                                ? explanation.shortLabel
                                : 'Login expirado (401)'
                              textClass = 'text-amber-500'
                              StatusIcon = (
                                <AlertCircle
                                  size={11}
                                  className="shrink-0 text-amber-500"
                                />
                              )
                            } else if (isForbidden) {
                              statusText = explanation
                                ? explanation.shortLabel
                                : 'Sem permissão (403)'
                              textClass = 'text-destructive'
                              StatusIcon = (
                                <ShieldAlert
                                  size={11}
                                  className="text-destructive shrink-0"
                                />
                              )
                            } else if (isGeneralError) {
                              statusText = explanation
                                ? explanation.shortLabel
                                : status.lastPushResult === 'error'
                                  ? 'Erro no push'
                                  : status.lastPullResult === 'error'
                                    ? 'Erro no pull'
                                    : 'Falha técnica'
                              textClass = 'text-destructive'
                              StatusIcon = (
                                <XCircle
                                  size={11}
                                  className="text-destructive shrink-0"
                                />
                              )
                            } else if (
                              !status.lastPulledAt &&
                              !status.lastPushedAt &&
                              !status.lastReplication
                            ) {
                              statusText = 'Aguardando sincronização'
                              textClass = 'text-zinc-400'
                              StatusIcon = (
                                <Clock
                                  size={11}
                                  className="shrink-0 text-zinc-400"
                                />
                              )
                            }

                            const isBusy =
                              status.isPulling ||
                              status.isPushing ||
                              status.isReconciling

                            const statusBadge = (
                              <div className="flex cursor-help items-center gap-1">
                                {StatusIcon}
                                <span
                                  className={cn(
                                    'text-[9px] font-medium',
                                    textClass,
                                  )}
                                >
                                  {statusText}
                                </span>
                              </div>
                            )

                            return (
                              <div
                                key={key}
                                className="flex items-center justify-between py-0.5 text-[11px]"
                              >
                                <span className="text-muted-foreground font-medium">
                                  {COLLECTION_LABELS[key]}
                                </span>

                                <div className="flex items-center gap-2">
                                  {isAnyFailure && explanation ? (
                                    <TooltipProvider delayDuration={200}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          {statusBadge}
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="left"
                                          className="max-w-xs space-y-1 p-2 text-xs"
                                        >
                                          <p className="text-foreground font-semibold">
                                            {COLLECTION_LABELS[key]}:{' '}
                                            {explanation.title}
                                          </p>
                                          <p className="text-muted-foreground text-[11px] leading-relaxed">
                                            {explanation.description}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    statusBadge
                                  )}

                                  {!isBusy && (
                                    <div className="text-muted-foreground/60 flex items-center gap-1 font-mono text-[9px]">
                                      {status.lastPulledAt && (
                                        <span title="Último Pull">
                                          ↓{' '}
                                          {format(status.lastPulledAt, 'HH:mm')}
                                        </span>
                                      )}
                                      {status.lastPushedAt && (
                                        <span title="Último Push">
                                          ↑{' '}
                                          {format(status.lastPushedAt, 'HH:mm')}
                                        </span>
                                      )}
                                      {!status.lastPulledAt &&
                                        !status.lastPushedAt &&
                                        status.lastReplication && (
                                          <span>
                                            {format(
                                              status.lastReplication,
                                              "HH:mm 'em' dd/MM",
                                              { locale: ptBR },
                                            )}
                                          </span>
                                        )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Seção 3: Filtro Universal de Conexões */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                  <Filter className="h-3.5 w-3.5" />
                  Filtro Universal de Conexões
                </h4>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={selectAll}
                  >
                    Todas
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={selectNone}
                  >
                    Nenhuma
                  </Button>
                </div>
              </div>

              {connectionsWithSync.length === 0 ? (
                <div className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
                  Nenhuma conexão configurada neste workspace.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {connectionsWithSync.map((conn) => {
                    const isChecked =
                      scope.kind === 'all' ||
                      (scope.kind === 'subset' &&
                        scope.ids.includes(conn.connectionId))
                    const sourceName = resolveConnectionSourceName(conn)
                    const title = resolveConnectionTitle(conn)

                    return (
                      <label
                        key={conn.connectionId}
                        className="hover:bg-accent/50 hover:border-border/60 flex cursor-pointer items-center justify-between rounded-md border border-transparent p-2 transition-colors select-none"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Checkbox
                            checked={isChecked}
                            aria-label={title}
                            onCheckedChange={() => {
                              toggleConnection(conn.connectionId)
                            }}
                          />
                          <div className="bg-muted/40 flex h-5 w-5 shrink-0 items-center justify-center rounded p-0.5">
                            <SafeAddonLogo
                              src={conn.addon?.logo}
                              alt={sourceName}
                              className="h-4 w-4 shrink-0 rounded object-contain"
                              fallbackIconClassName="h-3.5 w-3.5 text-muted-foreground"
                            />
                          </div>
                          <span className="truncate text-xs font-medium">
                            {title}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Seção 4: Falhas de Carregamento no Main Process */}
            {failures.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-destructive flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Falhas de Carga de Addons ({failures.length})
                  </h4>
                </div>

                <div className="space-y-2">
                  {failures.map((failure) => {
                    const isFocused = failure.addonId === focusedAddonId

                    return (
                      <div
                        key={failure.addonId}
                        className={cn(
                          'space-y-1.5 rounded-lg border p-3 text-xs transition-colors',
                          isFocused
                            ? 'border-destructive bg-destructive/10 ring-destructive ring-1'
                            : 'border-destructive/40 bg-destructive/5',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-destructive truncate font-semibold">
                            {failure.addonName || failure.addonId}
                          </span>
                          <Badge
                            variant="destructive"
                            className="px-1 py-0 font-mono text-[10px] uppercase"
                          >
                            {failure.reason}
                          </Badge>
                        </div>

                        <div className="text-muted-foreground truncate font-mono text-[11px]">
                          {failure.entryPath || failure.folderPath}
                        </div>

                        <div className="text-foreground/90 bg-background/60 border-border/40 rounded border p-2 font-mono text-[11px] break-all whitespace-pre-wrap">
                          {failure.technicalMessage}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Seção 5: Resetar Dados Locais */}
            <div className="border-border/40 flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground text-[11px]">
                Manutenção do cache local RxDB
              </span>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="reset-database-trigger"
                    className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive h-6 px-2 text-[10px] transition-colors"
                    disabled={isResetting || !isInitialized}
                  >
                    <Trash2 size={10} className="mr-1.5" />
                    {isResetting ? 'Resetando...' : 'Resetar Dados'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Atenção</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso apagará todos os dados salvos localmente. Qualquer
                      alteração que ainda não foi sincronizada será perdida.
                      Deseja continuar?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleReset}
                      data-testid="confirm-reset-database-btn"
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sim, Resetar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
