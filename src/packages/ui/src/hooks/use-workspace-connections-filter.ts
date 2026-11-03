import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useDataSourceConnections } from '@/hooks/use-data-source-connections'
import {
  ConnectionScope,
  ConnectionSelection,
  parseConnectionsParam,
  resolveConnectionScope,
  serializeConnectionSelection,
} from '@/lib/connection-scope'

export interface UseWorkspaceConnectionsFilterResult {
  selection: ConnectionSelection
  scope: ConnectionScope
  isLoadingCatalog: boolean
  selectedIds: string[] | undefined
  toggleConnection: (id: string) => void
  selectAll: () => void
  selectNone: () => void
  clear: () => void
}

export function useWorkspaceConnectionsFilter(): UseWorkspaceConnectionsFilterResult {
  const [searchParams, setSearchParams] = useSearchParams()
  const { dataSourceConnections, isLoading: isLoadingCatalog } =
    useDataSourceConnections()

  const rawParam = searchParams.get('connections')

  const selection = useMemo(() => parseConnectionsParam(rawParam), [rawParam])

  const catalogIds = useMemo(() => {
    const ids: string[] = []

    for (const conn of dataSourceConnections) {
      if (conn.connectionId) {
        ids.push(conn.connectionId)
      }
    }

    return ids.sort()
  }, [dataSourceConnections])

  const scope = useMemo(
    () => resolveConnectionScope(selection, catalogIds, isLoadingCatalog),
    [selection, catalogIds, isLoadingCatalog],
  )

  const selectedIds = useMemo((): string[] | undefined => {
    if (scope.kind === 'all') {
      return undefined
    }

    if (scope.kind === 'none') {
      return []
    }

    return scope.ids
  }, [scope])

  const updateParam = useCallback(
    (newSelection: ConnectionSelection) => {
      const nextParams = new URLSearchParams(searchParams)
      const serialized = serializeConnectionSelection(newSelection)

      if (serialized === null) {
        nextParams.delete('connections')
      }

      if (serialized !== null) {
        nextParams.set('connections', serialized)
      }

      setSearchParams(nextParams)
    },
    [searchParams, setSearchParams],
  )

  const toggleConnection = useCallback(
    (id: string) => {
      if (selection.kind === 'all') {
        // Estava tudo selecionado; agora desmarca `id` mantendo as outras do catálogo
        const remaining = catalogIds.filter((cid) => cid !== id)

        if (remaining.length === 0) {
          updateParam({ kind: 'none' })
          return
        }

        updateParam({ kind: 'ids', ids: remaining })
        return
      }

      if (selection.kind === 'none') {
        // Nenhuma estava selecionada; agora marca `id`
        updateParam({ kind: 'ids', ids: [id] })
        return
      }

      const hasId = selection.ids.includes(id)

      if (hasId) {
        const nextIds = selection.ids.filter((cid) => cid !== id)

        if (nextIds.length === 0) {
          updateParam({ kind: 'none' })
          return
        }

        updateParam({ kind: 'ids', ids: nextIds })
        return
      }

      const nextIds = Array.from(new Set([...selection.ids, id])).sort()

      // Se todas do catálogo estiverem marcadas, podemos manter o subset ou canonicalizar
      updateParam({ kind: 'ids', ids: nextIds })
    },
    [selection, catalogIds, updateParam],
  )

  const selectAll = useCallback(() => {
    updateParam({ kind: 'all' })
  }, [updateParam])

  const selectNone = useCallback(() => {
    updateParam({ kind: 'none' })
  }, [updateParam])

  const clear = useCallback(() => {
    updateParam({ kind: 'all' })
  }, [updateParam])

  return {
    selection,
    scope,
    isLoadingCatalog,
    selectedIds,
    toggleConnection,
    selectAll,
    selectNone,
    clear,
  }
}
