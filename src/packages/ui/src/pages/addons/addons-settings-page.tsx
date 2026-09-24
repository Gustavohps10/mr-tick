'use client'

import type {
  AddonManifest,
  WorkspaceConnectionDTO,
  WorkspaceDTO,
} from '@mr-tick/application'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Database,
  GlobeIcon,
  Palette,
  Plus,
  Settings2,
  Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AddonSettingsPanel } from '@/components/addon-settings-panel'
import {
  DataSourceInstanceFormData,
  NewDataSourceInstanceForm,
} from '@/components/new-datasource-instance-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDataSourceConnections } from '@/contexts/DataSourceConnectionsContext'
import { useHostBridge } from '@/hooks'

import type { AddonCapabilityType } from './components/addon-category-sidebar'
import { ConnectionCard } from './components/addon-list'
import type { AddonConnection, AddonItem } from './types'

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

export function AddonsSettingsPage() {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const { workspaceId, capability = 'data-sources' } = useParams<{
    workspaceId?: string
    capability?: AddonCapabilityType
  }>()

  const {
    connect,
    disconnect,
    connections: connectionState,
  } = useDataSourceConnections()

  const [selectedAddon, setSelectedAddon] = useState<AddonItem | null>(null)
  const [connectionTargetId, setConnectionTargetId] = useState<string | null>(
    null,
  )
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [configureDialogOpen, setConfigureDialogOpen] = useState(false)

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
      if (!res.isSuccess) {
        throw new Error(res.error ?? 'Falha ao listar plugins instalados')
      }
      return res.data ?? []
    },
  })

  const connections = useMemo(
    () => getConnections(workspace ?? null),
    [workspace],
  )

  const installedAddons: AddonItem[] = useMemo(() => {
    return installedList.map((m: AddonManifest) => {
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

      const tags = (m.tags ?? []).map((t) => t.toLowerCase())
      const name = m.name.toLowerCase()

      let category: AddonItem['category'] = 'integrations'
      if (tags.some((t) => t.includes('theme') || t === 'tema')) {
        category = 'themes'
      } else if (tags.some((t) => t.includes('util') || t === 'utility')) {
        category = 'utilities'
      } else if (
        tags.some((t) => t.includes('watch') || t === 'watcher') ||
        tags.includes('ia') ||
        tags.includes('ai') ||
        name.includes('ia ') ||
        name.includes(' ai') ||
        name.includes('discord')
      ) {
        category = 'watchers'
      }

      return {
        id: m.id,
        name: m.name,
        description: m.description ?? '',
        author: m.creator ?? '',
        version: m.version,
        logo: m.logo ?? '',
        installed: true,
        category,
        connections: addonConnections,
        documentationUrl: m.sourceUrl,
        installerManifestUrl: m.installerManifestUrl,
      } satisfies AddonItem
    })
  }, [installedList, connections, connectionState])

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

  const unlinkMutation = useMutation({
    mutationFn: (connectionInstanceId: string) =>
      bridge.workspaces.unlinkDataSource({
        body: { workspaceId: workspaceId!, connectionInstanceId },
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
      setConnectionTargetId(null)
      setSelectedAddon(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const disconnectMutation = useMutation({
    mutationFn: (connectionId: string) => disconnect(connectionId),
    onSuccess: () => toast.success('Instância desconectada.'),
    onError: (e: Error) => toast.error(e.message),
  })

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
    } catch {
      // Handled in onError
    }
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

  // Filter addons by section
  const sectionAddons = useMemo(() => {
    if (capability === 'data-sources') {
      return installedAddons.filter((a) => a.category === 'integrations')
    }
    if (capability === 'watchers') {
      return installedAddons.filter((a) => a.category === 'watchers')
    }
    if (capability === 'themes') {
      return installedAddons.filter((a) => a.category === 'themes')
    }
    if (capability === 'utilities') {
      return installedAddons.filter((a) => a.category === 'utilities')
    }
    return []
  }, [installedAddons, capability])

  return (
    <div className="space-y-6">
      {/* Capability Title Header */}
      <div className="border-b pb-4">
        {capability === 'data-sources' && (
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Database className="text-primary h-5 w-5" />
              Fontes de Dados & Gestão de Tarefas
            </h2>
            <p className="text-muted-foreground text-xs">
              Gerencie suas instâncias de conexão e credenciais de acesso para
              sincronizar tarefas (Jira, Redmine, YouTrack).
            </p>
          </div>
        )}

        {capability === 'watchers' && (
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <GlobeIcon className="text-primary h-5 w-5" />
              Watchers & Observadores de Atividade
            </h2>
            <p className="text-muted-foreground text-xs">
              Configure o comportamento de captura passiva e regras de tempo
              para Discord, Git, IDEs e automações.
            </p>
          </div>
        )}

        {capability === 'utilities' && (
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Wrench className="text-primary h-5 w-5" />
              Utilitários & Inteligência Artificial
            </h2>
            <p className="text-muted-foreground text-xs">
              Ajuste configurações de relatórios, exportações e assistentes de
              IA do workspace.
            </p>
          </div>
        )}

        {capability === 'themes' && (
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Palette className="text-primary h-5 w-5" />
              Temas & Aparência da Interface
            </h2>
            <p className="text-muted-foreground text-xs">
              Personalize esquemas de cores e estilos visuais instalados no
              Mr-tick.
            </p>
          </div>
        )}
      </div>

      {/* Empty State */}
      {sectionAddons.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground font-medium">
            Nenhum addon configurável nesta categoria
          </p>
          <p className="text-muted-foreground mt-1 text-xs opacity-70">
            Instale novos plugins através da Loja de Addons para habilitar esta
            seção.
          </p>
        </div>
      )}

      {/* Render DataSources View */}
      {capability === 'data-sources' && sectionAddons.length > 0 && (
        <div className="space-y-4">
          {sectionAddons.map((addon) => (
            <div
              key={addon.id}
              className="bg-card border-border space-y-3 rounded-lg border p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-secondary/40 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                    {addon.logo ? (
                      <img
                        src={addon.logo}
                        alt={addon.name}
                        className="h-7 w-7 object-contain"
                      />
                    ) : (
                      <span className="text-lg">📦</span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{addon.name}</h3>
                    <p className="text-muted-foreground text-xs">
                      {addon.description}
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddConnection(addon)}
                  className="gap-1.5 rounded-lg text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nova Instância
                </Button>
              </div>

              {/* Instances list */}
              <div className="space-y-2 border-t pt-2">
                {addon.connections.length > 0 ? (
                  addon.connections.map((conn) => (
                    <ConnectionCard
                      key={conn.id}
                      connection={conn}
                      onOpenSettings={(c) => handleOpenSettings(addon, c)}
                      onDisconnect={(c) => disconnectMutation.mutate(c.id)}
                      onUninstall={(c) => unlinkMutation.mutate(c.id)}
                    />
                  ))
                ) : (
                  <p className="text-muted-foreground py-2 text-xs italic">
                    Nenhuma instância de {addon.name} configurada neste
                    workspace.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Render Watchers / Utilities / Themes View */}
      {capability !== 'data-sources' && sectionAddons.length > 0 && (
        <div className="space-y-4">
          {sectionAddons.map((addon) => {
            let storedUser: {
              avatarUrl?: string
              global_name?: string
              username?: string
            } | null = null
            try {
              const raw = localStorage.getItem(
                `addon_user_${workspaceId ?? 'default'}_${addon.id}`,
              )
              if (raw) storedUser = JSON.parse(raw)
            } catch {
              storedUser = null
            }

            return (
              <div
                key={addon.id}
                className="bg-card border-border flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-secondary/40 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                    {addon.logo ? (
                      <img
                        src={addon.logo}
                        alt={addon.name}
                        className="h-7 w-7 object-contain"
                      />
                    ) : (
                      <span className="text-lg">📦</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{addon.name}</h3>
                      <Badge
                        variant="outline"
                        className="rounded-md text-[10px]"
                      >
                        v{addon.version}
                      </Badge>
                      {storedUser && (
                        <Badge
                          variant="outline"
                          className="gap-1 rounded-md border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                        >
                          Conectado
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {addon.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {storedUser && (
                    <div className="bg-secondary/30 border-border/60 flex items-center gap-2 rounded-lg border px-2.5 py-1">
                      {storedUser.avatarUrl ? (
                        <img
                          src={storedUser.avatarUrl}
                          alt={
                            storedUser.global_name ??
                            storedUser.username ??
                            'Avatar'
                          }
                          className="h-6 w-6 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="bg-primary/10 flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold">
                          {
                            (storedUser.global_name ??
                              storedUser.username ??
                              'U')[0]
                          }
                        </div>
                      )}
                      <span className="text-foreground text-xs font-medium">
                        {storedUser.global_name ?? storedUser.username}
                      </span>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 rounded-lg text-xs"
                    onClick={() => {
                      setSelectedAddon(addon)
                      setConfigureDialogOpen(true)
                    }}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Configurar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
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
              Preencha as credenciais para autenticar esta instância de
              DataSource.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {selectedAddon && connectionTargetId && (
              <NewDataSourceInstanceForm
                pluginId={selectedAddon.id}
                connectionInstanceId={connectionTargetId}
                isSubmitting={connectMutation.isPending}
                onSubmit={(data) => connectMutation.mutate(data)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
