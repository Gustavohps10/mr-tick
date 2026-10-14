'use client'

import type { WorkspaceViewModel } from '@mr-tick/sdk'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderKanban, Plus, SlidersHorizontal } from 'lucide-react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { ConnectionCard } from '@/pages/addons/components/addon-list'
import type { ConnectionStatus } from '@/pages/addons/types'

export interface WorkspaceGroupedDataSourceManagerProps {
  addonId: string
}

export function WorkspaceGroupedDataSourceManager({
  addonId,
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
      return res.data ?? []
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
        toast.error(res?.error ?? 'Falha ao conectar instância')
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
      workspaceId,
      connectionInstanceId,
    }: {
      workspaceId: string
      connectionInstanceId: string
    }) => {
      const res = await bridge.workspaces.disconnectDataSource({
        body: { workspaceId, connectionInstanceId },
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
      workspaceId,
      connectionInstanceId,
    }: {
      workspaceId: string
      connectionInstanceId: string
    }) => {
      const res = await bridge.workspaces.unlinkDataSource({
        body: { workspaceId, connectionInstanceId },
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

  const handleAddConnection = async (workspaceId: string) => {
    const unique = crypto.randomUUID().slice(0, 8)
    const newId = `${addonId}-${unique}`
    setActiveWorkspaceId(workspaceId)
    setConnectionTargetId(newId)

    try {
      await bridge.workspaces.linkDataSource({
        body: {
          workspaceId,
          dataSourceId: addonId,
          connectionInstanceId: newId,
        },
      })
      setConnectionDialogOpen(true)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Falha ao vincular DataSource'
      toast.error(message)
    }
  }

  if (isLoadingWorkspaces) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    )
  }

  if (workspaces.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <FolderKanban className="text-muted-foreground/40 mb-3 size-10" />
        <h3 className="text-foreground text-sm font-semibold">
          Nenhum workspace encontrado
        </h3>
        <p className="text-muted-foreground mt-1 max-w-sm text-xs">
          Instâncias de conexão pertencem aos Workspaces. Crie ou abra um
          workspace para gerenciar suas conexões com este DataSource.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ScrollArea className="h-full w-full">
        <div className="w-full space-y-6 px-8 py-6">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                Workspaces & Instâncias Conectadas
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Contas e conexões ativas deste provedor organizadas por
                Workspace.
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {workspaces.length}{' '}
              {workspaces.length === 1 ? 'Workspace' : 'Workspaces'}
            </Badge>
          </div>

          <div className="space-y-5">
            {workspaces.map((ws) => {
              const connections = (ws.dataSourceConnections ?? []).filter(
                (c) => c.dataSourceId === addonId,
              )
              const mappedConnections = connections.map((c) => ({
                id: c.id,
                name: (c.config?.name as string) || c.id,
                url:
                  (c.config?.url as string) ||
                  (c.config?.baseUrl as string) ||
                  undefined,
                status: (c.status === 'connected'
                  ? 'connected'
                  : 'disconnected') as ConnectionStatus,
                member: c.member,
              }))

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
                  </div>

                  {/* Lista de Instâncias deste Workspace */}
                  <div className="p-4">
                    {mappedConnections.length > 0 ? (
                      <div className="space-y-3">
                        {mappedConnections.map((conn) => (
                          <div key={conn.id} className="space-y-1.5">
                            <ConnectionCard
                              connection={conn}
                              onOpenSettings={(c) => {
                                setActiveWorkspaceId(ws.id)
                                setConnectionTargetId(c.id)
                                setConnectionDialogOpen(true)
                              }}
                              onDisconnect={(c) =>
                                disconnectMutation.mutate({
                                  workspaceId: ws.id,
                                  connectionInstanceId: c.id,
                                })
                              }
                              onUninstall={(c) =>
                                unlinkMutation.mutate({
                                  workspaceId: ws.id,
                                  connectionInstanceId: c.id,
                                })
                              }
                            />

                            {conn.status === 'connected' && (
                              <div className="flex justify-end px-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 cursor-pointer gap-1.5 text-xs"
                                  data-testid={`configure-mapping-instance-btn-${conn.id}`}
                                  onClick={() => {
                                    setMappingWorkspaceId(ws.id)
                                    setMappingTargetId(conn.id)
                                  }}
                                >
                                  <SlidersHorizontal className="size-3.5" />
                                  Configurar Mapeamento
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border-border/60 bg-muted/10 rounded-md border border-dashed py-5 text-center">
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
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </ScrollArea>

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
