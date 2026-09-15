'use client'

import type {
  AddonSettingsField,
  AddonSettingsFieldScope,
  AddonSettingsTab,
} from '@mr-tick/sdk'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, PlugZap, Settings } from 'lucide-react'
import React from 'react'
import { FormProvider, useForm } from 'react-hook-form'

import { Button, Input, Label } from '@/components/ui'
import { useOpenAPI } from '@/hooks/use-open-api'

export type FieldPrimitiveValue = string | number | boolean

export interface DataSourceInstanceFormData {
  pluginId: string
  connectionInstanceId: string
  credentials: Record<string, FieldPrimitiveValue>
  configuration: Record<string, FieldPrimitiveValue>
}

interface NewDataSourceInstanceFormProps {
  pluginId: string
  connectionInstanceId: string
  onSubmit: (data: DataSourceInstanceFormData) => void
  isSubmitting?: boolean
  submitLabel?: string
  hideSubmitButton?: boolean
}

export function NewDataSourceInstanceForm({
  pluginId,
  connectionInstanceId,
  onSubmit,
  isSubmitting = false,
  hideSubmitButton = false,
}: NewDataSourceInstanceFormProps) {
  const openAPI = useOpenAPI()

  // 2. Busca dinâmica de campos baseada no pluginId
  const {
    data: schema,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['datasource-fields', pluginId],
    queryFn: async (): Promise<AddonSettingsTab[]> => {
      const res = await openAPI.integrations.addons.getConnectionSchema({
        body: { addonId: pluginId },
      })

      const rawSchema = res.data || []

      if (Array.isArray(rawSchema)) {
        if (
          rawSchema.length > 0 &&
          !('groups' in rawSchema[0]) &&
          !('fields' in rawSchema[0])
        ) {
          // Schema is a flat array of fields. Convert to a default tab.
          const flatFields: AddonSettingsField[] = []
          for (const item of rawSchema) {
            if ('type' in item) {
              flatFields.push(item)
            }
          }
          return [
            {
              id: 'general',
              label: 'General',
              fields: flatFields,
            },
          ]
        }

        const tabs: AddonSettingsTab[] = []
        for (const item of rawSchema) {
          if (!('type' in item)) {
            tabs.push(item)
          }
        }
        return tabs
      }
      return []
    },
  })

  // 3. Setup do Formulário
  const methods = useForm<Record<string, FieldPrimitiveValue>>({
    defaultValues: {
      pluginId,
      connectionInstanceId,
    },
  })

  const handleFormSubmit = (values: Record<string, FieldPrimitiveValue>) => {
    const rawPluginId = values.pluginId ?? pluginId
    const rawConnectionInstanceId =
      values.connectionInstanceId ?? connectionInstanceId

    const credentials: Record<string, FieldPrimitiveValue> = {}
    const configuration: Record<string, FieldPrimitiveValue> = {}

    const fieldScopeMap = new Map<string, AddonSettingsFieldScope>()
    if (schema) {
      for (const tab of schema) {
        if (tab.groups) {
          for (const group of tab.groups) {
            for (const field of group.fields) {
              fieldScopeMap.set(field.id, field.scope ?? 'configuration')
            }
          }
        }
        if (tab.fields) {
          for (const field of tab.fields) {
            fieldScopeMap.set(field.id, field.scope ?? 'configuration')
          }
        }
      }
    }

    for (const [key, value] of Object.entries(values)) {
      if (key === 'pluginId' || key === 'connectionInstanceId') {
        continue
      }
      const scope = fieldScopeMap.get(key) ?? 'configuration'
      if (scope === 'credential') {
        credentials[key] = value
      } else {
        configuration[key] = value
      }
    }

    onSubmit({
      pluginId: String(rawPluginId),
      connectionInstanceId: String(rawConnectionInstanceId),
      credentials,
      configuration,
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-12">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
        <p className="text-muted-foreground text-sm">
          Carregando campos de integração...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="border-destructive/20 bg-destructive/5 flex items-center gap-3 rounded-xl border p-4">
        <AlertCircle className="text-destructive h-5 w-5" />
        <p className="text-sm font-medium">
          Falha ao carregar definições do plugin.
        </p>
      </div>
    )
  }

  return (
    <FormProvider {...methods}>
      <div className="space-y-8">
        {schema?.map((tab) => (
          <div key={tab.id} className="space-y-4">
            <div className="text-foreground/80 flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4" />
              <h4>{tab.label}</h4>
            </div>
            {tab.description && (
              <p className="text-muted-foreground text-xs">{tab.description}</p>
            )}

            <div className="ml-2 grid gap-4 border-l-2 pl-4">
              {/* Se a tab tem grupos */}
              {tab.groups?.map((group) => (
                <div key={group.id} className="space-y-3">
                  <Label className="text-muted-foreground text-[11px] tracking-wider">
                    {group.label}
                  </Label>
                  {group.description && (
                    <p className="text-muted-foreground mb-2 text-xs">
                      {group.description}
                    </p>
                  )}
                  {group.fields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label
                        htmlFor={`${tab.id}-${field.id}`}
                        className="text-xs"
                      >
                        {field.label || field.id}
                      </Label>
                      <Input
                        id={`${tab.id}-${field.id}`}
                        type={field.type === 'password' ? 'password' : 'text'}
                        placeholder={field.placeholder}
                        {...methods.register(`${field.id}`, {
                          required: field.required,
                        })}
                      />
                      {field.description && (
                        <p className="text-muted-foreground text-[10px]">
                          {field.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {/* Se a tab tem campos diretos ao invés de grupos */}
              {tab.fields?.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <Label htmlFor={`${tab.id}-${field.id}`} className="text-xs">
                    {field.label || field.id}
                  </Label>
                  <Input
                    id={`${tab.id}-${field.id}`}
                    type={field.type === 'password' ? 'password' : 'text'}
                    placeholder={field.placeholder}
                    {...methods.register(`${field.id}`, {
                      required: field.required,
                    })}
                  />
                  {field.description && (
                    <p className="text-muted-foreground text-[10px]">
                      {field.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {!hideSubmitButton && (
          <div className="flex justify-end">
            <Button
              onClick={methods.handleSubmit(handleFormSubmit)}
              disabled={isSubmitting}
              size="sm"
              variant="secondary"
              className="w-full"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="mr-2" />
              )}
              Conectar
            </Button>
          </div>
        )}
      </div>
    </FormProvider>
  )
}
