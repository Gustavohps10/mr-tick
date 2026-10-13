'use client'

import type { AddonManifest } from '@mr-tick/application'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DownloadIcon,
  KeyRound,
  LayoutGrid,
  Search,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  LicenseActivationDialog,
  LicenseSettingsCard,
  useLicensingState,
} from '@/components/addons-manager/license-settings-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useHostBridge } from '@/hooks'

import type { AddonCategory } from './components/addon-category-sidebar'
import {
  AddonDetailsDialog,
  InstallPluginDialog,
} from './components/addon-dialogs'
import type { AddonItem } from './types'

function resolveString(value: string | undefined): string {
  if (value) {
    return value
  }
  return ''
}

function resolveErrorMessage(
  error: string | undefined,
  fallback: string,
): string {
  if (error) {
    return error
  }
  return fallback
}

function resolveTabButtonVariant(
  activeTab: 'installed' | 'available',
  targetTab: 'installed' | 'available',
): 'default' | 'outline' {
  if (activeTab === targetTab) {
    return 'default'
  }
  return 'outline'
}

function resolveStatusBadgeClass(installed: boolean): string {
  if (installed) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400'
  }
  return 'bg-muted text-muted-foreground text-[10px]'
}

function resolveStatusBadgeLabel(installed: boolean): string {
  if (installed) {
    return 'Instalado'
  }
  return 'Disponível'
}

function matchesTabFilter(
  activeTab: 'installed' | 'available',
  installed: boolean,
): boolean {
  if (activeTab === 'installed') {
    return installed
  }
  return !installed
}

function manifestToAddonItem(
  m: AddonManifest,
  category: AddonCategory,
): AddonItem {
  return {
    id: m.id,
    name: m.name,
    description: resolveString(m.description),
    author: resolveString(m.creator),
    version: m.version,
    logo: resolveString(m.logo),
    installed: m.installed,
    category,
    connections: [],
    documentationUrl: m.sourceUrl,
    installerManifestUrl: m.installerManifestUrl,
    tier: m.tier,
    sha256: m.sha256,
    size: m.size,
  }
}

function addonCategory(m: AddonManifest): AddonCategory {
  let rawTags: string[] = []
  if (m.tags) {
    rawTags = m.tags
  }
  const tags = rawTags.map((t) => t.toLowerCase())
  const name = m.name.toLowerCase()

  if (tags.some((t) => Boolean(t.includes('theme') || t === 'tema'))) {
    return 'themes'
  }
  if (tags.some((t) => Boolean(t.includes('util') || t === 'utility'))) {
    return 'utilities'
  }
  if (
    tags.some((t) => Boolean(t.includes('watch') || t === 'watcher')) ||
    tags.includes('ia') ||
    tags.includes('ai') ||
    name.includes('ia ') ||
    name.includes(' ai') ||
    name.includes('discord')
  ) {
    return 'watchers'
  }
  return 'integrations'
}

export function AddonsStorePage() {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const { data: licenseState } = useLicensingState()

  const [activeTab, setActiveTab] = useState<'installed' | 'available'>(
    'installed',
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAddon, setSelectedAddon] = useState<AddonItem | null>(null)
  const [installDialogOpen, setInstallDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [activationDialogOpen, setActivationDialogOpen] = useState(false)
  const [installVersions, setInstallVersions] = useState<
    { value: string; label: string }[]
  >([])

  const isPlusAuthorized = Boolean(licenseState?.isPlusActive)

  const { data: installedList = [] } = useQuery({
    queryKey: ['plugins', 'installed'],
    queryFn: async () => {
      const res = await bridge.addons.listInstalled()
      if (!res.isSuccess) {
        throw new Error(
          resolveErrorMessage(res.error, 'Falha ao listar plugins instalados'),
        )
      }
      if (!res.data) {
        return []
      }
      return res.data
    },
  })

  const { data: availableList = [] } = useQuery({
    queryKey: ['plugins', 'available'],
    queryFn: async () => {
      const res = await bridge.addons.listAvailable()
      if (!res.isSuccess) {
        throw new Error(
          resolveErrorMessage(res.error, 'Falha ao listar plugins disponíveis'),
        )
      }
      if (!res.data) {
        return []
      }
      return res.data
    },
  })

  const installMutation = useMutation({
    mutationFn: async (input: {
      installerManifestUrl: string
      version: string
      fallbackSha256?: string
    }) => {
      const installer = await bridge.addons.getInstaller({
        body: { installerUrl: input.installerManifestUrl },
      })
      const pkg = installer.data?.packages.find(
        (p) => p.version === input.version,
      )
      if (!pkg) {
        throw new Error('Versão não encontrada.')
      }
      let expectedSha256 = pkg.sha256
      if (!expectedSha256) {
        expectedSha256 = input.fallbackSha256
      }
      const installRes = await bridge.addons.install({
        body: {
          downloadUrl: pkg.downloadUrl,
          expectedSha256,
        },
      })
      if (!installRes.isSuccess) {
        throw new Error(
          resolveErrorMessage(
            installRes.error,
            'Falha ao iniciar instalação do plugin.',
          ),
        )
      }
      return installRes
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins'] })
      toast.success('Plugin instalado com sucesso!')
      setInstallDialogOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const allAddons: AddonItem[] = useMemo(() => {
    const byId = new Map<string, AddonManifest>()
    installedList.forEach((m) => byId.set(m.id, { ...m, installed: true }))
    availableList.forEach((m) => {
      if (!byId.has(m.id)) {
        byId.set(m.id, { ...m, installed: false })
      }
    })

    return Array.from(byId.values()).map((m) =>
      manifestToAddonItem(m, addonCategory(m)),
    )
  }, [installedList, availableList])

  const filteredAddons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return allAddons.filter((addon) => {
      if (!matchesTabFilter(activeTab, addon.installed)) {
        return false
      }
      if (!query) {
        return true
      }

      return Boolean(
        addon.name.toLowerCase().includes(query) ||
        addon.description.toLowerCase().includes(query),
      )
    })
  }, [allAddons, activeTab, searchQuery])

  const handleOpenInstallDialog = async (addon: AddonItem) => {
    if (addon.tier === 'plus' && !isPlusAuthorized) {
      setSelectedAddon(addon)
      setActivationDialogOpen(true)
      return
    }

    setSelectedAddon(addon)
    setInstallVersions([{ value: addon.version, label: `v${addon.version}` }])

    if (!addon.installerManifestUrl) {
      setInstallDialogOpen(true)
      return
    }

    try {
      const res = await bridge.addons.getInstaller({
        body: { installerUrl: addon.installerManifestUrl },
      })
      if (res.isSuccess && res.data?.packages) {
        setInstallVersions(
          res.data.packages.map((p: { version: string }) => ({
            value: p.version,
            label: `v${p.version}`,
          })),
        )
      }
    } catch {
      // Keep default version on error
    }

    setInstallDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <LicenseSettingsCard />

      {/* Header Bar */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={resolveTabButtonVariant(activeTab, 'installed')}
            size="sm"
            onClick={() => setActiveTab('installed')}
            className="gap-2"
          >
            <LayoutGrid className="h-4 w-4" />
            Instalados ({allAddons.filter((a) => a.installed).length})
          </Button>
          <Button
            variant={resolveTabButtonVariant(activeTab, 'available')}
            size="sm"
            onClick={() => setActiveTab('available')}
            className="gap-2"
          >
            <DownloadIcon className="h-4 w-4" />
            Disponíveis ({allAddons.filter((a) => !a.installed).length})
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
          <Input
            placeholder="Buscar plugins na loja..."
            className="h-9 pl-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid of Store Items */}
      {filteredAddons.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground font-medium">
            Nenhum plugin encontrado
          </p>
          <p className="text-muted-foreground mt-1 text-xs opacity-70">
            Nenhum item corresponde ao filtro selecionado.
          </p>
        </div>
      )}

      {filteredAddons.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAddons.map((addon) => (
            <div
              key={addon.id}
              className="bg-card border-border hover:border-primary/50 flex flex-col justify-between rounded-lg border p-4 shadow-sm transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="bg-secondary/40 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                    {addon.logo && (
                      <img
                        src={addon.logo}
                        alt={addon.name}
                        className="h-8 w-8 object-contain"
                      />
                    )}
                    {!addon.logo && <span className="text-xl">📦</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {addon.tier === 'plus' && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/40 bg-amber-500/10 text-[9px] font-bold tracking-wider text-amber-600 uppercase dark:text-amber-400"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        PLUS
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={resolveStatusBadgeClass(addon.installed)}
                    >
                      {resolveStatusBadgeLabel(addon.installed)}
                    </Badge>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{addon.name}</h3>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      v{addon.version}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                    {addon.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <span className="text-muted-foreground text-[11px]">
                  por {addon.author}
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setSelectedAddon(addon)
                      setDetailsDialogOpen(true)
                    }}
                  >
                    Detalhes
                  </Button>

                  {!addon.installed &&
                    addon.tier === 'plus' &&
                    !isPlusAuthorized && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 border-amber-500/40 text-xs text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                        onClick={() => handleOpenInstallDialog(addon)}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Requer Plus
                      </Button>
                    )}

                  {!addon.installed &&
                    (addon.tier !== 'plus' || isPlusAuthorized) && (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => handleOpenInstallDialog(addon)}
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                        Instalar
                      </Button>
                    )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <InstallPluginDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        addon={selectedAddon}
        versions={installVersions}
        onInstall={(addon, version) => {
          if (!addon.installerManifestUrl) {
            toast.error('URL do instalador não encontrada')
            return
          }
          installMutation.mutate({
            installerManifestUrl: addon.installerManifestUrl,
            version,
            fallbackSha256: addon.sha256,
          })
        }}
        isInstalling={installMutation.isPending}
      />

      <AddonDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        addon={selectedAddon}
        onInstall={handleOpenInstallDialog}
      />

      <LicenseActivationDialog
        open={activationDialogOpen}
        onOpenChange={setActivationDialogOpen}
        onActivated={() => {
          if (selectedAddon) {
            void handleOpenInstallDialog(selectedAddon)
          }
        }}
      />
    </div>
  )
}
