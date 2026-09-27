import { AddonSettingsField, AddonSettingsTab } from '@mr-tick/application'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  DataSourceInstanceFormData,
  NewDataSourceInstanceForm,
} from '@/components/new-datasource-instance-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDataSourceConnections } from '@/contexts/DataSourceConnectionsContext'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { ConnectionCard } from '@/pages/addons/components/addon-list'

import { AddonFieldRenderer } from './addon-field-renderer'

export function AddonSettingsRenderer({ addonId }: { addonId: string }) {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()

  const { data: schema, isLoading: isLoadingSchema } = useQuery({
    queryKey: ['addon-schema', addonId],
    queryFn: async () => {
      const res = await bridge.addons.getSchema({
        body: { addonId },
      })
      if (!res.isSuccess) throw new Error(res.error)
      return res.data
    },
  })

  const { data: savedSettings = {}, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['addon-settings', addonId],
    queryFn: async () => {
      const res = await bridge.addons.getSettings({
        body: { addonId },
      })
      if (!res.isSuccess) throw new Error(res.error)
      return res.data ?? {}
    },
  })

  const [formValues, setFormValues] = useState<
    Record<string, string | number | boolean | null>
  >({})

  useEffect(() => {
    if (savedSettings) {
      setFormValues({ ...savedSettings })
    }
  }, [savedSettings])

  const saveMutation = useMutation({
    mutationFn: async (
      values: Record<string, string | number | boolean | null>,
    ) => {
      const res = await bridge.addons.saveSettings({
        body: { addonId, settings: values },
      })
      if (!res.isSuccess) throw new Error(res.error)
      return res
    },
    onSuccess: () => {
      toast.success('Configurações salvas com sucesso!')
      queryClient.invalidateQueries({ queryKey: ['addon-settings', addonId] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao salvar configurações')
    },
  })

  const handleFieldChange = (
    fieldId: string,
    value: string | number | boolean | null,
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }))
  }

  const handleReset = () => {
    setFormValues({ ...savedSettings })
    toast.info('Alterações descartadas.')
  }

  const handleSave = () => {
    saveMutation.mutate(formValues)
  }

  if (isLoadingSchema || isLoadingSettings) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!schema || (Array.isArray(schema) && schema.length === 0)) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
        Este addon não possui configurações disponíveis.
      </div>
    )
  }

  const isTabbed =
    Array.isArray(schema) &&
    schema.length > 0 &&
    ('groups' in schema[0] || 'fields' in schema[0])

  const tabs: AddonSettingsTab[] = isTabbed
    ? (schema as AddonSettingsTab[])
    : [
        {
          id: 'general',
          label: 'Geral',
          fields: schema as AddonSettingsField[],
        },
      ]

  const defaultTab = tabs[0]?.id

  return (
    <div className="bg-card/50 flex h-full flex-1 flex-col">
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">{addonId}</h2>
        <p className="text-muted-foreground text-sm">
          Configure os parâmetros deste addon
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <Tabs defaultValue={defaultTab} className="w-full">
          {tabs.length > 1 && (
            <TabsList className="mb-4">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="m-0 space-y-6">
              {tab.description && (
                <p className="text-muted-foreground mb-4 text-sm">
                  {tab.description}
                </p>
              )}

              {tab.groups
                ? tab.groups.map((group) => (
                    <div key={group.id} className="space-y-4">
                      <div className="border-b pb-2">
                        <h3 className="text-sm font-medium">{group.label}</h3>
                        {group.description && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {group.description}
                          </p>
                        )}
                      </div>
                      <div className="grid max-w-2xl gap-4">
                        {group.fields.map((field) => (
                          <FieldRenderer
                            key={field.id}
                            field={field}
                            addonId={addonId}
                            value={formValues[field.id]}
                            onChange={handleFieldChange}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                : tab.fields?.map((field) => (
                    <div key={field.id} className="grid max-w-2xl gap-4">
                      <FieldRenderer
                        field={field}
                        addonId={addonId}
                        value={formValues[field.id]}
                        onChange={handleFieldChange}
                      />
                    </div>
                  ))}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div className="bg-muted/20 flex justify-end gap-2 border-t p-4">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={saveMutation.isPending}
        >
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Salvar
        </Button>
      </div>
    </div>
  )
}

function DataSourceInstancesManager({ addonId }: { addonId: string }) {
  const queryClient = useQueryClient()
  const connectionsCtx = useDataSourceConnections()
  const {
    connections: connectionState,
    disconnect,
    link,
    connect,
  } = connectionsCtx

  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [connectionTargetId, setConnectionTargetId] = useState<string | null>(
    null,
  )

  const unlinkMutation = useMutation({
    mutationFn: (connectionInstanceId: string) =>
      connectionsCtx.unlink(connectionInstanceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const connectMutation = useMutation({
    mutationFn: (data: DataSourceInstanceFormData) =>
      connect({
        connectionInstanceId: data.connectionInstanceId,
        pluginId: data.pluginId,
        credentials: data.credentials,
        configuration: data.configuration,
      }),
    onSuccess: (res) => {
      if (!res?.isSuccess || !res.data) {
        toast.error(res?.error ?? 'Falha ao conectar')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      toast.success(`${res.data.member.login} conectado`)
      setConnectionDialogOpen(false)
      setConnectionTargetId(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleAddConnection = async () => {
    const unique = crypto.randomUUID().slice(0, 8)
    const newId = `${addonId}-${unique}`
    try {
      await link({
        pluginId: addonId,
        connectionInstanceId: newId,
      })
      setConnectionTargetId(newId)
      setConnectionDialogOpen(true)
    } catch {
      // Handled in onError
    }
  }

  const myConnections = connectionState
    .filter((c) => c.dataSourceId === addonId)
    .map((c) => ({
      id: c.connectionId,
      name: (c.config?.name as string) || c.connectionId,
      url:
        (c.config?.url as string) || (c.config?.baseUrl as string) || undefined,
      status: (c.status === 'connected'
        ? 'connected'
        : 'disconnected') as import('@/pages/addons/types').ConnectionStatus,
    }))

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <h3 className="text-sm font-medium">Instâncias Conectadas</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Gerencie múltiplas conexões para este DataSource.
          </p>
        </div>
        <Button size="sm" onClick={handleAddConnection} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nova Instância
        </Button>
      </div>
      <div className="space-y-3">
        {myConnections.length > 0 ? (
          myConnections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              onOpenSettings={(c) => {
                setConnectionTargetId(c.id)
                setConnectionDialogOpen(true)
              }}
              onDisconnect={(c) => disconnect(c.id)}
              onUninstall={(c) => unlinkMutation.mutate(c.id)}
            />
          ))
        ) : (
          <div className="text-muted-foreground border-border/50 bg-muted/20 rounded-lg border border-dashed py-8 text-center text-sm">
            Nenhuma instância conectada.
          </div>
        )}
      </div>

      <Dialog
        open={connectionDialogOpen}
        onOpenChange={setConnectionDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Conectar Instância</DialogTitle>
            <DialogDescription>
              Preencha as configurações de conexão para esta instância.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
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

function FieldRenderer({
  field,
  addonId,
  value,
  onChange,
}: {
  field: AddonSettingsField
  addonId: string
  value: string | number | boolean | null | undefined
  onChange: (fieldId: string, value: string | number | boolean | null) => void
}) {
  return (
    <AddonFieldRenderer
      field={field}
      addonId={addonId}
      value={value}
      onChange={onChange}
      renderDataSourceInstances={(id) => (
        <DataSourceInstancesManager addonId={id} />
      )}
    />
  )
}
