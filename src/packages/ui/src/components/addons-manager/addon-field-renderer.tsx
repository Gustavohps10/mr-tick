import { AddonActionResponse, AddonSettingsField } from '@mr-tick/application'
import { useQueryClient } from '@tanstack/react-query'
import { Folder, Loader2 } from 'lucide-react'
import { ReactNode, useState } from 'react'

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
import { useHostBridge } from '@/hooks/use-host-bridge'

export interface AddonFieldRendererProps {
  field: AddonSettingsField
  addonId?: string
  value: string | number | boolean | null | undefined
  onChange: (fieldId: string, value: string | number | boolean | null) => void
  disabled?: boolean
  renderDataSourceInstances?: (addonId: string) => ReactNode
}

export function AddonFieldRenderer({
  field,
  addonId = '',
  value,
  onChange,
  disabled = false,
  renderDataSourceInstances,
}: AddonFieldRendererProps) {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const [actionState, setActionState] = useState<{
    isOpen: boolean
    isLoading: boolean
    result?: AddonActionResponse
  }>({ isOpen: false, isLoading: false })

  const fieldValue = value !== undefined ? value : field.defaultValue

  if (field.type === 'datasource-instances') {
    if (renderDataSourceInstances) return renderDataSourceInstances(addonId)
    return null
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

  if (field.type === 'button') {
    return (
      <>
        <div className="flex flex-col gap-1.5 py-2">
          <Button
            variant={field.variant || 'default'}
            disabled={disabled || actionState.isLoading}
            onClick={async () => {
              if (!field.actionId) return
              setActionState({ isOpen: true, isLoading: true })
              try {
                const res = await bridge.addons.executeAction({
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
                  return
                }

                setActionState({ isOpen: false, isLoading: false })
              } catch (err) {
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
          disabled={disabled}
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
          disabled={disabled}
          value={
            fieldValue !== undefined && fieldValue !== null
              ? String(fieldValue)
              : ''
          }
          onValueChange={(val) => onChange(field.id, val)}
        >
          <SelectTrigger
            className="w-full"
            data-testid={`addon-field-select-${field.id}`}
          >
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
            disabled={disabled}
            value={
              fieldValue !== undefined && fieldValue !== null
                ? String(fieldValue)
                : ''
            }
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            className="flex-1"
            data-testid={`addon-field-input-${field.id}`}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
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
        disabled={disabled}
        value={
          fieldValue !== undefined && fieldValue !== null
            ? String(fieldValue)
            : ''
        }
        onChange={(e) => {
          const val = e.target.value
          if (field.type === 'number') {
            onChange(field.id, val === '' ? '' : Number(val))
            return
          }
          onChange(field.id, val)
        }}
        placeholder={field.placeholder}
        data-testid={`addon-field-input-${field.id}`}
      />
      {field.description && (
        <p className="text-muted-foreground text-xs">{field.description}</p>
      )}
    </div>
  )
}
