import { useQueries } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { useDebounce } from 'use-debounce'

import { useHostBridge } from '@/hooks/use-host-bridge'

export interface TaskSearchOrigin {
  id: string
  label: string
}

export interface RemoteTaskSearchState {
  origin: TaskSearchOrigin
  phase: 'waiting' | 'searching' | 'complete' | 'error' | 'offline' | 'limited'
  message?: string
  retry: () => void
}

/** All callers use the host coordinator; local text/results never wait for this debounce. */
export function useRemoteTaskSearch(
  workspaceId: string,
  origins: readonly TaskSearchOrigin[],
  query: string,
  enabled: boolean,
) {
  const bridge = useHostBridge()
  const consumerId = useId()
  const text = query.trim()
  const [remoteText] = useDebounce(text, 400)
  const queries = useQueries({
    queries: origins.map((origin) => ({
      queryKey: [
        'remote-task-search',
        workspaceId,
        origin.id,
        consumerId,
        remoteText,
      ],
      queryFn: () =>
        bridge.tasks.listTasks({
          body: {
            workspaceId,
            connectionInstanceId: origin.id,
            consumerId,
            search: remoteText,
            page: 1,
            pageSize: 50,
          },
        }),
      enabled:
        enabled &&
        workspaceId.length > 0 &&
        remoteText.length > 0 &&
        text === remoteText &&
        bridge.tasks !== undefined,
      retry: false,
      staleTime: 30000,
    })),
  })

  const originKey = origins.map((origin) => origin.id).join('|')
  useEffect(() => {
    if (!enabled || text.length > 0 || !bridge.tasks?.cancelSearch) return
    for (const origin of origins)
      void bridge.tasks.cancelSearch({
        body: { workspaceId, connectionInstanceId: origin.id, consumerId },
      })
  }, [text, enabled, workspaceId, originKey, bridge.tasks, consumerId])

  useEffect(() => {
    const connectionIds = origins.map((origin) => origin.id)
    return () => {
      if (!bridge.tasks?.cancelSearch) return
      for (const connectionInstanceId of connectionIds)
        void bridge.tasks.cancelSearch({
          body: { workspaceId, connectionInstanceId, consumerId },
        })
    }
  }, [workspaceId, originKey, enabled, bridge.tasks, consumerId])

  const states: RemoteTaskSearchState[] = []

  if (enabled && text.length > 0) {
    origins.forEach((origin, index) => {
      const result = queries[index]
      if (result === undefined) return
      let phase: RemoteTaskSearchState['phase'] = 'complete'
      let message: string | undefined

      if (text !== remoteText) phase = 'waiting'
      if (text === remoteText && result.isFetching) phase = 'searching'
      if (text === remoteText && result.isError) {
        phase = 'error'
        message = result.error.message
      }
      if (
        text === remoteText &&
        result.data !== undefined &&
        !result.data.isSuccess
      ) {
        phase = 'error'
        message = result.data.error
        if (result.data.statusCode === 429) phase = 'limited'
        if (result.data.statusCode === 0) phase = 'offline'
      }

      states.push({
        origin,
        phase,
        message,
        retry: () => {
          void result.refetch()
        },
      })
    })
  }

  return { states, queries }
}
