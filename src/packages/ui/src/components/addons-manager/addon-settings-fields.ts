import type { AddonSettingsField, AddonSettingsTab } from '@mr-tick/sdk'

function isEditable(field: AddonSettingsField): boolean {
  return (
    field.type !== 'button' &&
    field.type !== 'info-card' &&
    field.type !== 'datasource-instances'
  )
}

export function tabHasEditableFields(tab: AddonSettingsTab): boolean {
  if (tab.requiresAuth && tab.isAuthenticated === false) return false
  if (tab.groups && tab.groups.length > 0)
    return tab.groups.some((group) => group.fields.some(isEditable))
  if (tab.fields) return tab.fields.some(isEditable)
  return false
}
