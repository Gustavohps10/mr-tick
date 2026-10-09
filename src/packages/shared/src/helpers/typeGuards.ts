/**
 * Canonical runtime type guards.
 * Centralizes runtime checks on untrusted or external boundaries,
 * preventing ad-hoc `typeof === 'object'` antipatterns across the codebase.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

export function isFunction(
  value: unknown,
): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

export function hasProperty<K extends string>(
  target: unknown,
  key: K,
): target is Record<K, unknown> {
  return isRecord(target) && key in target
}

export function isWorkspaceScoped(
  value: unknown,
): value is { workspaceId: string } {
  return isRecord(value) && isNonEmptyString(value.workspaceId)
}
