export type ConnectionSelection =
  { kind: 'all' } | { kind: 'none' } | { kind: 'ids'; ids: string[] }

export type ConnectionScope =
  { kind: 'all' } | { kind: 'none' } | { kind: 'subset'; ids: string[] }

export const DEFAULT_CONNECTION_SCOPE: ConnectionScope = Object.freeze({
  kind: 'all',
})

export const NONE_CONNECTION_SCOPE: ConnectionScope = Object.freeze({
  kind: 'none',
})

export const DEFAULT_CONNECTION_SELECTION: ConnectionSelection = Object.freeze({
  kind: 'all',
})

export const NONE_CONNECTION_SELECTION: ConnectionSelection = Object.freeze({
  kind: 'none',
})

export function parseConnectionsParam(
  raw: string | null | undefined,
): ConnectionSelection {
  if (raw === null || raw === undefined) {
    return DEFAULT_CONNECTION_SELECTION
  }

  const trimmed = raw.trim()

  if (trimmed === '' || trimmed === 'none') {
    return NONE_CONNECTION_SELECTION
  }

  if (trimmed === 'all') {
    return DEFAULT_CONNECTION_SELECTION
  }

  const parts = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return NONE_CONNECTION_SELECTION
  }

  // Sentinelas misturadas com outros IDs ou com 'none' => falha fechada (none)
  if (parts.includes('none')) {
    return NONE_CONNECTION_SELECTION
  }

  if (parts.includes('all')) {
    if (parts.length > 1) {
      return NONE_CONNECTION_SELECTION
    }
    return DEFAULT_CONNECTION_SELECTION
  }

  const uniqueSorted = Array.from(new Set(parts)).sort()

  return {
    kind: 'ids',
    ids: uniqueSorted,
  }
}

export function resolveConnectionScope(
  selection: ConnectionSelection,
  catalogIds: string[],
  isLoadingCatalog: boolean,
): ConnectionScope {
  if (selection.kind === 'none') {
    return NONE_CONNECTION_SCOPE
  }

  if (selection.kind === 'all') {
    return DEFAULT_CONNECTION_SCOPE
  }

  if (isLoadingCatalog) {
    return {
      kind: 'subset',
      ids: selection.ids,
    }
  }

  const catalogSet = new Set(catalogIds)
  const intersected = selection.ids.filter((id) => catalogSet.has(id)).sort()

  if (intersected.length === 0) {
    return NONE_CONNECTION_SCOPE
  }

  return {
    kind: 'subset',
    ids: intersected,
  }
}

export function serializeConnectionScope(
  scope: ConnectionScope,
): string | null {
  if (scope.kind === 'all') {
    return null
  }

  if (scope.kind === 'none') {
    return 'none'
  }

  return scope.ids.join(',')
}

export function serializeConnectionSelection(
  selection: ConnectionSelection,
): string | null {
  if (selection.kind === 'all') {
    return null
  }

  if (selection.kind === 'none') {
    return 'none'
  }

  return selection.ids.join(',')
}

export function connectionScopeKey(scope: ConnectionScope): string {
  if (scope.kind === 'all') {
    return 'all'
  }

  if (scope.kind === 'none') {
    return 'none'
  }

  return `ids:${scope.ids.join('|')}`
}

export function isNoneScope(scope: ConnectionScope): boolean {
  return scope.kind === 'none'
}

export function extractScopeSubsetIds(scopeKey: string): string[] | undefined {
  if (!scopeKey.startsWith('ids:')) {
    return undefined
  }

  return scopeKey.slice('ids:'.length).split('|').filter(Boolean)
}
