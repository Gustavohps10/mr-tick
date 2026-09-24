'use client'

import {
  AddonManifest,
  WorkspaceConnectionDTO,
  WorkspaceDTO,
} from '@mr-tick/application'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import jiraLogo from '@/assets/temp-plugins-icons/jira.png'
import youtrackLogo from '@/assets/temp-plugins-icons/youtrack.png'
import { AddonSettingsPanel } from '@/components/addon-settings-panel'
import {
  DataSourceInstanceFormData,
  NewDataSourceInstanceForm,
} from '@/components/new-datasource-instance-form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDataSourceConnections } from '@/hooks'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { queryClient } from '@/lib'

import { AddonCategory } from './components/addon-category-sidebar'
import {
  AddonDetailsDialog,
  InstallPluginDialog,
} from './components/addon-dialogs'
import { AddonList } from './components/addon-list'
import type { AddonConnection, AddonItem } from './types'

const MOCK_ADDONS: AddonItem[] = [
  {
    id: 'jira-mock',
    name: 'Jira Software',
    description:
      'Importe suas issues e gerencie o tempo diretamente no Mr-tick.',
    author: 'Mr-tick Foundation',
    version: '0.1.0',
    logo: jiraLogo,
    installed: true,
    category: 'integrations',
    connections: [
      {
        id: 'c1',
        name: 'Jira Produção',
        url: 'empresa.atlassian.net',
        status: 'connected',
      },
    ],
  },
  {
    id: 'youtrack-mock',
    name: 'YouTrack',
    description:
      'Sincronização ágil com JetBrains YouTrack para rastreamento de tarefas.',
    author: 'Mr-tick Foundation',
    version: '1.2.4',
    logo: youtrackLogo,
    installed: true,
    category: 'integrations',
    connections: [
      {
        id: 'c2',
        name: 'YouTrack Local',
        url: 'youtrack.internal.com',
        status: 'disconnected',
      },
    ],
  },
]

function getConnections(
  workspace: WorkspaceDTO | null,
): WorkspaceConnectionDTO[] {
  if (!workspace) return []
  return workspace.dataSourceConnections ?? []
}

function connectionMatchesAddon(
  c: WorkspaceConnectionDTO,
  addonId: string,
): boolean {
  return c.dataSourceId === addonId
}

function manifestToAddonItem(
  m: AddonManifest,
  connections: AddonConnection[],
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
    connections,
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

export function AddonsPage() {
  const bridge = useHostBridge()
  const {
    connect,
    disconnect,
    connections: connectionState,
  } = useDataSourceConnections()
  const { workspaceId, category = 'integrations' } = useParams<{
    workspaceId: string
    category: string
  }>()
  const location = useLocation()
  const isAvailable = location.pathname.endsWith('available')

  // Dialogs
  const [installDialogOpen, setInstallDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [configureDialogOpen, setConfigureDialogOpen] = useState(false)

  const [selectedAddon, setSelectedAddon] = useState<AddonItem | null>(null)
  const [connectionTargetId, setConnectionTargetId] = useState<string | null>(
    null,
  )
  const [installVersions, setInstallVersions] = useState<
    { value: string; label: string }[]
  >([])
  const [isInstalling, setIsInstalling] = useState(false)

  const workspaceQueryKey = ['workspace', workspaceId]

  const { data: workspace } = useQuery({
    queryKey: workspaceQueryKey,
    queryFn: async () => {
      if (!workspaceId) return null
      const res = await bridge.workspaces.getById({
        body: { workspaceId },
      })
      return res.data ?? null
    },
    enabled: !!workspaceId,
  })

  const { data: installedList = [] } = useQuery({
    queryKey: ['plugins', 'installed'],
    queryFn: async () => {
      const res = await bridge.addons.listInstalled()
      if (!res.isSuccess)
        throw new Error(res.error ?? 'Falha ao listar plugins instalados')
      return res.data ?? []
    },
  })

  const { data: availableList = [] } = useQuery({
    queryKey: ['plugins', 'available'],
    queryFn: async () => {
      const res = await bridge.addons.listAvailable()
      if (!res.isSuccess)
        throw new Error(res.error ?? 'Falha ao listar plugins disponíveis')
      return res.data ?? []
    },
  })

  const connections = useMemo(
    () => getConnections(workspace ?? null),
    [workspace],
  )

  const addons: AddonItem[] = useMemo(() => {
    const byId = new Map<string, AddonManifest>()
    installedList.forEach((m) => byId.set(m.id, m))
    availableList.forEach((m) => {
      if (!byId.has(m.id)) byId.set(m.id, m)
    })

    const realAddons = Array.from(byId.values()).map((m) => {
      const addonConnections: AddonConnection[] = connections
        .filter((c) => connectionMatchesAddon(c, m.id))
        .map((c) => {
          const state = connectionState.find((s) => s.connectionId === c.id)
          return {
            id: c.id,
            name: (c.config?.name as string) || c.id,
            url:
              (c.config?.url as string) ||
              (c.config?.baseUrl as string) ||
              undefined,
            status:
              state?.status === 'connected' ? 'connected' : 'disconnected',
            lastSync: undefined,
          } satisfies AddonConnection
        })
      return manifestToAddonItem(m, addonConnections, addonCategory(m))
    })

    return [...realAddons, ...MOCK_ADDONS]
  }, [installedList, availableList, connections, connectionState])

  const filteredAddons = useMemo(() => {
    let result = addons.filter((a) => a.category === category)
    if (isAvailable) {
      result = result.filter((a) => !a.installed)
    } else {
      result = result.filter((a) => a.installed)
    }
    return result
  }, [addons, category, isAvailable])

  const linkMutation = useMutation({
    mutationFn: (input: {
      dataSourceId: string
      connectionInstanceId: string
    }) =>
      bridge.workspaces.linkDataSource({
        body: { workspaceId: workspaceId!, ...input },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: workspaceQueryKey }),
    onError: (e: Error) => toast.error(e.message),
  })

  const connectMutation = useMutation({
    mutationFn: (payload: DataSourceInstanceFormData) =>
      connect({
        connectionInstanceId: payload.connectionInstanceId,
        pluginId: payload.pluginId,
        credentials: payload.credentials,
        configuration: payload.configuration,
      }),
    onSuccess: (res) => {
      if (!res?.isSuccess || !res.data) {
        toast.error(res?.error ?? 'Falha ao conectar')
        return
      }
      queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      toast.success(`${res.data.member.login} conectado`)
      setConnectionDialogOpen(false)
      setSelectedAddon(null)
      setConnectionTargetId(null)
    },
    onError: (e: Error) => {
      console.error(e)
      toast.error('Erro inesperado')
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: (connectionInstanceId: string) =>
      bridge.workspaces.disconnectDataSource({
        body: { workspaceId: workspaceId!, connectionInstanceId },
      }),
    onSuccess: async (res, connectionInstanceId) => {
      await disconnect(connectionInstanceId)
      queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      toast.info('Desconectado.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const unlinkMutation = useMutation({
    mutationFn: (connectionInstanceId: string) =>
      bridge.workspaces.unlinkDataSource({
        body: { workspaceId: workspaceId!, connectionInstanceId },
      }),
    onSuccess: async (res, connectionInstanceId) => {
      await disconnect(connectionInstanceId)
      queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      toast.info('Removido.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleInstall = (addon: AddonItem, version: string) => {
    if (!addon.installerManifestUrl) return
    setIsInstalling(true)
    bridge.addons
      .getInstaller({ body: { installerUrl: addon.installerManifestUrl } })
      .then((installer) => {
        const pkg = installer.data?.packages.find((p) => p.version === version)
        if (!pkg) throw new Error('Versão não encontrada.')
        return bridge.addons.install({
          body: { downloadUrl: pkg.downloadUrl },
        })
      })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['plugins'] })
        toast.success('Instalado.')
        setInstallDialogOpen(false)
      })
      .catch((e: Error) => toast.error(e?.message ?? 'Erro'))
      .finally(() => setIsInstalling(false))
  }

  const handleOpenInstallDialog = (addon: AddonItem) => {
    if (!addon.installerManifestUrl) {
      setSelectedAddon(addon)
      setDetailsDialogOpen(true)
      return
    }
    setSelectedAddon(addon)
    bridge.addons
      .getInstaller({ body: { installerUrl: addon.installerManifestUrl } })
      .then(
        (installer) => {
          setInstallVersions(
            installer.data?.packages.map((p) => ({
              value: p.version,
              label: `v${p.version}`,
            })) ?? [],
          )
          setInstallDialogOpen(true)
        },
        (error: Error) => toast.error(error.message),
      )
  }

  const handleAddConnection = async (addon: AddonItem) => {
    setSelectedAddon(addon)
    const unique = crypto.randomUUID().slice(0, 8)
    const newId = `${addon.id}-${unique}`
    try {
      await linkMutation.mutateAsync({
        dataSourceId: addon.id,
        connectionInstanceId: newId,
      })
      setConnectionTargetId(newId)
      setConnectionDialogOpen(true)
    } catch {}
  }

  const handleOpenSettings = (
    addon: AddonItem,
    connection: AddonConnection,
  ) => {
    const state = connectionState.find((s) => s.connectionId === connection.id)
    if (state?.status === 'connected') {
      toast.error('Desconecte antes de reconfigurar.')
      return
    }
    setSelectedAddon(addon)
    setConnectionTargetId(connection.id)
    setConnectionDialogOpen(true)
  }

  const handleConnectDataSource = (data: DataSourceInstanceFormData) => {
    connectMutation.mutate(data)
  }

  const handleDisconnect = (_addon: AddonItem, connection: AddonConnection) =>
    disconnectMutation.mutate(connection.id)
  const handleUninstall = (_addon: AddonItem, connection: AddonConnection) =>
    unlinkMutation.mutate(connection.id)

  return (
    <>
      <AddonList
        addons={filteredAddons}
        onInstall={handleOpenInstallDialog}
        onDetails={(a) => {
          setSelectedAddon(a)
          setDetailsDialogOpen(true)
        }}
        onAddConnection={handleAddConnection}
        onOpenSettings={handleOpenSettings}
        onDisconnect={handleDisconnect}
        onUpdate={() => toast.info('Atualização em breve.')}
        onUninstall={handleUninstall}
        onConfigure={(a) => {
          setSelectedAddon(a)
          setConfigureDialogOpen(true)
        }}
      />

      <InstallPluginDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        addon={selectedAddon}
        versions={installVersions}
        onInstall={handleInstall}
        isInstalling={isInstalling}
      />

      <Dialog
        open={configureDialogOpen}
        onOpenChange={(open) => {
          setConfigureDialogOpen(open)
          if (!open) setSelectedAddon(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedAddon?.logo && (
                <span className="bg-secondary flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border">
                  <img
                    src={selectedAddon.logo}
                    alt={selectedAddon.name}
                    className="h-6 w-6 object-contain"
                  />
                </span>
              )}
              Configurar {selectedAddon?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {selectedAddon && <AddonSettingsPanel addonId={selectedAddon.id} />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={connectionDialogOpen}
        onOpenChange={(open) => {
          setConnectionDialogOpen(open)
          if (!open) {
            setConnectionTargetId(null)
            setSelectedAddon(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedAddon?.logo && (
                <span className="bg-secondary flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border">
                  <img
                    src={selectedAddon.logo}
                    alt={selectedAddon.name}
                    className="h-6 w-6 object-contain"
                  />
                </span>
              )}
              Conectar {selectedAddon?.name}
            </DialogTitle>
            <DialogDescription>
              Preencha as credenciais para autenticar esta instância.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {selectedAddon && connectionTargetId && (
              <NewDataSourceInstanceForm
                pluginId={selectedAddon.id}
                connectionInstanceId={connectionTargetId}
                isSubmitting={connectMutation.isPending}
                onSubmit={handleConnectDataSource}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddonDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        addon={selectedAddon}
        onInstall={(a) => {
          setDetailsDialogOpen(false)
          handleOpenInstallDialog(a)
        }}
      />
    </>
  )
}
