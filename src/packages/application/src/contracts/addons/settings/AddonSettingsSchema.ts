export type AddonSettingsFieldScope = 'credential' | 'configuration'

export interface AddonSettingsOption {
  readonly label: string
  readonly value: string | number | boolean
  readonly description?: string
  readonly disabled?: boolean
}

export interface AddonSettingsMultiSelectOption {
  readonly label: string
  readonly value: string | number
  readonly description?: string
  readonly disabled?: boolean
}

export type ConfiguredFieldMapping = {
  readonly icon: string
  readonly color: string
  readonly customValue?: string
}

export type AddonMappingPreset = Record<string, ConfiguredFieldMapping>

export interface DataSourceConfigPreset {
  readonly pluginId?: string
  readonly version?: string
  readonly name?: string
  readonly configuration: Record<string, string | number | boolean>
  readonly mapping?: AddonMappingPreset
}

export type AddonFieldAddressStep =
  | { readonly kind: 'field'; readonly fieldId: string }
  | { readonly kind: 'item'; readonly itemId: string }

export interface AddonFieldAddress {
  readonly path: readonly AddonFieldAddressStep[]
}

export interface AddonBaseSettingsField {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly required?: boolean
  readonly scope?: AddonSettingsFieldScope
}

export interface AddonSettingsTextField extends AddonBaseSettingsField {
  readonly type: 'text'
  readonly defaultValue?: string
  readonly placeholder?: string
}

export interface AddonSettingsTextareaField extends AddonBaseSettingsField {
  readonly type: 'textarea'
  readonly defaultValue?: string
  readonly placeholder?: string
  readonly rows?: number
}

export interface AddonSettingsNumberField extends AddonBaseSettingsField {
  readonly type: 'number'
  readonly defaultValue?: number
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly placeholder?: string
}

export interface AddonSettingsBooleanField extends AddonBaseSettingsField {
  readonly type: 'boolean'
  readonly defaultValue?: boolean
}

export interface AddonSettingsDateField extends AddonBaseSettingsField {
  readonly type: 'date'
  readonly defaultValue?: string
  readonly placeholder?: string
}

export interface AddonSettingsTimeField extends AddonBaseSettingsField {
  readonly type: 'time'
  readonly defaultValue?: string
  readonly placeholder?: string
}

export interface AddonSettingsTimezoneField extends AddonBaseSettingsField {
  readonly type: 'timezone'
  readonly defaultValue?: string
  readonly placeholder?: string
}

export interface AddonSettingsFieldDependency {
  readonly base: 'root' | 'parent'
  readonly address: AddonFieldAddress
}

export type AddonSettingsSelectSource =
  | {
      readonly kind: 'static'
      readonly options: readonly AddonSettingsOption[]
    }
  | {
      readonly kind: 'dynamic'
      readonly providerId: string
      readonly dependsOn?: readonly AddonSettingsFieldDependency[]
    }

export type AddonSettingsMultiSelectSource =
  | {
      readonly kind: 'static'
      readonly options: readonly AddonSettingsMultiSelectOption[]
    }
  | {
      readonly kind: 'dynamic'
      readonly providerId: string
      readonly dependsOn?: readonly AddonSettingsFieldDependency[]
    }

export interface AddonSettingsSelectField extends AddonBaseSettingsField {
  readonly type: 'select'
  readonly source: AddonSettingsSelectSource
  readonly defaultValue?: string | number | boolean
  readonly placeholder?: string
}

export interface AddonSettingsMultiSelectField extends AddonBaseSettingsField {
  readonly type: 'multiselect'
  readonly source: AddonSettingsMultiSelectSource
  readonly defaultValue?: readonly (string | number)[]
  readonly placeholder?: string
}

export interface AddonSettingsTaskReferenceField extends AddonBaseSettingsField {
  readonly type: 'task-reference'
  readonly includeMetadata?: boolean
}

export interface AddonSettingsGroupField {
  readonly id: string
  readonly type: 'group'
  readonly label: string
  readonly description?: string
  readonly scope?: AddonSettingsFieldScope
  readonly fields: readonly AddonSettingsField[]
}

export interface AddonSettingsCollectionField {
  readonly id: string
  readonly type: 'collection'
  readonly label: string
  readonly description?: string
  readonly itemLabel?: string
  readonly scope?: AddonSettingsFieldScope
  readonly enabledFieldId?: string
  readonly allowReorder?: boolean
  readonly allowDuplicate?: boolean
  readonly fields: readonly AddonSettingsField[]
}

export interface AddonOperationalActionDefinition {
  readonly id: string
  readonly label: string
  readonly variant?:
    'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  readonly fields?: readonly AddonSettingsField[]
}

export interface AddonSettingsOperationalListField {
  readonly id: string
  readonly type: 'operational-list'
  readonly label: string
  readonly description?: string
  readonly scope?: AddonSettingsFieldScope
  readonly providerId: string
  readonly actions: readonly AddonOperationalActionDefinition[]
}

export interface AddonSettingsPasswordField extends AddonBaseSettingsField {
  readonly type: 'password'
  readonly scope: 'credential'
  readonly placeholder?: string
}

export interface AddonSettingsJsonField extends AddonBaseSettingsField {
  readonly type: 'json'
  readonly defaultValue?: string
  readonly placeholder?: string
}

export interface AddonSettingsMappingField extends AddonBaseSettingsField {
  readonly type: 'mapping'
  readonly defaultValue?: AddonMappingPreset
}

export interface AddonSettingsButtonField {
  readonly id: string
  readonly type: 'button'
  readonly label: string
  readonly actionId: string
  readonly scope?: AddonSettingsFieldScope
  readonly variant?:
    'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  readonly description?: string
}

export interface AddonSettingsInfoCardField {
  readonly id: string
  readonly type: 'info-card'
  readonly label: string
  readonly description?: string
  readonly scope?: AddonSettingsFieldScope
  readonly display?: {
    readonly title?: string
    readonly message?: string
    readonly avatarUrl?: string
    readonly data?: Record<string, string>
  }
}

export interface AddonSettingsDataSourceInstancesField {
  readonly id: string
  readonly type: 'datasource-instances'
  readonly label: string
  readonly scope?: AddonSettingsFieldScope
  readonly description?: string
}

export interface AddonSettingsFileField extends AddonBaseSettingsField {
  readonly type: 'file'
  readonly defaultValue?: string
  readonly placeholder?: string
  readonly extensions?: readonly string[]
}

export interface AddonSettingsDirectoryField extends AddonBaseSettingsField {
  readonly type: 'directory'
  readonly defaultValue?: string
  readonly placeholder?: string
}

export type AddonCollectionItemField = AddonSettingsField

export type AddonSettingsField =
  | AddonSettingsTextField
  | AddonSettingsTextareaField
  | AddonSettingsNumberField
  | AddonSettingsBooleanField
  | AddonSettingsDateField
  | AddonSettingsTimeField
  | AddonSettingsTimezoneField
  | AddonSettingsSelectField
  | AddonSettingsMultiSelectField
  | AddonSettingsTaskReferenceField
  | AddonSettingsGroupField
  | AddonSettingsCollectionField
  | AddonSettingsOperationalListField
  | AddonSettingsPasswordField
  | AddonSettingsJsonField
  | AddonSettingsMappingField
  | AddonSettingsButtonField
  | AddonSettingsInfoCardField
  | AddonSettingsDataSourceInstancesField
  | AddonSettingsFileField
  | AddonSettingsDirectoryField

export type AddonSettingsFieldType = AddonSettingsField['type']

export type AddonSettingsTabKind = 'auth' | 'capability'
export type AddonSettingsAuthType = 'credentials' | 'oauth2'

export interface AddonSettingsGroup {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly authType?: AddonSettingsAuthType
  readonly fields: readonly AddonSettingsField[]
}

export interface AddonSettingsTab {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly kind?: AddonSettingsTabKind
  readonly requiresAuth?: boolean
  readonly isAuthenticated?: boolean
  readonly authType?: AddonSettingsAuthType
  readonly evaluatorId?: string
  readonly groups?: readonly AddonSettingsGroup[]
  readonly fields?: readonly AddonSettingsField[]
}

export type AddonSettingsSchema =
  readonly AddonSettingsTab[] | readonly AddonSettingsField[]
