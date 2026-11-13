import type {
  AnalyticsQueryInput,
  AnalyticsQueryResult,
} from '@mr-tick/application'
import { useCallback, useEffect, useState } from 'react'

import { useHostBridge } from '@/hooks'

import { selectAnalyticsQueryInputs } from '../lib/analytics-plan'

function computeStructuralKey(input: AnalyticsQueryInput | undefined): string {
  if (input === undefined) return ''

  return JSON.stringify({
    workspaceId: input.workspaceId,
    targetNodeId: input.targetNodeId,
    nodes: input.nodes,
    projection: input.projection,
    filters: input.filters,
    search: input.search,
    calculation: input.calculation,
    rollup: input.rollup,
    groupBy: input.groupBy,
    measures: input.measures,
    pivot: input.pivot,
  })
}

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
  const structuralKey = computeStructuralKey(query)
  const [state, setState] = useState<{
    signature: string
    structuralKey: string
    data?: AnalyticsQueryResult
    details?: Record<string, string[]>
    error?: string
    loading: boolean
  }>({ signature: '', structuralKey: '', loading: false })

  useEffect(() => {
    if (query === undefined) {
      setState((previous) => {
        if (
          previous.signature === '' &&
          previous.data === undefined &&
          previous.error === undefined &&
          !previous.loading
        )
          return previous

        return { signature: '', structuralKey: '', loading: false }
      })
      return
    }

    let active = true

    setState((previous) => {
      if (
        previous.structuralKey === structuralKey &&
        previous.data !== undefined
      )
        return {
          signature,
          structuralKey,
          data: previous.data,
          details: previous.details,
          loading: true,
        }

      return { signature, structuralKey, loading: true }
    })

    void bridge.addons.queryAnalytics({ body: query }).then((response) => {
      if (!active) return

      if (response.isSuccess && response.data !== undefined) {
        setState({
          signature,
          structuralKey,
          data: response.data,
          loading: false,
        })
        return
      }

      let error = 'ANALYTICS_QUERY_FAILED'
      if (response.error !== undefined) error = response.error

      if (response.statusCode === 401 || response.statusCode === 403) {
        if (response.details?.connectionInstanceIds !== undefined)
          onUnauthorized(response.details.connectionInstanceIds, error)
        setState({
          signature,
          structuralKey,
          data: undefined,
          error,
          details: response.details,
          loading: false,
        })
        return
      }

      setState((previous) => {
        let retainedData: AnalyticsQueryResult | undefined
        if (previous.structuralKey === structuralKey)
          retainedData = previous.data

        return {
          signature,
          structuralKey,
          data: retainedData,
          error,
          details: response.details,
          loading: false,
        }
      })
    })

    return () => {
      active = false
    }
    // The serialized request is the complete query identity.
  }, [bridge.addons, signature])

  if (query === undefined)
    return {
      data: undefined,
      error: undefined,
      details: undefined,
      retry,
      loading: false,
      isRefreshing: false,
    }

  if (state.signature !== signature) {
    if (state.structuralKey === structuralKey && state.data !== undefined)
      return {
        data: state.data,
        error: undefined,
        details: undefined,
        retry,
        loading: false,
        isRefreshing: true,
      }

    return {
      data: undefined,
      error: undefined,
      details: undefined,
      retry,
      loading: true,
      isRefreshing: false,
    }
  }

  return {
    data: state.data,
    error: state.error,
    details: state.details,
    retry,
    loading: state.loading && state.data === undefined,
    isRefreshing: state.loading && state.data !== undefined,
  }
}
