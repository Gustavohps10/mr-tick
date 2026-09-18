'use client'

import type { AddonManifest } from '@mr-tick/application'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DownloadIcon, LayoutGrid, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOpenAPI } from '@/hooks'

import type { AddonCategory } from './components/addon-category-sidebar'
import {
  AddonDetailsDialog,
  InstallPluginDialog,
} from './components/addon-dialogs'
import type { AddonItem } from './types'

function manifestToAddonItem(
  m: AddonManifest,
  category: AddonCategory,
): AddonItem {
  return {
    id: m.id,
    name: m.name,
    description: m.description ?? '',
    author: m.creator ?? '',
    version: m.version,
    logo: m.logo ?? '',
    installed: m.installed,
    category,
    connections: [],
    documentationUrl: m.sourceUrl,
    installerManifestUrl: m.installerManifestUrl,
  }
}

function addonCategory(m: AddonManifest): AddonCategory {
  const tags = (m.tags ?? []).map((t) => t.toLowerCase())
  const name = m.name.toLowerCase()

  if (tags.some((t) => t.includes('theme') || t === 'tema')) return 'themes'
  if (tags.some((t) => t.includes('util') || t === 'utility'))
    return 'utilities'
  if (
    tags.some((t) => t.includes('watch') || t === 'watcher') ||
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
  const openAPI = useOpenAPI()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'installed' | 'available'>(
    'installed',
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAddon, setSelectedAddon] = useState<AddonItem | null>(null)
  const [installDialogOpen, setInstallDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [installVersions, setInstallVersions] = useState<
    { value: string; label: string }[]
  >([])

  const { data: installedList = [] } = useQuery({
    queryKey: ['plugins', 'installed'],
    queryFn: async () => {
      const res = await openAPI.integrations.addons.listInstalled()
      if (!res.isSuccess) {
        throw new Error(res.error ?? 'Falha ao listar plugins instalados')
      }
      return res.data ?? []
    },
  })

  const { data: availableList = [] } = useQuery({
    queryKey: ['plugins', 'available'],
    queryFn: async () => {
      const res = await openAPI.integrations.addons.listAvailable()
      if (!res.isSuccess) {
        throw new Error(res.error ?? 'Falha ao listar plugins disponíveis')
      }
      return res.data ?? []
    },
  })

  const installMutation = useMutation({
    mutationFn: async (input: {
      installerManifestUrl: string
      version: string
    }) => {
      const installer = await openAPI.integrations.addons.getInstaller({
        body: { installerUrl: input.installerManifestUrl },
      })
      const pkg = installer.data?.packages.find(
        (p) => p.version === input.version,
      )
      if (!pkg) {
        throw new Error('Versão não encontrada.')
      }
      return openAPI.integrations.addons.install({
        body: { downloadUrl: pkg.downloadUrl },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      toast.success('Plugin instalado com sucesso!')
      setInstallDialogOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const allAddons: AddonItem[] = useMemo(() => {
    const byId = new Map<string, AddonManifest>()
    installedList.forEach((m) => byId.set(m.id, { ...m, installed: true }))
    availableList.forEach((m) => {
      if (!byId.has(m.id)) byId.set(m.id, { ...m, installed: false })
    })

    return Array.from(byId.values()).map((m) =>
      manifestToAddonItem(m, addonCategory(m)),
    )
  }, [installedList, availableList])

  const filteredAddons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return allAddons.filter((addon) => {
      const matchesTab =
        activeTab === 'installed' ? addon.installed : !addon.installed
      if (!matchesTab) return false
      if (!query) return true

      return (
        addon.name.toLowerCase().includes(query) ||
        addon.description.toLowerCase().includes(query)
      )
    })
  }, [allAddons, activeTab, searchQuery])

  const handleOpenInstallDialog = async (addon: AddonItem) => {
    setSelectedAddon(addon)
    setInstallVersions([{ value: addon.version, label: `v${addon.version}` }])

    if (!addon.installerManifestUrl) {
      setInstallDialogOpen(true)
      return
    }

    try {
      const res = await openAPI.integrations.addons.getInstaller({
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
      {/* Header Bar */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === 'installed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('installed')}
            className="gap-2"
          >
            <LayoutGrid className="h-4 w-4" />
            Instalados ({allAddons.filter((a) => a.installed).length})
          </Button>
          <Button
            variant={activeTab === 'available' ? 'default' : 'outline'}
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
                    {addon.logo ? (
                      <img
                        src={addon.logo}
                        alt={addon.name}
                        className="h-8 w-8 object-contain"
                      />
                    ) : (
                      <span className="text-xl">📦</span>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      addon.installed
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground text-[10px]'
                    }
                  >
                    {addon.installed ? 'Instalado' : 'Disponível'}
                  </Badge>
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

                  {!addon.installed && (
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
    </div>
  )
}
