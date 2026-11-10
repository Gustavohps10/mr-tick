import type {
  AnalyticsPlanNode,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
} from '@mr-tick/application'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useHostBridge } from '@/hooks'

import { selectAnalyticsQueryInputs } from '../lib/analytics-plan'

function computePageStructuralKey(input: AnalyticsQueryInput): string {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    targetNodeId: input.targetNodeId,
    nodes: input.nodes,
    search: input.search,
    offset: input.offset,
    limit: input.limit,
  })
}

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
        structuralKey: string
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
      const structuralKey = computePageStructuralKey(input)
      if (requests.current.get(id) === signature) continue
      requests.current.set(id, signature)
      tail.current = tail.current.then(async () => {
        if (requests.current.get(id) !== signature) return
        const response = await bridge.addons.queryAnalytics({ body: input })
        if (requests.current.get(id) !== signature) return

        if (response.isSuccess && response.data !== undefined) {
          setPages((previous) => ({
            ...previous,
            [id]: { signature, structuralKey, data: response.data },
          }))
          return
        }

        let error = 'ANALYTICS_QUERY_FAILED'
        if (response.error !== undefined) error = response.error

        if (response.statusCode === 401 || response.statusCode === 403) {
          if (response.details?.connectionInstanceIds !== undefined)
            onUnauthorized(response.details.connectionInstanceIds, error)
          setPages((previous) => ({
            ...previous,
            [id]: {
              signature,
              structuralKey,
              data: undefined,
              error,
              details: response.details,
            },
          }))
          return
        }

        setPages((previous) => {
          const prior = previous[id]
          let retainedData: AnalyticsQueryResult | undefined
          if (prior !== undefined && prior.structuralKey === structuralKey)
            retainedData = prior.data

          return {
            ...previous,
            [id]: {
              signature,
              structuralKey,
              data: retainedData,
              error,
              details: response.details,
            },
          }
        })
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
      const expectedSignature = JSON.stringify([
        input,
        publicationVersion,
        revision,
      ])
      const expectedStructuralKey = computePageStructuralKey(input)

      if (page?.signature === expectedSignature) {
        current[id] = page
        continue
      }

      if (
        page !== undefined &&
        page.structuralKey === expectedStructuralKey &&
        page.data !== undefined &&
        page.error === undefined
      )
        current[id] = page
    }

    return current
  }, [pages, identity])
}
