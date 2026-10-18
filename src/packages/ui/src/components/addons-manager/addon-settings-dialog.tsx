import type { AddonCategory, AddonManifestViewModel } from '@mr-tick/sdk'
import {
  Calendar,
  Clock,
  Database,
  GlobeIcon,
  KeyRound,
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

export type AddonCapabilityId = AddonCategory | 'general'

export interface AddonCapabilityItem {
  id: AddonCapabilityId
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

function firstCapability(
  items: AddonCapabilityItem[],
): AddonCapabilityItem | null {
  for (const item of items) return item
  return null
}

export function resolveAddonCapabilities(
  addon: AddonManifestViewModel | null,
): AddonCapabilityItem[] {
  if (!addon) return []

  const capabilities: AddonCapabilityItem[] = []

  if (
    addonMatchesCategory(addon, 'auth') ||
    addonMatchesCategory(addon, 'dataSource')
  ) {
    capabilities.push({
      id: 'auth',
      label: 'Autenticação',
      icon: KeyRound,
      description:
        'Gerencie contas, credenciais e instâncias conectadas por workspace.',
    })
  }

  if (addonMatchesCategory(addon, 'dataSource')) {
    capabilities.push({
      id: 'dataSource',
      label: 'Fonte De Dados',
      icon: Database,
      description:
        'Configurações e mapeamento de campos das instâncias conectadas neste workspace.',
    })
  }

  if (addonMatchesCategory(addon, 'watcher')) {
    capabilities.push({
      id: 'watcher',
      label: 'Observador',
      icon: GlobeIcon,
      description:
        'Regras de monitoramento de chamadas e automações em tempo real.',
    })
  }

  if (addonMatchesCategory(addon, 'calendar')) {
    capabilities.push({
      id: 'calendar',
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

  if (addonMatchesCategory(addon, 'theme')) {
    capabilities.push({
      id: 'theme',
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
    return firstCapability(capabilities)
  }, [capabilities, activeCapabilityId])

  if (!addon) return null

  const renderCapabilityButton = (cap: AddonCapabilityItem) => {
    const Icon = cap.icon
    const isSelected = currentCapability?.id === cap.id

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
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[82vh] max-h-[820px] min-h-[520px] w-[92vw] min-w-0 flex-row gap-0 overflow-hidden rounded-lg border p-0 shadow-2xl sm:max-w-[1180px]">
        {/* Coluna 1: Sidebar Principal (Capacidades com Autenticação unificada na lista) */}
        <aside className="border-border/60 bg-muted/20 flex min-h-0 w-52 shrink-0 flex-col border-r select-none">
          <div className="p-3 pb-1">
            <h4 className="text-muted-foreground/70 px-2 py-1 text-[11px] font-bold tracking-wider uppercase">
              Capacidades
            </h4>
          </div>

          <ScrollArea className="flex-1 px-3 pb-3">
            <div className="space-y-1">
              {capabilities.map((cap) => renderCapabilityButton(cap))}
            </div>
          </ScrollArea>
        </aside>

        {/* Área Direita: Header do Addon no topo + Outlet (Coluna 2 Workspaces + Coluna 3 Conteúdo) */}
        <main className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="border-border/40 bg-muted/5 flex shrink-0 items-start gap-3.5 border-b px-6 pt-4 pr-14 pb-4">
            <div className="bg-background flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border p-1.5 shadow-2xs">
              <SafeAddonLogo
                src={addon.logo}
                alt={addon.name}
                className="size-full object-contain"
                fallbackIconClassName="size-5 text-muted-foreground/60"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-foreground truncate text-base font-bold tracking-tight">
                  {addon.name}
                </h2>
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 font-mono text-[10px]"
                >
                  v{addon.version}
                </Badge>
                <span className="text-muted-foreground truncate text-xs">
                  por {addon.creator}
                </span>
              </div>
              {addon.description && (
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                  {addon.description}
                </p>
              )}
            </div>
          </header>

          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <AddonSettingsRenderer
              addonId={addon.id}
              activeCapability={currentCapability?.id}
              activeCapabilityLabel={currentCapability?.label}
              activeCapabilityDescription={currentCapability?.description}
              addon={addon}
              hideHeader={true}
            />
          </div>
        </main>
      </DialogContent>
    </Dialog>
  )
}
