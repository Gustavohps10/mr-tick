'use client'

import type {
  AddonSettingsField,
  AddonSettingsSchema,
  AddonSettingsTab,
} from '@mr-tick/sdk'
import type { WorkspaceConnectionIdentityViewModel } from '@mr-tick/shared/view-models'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Lock, PlugZap, ShieldCheck } from 'lucide-react'
import React from 'react'
import { FormProvider, useForm } from 'react-hook-form'

import { Button, Label, Skeleton } from '@/components/ui'
import { useHostBridge } from '@/hooks'

import { AddonFieldRenderer } from './addons-manager/addon-field-renderer'

export type FieldPrimitiveValue = string | number | boolean

export interface AddonConnectionFormData {
  pluginId: string
  connectionInstanceId: string
  connectionProfileId: string
  credentials: Record<string, FieldPrimitiveValue>
  configuration: Record<string, FieldPrimitiveValue>
}

export interface NewAddonConnectionFormProps {
  pluginId: string
  connectionInstanceId: string
  connectionProfileId: string
  onSubmit: (data: AddonConnectionFormData) => void
  isSubmitting?: boolean
  hideSubmitButton?: boolean
  fieldErrors?: Readonly<Record<string, readonly string[]>>
  initialConfiguration?: Record<string, unknown>
  pinnedIdentity?: WorkspaceConnectionIdentityViewModel
  lastAuthenticatedAt?: string
}

function toPrimitiveValue(value: unknown): FieldPrimitiveValue | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  return undefined
}

function formatLastAuthenticated(isoDate?: string): string | undefined {
  if (isoDate === undefined || isoDate.length === 0) {
    return undefined
  }

  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) {
    return undefined
  }

  const date = new Date(timestamp)

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function schemaTabs(schema: AddonSettingsSchema): AddonSettingsTab[] {
  const tabs: AddonSettingsTab[] = []
  const fields: AddonSettingsField[] = []

  for (const item of schema) {
    if ('type' in item) {
      fields.push(item)
      continue
    }

    tabs.push(item)
  }

  if (fields.length > 0) {
    tabs.push({ id: 'general', label: 'General', fields })
  }

  return tabs
}

function tabFields(tab: AddonSettingsTab): AddonSettingsField[] {
  const fields: AddonSettingsField[] = []

  if (tab.fields) {
    fields.push(...tab.fields)
  }

  if (tab.groups) {
    for (const group of tab.groups) {
      fields.push(...group.fields)
    }
  }

  return fields.filter((field) => field.type !== 'mapping')
}

function extractDefaultPrimitiveValue(
  field: AddonSettingsField,
): FieldPrimitiveValue | undefined {
  if (!('defaultValue' in field)) {
    return undefined
  }

  const defVal = field.defaultValue
  if (defVal === undefined) {
    return undefined
  }

  if (typeof defVal === 'object' && defVal !== null) {
    return JSON.stringify(defVal)
  }

  return defVal
}

function resolveInitialFormValues(
  fields: AddonSettingsField[],
  initialConfig?: Record<string, unknown>,
): Record<string, FieldPrimitiveValue> {
  const defaults: Record<string, FieldPrimitiveValue> = {}

  for (const field of fields) {
    if (initialConfig !== undefined && initialConfig[field.id] !== undefined) {
      const configVal = toPrimitiveValue(initialConfig[field.id])
      if (configVal !== undefined) {
        defaults[field.id] = configVal
        continue
      }
    }

    const def = extractDefaultPrimitiveValue(field)
    if (def !== undefined) {
      defaults[field.id] = def
    }
  }

  return defaults
}

export function NewAddonConnectionForm(props: NewAddonConnectionFormProps) {
  const bridge = useHostBridge()
  const {
    data: result,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [
      'addon-connection-schema',
      props.pluginId,
      props.connectionProfileId,
    ],
    queryFn: () =>
      bridge.addons.getConnectionSchema({
        body: {
          addonId: props.pluginId,
          connectionProfileId: props.connectionProfileId,
        },
      }),
  })

  if (isLoading)
    return (
      <div
        className="flex flex-col gap-4 p-1"
        aria-label="Carregando campos de conexão"
      >
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )

  if (isError || !result)
    return <p role="alert">Falha ao carregar definições da conexão.</p>
  if (!result.isSuccess) return <p role="alert">{result.error}</p>
  if (result.data === undefined)
    return <p role="alert">CONNECTION_SCHEMA_NOT_FOUND</p>

  return (
    <ConnectionFields
      key={`${props.pluginId}:${props.connectionProfileId}:${props.connectionInstanceId}`}
      {...props}
      tabs={schemaTabs(result.data)}
    />
  )
}

function ConnectionFields({
  pluginId,
  connectionInstanceId,
  connectionProfileId,
  onSubmit,
  isSubmitting = false,
  hideSubmitButton = false,
  fieldErrors,
  initialConfiguration,
  pinnedIdentity,
  lastAuthenticatedAt,
  tabs,
}: NewAddonConnectionFormProps & { tabs: AddonSettingsTab[] }) {
  const authTabs = tabs.filter((tab) => tab.authType !== undefined)
  const [selectedAuthTabId, setSelectedAuthTabId] = React.useState('')

  const activeAuthTab = authTabs.find((tab) => {
    if (authTabs.length === 1) return true
    return tab.id === selectedAuthTabId
  })

  const visibleTabs = tabs.filter(
    (tab) => !tab.authType || tab.id === activeAuthTab?.id,
  )

  const fields = visibleTabs.flatMap(tabFields)
  const methods = useForm<Record<string, FieldPrimitiveValue>>({
    defaultValues: resolveInitialFormValues(fields, initialConfiguration),
  })

  const requiresAuthSelection =
    authTabs.length > 1 && activeAuthTab === undefined

  function fieldValue(
    field: AddonSettingsField,
  ): FieldPrimitiveValue | undefined {
    const value = methods.watch(field.id)
    if (value !== undefined) return value

    if (
      initialConfiguration !== undefined &&
      initialConfiguration[field.id] !== undefined
    ) {
      const configVal = toPrimitiveValue(initialConfiguration[field.id])
      if (configVal !== undefined) {
        return configVal
      }
    }

    return extractDefaultPrimitiveValue(field)
  }

  function submit(values: Record<string, FieldPrimitiveValue>) {
    if (requiresAuthSelection) return

    const credentials: Record<string, FieldPrimitiveValue> = {}
    const configuration: Record<string, FieldPrimitiveValue> = {}

    if (activeAuthTab?.authType) {
      configuration.authType = activeAuthTab.authType
    }

    for (const field of fields) {
      let value = values[field.id]
      if (value === undefined) {
        if (
          initialConfiguration !== undefined &&
          initialConfiguration[field.id] !== undefined
        ) {
          const configVal = toPrimitiveValue(initialConfiguration[field.id])
          if (configVal !== undefined) {
            value = configVal
          }
        }

        if (value === undefined) {
          const defVal = extractDefaultPrimitiveValue(field)
          if (defVal === undefined) continue
          value = defVal
        }
      }

      if (field.scope === 'credential') {
        credentials[field.id] = value
        continue
      }

      configuration[field.id] = value
    }

    onSubmit({
      pluginId,
      connectionInstanceId,
      connectionProfileId,
      credentials,
      configuration,
    })
  }

  function renderField(field: AddonSettingsField) {
    const isLocked = Boolean(
      pinnedIdentity !== undefined &&
      field.scope !== 'credential' &&
      initialConfiguration !== undefined &&
      initialConfiguration[field.id] !== undefined,
    )

    return (
      <div key={field.id} className="relative flex flex-col gap-1">
        {isLocked && (
          <div className="text-muted-foreground/80 mb-0.5 flex items-center gap-1.5 text-[11px]">
            <Lock className="text-muted-foreground size-3" />
            <span className="font-medium">Parâmetro fixado</span>
            <span className="text-muted-foreground/60">
              — vinculado a esta instância
            </span>
          </div>
        )}

        <AddonFieldRenderer
          field={field}
          addonId={pluginId}
          value={fieldValue(field)}
          errors={fieldErrors?.[field.id]}
          disabled={isLocked}
          onChange={(fieldId, value) => {
            if (value === null) {
              methods.unregister(fieldId)
              return
            }

            const nextValue: FieldPrimitiveValue =
              typeof value === 'object' ? JSON.stringify(value) : value

            methods.setValue(fieldId, nextValue, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }}
        />
      </div>
    )
  }

  const formattedLastAuth = formatLastAuthenticated(lastAuthenticatedAt)
  let pinnedAccountName = pinnedIdentity?.displayName
  if (
    pinnedAccountName === undefined ||
    pinnedAccountName.trim().length === 0
  ) {
    pinnedAccountName = pinnedIdentity?.providerSubjectId
  }

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col gap-6 p-1">
        {pinnedIdentity && (
          <div
            data-testid="pinned-identity-banner"
            className="space-y-1.5 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3.5 text-xs"
          >
            <div className="flex items-center gap-2 font-medium text-sky-500">
              <ShieldCheck className="size-4 shrink-0" />
              <span>Instância com Identidade Vinculada</span>
            </div>

            <p className="text-muted-foreground leading-relaxed">
              Esta conexão já possui histórico atrelado a{' '}
              <strong className="text-foreground">{pinnedAccountName}</strong>{' '}
              no tenant{' '}
              <code className="bg-muted text-foreground/90 rounded px-1 py-0.5 font-mono text-[11px]">
                {pinnedIdentity.tenantId}
              </code>
              {formattedLastAuth
                ? ` (última autenticação em ${formattedLastAuth})`
                : ''}
              .
            </p>

            <p className="text-muted-foreground/75 text-[11px] leading-relaxed">
              Para assegurar a integridade dos dados e apontamentos existentes,
              os parâmetros de servidor desta instância estão fixados. Insira as
              credenciais de acesso correspondentes a esta mesma conta para
              reconectar.
            </p>
          </div>
        )}

        {authTabs.length > 1 && (
          <label className="flex flex-col gap-2">
            <Label>Método de autenticação</Label>
            <select
              aria-label="Método de autenticação"
              data-testid="datasource-auth-type-selector"
              value={selectedAuthTabId}
              onChange={(event) =>
                setSelectedAuthTabId(event.currentTarget.value)
              }
            >
              <option value="">Selecione um método</option>
              {authTabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {visibleTabs.map((tab) => (
          <div key={tab.id} className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold">{tab.label}</h4>
            {tab.description && (
              <p className="text-muted-foreground text-xs">{tab.description}</p>
            )}

            {tab.groups
              ?.filter((group) =>
                group.fields.some((field) => field.type !== 'mapping'),
              )
              .map((group) => (
                <div key={group.id} className="flex flex-col gap-3">
                  <Label>{group.label}</Label>
                  {group.description && (
                    <p className="text-muted-foreground text-xs">
                      {group.description}
                    </p>
                  )}

                  {group.fields
                    .filter((field) => field.type !== 'mapping')
                    .map(renderField)}
                </div>
              ))}

            {tab.fields
              ?.filter((field) => field.type !== 'mapping')
              .map(renderField)}
          </div>
        ))}

        {!hideSubmitButton && (
          <div className="flex justify-end">
            <Button
              data-testid="datasource-instance-connect-btn"
              onClick={methods.handleSubmit(submit)}
              disabled={isSubmitting || requiresAuthSelection}
              size="sm"
            >
              {isSubmitting && <Loader2 className="animate-spin" />}
              {!isSubmitting && <PlugZap />}
              {activeAuthTab?.authType === 'oauth2' &&
                'Autenticar via OAuth e Conectar'}
              {activeAuthTab?.authType !== 'oauth2' && 'Conectar'}
            </Button>
          </div>
        )}
      </div>
    </FormProvider>
  )
}
