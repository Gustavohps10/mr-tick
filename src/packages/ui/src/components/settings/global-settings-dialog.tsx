import {
  CheckCircle2,
  Compass,
  Download,
  Info,
  Palette,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react'
import React, { useMemo, useState } from 'react'

import {
  AddonsManagerView,
  type SidebarSection,
} from '@/components/addons-manager/addons-manager-view'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  type SettingsTab,
  useSettingsModalStore,
} from '@/stores/settingsModalStore'

import { AboutSettingsTab } from './about-settings-tab'
import { AppearanceSettingsTab } from './appearance-settings-tab'
import { GeneralSettingsTab } from './general-settings-tab'
import { LicenseSettingsTab } from './license-settings-tab'
import { UpdateSettingsTab } from './update-settings-tab'

interface NavMenuItem {
  id: SettingsTab
  label: string
  icon: React.ComponentType<{ className?: string }>
  sectionGroup: 'app' | 'addons'
  description: string
}

const NAV_ITEMS: NavMenuItem[] = [
  // Grupo Geral do App
  {
    id: 'about',
    label: 'Sobre',
    icon: Info,
    sectionGroup: 'app',
    description: 'Informações sobre a versão instalada, ajuda e licença.',
  },
  {
    id: 'general',
    label: 'Geral',
    icon: Sliders,
    sectionGroup: 'app',
    description:
      'Comportamento geral da aplicação, inicialização e notificações.',
  },
  {
    id: 'appearance',
    label: 'Aparência',
    icon: Palette,
    sectionGroup: 'app',
    description:
      'Tema de cores, densidade da interface e preferências visuais.',
  },
  {
    id: 'updates',
    label: 'Atualizações',
    icon: RefreshCw,
    sectionGroup: 'app',
    description: 'Canal de distribuição, verificações manuais e versão.',
  },
  {
    id: 'license',
    label: 'Mr. Tick Plus',
    icon: Sparkles,
    sectionGroup: 'app',
    description: 'Gerenciamento de chave de ativação, plano e dispositivos.',
  },

  // Grupo Extensões & Addons
  {
    id: 'addons-browse',
    label: 'Explorar Addons',
    icon: Compass,
    sectionGroup: 'addons',
    description: 'Catálogo de extensões, integrações de terceiros e temas.',
  },
  {
    id: 'addons-installed',
    label: 'Addons Instalados',
    icon: CheckCircle2,
    sectionGroup: 'addons',
    description: 'Gerencie extensões instaladas e atalhos de configuração.',
  },
  {
    id: 'addons-updates',
    label: 'Atualizações de Addons',
    icon: Download,
    sectionGroup: 'addons',
    description: 'Verifique se há novas versões para seus plugins instalados.',
  },
]

export function GlobalSettingsDialog({
  isOpen: propIsOpen,
  setIsOpen: propSetIsOpen,
}: {
  isOpen?: boolean
  setIsOpen?: (open: boolean) => void
}) {
  const storeIsOpen = useSettingsModalStore((s) => s.isOpen)
  const storeClose = useSettingsModalStore((s) => s.closeModal)
  const activeTab = useSettingsModalStore((s) => s.activeTab)
  const setActiveTab = useSettingsModalStore((s) => s.setActiveTab)

  const isControlled = propIsOpen !== undefined
  const isOpen = isControlled ? propIsOpen : storeIsOpen

  const handleOpenChange = (open: boolean) => {
    if (propSetIsOpen) propSetIsOpen(open)
    if (!open) storeClose()
  }

  const [searchQuery, setSearchQuery] = useState('')

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return NAV_ITEMS

    return NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query),
    )
  }, [searchQuery])

  const appItems = filteredItems.filter((i) => i.sectionGroup === 'app')
  const addonItems = filteredItems.filter((i) => i.sectionGroup === 'addons')

  const activeItem = useMemo(() => {
    return NAV_ITEMS.find((i) => i.id === activeTab) || NAV_ITEMS[0]
  }, [activeTab])

  const handleSelectTab = (tab: SettingsTab) => {
    setActiveTab(tab)
  }

  const renderNavButton = (item: NavMenuItem) => {
    const Icon = item.icon
    const selected = activeTab === item.id

    return (
      <button
        key={item.id}
        type="button"
        data-testid={`settings-nav-tab-${item.id}`}
        onClick={() => handleSelectTab(item.id)}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
          selected
            ? 'bg-accent text-accent-foreground font-semibold shadow-xs'
            : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        )}
      >
        <Icon
          className={cn(
            'size-4 shrink-0',
            selected ? 'text-primary' : 'opacity-70',
          )}
        />
        <span className="truncate">{item.label}</span>
        {item.id === 'addons-browse' && (
          <span
            data-testid="addons-manager-tab-browse"
            className="sr-only"
            aria-hidden="true"
          />
        )}
        {item.id === 'addons-installed' && (
          <span
            data-testid="addons-manager-tab-installed"
            className="sr-only"
            aria-hidden="true"
          />
        )}
        {item.id === 'addons-updates' && (
          <span
            data-testid="addons-manager-tab-updates"
            className="sr-only"
            aria-hidden="true"
          />
        )}
      </button>
    )
  }

  const renderContent = () => {
    if (activeTab === 'about') return <AboutSettingsTab />
    if (activeTab === 'general') return <GeneralSettingsTab />
    if (activeTab === 'appearance') return <AppearanceSettingsTab />
    if (activeTab === 'updates') return <UpdateSettingsTab />
    if (activeTab === 'license') return <LicenseSettingsTab />

    const resolvedAddonSection: SidebarSection =
      activeTab === 'addons-installed'
        ? 'installed'
        : activeTab === 'addons-updates'
          ? 'updates'
          : 'browse'

    return (
      <div className="h-full min-h-0 flex-1">
        <AddonsManagerView
          hideSidebar={true}
          activeSection={resolvedAddonSection}
          onSectionChange={(section) => {
            const nextTab: SettingsTab =
              section === 'installed'
                ? 'addons-installed'
                : section === 'updates'
                  ? 'addons-updates'
                  : 'addons-browse'
            setActiveTab(nextTab)
          }}
        />
      </div>
    )
  }

  const isAddonActive = activeTab.startsWith('addons-')

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="global-settings-dialog"
        className="flex h-[82vh] max-h-[820px] min-h-[520px] w-[92vw] min-w-0 flex-row gap-0 overflow-hidden rounded-lg border p-0 shadow-2xl sm:max-w-[1080px]"
      >
        {/* Coluna 1: Side Menu Obsidian Style */}
        <aside className="border-border/60 bg-muted/20 flex min-h-0 w-60 shrink-0 flex-col border-r select-none">
          {/* Header da Sidebar com Campo de Busca */}
          <div className="border-border/40 shrink-0 border-b p-3">
            <div className="relative">
              <Search className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Localizar configurações..."
                className="bg-background/60 border-border/50 h-8 pr-7 pl-8 text-xs focus-visible:ring-1"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-muted-foreground/60 hover:text-foreground absolute top-1/2 right-2 flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center"
                  aria-label="Limpar busca"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* Lista de Navegação por Grupos */}
          <ScrollArea className="flex-1 px-2 py-2">
            <div className="space-y-4">
              {/* Grupo 1: Configurações */}
              {appItems.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-muted-foreground/70 px-2 py-1 text-[11px] font-bold tracking-wider uppercase">
                    Configurações
                  </h4>
                  {appItems.map(renderNavButton)}
                </div>
              )}

              {/* Grupo 2: Extensões & Addons */}
              {addonItems.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-muted-foreground/70 px-2 py-1 text-[11px] font-bold tracking-wider uppercase">
                    Extensões & Addons
                  </h4>
                  {addonItems.map(renderNavButton)}
                </div>
              )}

              {filteredItems.length === 0 && (
                <div className="text-muted-foreground p-4 text-center text-xs">
                  Nenhuma configuração encontrada.
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Coluna 2: Área de Conteúdo */}
        <main className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Header da Seção Ativa (com pr-12 para nunca colidir com o botão X) */}
          <header className="border-border/40 flex shrink-0 flex-col border-b px-8 pt-5 pr-12 pb-4">
            <h2 className="text-foreground text-lg font-bold tracking-tight">
              {activeItem.label}
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {activeItem.description}
            </p>
          </header>

          {/* Área de Conteúdo da Seção */}
          {isAddonActive ? (
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              {renderContent()}
            </div>
          ) : (
            <ScrollArea className="h-full w-full">
              <div className="w-full px-8 py-6">{renderContent()}</div>
            </ScrollArea>
          )}
        </main>
      </DialogContent>
    </Dialog>
  )
}
