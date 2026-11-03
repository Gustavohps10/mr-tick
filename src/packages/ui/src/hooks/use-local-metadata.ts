import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useHostBridge } from '@/hooks/use-host-bridge'

export function useLocalMetadata(workspaceId: string) {
  const bridge = useHostBridge()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['local-metadata', workspaceId],
    queryFn: () => bridge.core.getLocalMetadata({ body: { workspaceId } }),
    enabled:
      workspaceId.length > 0 && bridge.core?.getLocalMetadata !== undefined,
  })

  useEffect(
    () =>
      bridge.events.on<{ workspaceId: string }>(
        'local-metadata:changed',
        (event) => {
          if (event.workspaceId !== workspaceId) return
          void client.invalidateQueries({
            queryKey: ['local-metadata', workspaceId],
          })
          void client.invalidateQueries({
            queryKey: ['popover-metadata-activities'],
          })
        },
      ),
    [bridge.events, client, workspaceId],
  )

  return query
}
