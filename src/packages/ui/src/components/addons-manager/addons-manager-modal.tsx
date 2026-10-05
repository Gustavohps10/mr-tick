import { AddonManifestViewModel, AddonPackageViewModel } from '@mr-tick/sdk'
import {
  compareSemVer,
  isApiVersionCompatible,
  parseSemVer,
} from '@mr-tick/shared/helpers'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpCircle,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Database,
  Download,
  ExternalLink,
  Github,
  Globe,
  GlobeIcon,
  Palette,
  PuzzleIcon,
  RefreshCw,
  Search,
  Settings2,
  Star,
  Trash2,
} from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib/utils'

import { AddonInstallModal, AddonInstallTarget } from './addon-install-modal'
import { AddonSettingsRenderer } from './addon-settings-renderer'

interface AddonsManagerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SidebarSection = 'updates' | 'installed' | 'browse' | 'settings'

interface OfficialCategoryItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const OFFICIAL_CATEGORIES: OfficialCategoryItem[] = [
  { id: 'DataSources', label: 'Fontes De Dados', icon: Database },
  { id: 'Watchers', label: 'Observadores', icon: GlobeIcon },
  { id: 'Calendars', label: 'Calendários', icon: Calendar },
  { id: 'Punch', label: 'Ponto Eletrônico', icon: Clock },
  { id: 'Themes', label: 'Temas', icon: Palette },
]

function formatStarCount(stars?: number): string {
  if (typeof stars !== 'number' || stars <= 0) return '17k'
  if (stars >= 1000000) return `${(stars / 1000000).toFixed(1)}M`
  if (stars >= 1000) return `${(stars / 1000).toFixed(1)}k`
  return String(stars)
}

function getAddonPackages(
  addon: AddonManifestViewModel,
): AddonPackageViewModel[] {
  if (addon.packages && addon.packages.length > 0) return addon.packages
  if (!addon.downloadUrl) return []

  return [
    {
      version: addon.version,
      downloadUrl: addon.downloadUrl,
      requiredApiVersion: addon.requiredApiVersion,
      releaseDate: addon.releaseDate,
      changelog: addon.changelog,
    },
  ]
}

function addonMatchesCategory(
  addon: AddonManifestViewModel,
  categoryId: string,
): boolean {
  const targetCategory = categoryId.toLowerCase()
  const primaryCategory = (addon.category || '').toLowerCase()
  const categoriesList = (addon.categories || []).map((cat) =>
    cat.toLowerCase(),
  )
  const tagsList = (addon.tags || []).map((tag) => tag.toLowerCase())

  if (targetCategory === 'themes') {
    return (
      primaryCategory === 'themes' ||
      primaryCategory === 'theme' ||
      categoriesList.includes('theme') ||
      categoriesList.includes('themes') ||
      tagsList.includes('theme') ||
      tagsList.includes('tema')
    )
  }

  if (targetCategory === 'datasources') {
    return (
      primaryCategory === 'datasources' ||
      primaryCategory === 'datasource' ||
      categoriesList.includes('datasource') ||
      categoriesList.includes('datasources') ||
      tagsList.includes('datasource') ||
      tagsList.includes('datasources')
    )
  }

  if (targetCategory === 'watchers') {
    return (
      primaryCategory === 'watchers' ||
      primaryCategory === 'watcher' ||
      categoriesList.includes('watcher') ||
      categoriesList.includes('watchers') ||
      tagsList.includes('watcher') ||
      tagsList.includes('watchers')
    )
  }

  if (targetCategory === 'calendars') {
    return (
      primaryCategory === 'calendars' ||
      primaryCategory === 'calendar' ||
      categoriesList.includes('calendar') ||
      tagsList.includes('calendar') ||
      tagsList.includes('agenda')
    )
  }

  if (targetCategory === 'punch') {
    return (
      primaryCategory === 'punch' ||
      categoriesList.includes('punch') ||
      tagsList.includes('punch') ||
      tagsList.includes('ponto')
    )
  }

  return (
    primaryCategory === targetCategory ||
    categoriesList.includes(targetCategory)
  )
}

function SafeAddonLogo({
  src,
  alt = '',
  className = 'h-full w-full object-cover',
  fallbackIconClassName = 'h-5 w-5 text-muted-foreground',
}: {
  src?: string
  alt?: string
  className?: string
  fallbackIconClassName?: string
}) {
  const [hasError, setHasError] = useState(false)

  if (!src || hasError) {
    return <PuzzleIcon className={fallbackIconClassName} />
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  )
}

export function AddonsManagerModal({
  open,
  onOpenChange,
}: AddonsManagerModalProps) {
  const bridge = useHostBridge()
  const [activeSection, setActiveSection] = useState<SidebarSection>('browse')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedAddonId, setSelectedAddonId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [installTarget, setInstallTarget] = useState<AddonInstallTarget | null>(
    null,
  )
  const [selectedVersions, setSelectedVersions] = useState<
    Record<string, string>
  >({})
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false)
  const [isUninstalling, setIsUninstalling] = useState<boolean>(false)

  const { data: sdkVersion = '0.5.0' } = useQuery({
    queryKey: ['sdkVersion'],
    queryFn: () => bridge.system.getSdkVersion(),
    staleTime: Infinity,
  })

  const handleUninstallAddon = async (addonId: string, version?: string) => {
    setIsUninstalling(true)
    const response = await bridge.addons.uninstall({
      body: { addonId, version },
    })
    setIsUninstalling(false)

    if (!response.isSuccess) {
      toast.error(response.error ?? 'Falha ao desinstalar addon.')
      return
    }

    toast.success('Addon desinstalado com sucesso!')
    refetchInstalled()
    refetchAvailable()
  }

  const { data: installedList = [], refetch: refetchInstalled } = useQuery<
    AddonManifestViewModel[]
  >({
    queryKey: ['plugins', 'installed'],
    queryFn: async () => {
      const response = await bridge.addons.listInstalled()
      if (!response.isSuccess) throw new Error(response.error)
      return response.data ?? []
    },
  })

  const { data: availableList = [], refetch: refetchAvailable } = useQuery<
    AddonManifestViewModel[]
  >({
    queryKey: ['plugins', 'available'],
    queryFn: async () => {
      const response = await bridge.addons.listAvailable()
      if (!response.isSuccess) throw new Error(response.error)
      return response.data ?? []
    },
  })

  const installedAddonsById = useMemo(() => {
    const addonsById = new Map<string, AddonManifestViewModel>()
    installedList.forEach((addon) => {
      const previous = addonsById.get(addon.id)
      const candidateVersion = parseSemVer(addon.version)
      const previousVersion = previous && parseSemVer(previous.version)
      if (
        !previous ||
        (candidateVersion &&
          (!previousVersion ||
            compareSemVer(candidateVersion, previousVersion) > 0))
      )
        addonsById.set(addon.id, addon)
    })
    return addonsById
  }, [installedList])

  const [operation, setOperation] = useState<'install' | 'update'>('install')
  const [updatingAddonId, setUpdatingAddonId] = useState<string | null>(null)

  const addonsWithUpdates = useMemo(() => {
    return Array.from(installedAddonsById.values())
      .map((installed) => {
        const available = availableList.find((a) => a.id === installed.id)
        if (!available) return null
        if (!isApiVersionCompatible(available.requiredApiVersion, sdkVersion))
          return null
        const parsedRemote = parseSemVer(available.version)
        const parsedLocal = parseSemVer(installed.version)
        const hasUpdate =
          parsedRemote && parsedLocal
            ? compareSemVer(parsedRemote, parsedLocal) > 0
            : false
        return hasUpdate ? { installed, available } : null
      })
      .filter(
        (
          item,
        ): item is {
          installed: AddonManifestViewModel
          available: AddonManifestViewModel
        } => item !== null,
      )
  }, [installedAddonsById, availableList, sdkVersion])

  const hasNotifiedUpdatesRef = useRef(false)
  useEffect(() => {
    if (addonsWithUpdates.length > 0 && !hasNotifiedUpdatesRef.current) {
      hasNotifiedUpdatesRef.current = true
      const first = addonsWithUpdates[0]
      toast.info(
        `Atualização disponível para ${first.available.name} (v${first.available.version})!`,
      )
    }
  }, [addonsWithUpdates])

  const handleUpdateAddon = (addonId: string, downloadUrl?: string) => {
    if (!downloadUrl) {
      toast.error('URL de download da nova versão não encontrada.')
      return
    }

    if (updatingAddonId) return
    const available = availableList.find((item) => item.id === addonId)
    if (!available) return
    setOperation('update')
    setUpdatingAddonId(addonId)
    setInstallTarget({
      id: addonId,
      name: available.name,
      version: available.version,
      downloadUrl,
      requiredApiVersion: available.requiredApiVersion,
    })
    setIsInstallModalOpen(true)
  }

  const handleSelectSection = (
    section: SidebarSection,
    categoryName: string | null = null,
  ) => {
    setActiveSection(section)
    setActiveCategory(categoryName)
    setSelectedAddonId(null)
  }

  const handleOpenInstall = (
    addon: AddonManifestViewModel,
    selectedPackage: AddonPackageViewModel,
  ) => {
    setOperation('install')
    setInstallTarget({
      id: addon.id,
      name: addon.name,
      version: selectedPackage.version,
      downloadUrl: selectedPackage.downloadUrl,
      requiredApiVersion: selectedPackage.requiredApiVersion,
    })
    setIsInstallModalOpen(true)
  }

  const filteredAvailableList = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return availableList

    return availableList.filter(
      (addon) =>
        addon.name.toLowerCase().includes(query) ||
        (addon.description &&
          addon.description.toLowerCase().includes(query)) ||
        (addon.tags &&
          addon.tags.some((tag) => tag.toLowerCase().includes(query))),
    )
  }, [availableList, searchQuery])

  // Define o addon selecionado inicialmente se nenhum estiver selecionado
  const activeBrowseAddon = useMemo(() => {
    if (selectedAddonId) {
      const found = filteredAvailableList.find(
        (addon) => addon.id === selectedAddonId,
      )
      if (found) return found
    }
    return filteredAvailableList[0] || null
  }, [filteredAvailableList, selectedAddonId])

  const activeInstalledAddon = activeBrowseAddon
    ? installedAddonsById.get(activeBrowseAddon.id)
    : undefined

  const activeAddonPackages = useMemo(() => {
    if (!activeBrowseAddon) return []
    return getAddonPackages(activeBrowseAddon)
  }, [activeBrowseAddon])

  const selectedPackage = activeBrowseAddon
    ? (activeAddonPackages.find(
        (pkg) => pkg.version === selectedVersions[activeBrowseAddon.id],
      ) ??
      activeAddonPackages.find(
        (pkg) => pkg.version === activeBrowseAddon.version,
      ))
    : undefined

  const isSelectedPackageCompatible = selectedPackage
    ? isApiVersionCompatible(selectedPackage.requiredApiVersion, sdkVersion)
    : false

  const renderManagerSidebarItem = (
    id: SidebarSection,
    label: string,
    IconComponent: React.ComponentType<{ className?: string }>,
  ) => {
    const isSelected = activeSection === id && !activeCategory
    return (
      <button
        data-testid={`addons-manager-tab-${id}`}
        onClick={() => handleSelectSection(id)}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted text-muted-foreground hover:text-foreground',
        )}
      >
        <div className="flex items-center gap-2.5">
          <IconComponent className="h-4 w-4" /> {label}
        </div>
        {id === 'updates' && addonsWithUpdates.length > 0 && (
          <Badge
            variant="secondary"
            className="border-primary/20 bg-primary/10 text-primary px-1.5 py-0 text-[10px] font-bold"
          >
            {addonsWithUpdates.length}
          </Badge>
        )}
      </button>
    )
  }

  const renderCategoryItem = (categoryItem: OfficialCategoryItem) => {
    const IconComponent = categoryItem.icon
    const isSelected =
      activeSection === 'settings' && activeCategory === categoryItem.id
    return (
      <button
        key={categoryItem.id}
        data-testid={`addons-manager-category-${categoryItem.id}`}
        onClick={() => handleSelectSection('settings', categoryItem.id)}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted text-muted-foreground hover:text-foreground',
        )}
      >
        <IconComponent className="h-4 w-4" /> {categoryItem.label}
      </button>
    )
  }

  const renderInstalledView = () => {
    return (
      <div className="p-6">
        <h2 className="mb-6 text-2xl font-bold">Addons Instalados</h2>
        <div className="space-y-8">
          {OFFICIAL_CATEGORIES.map((cat) => {
            const addonsInCat = installedList.filter((a) =>
              addonMatchesCategory(a, cat.id),
            )
            if (addonsInCat.length === 0) return null
            return (
              <div key={cat.id}>
                <h3 className="mb-3 border-b pb-2 text-lg font-semibold">
                  {cat.label}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {addonsInCat.map((addon) => (
                    <div
                      key={addon.id}
                      className="bg-card flex gap-4 rounded-lg border p-4 shadow-sm"
                    >
                      <div className="bg-muted/50 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border p-1.5 shadow-2xs">
                        <SafeAddonLogo
                          src={addon.logo}
                          alt={addon.name}
                          className="h-full w-full object-contain"
                          fallbackIconClassName="h-6 w-6 text-muted-foreground/60"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="truncate text-sm font-semibold">
                            {addon.name}
                          </h4>
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            v{addon.version}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-[11px]">
                          por {addon.creator || 'Autor'}
                        </p>
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                          {addon.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderBrowseView = () => {
    return (
      <div className="flex h-full">
        {/* Seção do Meio: Lista mais larga (w-[420px]) */}
        <div className="bg-muted/5 flex w-[320px] shrink-0 flex-col border-r xl:w-[420px]">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5" />
              <Input
                placeholder="Buscar Addons..."
                className="h-8 pl-8 text-xs"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-1.5 p-2.5">
              {filteredAvailableList.map((addon) => {
                const isSelected = activeBrowseAddon?.id === addon.id
                const installedAddon = installedAddonsById.get(addon.id)

                return (
                  <button
                    key={addon.id}
                    data-testid={`addon-browse-card-${addon.id}`}
                    onClick={() => setSelectedAddonId(addon.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-all',
                      isSelected
                        ? 'border-primary/40 bg-primary/10 shadow-sm'
                        : 'border-border/50 hover:border-border hover:bg-muted/40',
                    )}
                  >
                    {/* Logotipo à esquerda */}
                    <div className="bg-background flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border p-1 shadow-2xs">
                      <SafeAddonLogo
                        src={addon.logo}
                        alt={addon.name}
                        className="h-full w-full object-contain"
                        fallbackIconClassName="h-5 w-5 text-muted-foreground/60"
                      />
                    </div>

                    {/* Conteúdo do Card */}
                    <div className="min-w-0 flex-1">
                      {/* Linha 1: Nome + Versão + Estrelinhas no canto superior direito */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="text-foreground truncate text-sm font-bold">
                            {addon.name}
                          </span>
                          <span className="bg-muted text-muted-foreground py-0.2 shrink-0 rounded px-1.5 font-mono text-[10px]">
                            v{addon.version}
                          </span>
                          <span className="text-muted-foreground shrink-0 text-[9px] font-semibold uppercase">
                            Mais Recente
                          </span>
                        </div>

                        {/* Estrelinha no canto superior direito */}
                        <div className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px] font-medium opacity-80">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          <span>{formatStarCount(addon.stars)}</span>
                        </div>
                      </div>

                      {/* Linha 2: "por Gustavo Henrique" */}
                      <p className="text-muted-foreground text-[11px]">
                        por {addon.creator || 'Autor desconhecido'}
                      </p>

                      {/* Linha 3: Short description */}
                      <p className="text-muted-foreground/90 mt-1 line-clamp-2 text-xs leading-snug">
                        {addon.description}
                      </p>

                      {/* Indicador de Status */}
                      {installedAddon && (
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
                            <Check className="h-3 w-3" />
                            <span>Instalado · v{installedAddon.version}</span>
                          </div>
                          {addonsWithUpdates.some(
                            (u) => u.installed.id === addon.id,
                          ) && (
                            <Badge
                              variant="secondary"
                              data-testid={`addon-update-badge-${addon.id}`}
                              className="border-primary/20 bg-primary/10 text-primary border px-1.5 py-0 text-[9px] font-medium"
                            >
                              Atualização
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}

              {filteredAvailableList.length === 0 && (
                <div className="text-muted-foreground py-10 text-center text-xs">
                  Nenhum addon encontrado com este termo.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Terceira Seção Vertical (Detalhes / Instalação - mais estreita e organizada) */}
        <div className="bg-background flex min-w-0 flex-1 flex-col overflow-auto p-6">
          {activeBrowseAddon ? (
            <div className="max-w-xl space-y-6">
              {/* Header com Logo, Informações e Botão de Ação */}
              <div className="flex items-start gap-3">
                <div className="bg-muted/40 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border p-2 shadow-sm">
                  <SafeAddonLogo
                    src={activeBrowseAddon.logo}
                    alt={activeBrowseAddon.name}
                    className="h-full w-full object-contain"
                    fallbackIconClassName="h-10 w-10 text-muted-foreground/60"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-foreground truncate text-2xl font-bold">
                      {activeBrowseAddon.name}
                    </h2>
                    {activeInstalledAddon && (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500"
                      >
                        <Check className="mr-1 h-3 w-3" /> Instalado · v
                        {activeInstalledAddon.version}
                      </Badge>
                    )}
                    {addonsWithUpdates.some(
                      (u) => u.installed.id === activeBrowseAddon.id,
                    ) && (
                      <Badge
                        variant="secondary"
                        data-testid={`addon-update-badge-${activeBrowseAddon.id}`}
                        className="border-primary/20 bg-primary/10 text-primary border px-2 py-0.5 text-xs font-medium"
                      >
                        Atualização
                      </Badge>
                    )}
                  </div>

                  <p className="text-muted-foreground mt-0.5 text-xs">
                    por{' '}
                    <span className="text-foreground font-medium">
                      {activeBrowseAddon.creator}
                    </span>{' '}
                    •{' '}
                    <span data-testid="addon-details-version-label">
                      Mais recente: {activeBrowseAddon.version}
                    </span>
                  </p>

                  {/* Links Úteis: GitHub e Documentação */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    {activeBrowseAddon.sourceUrl && (
                      <a
                        href={activeBrowseAddon.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs transition-colors"
                      >
                        <Github className="h-3.5 w-3.5" />
                        <span>GitHub</span>
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    )}

                    {activeBrowseAddon.homepage && (
                      <a
                        href={activeBrowseAddon.homepage}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs transition-colors"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>Documentação</span>
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div
                data-testid="addon-details-actions"
                className="flex flex-wrap items-center gap-1.5"
              >
                {activeInstalledAddon ? (
                  <>
                    {addonsWithUpdates.some(
                      (u) => u.installed.id === activeBrowseAddon.id,
                    ) && (
                      <Button
                        data-testid={`addon-update-btn-${activeBrowseAddon.id}`}
                        size="sm"
                        disabled={updatingAddonId !== null}
                        onClick={() => {
                          const updateInfo = addonsWithUpdates.find(
                            (u) => u.installed.id === activeBrowseAddon.id,
                          )
                          handleUpdateAddon(
                            activeBrowseAddon.id,
                            updateInfo?.available.downloadUrl ||
                              activeBrowseAddon.downloadUrl,
                          )
                        }}
                        className="h-8 cursor-pointer gap-1 px-2 text-xs font-semibold"
                      >
                        <ArrowUpCircle className="h-3.5 w-3.5" />
                        {updatingAddonId === activeBrowseAddon.id
                          ? 'Atualizando...'
                          : 'Atualizar'}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updatingAddonId !== null}
                      onClick={() =>
                        handleSelectSection(
                          'settings',
                          activeBrowseAddon.category || 'DataSources',
                        )
                      }
                      className="h-8 cursor-pointer gap-1 px-2 text-xs"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Configurar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isUninstalling || updatingAddonId !== null}
                      onClick={() => handleUninstallAddon(activeBrowseAddon.id)}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-8 cursor-pointer gap-1 px-2 text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isUninstalling ? 'Desinstalando...' : 'Desinstalar'}
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={selectedPackage?.version ?? ''}
                      onValueChange={(version) =>
                        setSelectedVersions((versions) => ({
                          ...versions,
                          [activeBrowseAddon.id]: version,
                        }))
                      }
                    >
                      <SelectTrigger
                        data-testid="addon-details-version-select"
                        aria-label={`Versão do addon ${activeBrowseAddon.name}`}
                        className="h-8 w-36 text-xs"
                      >
                        <SelectValue placeholder="Selecionar versão" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeAddonPackages.map((pkg) => (
                          <SelectItem
                            key={pkg.version}
                            data-testid={`addon-version-option-${pkg.version}`}
                            value={pkg.version}
                            disabled={
                              !isApiVersionCompatible(
                                pkg.requiredApiVersion,
                                sdkVersion,
                              )
                            }
                          >
                            v{pkg.version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedPackage?.requiredApiVersion && (
                      <span className="text-muted-foreground font-mono text-[10px]">
                        API {selectedPackage.requiredApiVersion}
                      </span>
                    )}
                    <Button
                      data-testid="addon-details-install-btn"
                      size="sm"
                      disabled={
                        !selectedPackage?.downloadUrl ||
                        !isSelectedPackageCompatible
                      }
                      onClick={() => {
                        if (!selectedPackage) return
                        handleOpenInstall(activeBrowseAddon, selectedPackage)
                      }}
                      className="cursor-pointer gap-1.5 px-4 font-semibold"
                    >
                      <Download className="h-4 w-4" />
                      Instalar
                    </Button>
                  </div>
                )}
              </div>

              <Separator />

              {/* Screenshots Gallery (Playnite Style) */}
              {activeBrowseAddon.screenshots &&
                activeBrowseAddon.screenshots.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-foreground text-sm font-bold tracking-wide uppercase">
                      Capturas de Tela
                    </h3>
                    <div className="space-y-4">
                      {activeBrowseAddon.screenshots.map((screen, idx) => (
                        <div
                          key={idx}
                          className="bg-card overflow-hidden rounded-lg border shadow-sm"
                        >
                          <img
                            src={screen.url}
                            alt={screen.caption || `Screenshot ${idx + 1}`}
                            className="h-auto max-h-64 w-full object-cover"
                          />
                          {screen.caption && (
                            <p className="bg-muted/40 text-muted-foreground border-t px-3 py-1.5 text-xs">
                              {screen.caption}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <Separator />
                  </div>
                )}

              {/* Descrição Completa */}
              <div className="space-y-2">
                <h3 className="text-foreground text-sm font-bold tracking-wide uppercase">
                  Descrição
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
                  {activeBrowseAddon.description}
                </p>
              </div>

              {/* Changelog / Notas de Versão */}
              {activeBrowseAddon.changelog &&
                activeBrowseAddon.changelog.length > 0 && (
                  <div className="space-y-2">
                    <Separator />
                    <h3 className="text-foreground text-sm font-bold tracking-wide uppercase">
                      Notas da Versão
                    </h3>
                    <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs">
                      {activeBrowseAddon.changelog.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              Selecione um Addon para ver detalhes
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderSettingsView = () => {
    const activeCategoryObj = OFFICIAL_CATEGORIES.find(
      (c) => c.id.toLowerCase() === activeCategory?.toLowerCase(),
    )
    const categoryLabel = activeCategoryObj?.label || activeCategory
    const addonsInCat = installedList.filter((a) =>
      activeCategory ? addonMatchesCategory(a, activeCategory) : false,
    )
    return (
      <div className="flex h-full min-h-0 min-w-0">
        <div className="bg-muted/5 flex min-h-0 w-[260px] shrink-0 flex-col overflow-hidden border-r">
          <div className="flex shrink-0 items-center gap-2 border-b p-4">
            <span className="text-sm font-semibold">{categoryLabel}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="min-w-0 space-y-1 p-2">
              {addonsInCat.map((addon) => (
                <button
                  key={addon.id}
                  data-testid={`addon-settings-item-${addon.id}`}
                  onClick={() => setSelectedAddonId(addon.id)}
                  className={cn(
                    'flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    selectedAddonId === addon.id
                      ? 'bg-primary/10 text-primary border-primary/20 border font-medium shadow-2xs'
                      : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <div className="bg-background flex h-7 w-7 shrink-0 items-center justify-center rounded-md border p-1 shadow-2xs">
                    <SafeAddonLogo
                      src={addon.logo}
                      alt={addon.name}
                      className="h-full w-full object-contain"
                      fallbackIconClassName="h-4 w-4 text-muted-foreground/60"
                    />
                  </div>
                  <span className="min-w-0 flex-1 truncate">{addon.name}</span>
                </button>
              ))}
              {addonsInCat.length === 0 && (
                <div className="text-muted-foreground p-4 text-center text-xs">
                  Nenhum plugin instalado nesta categoria.
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
          {selectedAddonId ? (
            <AddonSettingsRenderer addonId={selectedAddonId} />
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              Selecione um Addon para configurar
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderUpdatesView = () => {
    return (
      <div className="flex h-full flex-col overflow-auto p-6 lg:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Atualizações Disponíveis</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Mantenha seus plugins sincronizados com as últimas correções e
              novidades.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchInstalled()
              refetchAvailable()
            }}
            className="cursor-pointer gap-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Verificar Novamente
          </Button>
        </div>

        {addonsWithUpdates.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <CheckCircle className="mb-3 h-10 w-10 text-emerald-500" />
            <p className="text-sm font-semibold">
              Todos os seus plugins estão atualizados!
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Nenhuma nova versão encontrada para os addons instalados.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {addonsWithUpdates.map(({ installed, available }) => (
              <div
                key={installed.id}
                className="bg-card flex flex-col items-start justify-between gap-4 rounded-lg border p-4 shadow-sm md:flex-row md:items-center"
              >
                <div className="flex min-w-0 items-start gap-4">
                  <div className="bg-muted/50 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border p-1.5 shadow-2xs">
                    <SafeAddonLogo
                      src={available.logo || installed.logo}
                      alt={available.name}
                      className="h-full w-full object-contain"
                      fallbackIconClassName="h-6 w-6 text-muted-foreground/60"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-semibold">
                        {available.name}
                      </h4>
                      <Badge
                        variant="secondary"
                        data-testid={`addon-update-badge-${installed.id}`}
                        className="border-primary/20 bg-primary/10 text-primary border text-[10px] font-medium"
                      >
                        Atualização
                      </Badge>
                    </div>
                    <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                      <span>
                        Instalada:{' '}
                        <strong className="font-mono">
                          v{installed.version}
                        </strong>
                      </span>
                      <span>→</span>
                      <span>
                        Nova:{' '}
                        <strong className="text-foreground font-mono">
                          v{available.version}
                        </strong>
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                      {available.description || installed.description}
                    </p>
                    {available.changelog && available.changelog.length > 0 && (
                      <div className="bg-muted/40 text-muted-foreground/90 mt-2 rounded border p-2 text-[11px]">
                        <span className="font-semibold">Novidades:</span>{' '}
                        {available.changelog[0]}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto">
                  <Button
                    data-testid={`addon-update-btn-${installed.id}`}
                    size="sm"
                    disabled={updatingAddonId === installed.id}
                    onClick={() =>
                      handleUpdateAddon(installed.id, available.downloadUrl)
                    }
                    className="cursor-pointer gap-1.5 text-xs font-semibold"
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                    {updatingAddonId === installed.id
                      ? 'Atualizando...'
                      : 'Atualizar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[85vh] w-[90vw] flex-row gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
          {/* Left Navigation Tree */}
          <div className="bg-muted/30 flex h-full w-[200px] shrink-0 flex-col border-r xl:w-[240px]">
            <div className="border-b p-4">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <PuzzleIcon className="text-primary h-5 w-5" />
                Addons
              </h2>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-6 p-3">
                <div className="space-y-1">
                  <h3 className="text-muted-foreground/70 mb-2 px-2 text-xs font-bold tracking-wider uppercase">
                    Gerenciador
                  </h3>
                  {renderManagerSidebarItem('browse', 'Explorar', Search)}
                  {renderManagerSidebarItem(
                    'installed',
                    'Instalados',
                    CheckCircle,
                  )}
                  {renderManagerSidebarItem(
                    'updates',
                    'Atualizações',
                    Download,
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="text-muted-foreground/70 mb-2 px-2 text-xs font-bold tracking-wider uppercase">
                    Configurações De Extensões
                  </h3>
                  {OFFICIAL_CATEGORIES.map((cat) => renderCategoryItem(cat))}
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Dynamic Right Area */}
          <div className="bg-background flex h-full flex-1 flex-col overflow-hidden">
            {activeSection === 'installed' && renderInstalledView()}
            {activeSection === 'browse' && renderBrowseView()}
            {activeSection === 'settings' && renderSettingsView()}
            {activeSection === 'updates' && renderUpdatesView()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Bidirecional de Instalação com Console em Tempo Real */}
      <AddonInstallModal
        addon={installTarget}
        open={isInstallModalOpen}
        onOpenChange={setIsInstallModalOpen}
        operation={operation}
        onSettled={() => setUpdatingAddonId(null)}
      />
    </>
  )
}
