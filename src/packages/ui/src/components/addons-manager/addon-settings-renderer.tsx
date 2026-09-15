import { AddonSettingsField, AddonSettingsTab } from '@mr-tick/application'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Folder, Loader2 } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDataSourceConnections } from '@/contexts/DataSourceConnectionsContext'
import { useOpenAPI } from '@/hooks/use-open-api'
import { ConnectionCard } from '@/pages/addons/components/addon-list'

export function AddonSettingsRenderer({ addonId }: { addonId: string }) {
  const openAPI = useOpenAPI()
  const queryClient = useQueryClient()

  const { data: schema, isLoading: isLoadingSchema } = useQuery({
    queryKey: ['addon-schema', addonId],
    queryFn: async () => {
      const res = await openAPI.integrations.addons.getSchema({
        body: { addonId },
      })
      if (!res.isSuccess) throw new Error(res.error)
      return res.data
    },
  })

  const { data: savedSettings = {}, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['addon-settings', addonId],
    queryFn: async () => {
      const res = await openAPI.integrations.addons.getSettings({
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
      const res = await openAPI.integrations.addons.saveSettings({
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
  const openAPI = useOpenAPI()
  const fieldValue = value !== undefined ? value : field.defaultValue

  if (field.type === 'datasource-instances') {
    return <DataSourceInstancesManager addonId={addonId} />
  }

  if (field.type === 'info-card') {
    const display = field.display
    if (!display) return null

    return (
      <div className="bg-card mb-4 flex flex-col items-center gap-4 rounded-lg border p-4 py-4 shadow-sm">
        {display.title && (
          <h3 className="text-lg font-semibold">{display.title}</h3>
        )}
        {display.message && (
          <p className="text-muted-foreground text-center text-sm">
            {display.message}
          </p>
        )}
        {display.avatarUrl && (
          <img
            src={display.avatarUrl}
            alt="Avatar"
            className="h-16 w-16 rounded-full border shadow-sm"
          />
        )}
        {display.data && (
          <div className="mt-2 w-full space-y-2">
            {Object.entries(display.data).map(([key, val]) => (
              <div
                key={key}
                className="flex justify-between border-b pb-1 text-sm"
              >
                <span className="text-muted-foreground font-medium">
                  {key}:
                </span>
                <span>{val}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const queryClient = useQueryClient()
  const [actionState, setActionState] = useState<{
    isOpen: boolean
    isLoading: boolean
    result?: import('@mr-tick/application').AddonActionResponse
  }>({ isOpen: false, isLoading: false })

  if (field.type === 'button') {
    return (
      <>
        <div className="flex flex-col gap-1.5 py-2">
          <Button
            variant={field.variant || 'default'}
            disabled={actionState.isLoading}
            onClick={async () => {
              if (field.actionId) {
                setActionState({ isOpen: true, isLoading: true })
                try {
                  const res = await openAPI.integrations.addons.executeAction({
                    body: { addonId, actionId: field.actionId },
                  })
                  queryClient.invalidateQueries({
                    queryKey: ['addon-schema', addonId],
                  })
                  await queryClient.refetchQueries({
                    queryKey: ['addons', 'activeTheme'],
                  })

                  if (res.isSuccess && res.data) {
                    setActionState({
                      isOpen: true,
                      isLoading: false,
                      result: res.data,
                    })
                  } else {
                    setActionState({ isOpen: false, isLoading: false })
                  }
                } catch (err: unknown) {
                  await queryClient.refetchQueries({
                    queryKey: ['addons', 'activeTheme'],
                  })
                  const errorMessage =
                    err instanceof Error ? err.message : 'Erro ao executar ação'
                  setActionState({
                    isOpen: true,
                    isLoading: false,
                    result: { isSuccess: false, error: errorMessage },
                  })
                }
              }
            }}
          >
            {actionState.isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {field.label}
          </Button>
          {field.description && (
            <p className="text-muted-foreground text-xs">{field.description}</p>
          )}
        </div>

        <Dialog
          open={actionState.isOpen}
          onOpenChange={(open) => {
            if (!actionState.isLoading) {
              setActionState((prev) => ({ ...prev, isOpen: open }))
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {actionState.isLoading
                  ? 'Aguardando...'
                  : actionState.result?.display?.title ||
                    (actionState.result?.isSuccess ? 'Sucesso' : 'Erro')}
              </DialogTitle>
              <DialogDescription>
                {actionState.isLoading
                  ? 'Executando a ação. Siga as instruções no seu navegador se for solicitado.'
                  : actionState.result?.display?.message ||
                    (actionState.result?.isSuccess
                      ? 'Ação concluída com sucesso.'
                      : actionState.result?.error || 'Ocorreu um erro.')}
              </DialogDescription>
            </DialogHeader>

            {!actionState.isLoading && actionState.result?.display && (
              <div className="flex flex-col items-center gap-4 py-4">
                {actionState.result.display.avatarUrl && (
                  <img
                    src={actionState.result.display.avatarUrl}
                    alt="Avatar"
                    className="h-16 w-16 rounded-full border shadow-sm"
                  />
                )}
                {actionState.result.display.data && (
                  <div className="w-full space-y-2">
                    {Object.entries(actionState.result.display.data).map(
                      ([key, val]) => (
                        <div
                          key={key}
                          className="flex justify-between border-b pb-1 text-sm"
                        >
                          <span className="text-muted-foreground font-medium">
                            {key}:
                          </span>
                          <span>{val}</span>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}

            {!actionState.isLoading && (
              <div className="flex justify-end pt-4">
                <Button
                  onClick={() =>
                    setActionState((prev) => ({ ...prev, isOpen: false }))
                  }
                >
                  Fechar
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    )
  }

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{field.label}</label>
          {field.description && (
            <p className="text-muted-foreground text-xs">{field.description}</p>
          )}
        </div>
        <Switch
          checked={Boolean(fieldValue)}
          onCheckedChange={(checked) => onChange(field.id, checked)}
        />
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <label className="text-sm font-medium">{field.label}</label>
        <Select
          value={
            fieldValue !== undefined && fieldValue !== null
              ? String(fieldValue)
              : ''
          }
          onValueChange={(val) => onChange(field.id, val)}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={field.placeholder || 'Selecione uma opção'}
            />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.description && (
          <p className="text-muted-foreground text-xs">{field.description}</p>
        )}
      </div>
    )
  }

  if (field.type === 'file' || field.type === 'directory') {
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <label className="text-sm font-medium">{field.label}</label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={
              fieldValue !== undefined && fieldValue !== null
                ? String(fieldValue)
                : ''
            }
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            title={
              field.type === 'directory'
                ? 'Selecionar pasta'
                : 'Selecionar arquivo'
            }
          >
            <Folder className="h-4 w-4" />
          </Button>
        </div>
        {field.description && (
          <p className="text-muted-foreground text-xs">{field.description}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <label className="text-sm font-medium">{field.label}</label>
      <Input
        type={
          field.type === 'password'
            ? 'password'
            : field.type === 'number'
              ? 'number'
              : 'text'
        }
        value={
          fieldValue !== undefined && fieldValue !== null
            ? String(fieldValue)
            : ''
        }
        onChange={(e) => {
          const val = e.target.value
          if (field.type === 'number') {
            onChange(field.id, val === '' ? '' : Number(val))
          } else {
            onChange(field.id, val)
          }
        }}
        placeholder={field.placeholder}
      />
      {field.description && (
        <p className="text-muted-foreground text-xs">{field.description}</p>
      )}
    </div>
  )
}
