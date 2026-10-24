'use client'

import type {
  AddonSettingsField,
  AddonSettingsSchema,
  AddonSettingsTab,
} from '@mr-tick/sdk'
import { useQuery } from '@tanstack/react-query'
import { Loader2, PlugZap } from 'lucide-react'
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

interface NewAddonConnectionFormProps {
  pluginId: string
  connectionInstanceId: string
  connectionProfileId: string
  onSubmit: (data: AddonConnectionFormData) => void
  isSubmitting?: boolean
  hideSubmitButton?: boolean
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
  if (fields.length > 0) tabs.push({ id: 'general', label: 'General', fields })
  return tabs
}

function tabFields(tab: AddonSettingsTab): AddonSettingsField[] {
  const fields: AddonSettingsField[] = []
  if (tab.fields) fields.push(...tab.fields)
  if (tab.groups) for (const group of tab.groups) fields.push(...group.fields)
  return fields.filter((field) => field.type !== 'mapping')
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
        className="flex flex-col gap-4"
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
  tabs,
}: NewAddonConnectionFormProps & { tabs: AddonSettingsTab[] }) {
  const methods = useForm<Record<string, FieldPrimitiveValue>>()
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
  const requiresAuthSelection =
    authTabs.length > 1 && activeAuthTab === undefined

  function fieldValue(
    field: AddonSettingsField,
  ): FieldPrimitiveValue | undefined {
    const value = methods.watch(field.id)
    if (value !== undefined) return value
    if (field.defaultValue === undefined) return undefined
    if (typeof field.defaultValue === 'object')
      return JSON.stringify(field.defaultValue)
    return field.defaultValue
  }

  function submit(values: Record<string, FieldPrimitiveValue>) {
    if (requiresAuthSelection) return
    const credentials: Record<string, FieldPrimitiveValue> = {}
    const configuration: Record<string, FieldPrimitiveValue> = {}
    if (activeAuthTab?.authType) configuration.authType = activeAuthTab.authType
    for (const field of fields) {
      let value = values[field.id]
      if (value === undefined) {
        if (field.defaultValue === undefined) continue
        if (typeof field.defaultValue === 'object') {
          value = JSON.stringify(field.defaultValue)
        }
        if (typeof field.defaultValue !== 'object') value = field.defaultValue
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
    return (
      <AddonFieldRenderer
        key={field.id}
        field={field}
        addonId={pluginId}
        value={fieldValue(field)}
        onChange={(fieldId, value) => {
          if (value === null) {
            methods.unregister(fieldId)
            return
          }
          methods.setValue(fieldId, value, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }}
      />
    )
  }

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col gap-6">
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
