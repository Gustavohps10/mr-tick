import {
  AddonActionResponse,
  type AddonCollectionItemEnvelope,
  type AddonFieldAddress,
  type AddonMappingPreset,
  AddonSettingsField,
  type AddonSettingsValues,
  type AddonSettingValue,
  type AddonTaskReferenceValue,
  type AddonVaultScope,
  type ConfiguredFieldMapping,
} from '@mr-tick/application'
import { useQueryClient } from '@tanstack/react-query'
import { Folder, Loader2, SlidersHorizontal } from 'lucide-react'
import { ReactNode, useState } from 'react'

import {
  MappingConfigModal,
  parseMappingValue,
} from '@/components/mapping-config-modal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib/utils'

import { AddonCollectionControl } from './addon-collection-control'
import { AddonDateField } from './addon-date-field'
import { AddonDynamicSelectControl } from './addon-dynamic-select-control'
import { AddonOperationalRecordsCard } from './addon-operational-records-card'
import { AddonTaskDestinationControl } from './addon-task-destination-control'
import { serializeFieldAddress } from './address-helpers'

export interface AddonFieldRendererProps {
  field: AddonSettingsField
  addonId?: string
  value: AddonSettingValue | undefined
  onChange: (fieldId: string, value: AddonSettingValue) => void
  disabled?: boolean
  renderDataSourceInstances?: (addonId: string) => ReactNode
  workspaceId?: string
  connectionInstanceId?: string
  credentialConfigured?: boolean
  errors?: readonly string[]
  fieldAddress?: AddonFieldAddress
  scope?: AddonVaultScope
  draftValues?: AddonSettingsValues
  fieldErrorsMap?: ReadonlyMap<string, readonly string[]>
  fieldVisibilityMap?: ReadonlyMap<string, boolean>
  fieldDisabledMap?: ReadonlyMap<string, boolean>
}

export function AddonFieldRenderer(props: AddonFieldRendererProps) {
  const currentAddress: AddonFieldAddress = props.fieldAddress || {
    path: [{ kind: 'field', fieldId: props.field.id }],
  }
  const fieldKey = serializeFieldAddress(currentAddress)

  const isVisible =
    props.fieldVisibilityMap?.get(fieldKey) !== false &&
    (props.fieldAddress
      ? true
      : props.fieldVisibilityMap?.get(props.field.id) !== false)

  if (!isVisible) return null

  const isFieldDisabled =
    props.disabled ||
    props.fieldDisabledMap?.get(fieldKey) === true ||
    (!props.fieldAddress &&
      props.fieldDisabledMap?.get(props.field.id) === true)

  const effectiveErrors =
    props.errors ||
    props.fieldErrorsMap?.get(fieldKey) ||
    (!props.fieldAddress
      ? props.fieldErrorsMap?.get(props.field.id)
      : undefined)

  const controlProps = {
    ...props,
    disabled: isFieldDisabled,
    fieldAddress: currentAddress,
  }

  if (effectiveErrors === undefined || effectiveErrors.length === 0) {
    return <AddonFieldControl {...controlProps} />
  }

  return (
    <div
      className="flex flex-col"
      data-testid={`addon-field-errors-${props.field.id}`}
    >
      <AddonFieldControl {...controlProps} />
      {effectiveErrors.map((message) => (
        <p key={message} role="alert" className="text-destructive text-xs">
          {message}
        </p>
      ))}
    </div>
  )
}

function isObjectSettingValue(
  val: AddonSettingValue | undefined,
): val is { readonly [key: string]: AddonSettingValue | undefined } {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function isTaskReferenceValue(
  val: AddonSettingValue | undefined,
): val is AddonTaskReferenceValue {
  if (!isObjectSettingValue(val)) return false
  const ws = val['workspaceId']
  if (typeof ws !== 'string') return false
  const conn = val['connectionInstanceId']
  if (typeof conn !== 'string') return false
  const task = val['taskId']
  if (typeof task !== 'string') return false
  return true
}

function isCollectionArray(
  val: AddonSettingValue | undefined,
): val is readonly AddonCollectionItemEnvelope[] {
  if (!Array.isArray(val)) return false
  return true
}

function isMappingPreset(
  val: AddonSettingValue | undefined,
): val is AddonMappingPreset {
  if (!isObjectSettingValue(val)) return false
  return true
}

function AddonFieldControl({
  field,
  addonId = '',
  value,
  onChange,
  disabled = false,
  renderDataSourceInstances,
  workspaceId,
  connectionInstanceId,
  credentialConfigured = false,
  fieldAddress,
  scope = { kind: 'addon' },
  draftValues = {},
  fieldErrorsMap,
  fieldVisibilityMap,
  fieldDisabledMap,
}: Omit<AddonFieldRendererProps, 'errors'>) {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const [actionState, setActionState] = useState<{
    isOpen: boolean
    isLoading: boolean
    result?: AddonActionResponse
  }>({ isOpen: false, isLoading: false })

  let fieldValue: AddonSettingValue | undefined = value
  if (fieldValue === undefined && field.scope !== 'credential') {
    if ('defaultValue' in field) {
      const defVal = field.defaultValue
      if (
        typeof defVal === 'string' ||
        typeof defVal === 'number' ||
        typeof defVal === 'boolean'
      ) {
        fieldValue = defVal
      }
      if (Array.isArray(defVal)) {
        fieldValue = defVal
      }
      if (defVal !== null && typeof defVal === 'object') {
        fieldValue = defVal
      }
    }
  }

  const currentAddress: AddonFieldAddress = fieldAddress || {
    path: [{ kind: 'field', fieldId: field.id }],
  }

  if (field.type === 'datasource-instances') {
    if (renderDataSourceInstances) return renderDataSourceInstances(addonId)
    return null
  }

  if (field.type === 'info-card') {
    const display = field.display
    if (!display) return null

    return (
      <div
        data-testid={`addon-info-card-${field.id}`}
        className="bg-card mb-4 flex flex-col items-center gap-4 rounded-lg border p-4 py-4 shadow-sm"
      >
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
            data-testid={`addon-action-btn-${field.id}`}
            variant={field.variant || 'default'}
            disabled={disabled || actionState.isLoading}
            onClick={async () => {
              if (!field.actionId) return
              setActionState({ isOpen: true, isLoading: true })
              try {
                const effectiveScope: AddonVaultScope | undefined = workspaceId
                  ? { kind: 'workspace', workspaceId }
                  : undefined
                const res = await bridge.addons.executeAction({
                  body: {
                    addonId,
                    actionId: field.actionId,
                    workspaceId,
                    scope: effectiveScope,
                  },
                })
                queryClient.invalidateQueries({
                  queryKey: ['addon-schema', addonId],
                })
                queryClient.invalidateQueries({
                  queryKey: ['addon-settings', addonId],
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
          data-testid={`addon-field-input-${field.id}`}
          checked={Boolean(fieldValue)}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(field.id, checked)}
        />
      </div>
    )
  }

  if (field.type === 'date') {
    let dateValue: string | undefined
    if (typeof fieldValue === 'string') dateValue = fieldValue
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <label className="text-sm font-medium">{field.label}</label>
        <AddonDateField
          fieldId={field.id}
          value={dateValue}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(date) => onChange(field.id, date)}
        />
        {field.description && (
          <p className="text-muted-foreground text-xs">{field.description}</p>
        )}
      </div>
    )
  }

  if (field.type === 'select' || field.type === 'multiselect') {
    return (
      <AddonDynamicSelectControl
        field={field}
        addonId={addonId}
        scope={scope}
        fieldAddress={currentAddress}
        value={
          Array.isArray(fieldValue)
            ? fieldValue
            : typeof fieldValue === 'string' ||
                typeof fieldValue === 'number' ||
                typeof fieldValue === 'boolean'
              ? fieldValue
              : null
        }
        onChange={(val) => onChange(field.id, val)}
        disabled={disabled}
        draftValues={draftValues}
      />
    )
  }

  if (field.type === 'collection') {
    const collectionItems = isCollectionArray(fieldValue) ? fieldValue : []

    return (
      <AddonCollectionControl
        field={field}
        addonId={addonId}
        scope={scope}
        parentAddress={currentAddress}
        value={collectionItems}
        onChange={(items) => onChange(field.id, items)}
        disabled={disabled}
        draftValues={draftValues}
        renderField={({
          field: nestedField,
          itemAddress,
          value: nestedVal,
          onChange: onNestedChange,
          disabled: nestedDisabled,
        }) => (
          <AddonFieldRenderer
            field={nestedField}
            addonId={addonId}
            value={nestedVal}
            onChange={onNestedChange}
            disabled={nestedDisabled}
            workspaceId={workspaceId}
            fieldAddress={itemAddress}
            scope={scope}
            draftValues={draftValues}
            fieldErrorsMap={fieldErrorsMap}
            fieldVisibilityMap={fieldVisibilityMap}
            fieldDisabledMap={fieldDisabledMap}
          />
        )}
      />
    )
  }

  if (field.type === 'task-reference') {
    return (
      <AddonTaskDestinationControl
        field={field}
        workspaceId={workspaceId || ''}
        value={isTaskReferenceValue(fieldValue) ? fieldValue : null}
        onChange={(taskVal) => onChange(field.id, taskVal)}
        disabled={disabled}
      />
    )
  }

  if (field.type === 'operational-list') {
    return (
      <AddonOperationalRecordsCard
        field={field}
        addonId={addonId}
        scope={scope}
        workspaceId={workspaceId}
        disabled={disabled}
        renderField={({
          field: actionField,
          value: actionVal,
          onChange: onActionChange,
          disabled: actionDisabled,
        }) => (
          <AddonFieldRenderer
            field={actionField}
            addonId={addonId}
            value={actionVal}
            onChange={onActionChange}
            disabled={actionDisabled}
            workspaceId={workspaceId}
            scope={scope}
            draftValues={draftValues}
            fieldErrorsMap={fieldErrorsMap}
            fieldVisibilityMap={fieldVisibilityMap}
            fieldDisabledMap={fieldDisabledMap}
          />
        )}
      />
    )
  }

  if (field.type === 'group') {
    return (
      <div
        className="border-border/60 bg-muted/10 space-y-3 rounded-lg border p-4"
        data-testid={`addon-group-${field.id}`}
      >
        <div>
          <h4 className="text-sm font-semibold">{field.label}</h4>
          {field.description && (
            <p className="text-muted-foreground text-xs">{field.description}</p>
          )}
        </div>
        <div className="grid gap-3">
          {field.fields.map((subField) => (
            <AddonFieldRenderer
              key={subField.id}
              field={subField}
              addonId={addonId}
              value={
                isObjectSettingValue(fieldValue)
                  ? fieldValue[subField.id]
                  : undefined
              }
              onChange={(subFieldId, subFieldVal) => {
                const currentGroup: Record<string, AddonSettingValue> = {}
                if (isObjectSettingValue(fieldValue)) {
                  for (const [k, v] of Object.entries(fieldValue)) {
                    if (v !== undefined) {
                      currentGroup[k] = v
                    }
                  }
                }
                currentGroup[subFieldId] = subFieldVal
                onChange(field.id, currentGroup)
              }}
              disabled={disabled}
              workspaceId={workspaceId}
              fieldAddress={{
                path: [
                  ...currentAddress.path,
                  { kind: 'field', fieldId: subField.id },
                ],
              }}
              scope={scope}
              draftValues={draftValues}
              fieldErrorsMap={fieldErrorsMap}
              fieldVisibilityMap={fieldVisibilityMap}
              fieldDisabledMap={fieldDisabledMap}
            />
          ))}
        </div>
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

  if (field.type === 'mapping') {
    let mappingValue: AddonMappingPreset | string | undefined
    if (typeof fieldValue === 'string') {
      mappingValue = fieldValue
    }
    if (isMappingPreset(fieldValue)) {
      mappingValue = fieldValue
    }

    return (
      <MappingFieldItem
        field={field}
        addonId={addonId}
        value={mappingValue}
        onChange={(val) => onChange(field.id, val)}
        disabled={disabled}
        workspaceId={workspaceId}
        connectionInstanceId={connectionInstanceId}
      />
    )
  }

  if (field.type === 'textarea' || field.type === 'json') {
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <label className="text-sm font-medium">{field.label}</label>
        <Textarea
          disabled={disabled}
          value={
            fieldValue !== undefined && fieldValue !== null
              ? String(fieldValue)
              : ''
          }
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          className={cn(
            'min-h-[80px]',
            field.type === 'json' && 'font-mono text-xs',
          )}
          data-testid={`addon-field-input-${field.id}`}
        />
        {field.description && (
          <p className="text-muted-foreground text-xs">{field.description}</p>
        )}
      </div>
    )
  }

  if (field.type === 'time' || field.type === 'timezone') {
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <label className="text-sm font-medium">{field.label}</label>
        <Input
          type={field.type === 'time' ? 'time' : 'text'}
          disabled={disabled}
          value={
            fieldValue !== undefined && fieldValue !== null
              ? String(fieldValue)
              : ''
          }
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          data-testid={`addon-field-input-${field.id}`}
        />
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
        placeholder={
          field.scope === 'credential' && credentialConfigured
            ? 'Credencial configurada; deixe em branco para manter'
            : field.placeholder
        }
        data-testid={`addon-field-input-${field.id}`}
      />
      {field.description && (
        <p className="text-muted-foreground text-xs">{field.description}</p>
      )}
    </div>
  )
}

function MappingFieldItem({
  field,
  addonId,
  value,
  onChange,
  disabled,
  workspaceId,
  connectionInstanceId,
}: {
  field: AddonSettingsField
  addonId: string
  value: string | AddonMappingPreset | undefined
  onChange: (val: string) => void
  disabled?: boolean
  workspaceId?: string
  connectionInstanceId?: string
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  let stringOrObjValue: string | Record<string, ConfiguredFieldMapping> = ''
  if (typeof value === 'string') stringOrObjValue = value
  if (value && typeof value === 'object') stringOrObjValue = value
  const parsedMappings = parseMappingValue(stringOrObjValue)
  const configuredCount = Object.keys(parsedMappings).length

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label className="text-sm font-medium">{field.label}</label>
          {field.description && (
            <p className="text-muted-foreground text-xs">{field.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {configuredCount > 0 && (
            <Badge
              variant="outline"
              className="text-xs"
              data-testid={`mapping-badge-${field.id}`}
            >
              {configuredCount} mapeados
            </Badge>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-8 gap-1.5 text-xs"
            data-testid={`configure-mapping-${field.id}-btn`}
            onClick={() => setIsModalOpen(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Configurar Mapeamento
          </Button>
        </div>
      </div>

      <MappingConfigModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        addonId={addonId}
        workspaceId={workspaceId}
        connectionInstanceId={connectionInstanceId}
        value={parsedMappings}
        onSave={(newMappings) => {
          onChange(JSON.stringify(newMappings))
        }}
      />
    </div>
  )
}
