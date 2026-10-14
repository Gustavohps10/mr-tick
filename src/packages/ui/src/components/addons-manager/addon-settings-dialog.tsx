import type { AddonManifestViewModel } from '@mr-tick/sdk'
import {
  Calendar,
  Clock,
  Database,
  GlobeIcon,
  Palette,
  SlidersHorizontal,
} from 'lucide-react'
import React, { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { AddonSettingsRenderer } from './addon-settings-renderer'
import { addonMatchesCategory, SafeAddonLogo } from './addons-manager-view'

export interface AddonSettingsDialogProps {
  addon: AddonManifestViewModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export interface AddonCapabilityItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

export function resolveAddonCapabilities(
  addon: AddonManifestViewModel | null,
): AddonCapabilityItem[] {
  if (!addon) return []

  const capabilities: AddonCapabilityItem[] = []

  if (addonMatchesCategory(addon, 'datasources')) {
    capabilities.push({
      id: 'datasources',
      label: 'Fonte De Dados',
      icon: Database,
      description:
        'Gerencie contas, instâncias de conexão, credenciais e mapeamento de campos.',
    })
  }

  if (addonMatchesCategory(addon, 'watchers')) {
    capabilities.push({
      id: 'watchers',
      label: 'Observador',
      icon: GlobeIcon,
      description:
        'Regras de monitoramento de chamadas e automações em tempo real.',
    })
  }

  if (addonMatchesCategory(addon, 'calendars')) {
    capabilities.push({
      id: 'calendars',
      label: 'Calendário',
      icon: Calendar,
      description: 'Sincronização de agendas e eventos.',
    })
  }

  if (addonMatchesCategory(addon, 'punch')) {
    capabilities.push({
      id: 'punch',
      label: 'Ponto Eletrônico',
      icon: Clock,
      description: 'Espelho de ponto e integração com relógio de ponto.',
    })
  }

  if (addonMatchesCategory(addon, 'themes')) {
    capabilities.push({
      id: 'themes',
      label: 'Tema Visual',
      icon: Palette,
      description: 'Esquema de cores e variáveis do tema visual.',
    })
  }

  if (capabilities.length === 0) {
    capabilities.push({
      id: 'general',
      label: 'Configurações',
      icon: SlidersHorizontal,
      description: 'Parâmetros e opções gerais do addon.',
    })
  }

  return capabilities
}

export function AddonSettingsDialog({
  addon,
  open,
  onOpenChange,
}: AddonSettingsDialogProps) {
  const capabilities = useMemo(() => resolveAddonCapabilities(addon), [addon])

  const [activeCapabilityId, setActiveCapabilityId] = useState<string>('')

  const currentCapability = useMemo(() => {
    if (activeCapabilityId) {
      const match = capabilities.find((c) => c.id === activeCapabilityId)
      if (match) return match
    }
    return capabilities[0] || null
  }, [capabilities, activeCapabilityId])

  if (!addon) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[82vh] max-h-[820px] min-h-[520px] w-[92vw] min-w-0 flex-row gap-0 overflow-hidden rounded-lg border p-0 shadow-2xl sm:max-w-[1080px]">
        {/* Coluna 1: Sidebar com informações do Addon e suas Capacidades */}
        <aside className="border-border/60 bg-muted/20 flex min-h-0 w-64 shrink-0 flex-col border-r select-none">
          {/* Header do Addon */}
          <div className="border-border/40 flex items-center gap-3 border-b p-4">
            <div className="bg-background flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border p-1 shadow-2xs">
              <SafeAddonLogo
                src={addon.logo}
                alt={addon.name}
                className="size-full object-contain"
                fallbackIconClassName="size-5 text-muted-foreground/60"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-foreground truncate text-sm font-bold">
                  {addon.name}
                </h3>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="px-1 py-0 font-mono text-[9px]"
                >
                  v{addon.version}
                </Badge>
                <span className="text-muted-foreground truncate text-[10px]">
                  por {addon.creator}
                </span>
              </div>
            </div>
          </div>

          {/* Navegação de Capacidades deste Addon */}
          <div className="p-3 pb-1">
            <h4 className="text-muted-foreground/70 px-2 py-1 text-[11px] font-bold tracking-wider uppercase">
              Capacidades
            </h4>
          </div>

          <ScrollArea className="flex-1 px-2 pb-2">
            <div className="space-y-1">
              {capabilities.map((cap) => {
                const Icon = cap.icon
                const isSelected = (currentCapability?.id ?? '') === cap.id

                return (
                  <button
                    key={cap.id}
                    type="button"
                    data-testid={`addon-capability-tab-${cap.id}`}
                    onClick={() => setActiveCapabilityId(cap.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                      isSelected
                        ? 'bg-accent text-accent-foreground font-semibold shadow-xs'
                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        isSelected ? 'text-primary' : 'opacity-70',
                      )}
                    />
                    <span className="truncate">{cap.label}</span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </aside>

        {/* Coluna 2: Conteúdo da Capacidade Selecionada */}
        <main className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
          {currentCapability && (
            <header className="border-border/40 flex shrink-0 flex-col border-b px-8 pt-5 pr-14 pb-4">
              <h2 className="text-foreground text-lg font-bold tracking-tight">
                {currentCapability.label}
              </h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {currentCapability.description}
              </p>
            </header>
          )}

          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <AddonSettingsRenderer
              addonId={addon.id}
              activeCapability={currentCapability?.id}
              addon={addon}
              hideHeader={true}
            />
          </div>
        </main>
      </DialogContent>
    </Dialog>
  )
}
