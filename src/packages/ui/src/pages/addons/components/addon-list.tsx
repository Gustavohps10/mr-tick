'use client'

import {
  AlertCircle,
  ArrowUpCircle,
  Download,
  Info,
  MoreHorizontal,
  PackageOpen,
  Plus,
  Settings2,
  Trash2,
  User2,
  WifiOff,
} from 'lucide-react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useConnectionsWithSync } from '@/stores/syncStore'

import type { AddonConnection, AddonItem } from '../types'

// ---------------------------------------------------------------------------
// ConnectionCard
// ---------------------------------------------------------------------------

interface ConnectionCardProps {
  connection: AddonConnection
  onOpenSettings: (connection: AddonConnection) => void
  onDisconnect: (connection: AddonConnection) => void
  onUninstall: (connection: AddonConnection) => void
}

export function ConnectionCard({
  connection,
  onOpenSettings,
  onDisconnect,
  onUninstall,
}: ConnectionCardProps) {
  const syncedConnections = useConnectionsWithSync()
  const live = syncedConnections.find((s) => s.connectionId === connection.id)

  const isConnected = (live?.status ?? connection.status) === 'connected'
  const syncStatuses = live ? Object.values(live.sync) : []
  const isSyncing = syncStatuses.some((s) => s.isPulling || s.isPushing)
  const hasError = syncStatuses.some((s) => s.error)
  const member = live?.member
  const addon = live?.addon

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 rounded-lg border p-3 transition-colors',
        isConnected
          ? 'bg-card/40 border-border'
          : 'bg-muted/20 border-dashed opacity-75',
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: logo + name + member */}
        <div className="flex min-w-0 items-center gap-3">
          {/* Logo with sync/error indicator */}
          <div className="relative shrink-0">
            <div className="bg-background flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border shadow-sm">
              {addon?.logo ? (
                <img
                  src={addon.logo}
                  alt={addon.name}
                  className="h-6 w-6 object-contain"
                />
              ) : (
                <span className="text-base">📦</span>
              )}
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
                {connection.name || connection.id}
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

            {member ? (
              <div className="flex items-center gap-1.5">
                <div className="bg-muted flex h-3.5 w-3.5 items-center justify-center overflow-hidden rounded-full border-[0.5px]">
                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt={member.name ?? member.login}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <User2 size={8} className="text-muted-foreground" />
                  )}
                </div>
                <p
                  data-testid="connection-member-login"
                  className="text-muted-foreground truncate text-[10px]"
                >
                  {member.name ?? member.login}
                </p>
              </div>
            ) : (
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
              isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/30',
            )}
          />
          <span className="text-muted-foreground/80 text-[10px] font-medium">
            {isConnected ? 'Conectado' : 'Desconectado'}
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

// ---------------------------------------------------------------------------
// AddonRow
// ---------------------------------------------------------------------------

interface AddonRowProps {
  addon: AddonItem
  onInstall: (addon: AddonItem) => void
  onDetails: (addon: AddonItem) => void
  onAddConnection: (addon: AddonItem) => void
  onOpenSettings: (addon: AddonItem, connection: AddonConnection) => void
  onDisconnect: (addon: AddonItem, connection: AddonConnection) => void
  onUpdate: (addon: AddonItem) => void
  onUninstall: (addon: AddonItem, connection: AddonConnection) => void
  onConfigure: (addon: AddonItem) => void
}

function AddonRow({
  addon,
  onInstall,
  onDetails,
  onAddConnection,
  onOpenSettings,
  onDisconnect,
  onUpdate,
  onUninstall,
  onConfigure,
}: AddonRowProps) {
  const isInstalled = addon.installed

  return (
    <AccordionItem
      value={addon.id}
      className="border-border/50 bg-card rounded-lg border px-1"
    >
      <AccordionTrigger
        className={cn(
          'px-4 py-4 hover:no-underline',
          (addon.category !== 'integrations' || !isInstalled) &&
            'pointer-events-none cursor-default [&>svg]:hidden',
        )}
      >
        <div className="pointer-events-auto flex w-full items-center justify-between">
          {/* Left: Icon and info */}
          <div className="flex items-center gap-4">
            <div className="bg-secondary/40 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
              {addon.logo ? (
                <img
                  src={addon.logo}
                  alt={addon.name}
                  className="h-8 w-8 object-contain"
                />
              ) : (
                <PackageOpen className="text-muted-foreground/50 h-6 w-6" />
              )}
            </div>
            <div className="flex flex-col items-start gap-1">
              <span className="font-semibold">{addon.name}</span>
              <span className="text-muted-foreground line-clamp-1 max-w-[280px] text-left text-xs">
                {addon.description}
              </span>
            </div>
          </div>

          {/* Right: Badges and actions */}
          <div
            className="flex shrink-0 items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {addon.category === 'integrations' &&
              addon.connections.length > 0 && (
                <span className="text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5 text-[10px]">
                  {addon.connections.length}{' '}
                  {addon.connections.length === 1 ? 'instância' : 'instâncias'}
                </span>
              )}

            {addon.updateAvailable ? (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
              >
                Atualização
              </Badge>
            ) : isInstalled ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
              >
                Instalado
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-muted text-muted-foreground border-border text-[10px]"
              >
                Não instalado
              </Badge>
            )}

            {!isInstalled ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground/60 hover:text-foreground h-8 w-8 rounded-lg"
                  onClick={() => onDetails(addon)}
                  title="Detalhes"
                >
                  <Info className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => onInstall(addon)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Instalar
                </Button>
              </>
            ) : (
              <>
                {addon.category !== 'integrations' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mr-1 h-8 gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      onConfigure(addon)
                    }}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Configurar
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {addon.category === 'integrations' && (
                      <DropdownMenuItem onClick={() => onAddConnection(addon)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nova instância
                      </DropdownMenuItem>
                    )}
                    {addon.updateAvailable && (
                      <DropdownMenuItem onClick={() => onUpdate(addon)}>
                        <ArrowUpCircle className="mr-2 h-4 w-4" />
                        Atualizar plugin
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </AccordionTrigger>

      {isInstalled && addon.category === 'integrations' && (
        <AccordionContent className="border-border/40 border-t px-4 pb-4">
          <div className="space-y-2 pt-3">
            {addon.connections.length > 0 ? (
              <>
                <p className="text-muted-foreground pb-1 text-[10px] font-semibold tracking-wider uppercase">
                  Instâncias conectadas
                </p>
                {addon.connections.map((conn) => (
                  <ConnectionCard
                    key={conn.id}
                    connection={conn}
                    onOpenSettings={(c) => onOpenSettings(addon, c)}
                    onDisconnect={(c) => onDisconnect(addon, c)}
                    onUninstall={(c) => onUninstall(addon, c)}
                  />
                ))}
              </>
            ) : (
              <div className="bg-muted/5 flex flex-col items-center justify-center rounded-lg border border-dashed py-6">
                <p className="text-muted-foreground text-xs">
                  Nenhuma instância configurada.
                </p>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddConnection(addon)}
              className="text-muted-foreground hover:text-foreground mt-1 w-full border-dashed"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Adicionar instância
            </Button>
          </div>
        </AccordionContent>
      )}
    </AccordionItem>
  )
}

// ---------------------------------------------------------------------------
// AddonList
// ---------------------------------------------------------------------------

export interface AddonListProps {
  addons: AddonItem[]
  onInstall: (addon: AddonItem) => void
  onDetails: (addon: AddonItem) => void
  onAddConnection: (addon: AddonItem) => void
  onOpenSettings: (addon: AddonItem, connection: AddonConnection) => void
  onDisconnect: (addon: AddonItem, connection: AddonConnection) => void
  onUpdate: (addon: AddonItem) => void
  onUninstall: (addon: AddonItem, connection: AddonConnection) => void
  onConfigure: (addon: AddonItem) => void
}

export function AddonList({
  addons,
  onInstall,
  onDetails,
  onAddConnection,
  onOpenSettings,
  onDisconnect,
  onUpdate,
  onUninstall,
  onConfigure,
}: AddonListProps) {
  if (addons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="bg-secondary mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Info className="text-muted-foreground h-6 w-6" />
        </div>
        <p className="text-muted-foreground font-medium">
          Nenhum plugin encontrado
        </p>
        <p className="text-muted-foreground text-sm opacity-70">
          Tente ajustar seus filtros ou busca.
        </p>
      </div>
    )
  }

  return (
    <Accordion type="multiple" className="space-y-2">
      {addons.map((addon) => (
        <AddonRow
          key={addon.id}
          addon={addon}
          onInstall={onInstall}
          onDetails={onDetails}
          onAddConnection={onAddConnection}
          onOpenSettings={onOpenSettings}
          onDisconnect={onDisconnect}
          onUpdate={onUpdate}
          onUninstall={onUninstall}
          onConfigure={onConfigure}
        />
      ))}
    </Accordion>
  )
}
