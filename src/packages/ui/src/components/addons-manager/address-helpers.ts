import type {
  AddonFieldAddress,
  AddonFieldAddressStep,
  AddonResolvedDependencyEntry,
  AddonSettingObjectValue,
  AddonSettingsFieldDependency,
  AddonSettingsValues,
  AddonSettingValue,
} from '@mr-tick/application'

export function serializeFieldAddress(address: AddonFieldAddress): string {
  if (address.path.length === 0) return ''
  return JSON.stringify(address.path)
}

export function areFieldAddressesEqual(
  a: AddonFieldAddress,
  b: AddonFieldAddress,
): boolean {
  if (a.path.length !== b.path.length) return false
  return a.path.every((stepA, index) => {
    const stepB = b.path[index]
    if (!stepB) return false
    if (stepA.kind !== stepB.kind) return false
    if (stepA.kind === 'field' && stepB.kind === 'field') {
      return stepA.fieldId === stepB.fieldId
    }
    if (stepA.kind === 'item' && stepB.kind === 'item') {
      return stepA.itemId === stepB.itemId
    }
    return false
  })
}

function isObjectRecord(
  value: AddonSettingValue | undefined,
): value is AddonSettingObjectValue {
  if (value === undefined) return false
  if (value === null) return false
  if (typeof value !== 'object') return false
  if (Array.isArray(value)) return false
  return true
}

function isCollectionItemRecord(candidate: AddonSettingValue): candidate is {
  readonly itemId: string
  readonly values: AddonSettingObjectValue
} {
  if (!isObjectRecord(candidate)) return false
  const itemId = candidate['itemId']
  if (typeof itemId !== 'string') return false
  const values = candidate['values']
  if (!isObjectRecord(values)) return false
  return true
}

export function resolveValueAtAddress(
  values: AddonSettingsValues,
  address: AddonFieldAddress,
): AddonSettingValue | undefined {
  if (address.path.length === 0) return undefined

  let currentScope: AddonSettingObjectValue = values
  let resolvedValue: AddonSettingValue | undefined = undefined

  for (let index = 0; index < address.path.length; index += 1) {
    const step: AddonFieldAddressStep | undefined = address.path[index]
    if (!step) return undefined

    if (step.kind === 'field') {
      const candidate: AddonSettingValue | undefined =
        currentScope[step.fieldId]
      if (candidate === undefined) return undefined
      resolvedValue = candidate
      if (index < address.path.length - 1 && isObjectRecord(candidate)) {
        currentScope = candidate
      }
      continue
    }

    if (step.kind === 'item') {
      if (!Array.isArray(resolvedValue)) return undefined
      const found: AddonSettingValue | undefined = resolvedValue.find(
        (entry: AddonSettingValue) => {
          if (!isCollectionItemRecord(entry)) return false
          return entry.itemId === step.itemId
        },
      )
      if (!found) return undefined
      if (!isCollectionItemRecord(found)) return undefined
      currentScope = found.values
      resolvedValue = found.values
      continue
    }
  }

  return resolvedValue
}

export function resolveDependencyAddress(
  currentFieldAddress: AddonFieldAddress,
  dependency: AddonSettingsFieldDependency,
): AddonFieldAddress {
  if (dependency.base === 'root') {
    return dependency.address
  }
  const parentSteps = currentFieldAddress.path.slice(0, -1)
  return {
    path: [...parentSteps, ...dependency.address.path],
  }
}

export function extractResolvedDependencies(
  draftValues: AddonSettingsValues,
  currentFieldAddress: AddonFieldAddress,
  dependencies: readonly AddonSettingsFieldDependency[] | undefined,
): readonly AddonResolvedDependencyEntry[] {
  if (!dependencies) return []
  if (dependencies.length === 0) return []

  const result: AddonResolvedDependencyEntry[] = []

  for (const dep of dependencies) {
    const fullAddress = resolveDependencyAddress(currentFieldAddress, dep)
    const val = resolveValueAtAddress(draftValues, fullAddress)
    if (val === undefined) continue

    result.push({
      address: fullAddress,
      value: val,
    })
  }

  return result
}

function clearFieldInObject(
  record: AddonSettingObjectValue,
  fieldId: string,
  remainingSteps: readonly AddonFieldAddressStep[],
): AddonSettingsValues {
  const next: Record<string, AddonSettingValue> = {}
  for (const [key, val] of Object.entries(record)) {
    if (val === undefined) continue
    if (key === fieldId) {
      if (remainingSteps.length === 0) {
        continue
      }
      const updatedChild = clearFieldRecursively(val, remainingSteps)
      if (updatedChild !== undefined) {
        next[key] = updatedChild
      }
      continue
    }
    next[key] = val
  }
  return next
}

function clearFieldInArray(
  list: readonly AddonSettingValue[],
  itemId: string,
  remainingSteps: readonly AddonFieldAddressStep[],
): readonly AddonSettingValue[] {
  return list.map((entry) => {
    if (!isCollectionItemRecord(entry)) return entry
    if (entry.itemId !== itemId) return entry
    const firstRemaining = remainingSteps[0]
    const targetFieldId =
      firstRemaining?.kind === 'field' ? firstRemaining.fieldId : ''
    const updatedValues = clearFieldInObject(
      entry.values,
      targetFieldId,
      remainingSteps.slice(1),
    )
    return {
      itemId: entry.itemId,
      values: updatedValues,
    }
  })
}

function clearFieldRecursively(
  value: AddonSettingValue,
  steps: readonly AddonFieldAddressStep[],
): AddonSettingValue | undefined {
  if (steps.length === 0) return value
  const step = steps[0]
  if (!step) return value

  if (step.kind === 'field') {
    if (!isObjectRecord(value)) return value
    return clearFieldInObject(value, step.fieldId, steps.slice(1))
  }

  if (step.kind === 'item') {
    if (!Array.isArray(value)) return value
    return clearFieldInArray(value, step.itemId, steps.slice(1))
  }

  return value
}

export function clearValueAtAddress(
  values: AddonSettingsValues,
  address: AddonFieldAddress,
): AddonSettingsValues {
  if (address.path.length === 0) return values
  const firstStep = address.path[0]
  if (!firstStep) return values
  if (firstStep.kind !== 'field') return values

  return clearFieldInObject(values, firstStep.fieldId, address.path.slice(1))
}
