'use client'

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
  DatabaseIcon,
  DownloadCloud,
  Monitor,
  RefreshCcw,
  Trash2,
  UploadCloud,
  User2,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { RxError } from 'rxdb'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui'
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
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useWorkspaceConflicts } from '@/hooks/queries/use-workspace-conflicts'
import { cn } from '@/lib/utils'
import { useConflictModalStore } from '@/stores/conflictModalStore'
import {
  ReplicationStatus,
  useConnectionsWithSync,
  useSyncStore,
} from '@/stores/syncStore'

import { LottieJumpArrow } from './lottie-jump-arrow'

export interface HeaderProps {
  className?: string
}

const COLLECTION_LABELS: Record<'metadata' | 'tasks' | 'timeEntries', string> =
  {
    metadata: 'Metadados',
    tasks: 'Tarefas',
    timeEntries: 'Apontamentos',
  }

const ERROR_CODES = { MISSING_TOKEN: 'MISSING_TOKEN' }

const getRawErrorMessage = (error: Error | RxError | null): string => {
  if (!error) {
    return ''
  }
  if (
    'parameters' in error &&
    error.parameters &&
    typeof error.parameters === 'object'
  ) {
    const params = error.parameters
    if (
      'errors' in params &&
      params.errors &&
      typeof params.errors === 'object'
    ) {
      const errs = params.errors
      if ('message' in errs && typeof errs.message === 'string') {
        return errs.message
      }
    }
  }
  return error.message
}

const AUTH_ERROR_PATTERNS = [
  'MISSING_TOKEN',
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  '401',
]

const isAuthError = (error: Error | RxError | null): boolean => {
  if (!error) return false

  if (
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode === 401
  ) {
    return true
  }

  if (
    'status' in error &&
    typeof error.status === 'number' &&
    error.status === 401
  ) {
    return true
  }

  if (
    'parameters' in error &&
    error.parameters &&
    typeof error.parameters === 'object'
  ) {
    const params = error.parameters
    if ('errors' in params && params.errors) {
      const rawErrors = params.errors
      const errList = Array.isArray(rawErrors) ? rawErrors : [rawErrors]
      const hasAuthCode = errList.some((e) => {
        if (!e || typeof e !== 'object') return false
        const code =
          'statusCode' in e
            ? e.statusCode
            : 'status' in e
              ? e.status
              : undefined
        return code === 401
      })
      if (hasAuthCode) return true
    }
  }

  const rawMsg = getRawErrorMessage(error).toUpperCase()
  return AUTH_ERROR_PATTERNS.some((pattern) => rawMsg.includes(pattern))
}

export type GlobalSyncStatus =
  | 'initializing'
  | 'local_only'
  | 'auth_error'
  | 'technical_error'
  | 'reconciling'
  | 'syncing'
  | 'pulling'
  | 'pushing'
  | 'pending_connections'
  | 'synced'

interface GlobalSyncState {
  status: GlobalSyncStatus
  color: string
  label: string
  icon: 'sync' | 'local' | 'reconcile' | 'pull' | 'push'
}

export function Header({ className }: HeaderProps = {}) {
  const { workspace } = useWorkspace()
  const connections = useConnectionsWithSync()
  const dbName = useSyncStore((s) => s.db?.name)
  const isInitialized = useSyncStore((s) => s.isInitialized) ?? false
  const { conflictCount } = useWorkspaceConflicts()
  const openConflictModal = useConflictModalStore((s) => s.openConflictModal)

  const forceSync = useSyncStore((s) => s.forceSync)
  const reconcile = useSyncStore((s) => s.reconcile)
  const resetDatabase = useSyncStore((s) => s.resetDatabase)

  const [isResetting, setIsResetting] = useState(false)

  const hasRemote = connections.length > 0
  const allStatuses = connections.flatMap((c) =>
    Object.values(c.sync).filter((v): v is ReplicationStatus => Boolean(v)),
  )

  const isAnyPulling = allStatuses.some((v) => v.isPulling)
  const isAnyPushing = allStatuses.some((v) => v.isPushing)
  const isAnyReconciling = allStatuses.some((v) => v.isReconciling)
  const isAnySyncingGlobally = isAnyPulling || isAnyPushing || isAnyReconciling

  const handleReset = async () => {
    setIsResetting(true)
    try {
      await resetDatabase?.()
    } finally {
      setIsResetting(false)
    }
  }

  const getGlobalState = (): GlobalSyncState => {
    if (!isInitialized)
      return {
        status: 'initializing',
        color: 'bg-muted',
        label: 'Inicializando...',
        icon: 'sync',
      }
    if (!hasRemote)
      return {
        status: 'local_only',
        color: 'bg-zinc-400',
        label: 'Modo Local',
        icon: 'local',
      }

    const anyAuthError = allStatuses.some((v) => isAuthError(v.error))
    if (anyAuthError)
      return {
        status: 'auth_error',
        color: 'bg-amber-500',
        label: 'Autenticação necessária',
        icon: 'sync',
      }

    const technicalError = allStatuses.find(
      (v) => v.error && !isAuthError(v.error),
    )
    if (technicalError) {
      console.error(
        '[HEADER] Erro técnico de sincronização:',
        technicalError.error,
      )
      return {
        status: 'technical_error',
        color: 'bg-destructive',
        label: 'Erro técnico',
        icon: 'sync',
      }
    }
    if (isAnyReconciling)
      return {
        status: 'reconciling',
        color: 'bg-destructive animate-pulse',
        label: 'Conciliando exclusões...',
        icon: 'reconcile',
      }
    if (isAnyPulling && isAnyPushing)
      return {
        status: 'syncing',
        color: 'bg-blue-500 animate-pulse',
        label: 'Sincronizando (Download & Upload)...',
        icon: 'sync',
      }
    if (isAnyPulling)
      return {
        status: 'pulling',
        color: 'bg-blue-500 animate-pulse',
        label: 'Baixando atualizações (Pull)...',
        icon: 'pull',
      }
    if (isAnyPushing)
      return {
        status: 'pushing',
        color: 'bg-amber-500 animate-pulse',
        label: 'Enviando alterações (Push)...',
        icon: 'push',
      }

    const anyDisconnected = allStatuses.some((v) => v.lastReplication === null)
    if (anyDisconnected)
      return {
        status: 'pending_connections',
        color: 'bg-zinc-400',
        label: 'Conexões pendentes',
        icon: 'sync',
      }

    return {
      status: 'synced',
      color: 'bg-green-500',
      label: 'Sincronizado',
      icon: 'sync',
    }
  }

  const globalStatus = getGlobalState()

  return (
    <div
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={cn(
        'border-border/40 bg-muted/30 hover:bg-muted/50 pointer-events-auto flex h-6 items-center justify-between gap-2 rounded px-2 shadow-xs backdrop-blur-md transition-colors select-none',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <Avatar className="ring-border/40 size-3.5 rounded-xs shadow-2xs ring-1">
          <AvatarImage
            src={workspace?.avatarUrl || undefined}
            alt={workspace?.name}
          />
          <AvatarFallback className="text-[8px] font-bold">
            {workspace?.name?.[0]?.toUpperCase() || 'M'}
          </AvatarFallback>
        </Avatar>

        <div className="flex items-center gap-1 leading-none">
          <span className="text-foreground max-w-[140px] truncate text-[11px] font-semibold tracking-tight">
            {workspace?.name || 'Mr. Tick'}
          </span>
          <span className="text-muted-foreground/60 font-mono text-[9px]">
            {workspace?.id}
          </span>
        </div>
      </div>

      <div className="bg-border/50 h-3 w-px" />

      <div className="flex items-center gap-1">
        {conflictCount > 0 && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openConflictModal()}
                  className="h-5 gap-1 rounded-xs border border-amber-500/40 bg-amber-500/15 px-1.5 text-amber-600 hover:bg-amber-500/25 hover:text-amber-500 dark:text-amber-400"
                >
                  <AlertTriangle size={11} className="text-amber-500" />
                  <span className="text-[10px] font-bold">{conflictCount}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                {conflictCount === 1
                  ? '1 conflito de sincronização pendente'
                  : `${conflictCount} conflitos de sincronização pendentes`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <TooltipProvider delayDuration={200}>
          <Popover>
            <Tooltip>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="sync-status-indicator"
                    data-status={globalStatus.status}
                    aria-label={globalStatus.label}
                    className="hover:bg-muted/60 text-muted-foreground hover:text-foreground relative flex h-5 items-center gap-1 rounded-xs px-1.5"
                  >
                    {globalStatus.icon === 'local' ? (
                      <Monitor size={11} />
                    ) : (
                      <div className="flex items-center">
                        <LottieJumpArrow
                          direction="down"
                          animating={isAnyPulling}
                          style={{ width: 8 }}
                          className={cn(
                            isAnyPulling
                              ? 'text-blue-500'
                              : 'text-muted-foreground/50',
                          )}
                        />
                        <LottieJumpArrow
                          direction="up"
                          animating={isAnyPushing}
                          style={{ width: 8 }}
                          className={cn(
                            isAnyPushing
                              ? 'text-amber-500'
                              : 'text-muted-foreground/50',
                          )}
                        />
                      </div>
                    )}
                    <span
                      className={`border-background absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 rounded-full border ${globalStatus.color}`}
                    />
                  </Button>
                </TooltipTrigger>
              </PopoverTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                {globalStatus.label}
              </TooltipContent>
            </Tooltip>

            <PopoverContent
              className="border-border/50 bg-background/95 w-[360px] overflow-hidden rounded-lg p-0 shadow-2xl backdrop-blur-md"
              align="end"
              sideOffset={8}
            >
              {conflictCount > 0 && (
                <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      <div>
                        <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          Conflitos Detectados ({conflictCount})
                        </div>
                        <div className="text-muted-foreground text-[10px]">
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

              <div className="bg-muted/30 flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="bg-background flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm">
                    <DatabaseIcon size={14} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold tracking-tight opacity-80">
                      Local Database
                    </h4>
                    <div className="text-muted-foreground flex items-center gap-1 font-mono text-[10px] leading-4">
                      <span className="max-w-[120px] truncate">
                        {dbName || 'ERRO AO CARREGAR DB'}
                      </span>
                    </div>
                  </div>
                </div>

                {hasRemote && (
                  <div className="border-border/60 bg-background/80 hover:border-border flex h-9 w-9 flex-col items-center justify-between overflow-hidden rounded-md border shadow-xs transition-colors">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => forceSync?.(undefined, 'both')}
                          disabled={isAnySyncingGlobally}
                          aria-label="Sincronizar tudo"
                          data-testid="sync-all-button"
                          className="hover:bg-muted/60 flex h-full w-full cursor-pointer items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RefreshCcw
                            size={16}
                            className={cn(
                              isAnySyncingGlobally
                                ? 'animate-spin text-blue-500'
                                : 'text-foreground/70 hover:text-foreground',
                            )}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">
                        {isAnySyncingGlobally
                          ? 'Sincronizando todas as instâncias...'
                          : 'Sincronizar tudo (Pull & Push)'}
                      </TooltipContent>
                    </Tooltip>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Mais opções de sincronização"
                          className="border-border/40 hover:bg-muted/60 flex h-[10px] w-full cursor-pointer items-center justify-center border-t transition-colors"
                        >
                          <ChevronDown
                            size={7.5}
                            className="text-muted-foreground hover:text-foreground"
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

              <div className="max-h-[420px] overflow-y-auto p-2">
                {isInitialized && hasRemote ? (
                  <div className="flex flex-col gap-2">
                    {connections.map((conn) => {
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
                            !isAuthError(entry.status.error)) ||
                          entry.status.lastPushResult === 'error' ||
                          entry.status.lastPullResult === 'error',
                      )

                      return (
                        <div
                          key={conn.connectionId}
                          className="bg-card/40 hover:bg-card/60 rounded-lg border p-3 shadow-sm transition-colors"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="relative shrink-0">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-zinc-100 p-1 shadow-sm dark:bg-zinc-900">
                                  {conn.addon?.logo ? (
                                    <img
                                      src={conn.addon.logo}
                                      alt={conn.addon.name}
                                      className="h-full w-full object-contain"
                                    />
                                  ) : (
                                    <span className="text-lg">📦</span>
                                  )}
                                </div>

                                {isSyncing && (
                                  <div className="bg-primary border-background absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 shadow-sm">
                                    <RefreshCcw
                                      size={10}
                                      className="animate-spin text-white"
                                    />
                                  </div>
                                )}
                              </div>

                              <div className="flex min-w-0 flex-col">
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                  <span className="truncate text-[11px] font-bold tracking-tight">
                                    {conn.addon?.name || conn.connectionId}
                                  </span>
                                  <span className="text-muted-foreground shrink-0 font-mono text-[9px] font-medium opacity-60">
                                    v{conn.addon?.version || '1.0'}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <Avatar className="ring-border h-4 w-4 rounded-full shadow-sm ring-1">
                                    <AvatarImage src={conn.member?.avatarUrl} />
                                    <AvatarFallback className="bg-muted text-[8px]">
                                      <User2 size={8} />
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-muted-foreground max-w-[180px] truncate text-[10px]">
                                    {conn.member?.name || 'NÃO IDENTIFICADO '}
                                    <span className="ml-1 text-[9px] opacity-50">
                                      {conn.member?.login}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {conn.status === 'connected' && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-muted-foreground hover:text-foreground h-6 w-6"
                                      disabled={isSyncing}
                                    >
                                      <RefreshCcw
                                        size={12}
                                        className={
                                          isSyncing ? 'animate-spin' : ''
                                        }
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
                                      <Trash2 className="mr-2 h-3.5 w-3.5 dark:text-red-400" />{' '}
                                      Conciliar excluídos (Varredura 30d)
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              {conn.status === 'connected' ? (
                                hasConnectionError ? (
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
                                          ? getRawErrorMessage(
                                              syncEntries.find(
                                                (entry) => entry.status.error,
                                              )!.status.error,
                                            )
                                          : 'Falha na sincronização dos dados'}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
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
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 px-1">
                            {syncEntries.map(({ key, status }) => {
                              const isErr =
                                (status.error && !isAuthError(status.error)) ||
                                status.lastPushResult === 'error' ||
                                status.lastPullResult === 'error'

                              let statusText = 'Sincronizado'
                              let StatusIcon = (
                                <CheckCircle
                                  size={12}
                                  className="text-green-500"
                                />
                              )

                              if (status.isReconciling) {
                                statusText = 'Conciliando...'
                                StatusIcon = (
                                  <Trash2
                                    size={12}
                                    className="text-destructive animate-pulse"
                                  />
                                )
                              } else if (status.isPulling) {
                                statusText = 'Baixando...'
                                StatusIcon = (
                                  <LottieJumpArrow
                                    direction="down"
                                    animating={true}
                                    size={12}
                                    className="text-blue-500"
                                  />
                                )
                              } else if (status.isPushing) {
                                statusText = 'Enviando...'
                                StatusIcon = (
                                  <LottieJumpArrow
                                    direction="up"
                                    animating={true}
                                    size={12}
                                    className="text-amber-500"
                                  />
                                )
                              } else if (isErr) {
                                statusText =
                                  status.lastPushResult === 'error'
                                    ? 'Erro no envio (push)'
                                    : status.lastPullResult === 'error'
                                      ? 'Erro no recebimento (pull)'
                                      : 'Falha técnica'
                                const errDetail = status.error
                                  ? getRawErrorMessage(status.error)
                                  : statusText
                                StatusIcon = (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex cursor-help items-center">
                                        <XCircle
                                          size={12}
                                          className="text-destructive"
                                        />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="left"
                                      className="max-w-xs text-xs"
                                    >
                                      <p className="text-destructive font-semibold">
                                        {statusText}
                                      </p>
                                      <p className="text-muted-foreground mt-0.5 font-mono text-[10px] break-words">
                                        {errDetail}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                )
                              } else if (isAuthError(status.error)) {
                                statusText = 'Login expirado'
                                StatusIcon = (
                                  <AlertCircle
                                    size={12}
                                    className="text-zinc-400"
                                  />
                                )
                              } else if (
                                !status.lastPulledAt &&
                                !status.lastPushedAt &&
                                !status.lastReplication
                              ) {
                                statusText = 'Aguardando sincronização'
                                StatusIcon = (
                                  <Clock size={12} className="text-zinc-400" />
                                )
                              }

                              const isBusy =
                                status.isPulling ||
                                status.isPushing ||
                                status.isReconciling

                              return (
                                <div
                                  key={key}
                                  className="border-border/30 flex items-center justify-between border-t py-1.5 first:border-0"
                                >
                                  <span className="text-muted-foreground text-[10px] font-medium tracking-tight">
                                    {COLLECTION_LABELS[key]}
                                  </span>

                                  <div className="flex items-center gap-2">
                                    {StatusIcon}
                                    <div className="flex flex-col items-end">
                                      <span
                                        className={`text-[9px] font-bold ${
                                          isErr
                                            ? 'text-destructive'
                                            : status.isReconciling
                                              ? 'text-destructive'
                                              : status.isPulling
                                                ? 'text-blue-500'
                                                : status.isPushing
                                                  ? 'text-amber-500'
                                                  : 'text-foreground/80'
                                        }`}
                                      >
                                        {statusText}
                                      </span>
                                      {!isBusy && (
                                        <div className="text-muted-foreground/60 mt-0.5 flex items-center gap-1.5 text-[8px] leading-none">
                                          {status.lastPulledAt && (
                                            <span title="Último Pull">
                                              ↓{' '}
                                              {format(
                                                status.lastPulledAt,
                                                'HH:mm',
                                              )}
                                            </span>
                                          )}
                                          {status.lastPushedAt && (
                                            <span title="Último Push">
                                              ↑{' '}
                                              {format(
                                                status.lastPushedAt,
                                                'HH:mm',
                                              )}
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
                                          {!status.lastPulledAt &&
                                            !status.lastPushedAt &&
                                            !status.lastReplication && (
                                              <span title="Aguardando primeira sincronização com o servidor">
                                                Pendente
                                              </span>
                                            )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Monitor
                      size={24}
                      className="text-muted-foreground/20 mx-auto mb-2"
                    />
                    <p className="text-muted-foreground text-[10px] italic opacity-60">
                      {isInitialized
                        ? 'Somente dados locais ativados'
                        : 'Inicializando motor...'}
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-muted/20 flex items-center justify-between border-t px-4 py-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="reset-database-trigger"
                      className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto h-6 px-2 text-[10px] transition-colors"
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
            </PopoverContent>
          </Popover>
        </TooltipProvider>
      </div>
    </div>
  )
}
