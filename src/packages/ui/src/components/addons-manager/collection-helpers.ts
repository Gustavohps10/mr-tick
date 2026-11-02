import type {
  AddonCollectionItemEnvelope,
  AddonSettingsValues,
  AddonSettingValue,
} from '@mr-tick/application'
import type { AddonSettingsField } from '@mr-tick/sdk'

export type { AddonCollectionItemEnvelope } from '@mr-tick/application'

export function createCollectionItemEnvelope(
  initialValues: AddonSettingsValues,
  newItemId: string,
): AddonCollectionItemEnvelope {
  return {
    itemId: newItemId,
    values: { ...initialValues },
  }
}

export function duplicateCollectionItemEnvelope(
  item: AddonCollectionItemEnvelope,
  newItemId: string,
): AddonCollectionItemEnvelope {
  return {
    itemId: newItemId,
    values: { ...item.values },
  }
}

export function removeCollectionItemEnvelope(
  items: readonly AddonCollectionItemEnvelope[],
  targetItemId: string,
): readonly AddonCollectionItemEnvelope[] {
  return items.filter((item) => item.itemId !== targetItemId)
}

export function reorderCollectionItemEnvelope(
  items: readonly AddonCollectionItemEnvelope[],
  fromIndex: number,
  toIndex: number,
): readonly AddonCollectionItemEnvelope[] {
  if (fromIndex === toIndex) return items
  if (fromIndex < 0 || fromIndex >= items.length) return items
  if (toIndex < 0 || toIndex >= items.length) return items

  const result = [...items]
  const targetItem = result[fromIndex]
  if (!targetItem) return items

  result.splice(fromIndex, 1)
  result.splice(toIndex, 0, targetItem)

  return result
}

export function updateCollectionItemEnvelope(
  items: readonly AddonCollectionItemEnvelope[],
  targetItemId: string,
  updater: (
    current: AddonCollectionItemEnvelope,
  ) => AddonCollectionItemEnvelope,
): readonly AddonCollectionItemEnvelope[] {
  return items.map((item) => {
    if (item.itemId !== targetItemId) return item

    const updated = updater(item)
    if (updated.itemId === item.itemId) return updated

    return {
      ...updated,
      itemId: item.itemId,
    }
  })
}

export function isFieldValueEqual(
  a: AddonSettingValue | undefined,
  b: AddonSettingValue | undefined,
): boolean {
  if (a === b) return true
  if (a === undefined && b === null) return true
  if (a === null && b === undefined) return true

  if (
    (typeof a === 'string' || typeof a === 'number') &&
    (typeof b === 'string' || typeof b === 'number')
  ) {
    return String(a) === String(b)
  }

  return false
}

function fieldDependsOn(
  field: AddonSettingsField,
  targetFieldId: string,
): boolean {
  if (field.type === 'select' || field.type === 'multiselect') {
    if (field.source.kind === 'dynamic' && field.source.dependsOn) {
      return field.source.dependsOn.some((dep) => {
        const lastStep = dep.address.path[dep.address.path.length - 1]
        return lastStep?.kind === 'field' && lastStep.fieldId === targetFieldId
      })
    }
  }

  return false
}

export function findDependentFieldIds(
  fields: readonly AddonSettingsField[],
  changedFieldId: string,
): readonly string[] {
  const result = new Set<string>()
  const queue: string[] = [changedFieldId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) continue

    for (const field of fields) {
      if (result.has(field.id) || field.id === changedFieldId) continue

      if (fieldDependsOn(field, currentId)) {
        result.add(field.id)
        queue.push(field.id)
      }
    }
  }

  return Array.from(result)
}

export function updateCollectionItemFieldValue(
  item: AddonCollectionItemEnvelope,
  fieldId: string,
  nextValue: AddonSettingValue,
  fields?: readonly AddonSettingsField[],
): AddonCollectionItemEnvelope {
  if (isFieldValueEqual(item.values[fieldId], nextValue)) {
    return item
  }

  const nextValues: Record<string, AddonSettingValue> = {
    ...item.values,
    [fieldId]: nextValue,
  }

  if (fields && fields.length > 0) {
    const dependentFieldIds = findDependentFieldIds(fields, fieldId)

    for (const depId of dependentFieldIds) {
      const depField = fields.find((f) => f.id === depId)
      if (
        depField &&
        'defaultValue' in depField &&
        depField.defaultValue !== undefined
      ) {
        const def = depField.defaultValue
        if (
          typeof def === 'string' ||
          typeof def === 'number' ||
          typeof def === 'boolean'
        ) {
          nextValues[depId] = def
          continue
        }
      }

      delete nextValues[depId]
    }
  }

  return {
    itemId: item.itemId,
    values: nextValues,
  }
}

export interface RequestTracker {
  nextId(): number
  isCurrent(requestId: number): boolean
  reset(): void
}

export function createRequestTracker(): RequestTracker {
  let currentRequestId = 0

  return {
    nextId(): number {
      currentRequestId += 1
      return currentRequestId
    },
    isCurrent(requestId: number): boolean {
      return requestId === currentRequestId
    },
    reset(): void {
      currentRequestId += 1
    },
  }
}
