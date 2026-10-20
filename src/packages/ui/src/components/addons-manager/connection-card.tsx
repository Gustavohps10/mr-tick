'use client'

import { AlertCircle, Settings2, Trash2, User2, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useConnectionsWithSync } from '@/stores/syncStore'

export type ConnectionStatus =
  'connected' | 'disconnected' | 'warning' | 'error'

export interface AddonConnection {
  id: string
  name: string
  url?: string
  status: ConnectionStatus
  lastSync?: string
  userName?: string
  userId?: string
  member?: {
    id?: string
    name?: string
    login: string
    avatarUrl?: string
  }
}

export interface ConnectionCardProps {
  connection: AddonConnection
  onOpenSettings: (connection: AddonConnection) => void
  onDisconnect: (connection: AddonConnection) => void
  onUninstall: (connection: AddonConnection) => void
}

function resolveConnectionStatus(
  liveStatus: string | undefined,
  fallbackStatus: string,
): boolean {
  if (liveStatus !== undefined) {
    return liveStatus === 'connected'
  }
  return fallbackStatus === 'connected'
}

function resolveConnectionDisplayName(connection: AddonConnection): string {
  if (connection.name !== undefined && connection.name.length > 0) {
    return connection.name
  }
  return connection.id
}

function resolveMemberDisplayName(member: {
  name?: string
  login: string
}): string {
  if (member.name !== undefined && member.name.length > 0) {
    return member.name
  }
  return member.login
}

function resolveConnectionStatusLabel(isConnected: boolean): string {
  if (isConnected) {
    return 'Conectado'
  }
  return 'Desconectado'
}

export function ConnectionCard({
  connection,
  onOpenSettings,
  onDisconnect,
  onUninstall,
}: ConnectionCardProps) {
  const syncedConnections = useConnectionsWithSync()
  const live = syncedConnections.find((s) => s.connectionId === connection.id)

  const isConnected = resolveConnectionStatus(live?.status, connection.status)
  let syncStatuses: Array<{
    isPulling?: boolean
    isPushing?: boolean
    error?: object | string | null
  }> = []
  if (live !== undefined) {
    syncStatuses = Object.values(live.sync)
  }
  const isSyncing = syncStatuses.some((s) =>
    Boolean(s.isPulling || s.isPushing),
  )
  const hasError = syncStatuses.some((s) => Boolean(s.error))

  let member = connection.member
  if (live?.member !== undefined) {
    member = live.member
  }
  const addon = live?.addon

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 rounded-lg border p-3 transition-colors',
        isConnected && 'bg-card/40 border-border',
        !isConnected && 'bg-muted/20 border-dashed opacity-75',
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: logo + name + member */}
        <div className="flex min-w-0 items-center gap-3">
          {/* Logo with sync/error indicator */}
          <div className="relative shrink-0">
            <div className="bg-background flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border shadow-sm">
              {addon?.logo && (
                <img
                  src={addon.logo}
                  alt={addon.name}
                  className="h-6 w-6 object-contain"
                />
              )}
              {!addon?.logo && <span className="text-base">📦</span>}
            </div>
            {isSyncing && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
              </span>
            )}
            {hasError && !isSyncing && (
              <div
                className="bg-destructive/10 absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full"
                title="Erro na sincronização"
              >
                <AlertCircle className="text-destructive h-3 w-3" />
              </div>
            )}
          </div>

          {/* Text info */}
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <p className="truncate text-xs font-bold tracking-tight">
                {resolveConnectionDisplayName(connection)}
              </p>
              <span className="text-muted-foreground/50 font-mono text-[9px] uppercase">
                {connection.id.split('-')[0]}
              </span>
              {addon?.version && (
                <span className="text-muted-foreground/40 font-mono text-[9px]">
                  v{addon.version}
                </span>
              )}
            </div>

            {connection.url && (
              <p className="text-muted-foreground font-mono text-[10px]">
                {connection.url}
              </p>
            )}

            {member && (
              <div className="flex items-center gap-1.5">
                <div className="bg-muted flex h-3.5 w-3.5 items-center justify-center overflow-hidden rounded-full border-[0.5px]">
                  {member.avatarUrl && (
                    <img
                      src={member.avatarUrl}
                      alt={resolveMemberDisplayName(member)}
                      className="h-full w-full rounded-full object-cover"
                    />
                  )}
                  {!member.avatarUrl && (
                    <User2 size={8} className="text-muted-foreground" />
                  )}
                </div>
                <p
                  data-testid="connection-member-login"
                  className="text-muted-foreground truncate text-[10px]"
                >
                  {resolveMemberDisplayName(member)}
                </p>
              </div>
            )}
            {!member && (
              <p className="text-muted-foreground text-[10px]">
                Aguardando conexão...
              </p>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {!isConnected && (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              title="Configurar credenciais"
              className="text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 h-8 w-8 rounded-lg"
              onClick={() => onOpenSettings(connection)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
          {isConnected && (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              title="Desconectar"
              className="text-muted-foreground/60 h-8 w-8 rounded-lg hover:bg-amber-500/10 hover:text-amber-500"
              onClick={() => onDisconnect(connection)}
            >
              <WifiOff className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title="Remover conexão"
            className="text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 h-8 w-8 rounded-lg"
            onClick={() => onUninstall(connection)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="border-border/30 flex items-center justify-between border-t pt-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              isConnected && 'bg-emerald-500',
              !isConnected && 'bg-muted-foreground/30',
            )}
          />
          <span className="text-muted-foreground/80 text-[10px] font-medium">
            {resolveConnectionStatusLabel(isConnected)}
          </span>
        </div>

        {isSyncing && (
          <span className="text-[9px] font-medium text-sky-500">
            Sincronizando...
          </span>
        )}
        {!isSyncing && hasError && (
          <span className="text-destructive text-[9px] font-medium">
            Erro de sincronização
          </span>
        )}
        {!isSyncing && !hasError && isConnected && (
          <span className="text-muted-foreground/60 text-[9px] font-medium">
            Em dia
          </span>
        )}
        {connection.lastSync && !isSyncing && !hasError && !isConnected && (
          <span className="text-muted-foreground/60 text-[9px] font-medium">
            Última sync: {connection.lastSync}
          </span>
        )}
      </div>
    </div>
  )
}
