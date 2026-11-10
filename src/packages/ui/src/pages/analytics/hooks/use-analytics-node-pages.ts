import type {
  AnalyticsPlanNode,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
} from '@mr-tick/application'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useHostBridge } from '@/hooks'

import { selectAnalyticsQueryInputs } from '../lib/analytics-plan'

export function useAnalyticsNodePages(
  revision: number,
  workspaceId: string | undefined,
  nodes: AnalyticsPlanNode[],
  publicationVersion: string,
  onUnauthorized: (connectionIds: string[], message: string) => void,
  inspection:
    | { id: string; search: string; offset: number; version?: string }
    | undefined,
) {
  const bridge = useHostBridge()
  const [pages, setPages] = useState<
    Record<
      string,
      {
        signature: string
        data?: AnalyticsQueryResult
        details?: Record<string, string[]>
        error?: string
      }
    >
  >({})
  const tail = useRef(Promise.resolve())
  const requests = useRef(new Map<string, string>())
  const inputs: Record<string, AnalyticsQueryInput> = {}

  if (workspaceId !== undefined)
    for (const node of nodes) {
      const input: AnalyticsQueryInput = {
        workspaceId,
        nodes: selectAnalyticsQueryInputs(nodes, node.id),
        targetNodeId: node.id,
        offset: 0,
        limit: 100,
      }
      if (inspection?.id === node.id)
        Object.assign(input, {
          search: inspection.search,
          offset: inspection.offset,
          version: inspection.version,
        })
      inputs[node.id] = input
    }

  const identity = JSON.stringify([inputs, publicationVersion, revision])

  useEffect(() => {
    for (const id of requests.current.keys())
      if (inputs[id] === undefined) requests.current.delete(id)

    for (const [id, input] of Object.entries(inputs)) {
      const signature = JSON.stringify([input, publicationVersion, revision])
      if (requests.current.get(id) === signature) continue
      requests.current.set(id, signature)
      tail.current = tail.current.then(async () => {
        if (requests.current.get(id) !== signature) return
        const response = await bridge.addons.queryAnalytics({ body: input })
        if (requests.current.get(id) !== signature) return

        if (response.isSuccess && response.data !== undefined) {
          setPages((previous) => ({
            ...previous,
            [id]: { signature, data: response.data },
          }))
          return
        }

        let error = 'ANALYTICS_QUERY_FAILED'
        if (response.error !== undefined) error = response.error
        if (response.statusCode === 401 || response.statusCode === 403)
          onUnauthorized(
            input.nodes
              .filter((node) => node.kind === 'source')
              .map((node) => node.connectionInstanceId),
            error,
          )
        setPages((previous) => ({
          ...previous,
          [id]: { signature, error, details: response.details },
        }))
      })
    }

    // Each entry is invalidated separately; changing one preview cannot cancel another.
  }, [bridge.addons, identity])

  useEffect(
    () => () => {
      requests.current.clear()
    },
    [],
  )
  return useMemo(() => {
    const current: typeof pages = {}

    for (const [id, input] of Object.entries(inputs)) {
      const page = pages[id]
      if (
        page?.signature ===
        JSON.stringify([input, publicationVersion, revision])
      )
        current[id] = page
    }

    return current
  }, [pages, identity])
}
