export type AddonSettingsFieldType =
  | 'text'
  | 'textarea'
  | 'json'
  | 'mapping'
  | 'password'
  | 'number'
  | 'boolean'
  | 'select'
  | 'button'
  | 'file'
  | 'directory'
  | 'datasource-instances'
  | 'info-card'

export interface AddonSettingsOption {
  label: string
  value: string | number | boolean
}

export type AddonSettingsFieldScope = 'credential' | 'configuration'

export interface ConfiguredFieldMapping {
  icon: string
  color: string
  customValue?: string
}

export type AddonMappingPreset = Record<string, ConfiguredFieldMapping>

export interface DataSourceConfigPreset {
  pluginId?: string
  version?: string
  name?: string
  configuration: Record<string, string | number | boolean>
  mapping?: AddonMappingPreset
}

export interface AddonSettingsField {
  id: string
  type: AddonSettingsFieldType
  label: string
  /** Omitted scope is treated as configuration; credentials must opt in explicitly. */
  scope?: AddonSettingsFieldScope
  required?: boolean
  defaultValue?: string | number | boolean | AddonMappingPreset
  description?: string
  placeholder?: string
  options?: AddonSettingsOption[] // For select
  actionId?: string // For button
  variant?:
    'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  display?: {
    title?: string
    message?: string
    avatarUrl?: string
    data?: Record<string, string>
  } // For info-card
}

export type AddonSettingsTabKind = 'auth' | 'capability'

export type AddonSettingsAuthType = 'credentials' | 'oauth2'

export interface AddonSettingsGroup {
  id: string
  label: string
  description?: string
  authType?: AddonSettingsAuthType
  fields: AddonSettingsField[]
}

export interface AddonSettingsTab {
  id: string
  label: string
  description?: string
  kind?: AddonSettingsTabKind
  requiresAuth?: boolean
  isAuthenticated?: boolean
  authType?: AddonSettingsAuthType
  groups?: AddonSettingsGroup[]
  fields?: AddonSettingsField[]
}

export type AddonSettingsSchema = AddonSettingsTab[] | AddonSettingsField[]
