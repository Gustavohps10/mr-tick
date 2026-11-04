'use client'

import type { WorkspaceConnectionIdentityViewModel } from '@mr-tick/shared/view-models'
import {
  AlertCircle,
  Clock,
  Globe,
  Settings2,
  Trash2,
  User2,
  WifiOff,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
  lastAuthenticatedAt?: string
  userName?: string
  userId?: string
  addonId?: string
  connectionProfileId?: string
  identity?: WorkspaceConnectionIdentityViewModel
  config?: Record<string, unknown>
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

interface ConfigDisplayItem {
  key: string
  label: string
  value: string
}

const SENSITIVE_KEY_SUBSTRINGS = [
  'key',
  'token',
  'secret',
  'password',
  'credential',
  'auth',
]

function isKeySensitive(key: string): boolean {
  const lower = key.toLowerCase()

  return SENSITIVE_KEY_SUBSTRINGS.some((substr) => lower.includes(substr))
}

function formatConfigKeyLabel(key: string): string {
  const separated = key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()

  return separated.charAt(0).toUpperCase() + separated.slice(1)
}

function extractDisplayableConfigs(
  config?: Record<string, unknown>,
  urlToExclude?: string,
): ConfigDisplayItem[] {
  if (config === undefined) {
    return []
  }

  const items: ConfigDisplayItem[] = []

  for (const [key, rawValue] of Object.entries(config)) {
    if (isKeySensitive(key)) {
      continue
    }

    if (key === 'name') {
      continue
    }

    if (
      urlToExclude !== undefined &&
      typeof rawValue === 'string' &&
      rawValue.trim() === urlToExclude.trim()
    ) {
      continue
    }

    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (trimmed.length > 0) {
        items.push({
          key,
          label: formatConfigKeyLabel(key),
          value: trimmed,
        })
      }
      continue
    }

    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      items.push({
        key,
        label: formatConfigKeyLabel(key),
        value: String(rawValue),
      })
    }
  }

  return items
}

function formatLastAuthenticated(isoDate?: string): string | undefined {
  if (isoDate === undefined || isoDate.length === 0) {
    return undefined
  }

  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) {
    return undefined
  }

  const date = new Date(timestamp)

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
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

function resolveAccountDisplay(
  member?: { name?: string; login: string },
  identity?: WorkspaceConnectionIdentityViewModel,
): { displayName: string; identifier?: string } {
  if (identity !== undefined) {
    let displayName = identity.displayName
    if (displayName.trim().length === 0) {
      displayName = identity.providerSubjectId
    }

    let identifier: string | undefined
    if (
      identity.providerSubjectId.length > 0 &&
      identity.providerSubjectId !== displayName
    ) {
      identifier = identity.providerSubjectId
    }

    return { displayName, identifier }
  }

  if (member !== undefined) {
    let displayName = member.name
    if (displayName === undefined || displayName.trim().length === 0) {
      displayName = member.login
    }

    return { displayName }
  }

  return { displayName: 'Aguardando conexão...' }
}

function resolveTenantDisplay(
  url?: string,
  identity?: WorkspaceConnectionIdentityViewModel,
): string | undefined {
  if (url !== undefined && url.trim().length > 0) {
    return url.trim()
  }

  if (identity !== undefined && identity.tenantId.trim().length > 0) {
    return identity.tenantId.trim()
  }

  return undefined
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

  let identity = connection.identity
  if (live?.identity !== undefined) {
    identity = live.identity
  }

  const addon = live?.addon
  const tenantUrl = resolveTenantDisplay(connection.url, identity)
  const account = resolveAccountDisplay(member, identity)
  const avatarUrl = member?.avatarUrl ?? identity?.avatarUrl
  const formattedLastAuth = formatLastAuthenticated(
    connection.lastAuthenticatedAt,
  )
  const displayableConfigs = extractDisplayableConfigs(
    connection.config,
    tenantUrl,
  )

  let profileLabel = connection.connectionProfileId
  if (profileLabel === undefined || profileLabel.length === 0) {
    profileLabel = connection.id.split('-')[0]
  }

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 rounded-lg border p-3.5 shadow-2xs transition-colors',
        isConnected && 'bg-card/70 border-border/80 hover:border-border',
        !isConnected &&
          'bg-muted/15 border-border/60 border-dashed opacity-80 hover:opacity-100',
      )}
    >
      {/* Top row: Logo, Name, Badges & Actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/* Logo with sync/error indicator */}
          <div className="relative mt-0.5 shrink-0">
            <div className="bg-background flex size-9 items-center justify-center overflow-hidden rounded-lg border shadow-xs">
              {addon?.logo && (
                <img
                  src={addon.logo}
                  alt={addon.name}
                  className="size-6 object-contain"
                />
              )}
              {!addon?.logo && <span className="text-base">📦</span>}
            </div>

            {isSyncing && (
              <span className="absolute -top-1 -right-1 flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-sky-500" />
              </span>
            )}

            {hasError && !isSyncing && (
              <div
                className="bg-destructive/10 absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full"
                title="Erro na sincronização"
              >
                <AlertCircle className="text-destructive size-3" />
              </div>
            )}
          </div>

          {/* Text info */}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-foreground truncate text-xs font-semibold tracking-tight">
                {resolveConnectionDisplayName(connection)}
              </p>

              {profileLabel && (
                <Badge
                  variant="outline"
                  className="text-muted-foreground/70 h-4 px-1.5 py-0 font-mono text-[9px] tracking-wider uppercase"
                >
                  {profileLabel}
                </Badge>
              )}

              {identity?.kind && (
                <Badge
                  variant="secondary"
                  className="text-muted-foreground h-4 px-1.5 py-0 text-[9px] font-normal capitalize"
                >
                  {identity.kind}
                </Badge>
              )}

              {addon?.version && (
                <span className="text-muted-foreground/40 font-mono text-[9px]">
                  v{addon.version}
                </span>
              )}
            </div>

            {/* Tenant / URL and Account Metadata */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-xs">
              {tenantUrl && (
                <div className="text-muted-foreground flex min-w-0 items-center gap-1.5">
                  <Globe className="text-muted-foreground/70 size-3 shrink-0" />
                  <span
                    className="text-foreground/80 hover:text-foreground truncate font-mono text-[11px]"
                    title={tenantUrl}
                  >
                    {tenantUrl}
                  </span>
                </div>
              )}

              <div className="flex min-w-0 items-center gap-1.5">
                <div className="bg-muted flex size-3.5 items-center justify-center overflow-hidden rounded-full border-[0.5px]">
                  {avatarUrl && (
                    <img
                      src={avatarUrl}
                      alt={account.displayName}
                      className="size-full rounded-full object-cover"
                    />
                  )}
                  {!avatarUrl && (
                    <User2 size={8} className="text-muted-foreground" />
                  )}
                </div>

                <span
                  data-testid="connection-member-login"
                  className="text-foreground/90 truncate text-[10px] font-medium"
                >
                  {account.displayName}
                </span>

                {account.identifier && (
                  <span className="text-muted-foreground/60 font-mono text-[9px]">
                    #{account.identifier}
                  </span>
                )}
              </div>
            </div>

            {/* Non-secret config badges */}
            {displayableConfigs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {displayableConfigs.map((item) => (
                  <Badge
                    key={item.key}
                    variant="outline"
                    className="border-border/60 bg-muted/30 text-muted-foreground h-4 gap-1 px-1.5 py-0 text-[9px] font-normal"
                  >
                    <span className="text-foreground/70 font-medium">
                      {item.label}:
                    </span>
                    <span>{item.value}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {!isConnected && (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              data-testid={`configure-connection-btn-${connection.id}`}
              title="Configurar credenciais"
              className="text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 size-8 rounded-lg"
              onClick={() => onOpenSettings(connection)}
            >
              <Settings2 className="size-4" />
            </Button>
          )}

          {isConnected && (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              data-testid={`disconnect-connection-btn-${connection.id}`}
              title="Desconectar"
              className="text-muted-foreground/60 size-8 rounded-lg hover:bg-amber-500/10 hover:text-amber-500"
              onClick={() => onDisconnect(connection)}
            >
              <WifiOff className="size-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            type="button"
            data-testid={`delete-connection-btn-${connection.id}`}
            title="Remover conexão"
            className="text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 size-8 rounded-lg"
            onClick={() => onUninstall(connection)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="border-border/30 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'size-1.5 rounded-full',
                isConnected && 'bg-emerald-500 shadow-xs shadow-emerald-500/40',
                !isConnected && 'bg-muted-foreground/30',
              )}
            />
            <span className="text-muted-foreground/80 text-[10px] font-medium">
              {resolveConnectionStatusLabel(isConnected)}
            </span>
          </div>

          {formattedLastAuth && (
            <div className="text-muted-foreground/60 flex items-center gap-1 text-[10px]">
              <Clock className="text-muted-foreground/50 size-3" />
              <span>Autenticado em {formattedLastAuth}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
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
    </div>
  )
}
