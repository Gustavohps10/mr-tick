'use client'

import type {
  AddonSettingsAuthCardinality,
  WorkspaceViewModel,
} from '@mr-tick/sdk'
import { isString } from '@mr-tick/shared/helpers'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderKanban, KeyRound, Plus, SlidersHorizontal } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'

import { MappingConfigModal } from '@/components/mapping-config-modal'
import {
  DataSourceInstanceFormData,
  NewDataSourceInstanceForm,
} from '@/components/new-datasource-instance-form'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { ConnectionCard } from '@/pages/addons/components/addon-list'
import type { AddonConnection, ConnectionStatus } from '@/pages/addons/types'

export interface WorkspaceGroupedDataSourceManagerProps {
  addonId: string
  workspaceId?: string
  mode?: 'auth' | 'dataSource'
  cardinality?: AddonSettingsAuthCardinality
}

function resolveConnectionName(
  config: Record<string, unknown> | undefined,
  fallbackId: string,
): string {
  if (config && isString(config.name) && config.name.trim().length > 0) {
    return config.name
  }
  return fallbackId
}

function resolveConnectionUrl(
  config: Record<string, unknown> | undefined,
): string | undefined {
  if (!config) return undefined
  if (isString(config.url) && config.url.trim().length > 0) {
    return config.url
  }
  if (isString(config.baseUrl) && config.baseUrl.trim().length > 0) {
    return config.baseUrl
  }
  if (isString(config.apiUrl) && config.apiUrl.trim().length > 0) {
    return config.apiUrl
  }
  return undefined
}

function resolveConnectionStatus(status?: string): ConnectionStatus {
  if (status === 'connected') return 'connected'
  return 'disconnected'
}

export function WorkspaceGroupedDataSourceManager({
  addonId,
  workspaceId,
  mode = 'auth',
  cardinality = 'multi',
}: WorkspaceGroupedDataSourceManagerProps) {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()

  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null,
  )
  const [connectionTargetId, setConnectionTargetId] = useState<string | null>(
    null,
  )
  const [mappingTargetId, setMappingTargetId] = useState<string | null>(null)
  const [mappingWorkspaceId, setMappingWorkspaceId] = useState<string | null>(
    null,
  )

  const {
    data: workspaces = [],
    isLoading: isLoadingWorkspaces,
    refetch: refetchWorkspaces,
  } = useQuery<WorkspaceViewModel[]>({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const res = await bridge.workspaces.listAll()
      if (!res.isSuccess) throw new Error(res.error)
      if (!res.data) return []
      return res.data
    },
  })

  const connectMutation = useMutation({
    mutationFn: async (data: DataSourceInstanceFormData) => {
      if (!activeWorkspaceId) {
        throw new Error('Nenhum workspace selecionado para esta conexão.')
      }

      const res = await bridge.workspaces.connectDataSource({
        body: {
          workspaceId: activeWorkspaceId,
          pluginId: data.pluginId,
          connectionInstanceId: data.connectionInstanceId,
          credentials: data.credentials,
          configuration: data.configuration,
        },
      })
      return res
    },
    onSuccess: (res) => {
      if (!res?.isSuccess || !res.data) {
        let errorMsg = 'Falha ao conectar instância'
        if (res?.error) errorMsg = res.error
        toast.error(errorMsg)
        return
      }

      toast.success(`${res.data.member.login} conectado com sucesso!`)
      setConnectionDialogOpen(false)
      setConnectionTargetId(null)
      refetchWorkspaces()
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: async ({
      targetWorkspaceId,
      connectionInstanceId,
    }: {
      targetWorkspaceId: string
      connectionInstanceId: string
    }) => {
      const res = await bridge.workspaces.disconnectDataSource({
        body: { workspaceId: targetWorkspaceId, connectionInstanceId },
      })
      if (!res.isSuccess) throw new Error(res.error)
      return res
    },
    onSuccess: () => {
      toast.info('Instância desconectada.')
      refetchWorkspaces()
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const unlinkMutation = useMutation({
    mutationFn: async ({
      targetWorkspaceId,
      connectionInstanceId,
    }: {
      targetWorkspaceId: string
      connectionInstanceId: string
    }) => {
      const res = await bridge.workspaces.unlinkDataSource({
        body: { workspaceId: targetWorkspaceId, connectionInstanceId },
      })
      if (!res.isSuccess) throw new Error(res.error)
      return res
    },
    onSuccess: () => {
      toast.success('Instância removida do workspace.')
      refetchWorkspaces()
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleAddConnection = async (targetWorkspaceId: string) => {
    const unique = crypto.randomUUID().slice(0, 8)
    const newId = `${addonId}-${unique}`
    setActiveWorkspaceId(targetWorkspaceId)
    setConnectionTargetId(newId)

    try {
      await bridge.workspaces.linkDataSource({
        body: {
          workspaceId: targetWorkspaceId,
          dataSourceId: addonId,
          connectionInstanceId: newId,
        },
      })
      setConnectionDialogOpen(true)
    } catch (err) {
      let message = 'Falha ao vincular DataSource'
      if (err instanceof Error) message = err.message
      toast.error(message)
    }
  }

  if (isLoadingWorkspaces) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    )
  }

  const targetWorkspaces = workspaceId
    ? workspaces.filter((w) => w.id === workspaceId)
    : workspaces

  if (targetWorkspaces.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <FolderKanban className="text-muted-foreground/40 mb-3 size-10" />
        <h3 className="text-foreground text-sm font-semibold">
          Nenhum workspace encontrado
        </h3>
        <p className="text-muted-foreground mt-1 max-w-sm text-xs">
          Instâncias de conexão pertencem aos Workspaces. Crie ou abra um
          workspace para gerenciar suas conexões.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="h-full w-full overflow-x-hidden overflow-y-auto">
        <div className="w-full space-y-5 px-6 py-5">
          {targetWorkspaces.map((ws) => {
            let rawConnections = ws.dataSourceConnections
            if (!rawConnections) rawConnections = []

            const connections = rawConnections.filter(
              (c) => c.dataSourceId === addonId,
            )

            const mappedConnections: AddonConnection[] = connections.map(
              (c) => ({
                id: c.id,
                name: resolveConnectionName(c.config, c.id),
                url: resolveConnectionUrl(c.config),
                status: resolveConnectionStatus(c.status),
                member: c.member,
              }),
            )

            const canAddMoreInstances =
              mode === 'auth' &&
              (cardinality === 'multi' || mappedConnections.length === 0)

            return (
              <div
                key={ws.id}
                data-testid={`workspace-datasource-group-${ws.id}`}
                className="bg-card/70 border-border/70 overflow-hidden rounded-lg border shadow-xs"
              >
                {/* Cabeçalho do Workspace */}
                <div className="bg-muted/30 border-border/60 flex items-center justify-between border-b px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar className="border-border/40 size-8 shrink-0 rounded-lg border">
                      <AvatarImage
                        src={ws.avatarUrl}
                        alt={ws.name}
                        className="size-full object-cover"
                      />
                      <AvatarFallback className="bg-primary/10 text-primary rounded-lg text-xs font-semibold">
                        {ws.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-foreground truncate text-xs font-semibold">
                          {ws.name}
                        </h4>
                        {connections.length > 0 ? (
                          <Badge
                            variant="secondary"
                            className="border-emerald-500/20 bg-emerald-500/10 text-[10px] font-medium text-emerald-500"
                          >
                            {connections.length}{' '}
                            {connections.length === 1
                              ? 'conectada'
                              : 'conectadas'}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground text-[10px]"
                          >
                            0 conectadas
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {canAddMoreInstances && (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`add-instance-btn-${ws.id}`}
                      onClick={() => handleAddConnection(ws.id)}
                      className="h-7 cursor-pointer gap-1.5 px-2.5 text-xs font-medium"
                    >
                      <Plus className="size-3.5" />
                      Nova Instância
                    </Button>
                  )}
                </div>

                {/* Conteúdo do Workspace conforme o modo ('auth' vs 'dataSource') */}
                <div className="p-4">
                  {mode === 'auth' && mappedConnections.length > 0 && (
                    <div className="space-y-3">
                      {mappedConnections.map((conn) => (
                        <ConnectionCard
                          key={conn.id}
                          connection={conn}
                          onOpenSettings={(c) => {
                            setActiveWorkspaceId(ws.id)
                            setConnectionTargetId(c.id)
                            setConnectionDialogOpen(true)
                          }}
                          onDisconnect={(c) =>
                            disconnectMutation.mutate({
                              targetWorkspaceId: ws.id,
                              connectionInstanceId: c.id,
                            })
                          }
                          onUninstall={(c) =>
                            unlinkMutation.mutate({
                              targetWorkspaceId: ws.id,
                              connectionInstanceId: c.id,
                            })
                          }
                        />
                      ))}
                    </div>
                  )}

                  {mode === 'auth' && mappedConnections.length === 0 && (
                    <div className="border-border/60 bg-muted/10 rounded-md border border-dashed py-6 text-center">
                      <KeyRound className="text-muted-foreground/50 mx-auto mb-2 size-6" />
                      <p className="text-muted-foreground text-xs">
                        Nenhuma conta de {addonId} conectada neste workspace.
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => handleAddConnection(ws.id)}
                        className="text-primary mt-1 h-6 cursor-pointer text-xs"
                      >
                        Conectar agora
                      </Button>
                    </div>
                  )}

                  {mode === 'dataSource' && mappedConnections.length > 0 && (
                    <div className="space-y-3">
                      {mappedConnections.map((conn) => (
                        <div
                          key={conn.id}
                          data-testid={`datasource-mapping-card-${conn.id}`}
                          className="border-border/60 bg-background/60 flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="text-foreground truncate text-xs font-semibold">
                                {conn.name}
                              </span>
                              {conn.member?.login && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 font-mono text-[10px]"
                                >
                                  @{conn.member.login}
                                </Badge>
                              )}
                            </div>
                            {conn.url && (
                              <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                                {conn.url}
                              </p>
                            )}
                          </div>

                          {conn.status === 'connected' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0 cursor-pointer gap-1.5 text-xs"
                              data-testid={`configure-mapping-instance-btn-${conn.id}`}
                              onClick={() => {
                                setMappingWorkspaceId(ws.id)
                                setMappingTargetId(conn.id)
                              }}
                            >
                              <SlidersHorizontal className="size-3.5" />
                              Configurar Mapeamento
                            </Button>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground shrink-0 text-[10px]"
                            >
                              Autenticação pendente
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {mode === 'dataSource' && mappedConnections.length === 0 && (
                    <div
                      data-testid="datasource-auth-required-empty"
                      className="border-border/60 bg-muted/10 rounded-md border border-dashed px-4 py-6 text-center"
                    >
                      <p className="text-muted-foreground text-xs">
                        Nenhuma instância autenticada neste workspace. Conecte
                        uma conta em <strong>Autenticação</strong> para
                        configurar o mapeamento desta Fonte de Dados.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal de Mapeamento de Campos */}
      {mappingWorkspaceId && mappingTargetId && (
        <MappingConfigModal
          open={Boolean(mappingTargetId)}
          onOpenChange={(open) => {
            if (!open) {
              setMappingTargetId(null)
              setMappingWorkspaceId(null)
            }
          }}
          addonId={addonId}
          workspaceId={mappingWorkspaceId}
          connectionInstanceId={mappingTargetId}
          onSave={() => {
            setMappingTargetId(null)
            setMappingWorkspaceId(null)
          }}
        />
      )}

      {/* Modal de Conexão / Credenciais da Instância */}
      <Dialog
        open={connectionDialogOpen}
        onOpenChange={setConnectionDialogOpen}
      >
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Conectar Instância</DialogTitle>
            <DialogDescription>
              Preencha os parâmetros e credenciais de acesso para esta
              instância.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 pr-1">
            {connectionTargetId && (
              <NewDataSourceInstanceForm
                pluginId={addonId}
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
