'use client'

import {
  AddonManifestViewModel,
  WorkspaceConnectionDTO,
  WorkspaceDTO,
} from '@mr-tick/application'
import {
  compareSemVer,
  isApiVersionCompatible,
  isString,
  parseSemVer,
} from '@mr-tick/shared/helpers'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import jiraLogo from '@/assets/temp-plugins-icons/jira.png'
import youtrackLogo from '@/assets/temp-plugins-icons/youtrack.png'
import { AddonSettingsPanel } from '@/components/addon-settings-panel'
import {
  AddonInstallModal,
  AddonInstallTarget,
} from '@/components/addons-manager/addon-install-modal'
import {
  LicenseActivationDialog,
  useLicensingState,
} from '@/components/addons-manager/license-settings-card'
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

function getConnections(
  workspace: WorkspaceDTO | null | undefined,
): WorkspaceConnectionDTO[] {
  if (!workspace || !workspace.dataSourceConnections) {
    return []
  }
  return workspace.dataSourceConnections
}

function connectionMatchesAddon(
  c: WorkspaceConnectionDTO,
  addonId: string,
): boolean {
  return c.dataSourceId === addonId
}

function resolveConnectionName(c: WorkspaceConnectionDTO): string {
  const rawName = c.config?.name
  if (isString(rawName) && rawName.length > 0) {
    return rawName
  }
  return c.id
}

function resolveConnectionUrl(c: WorkspaceConnectionDTO): string | undefined {
  const rawUrl = c.config?.url
  if (isString(rawUrl) && rawUrl.length > 0) {
    return rawUrl
  }
  const rawBaseUrl = c.config?.baseUrl
  if (isString(rawBaseUrl) && rawBaseUrl.length > 0) {
    return rawBaseUrl
  }
  return undefined
}

function resolveConnectionStatusValue(
  status: string | undefined,
): 'connected' | 'disconnected' {
  if (status === 'connected') {
    return 'connected'
  }
  return 'disconnected'
}

function resolveRequiredApiVersion(
  updateAvailable: boolean,
  remoteRequired: string | undefined,
  localRequired: string | undefined,
): string | undefined {
  if (updateAvailable) {
    return remoteRequired
  }
  return localRequired
}

function manifestToAddonItem(
  m: AddonManifestViewModel,
  connections: AddonConnection[],
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
    connections,
    documentationUrl: m.sourceUrl,
    installerManifestUrl: m.installerManifestUrl,
    tier: m.tier,
    sha256: m.sha256,
    size: m.size,
    updateAvailable: m.updateAvailable,
    latestVersion: m.latestVersion,
    latestDownloadUrl: m.latestDownloadUrl,
    latestSha256: m.latestSha256,
    latestSize: m.latestSize,
    requiredApiVersion: m.requiredApiVersion,
    changelog: m.changelog,
    incompatibleUpdate: m.incompatibleUpdate,
    incompatibleReason: m.incompatibleReason,
  }
}

function addonCategory(m: AddonManifestViewModel): AddonCategory {
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

export function AddonsPage() {
  const bridge = useHostBridge()
  const { data: licenseState } = useLicensingState()
  const { data: sdkVersion = '0.5.0' } = useQuery({
    queryKey: ['sdkVersion'],
    queryFn: () => bridge.system.getSdkVersion(),
    staleTime: Infinity,
  })
  const [operation, setOperation] = useState<'install' | 'update'>('install')
  const [jobTarget, setJobTarget] = useState<AddonInstallTarget | null>(null)
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
  const [activationDialogOpen, setActivationDialogOpen] = useState(false)

  const [selectedAddon, setSelectedAddon] = useState<AddonItem | null>(null)
  const [connectionTargetId, setConnectionTargetId] = useState<string | null>(
    null,
  )
  const [installVersions, setInstallVersions] = useState<
    { value: string; label: string }[]
  >([])
  const [isInstalling, setIsInstalling] = useState(false)

  const isPlusAuthorized = Boolean(licenseState?.isPlusActive)

  const workspaceQueryKey = ['workspace', workspaceId]

  const { data: workspace } = useQuery({
    queryKey: workspaceQueryKey,
    queryFn: async () => {
      if (!workspaceId) {
        return null
      }
      const res = await bridge.workspaces.getById({
        body: { workspaceId },
      })
      if (!res.data) {
        return null
      }
      return res.data
    },
    enabled: Boolean(workspaceId),
  })

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

  const connections = useMemo(() => getConnections(workspace), [workspace])

  const addons: AddonItem[] = useMemo(() => {
    const byId = new Map<string, AddonManifestViewModel>()
    installedList.forEach((m) => {
      const previous = byId.get(m.id)
      const previousVersion = previous && parseSemVer(previous.version)
      const candidateVersion = parseSemVer(m.version)
      if (
        previousVersion &&
        (!candidateVersion ||
          compareSemVer(candidateVersion, previousVersion) <= 0)
      ) {
        return
      }
      const match = availableList.find((av) => av.id === m.id)
      let updateAvailable = false
      let latestVersion = m.version
      let latestDownloadUrl = m.downloadUrl
      let latestSha256 = m.sha256
      let latestSize = m.size
      let changelog = m.changelog

      if (match) {
        const parsedRemote = parseSemVer(match.version)
        const parsedLocal = parseSemVer(m.version)
        if (
          parsedRemote &&
          parsedLocal &&
          compareSemVer(parsedRemote, parsedLocal) > 0 &&
          isApiVersionCompatible(match.requiredApiVersion, sdkVersion)
        ) {
          updateAvailable = true
          latestVersion = match.version
          latestDownloadUrl = match.downloadUrl
          latestSha256 = match.sha256
          latestSize = match.size
          changelog = match.changelog
        }
      }

      byId.set(m.id, {
        ...m,
        updateAvailable,
        latestVersion,
        latestDownloadUrl,
        latestSha256,
        latestSize,
        requiredApiVersion: resolveRequiredApiVersion(
          updateAvailable,
          match?.requiredApiVersion,
          m.requiredApiVersion,
        ),
        changelog,
      })
    })

    availableList.forEach((m) => {
      if (!byId.has(m.id)) {
        byId.set(m.id, m)
      }
    })

    const realAddons = Array.from(byId.values()).map((m) => {
      const addonConnections: AddonConnection[] = connections
        .filter((c) => connectionMatchesAddon(c, m.id))
        .map((c) => {
          const state = connectionState.find((s) => s.connectionId === c.id)
          const item: AddonConnection = {
            id: c.id,
            name: resolveConnectionName(c),
            url: resolveConnectionUrl(c),
            status: resolveConnectionStatusValue(state?.status),
            lastSync: undefined,
          }
          return item
        })
      return manifestToAddonItem(m, addonConnections, addonCategory(m))
    })

    return [...realAddons, ...MOCK_ADDONS]
  }, [installedList, availableList, connections, connectionState, sdkVersion])

  useEffect(() => {
    const upgradable = addons.filter((a) =>
      Boolean(a.installed && a.updateAvailable),
    )
    if (upgradable.length > 0) {
      const names = upgradable
        .map((a) => `${a.name} (v${a.latestVersion})`)
        .join(', ')
      toast.info(`Atualização disponível para: ${names}`, {
        id: 'addons-update-notification',
      })
    }
  }, [addons])

  const filteredAddons = useMemo(() => {
    const byCategory = addons.filter((a) => a.category === category)
    if (isAvailable) {
      return byCategory.filter((a) => !a.installed)
    }
    return byCategory.filter((a) => a.installed)
  }, [addons, category, isAvailable])

  const linkMutation = useMutation({
    mutationFn: (input: {
      dataSourceId: string
      connectionInstanceId: string
    }) => {
      let currentWorkspaceId = ''
      if (workspaceId) {
        currentWorkspaceId = workspaceId
      }
      return bridge.workspaces.linkDataSource({
        body: { workspaceId: currentWorkspaceId, ...input },
      })
    },
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
        toast.error(resolveErrorMessage(res?.error, 'Falha ao conectar'))
        return
      }
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
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
    mutationFn: (connectionInstanceId: string) => {
      let currentWorkspaceId = ''
      if (workspaceId) {
        currentWorkspaceId = workspaceId
      }
      return bridge.workspaces.disconnectDataSource({
        body: { workspaceId: currentWorkspaceId, connectionInstanceId },
      })
    },
    onSuccess: async (res, connectionInstanceId) => {
      void res
      await disconnect(connectionInstanceId)
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      toast.info('Desconectado.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const unlinkMutation = useMutation({
    mutationFn: (connectionInstanceId: string) => {
      let currentWorkspaceId = ''
      if (workspaceId) {
        currentWorkspaceId = workspaceId
      }
      return bridge.workspaces.unlinkDataSource({
        body: { workspaceId: currentWorkspaceId, connectionInstanceId },
      })
    },
    onSuccess: async (res, connectionInstanceId) => {
      void res
      await disconnect(connectionInstanceId)
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      toast.info('Removido.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleInstall = (addon: AddonItem, version: string) => {
    if (!addon.installerManifestUrl) {
      return
    }
    setIsInstalling(true)
    bridge.addons
      .getInstaller({ body: { installerUrl: addon.installerManifestUrl } })
      .then(
        (installer) => {
          const pkg = installer.data?.packages.find(
            (item) => item.version === version,
          )
          if (!installer.isSuccess || !pkg?.downloadUrl) {
            toast.error(
              resolveErrorMessage(installer.error, 'Versão não encontrada.'),
            )
            return
          }
          let expectedSha256 = pkg.sha256
          if (!expectedSha256) {
            expectedSha256 = addon.sha256
          }
          setOperation('install')
          setInstallDialogOpen(false)
          setJobTarget({
            id: addon.id,
            name: addon.name,
            version: pkg.version,
            downloadUrl: pkg.downloadUrl,
            expectedSha256,
            requiredApiVersion: pkg.requiredApiVersion,
          })
        },
        () => toast.error('Falha ao obter instalador do addon.'),
      )
      .finally(() => setIsInstalling(false))
  }

  const handleOpenInstallDialog = (addon: AddonItem) => {
    if (addon.tier === 'plus' && !isPlusAuthorized) {
      setSelectedAddon(addon)
      setActivationDialogOpen(true)
      return
    }
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
          let versions: { value: string; label: string }[] = []
          if (installer.data?.packages) {
            versions = installer.data.packages.map((p) => ({
              value: p.version,
              label: `v${p.version}`,
            }))
          }
          setInstallVersions(versions)
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

  const handleDisconnect = (addon: AddonItem, connection: AddonConnection) => {
    void addon
    disconnectMutation.mutate(connection.id)
  }
  const handleUninstall = (addon: AddonItem, connection: AddonConnection) => {
    void addon
    unlinkMutation.mutate(connection.id)
  }

  const handleUpdate = (addon: AddonItem) => {
    if (addon.tier === 'plus' && !isPlusAuthorized) {
      setSelectedAddon(addon)
      setActivationDialogOpen(true)
      return
    }
    if (!addon.latestDownloadUrl || !addon.latestVersion) {
      toast.error('URL de download da atualização não disponível.')
      return
    }
    setOperation('update')
    setJobTarget({
      id: addon.id,
      name: addon.name,
      version: addon.latestVersion,
      downloadUrl: addon.latestDownloadUrl,
      expectedSha256: addon.latestSha256,
      requiredApiVersion: addon.requiredApiVersion,
    })
  }

  return (
    <div className="space-y-6">
      <AddonInstallModal
        addon={jobTarget}
        open={jobTarget !== null}
        operation={operation}
        onOpenChange={(open) => {
          if (!open) {
            setJobTarget(null)
          }
        }}
      />
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
        onUpdate={handleUpdate}
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
          if (!open) {
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

      <LicenseActivationDialog
        open={activationDialogOpen}
        onOpenChange={setActivationDialogOpen}
        onActivated={() => {
          if (selectedAddon) {
            handleOpenInstallDialog(selectedAddon)
          }
        }}
      />
    </div>
  )
}
