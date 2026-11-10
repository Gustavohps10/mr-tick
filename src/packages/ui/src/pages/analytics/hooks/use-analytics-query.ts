import type {
  AnalyticsQueryInput,
  AnalyticsQueryResult,
} from '@mr-tick/application'
import { useCallback, useEffect, useState } from 'react'

import { useHostBridge } from '@/hooks'

import { selectAnalyticsQueryInputs } from '../lib/analytics-plan'

/** Only a bounded result page crosses the desktop boundary. */

export function useAnalyticsQuery(
  input: AnalyticsQueryInput | undefined,
  publicationVersion: string,
  onUnauthorized: (connectionIds: string[], message: string) => void,
) {
  let scoped: AnalyticsQueryInput | undefined
  if (input !== undefined)
    scoped = {
      ...input,
      nodes: selectAnalyticsQueryInputs(input.nodes, input.targetNodeId),
    }
  const query = scoped
  const bridge = useHostBridge()
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((previous) => previous + 1), [])
  const signature = JSON.stringify([query, publicationVersion, attempt])
  const [state, setState] = useState<{
    signature: string
    data?: AnalyticsQueryResult
    details?: Record<string, string[]>
    error?: string
    loading: boolean
  }>({ signature: '', loading: false })

  useEffect(() => {
    if (query === undefined) return
    let active = true
    setState({ signature, loading: true })
    void bridge.addons.queryAnalytics({ body: query }).then((response) => {
      if (!active) return

      if (response.isSuccess && response.data !== undefined) {
        setState({ signature, data: response.data, loading: false })
        return
      }

      let error = 'ANALYTICS_QUERY_FAILED'
      if (response.error !== undefined) error = response.error
      if (response.statusCode === 401 || response.statusCode === 403)
        onUnauthorized(
          query.nodes
            .filter((node) => node.kind === 'source')
            .map((node) => node.connectionInstanceId),
          error,
        )
      setState({ signature, error, details: response.details, loading: false })
    })
    return () => {
      active = false
    }
    // The serialized request is the complete query identity.
  }, [bridge.addons, signature])

  if (state.signature !== signature)
    return {
      data: undefined,
      error: undefined,
      details: undefined,
      retry,
      loading: query !== undefined,
    }
  return { ...state, retry }
}
