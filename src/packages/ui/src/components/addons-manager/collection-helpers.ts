import type {
  AddonCollectionItemEnvelope,
  AddonSettingsValues,
  AddonSettingValue,
} from '@mr-tick/application'

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

export function updateCollectionItemFieldValue(
  item: AddonCollectionItemEnvelope,
  fieldId: string,
  nextValue: AddonSettingValue,
): AddonCollectionItemEnvelope {
  return {
    itemId: item.itemId,
    values: {
      ...item.values,
      [fieldId]: nextValue,
    },
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
