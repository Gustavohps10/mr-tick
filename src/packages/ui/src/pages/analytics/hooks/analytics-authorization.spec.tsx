import type {
  AnalyticsPlanNode,
  AnalyticsQueryInput,
  IHostBridge,
} from '@mr-tick/application'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnalyticsNodePages } from './use-analytics-node-pages'
import { useAnalyticsQuery } from './use-analytics-query'

const calls = vi.hoisted(() => ({
  query: vi.fn<IHostBridge['addons']['queryAnalytics']>(),
}))
const bridge = {
  addons: { queryAnalytics: calls.query },
} as unknown as IHostBridge
vi.mock('@/hooks', () => ({ useHostBridge: () => bridge }))

const nodes: AnalyticsPlanNode[] = [
  { id: 'a', kind: 'source', connectionInstanceId: 'A', selectionKey: 'a' },
  { id: 'b', kind: 'source', connectionInstanceId: 'B', selectionKey: 'b' },
  {
    id: 'combined',
    kind: 'join',
    upstreamNodeIds: ['a', 'b'],
    joinConfig: { joinType: 'union', leftKey: '', rightKey: '' },
  },
]
const input: AnalyticsQueryInput = {
  workspaceId: 'workspace',
  targetNodeId: 'combined',
  nodes,
  offset: 0,
  limit: 100,
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.query.mockResolvedValue({
    isSuccess: false,
    statusCode: 403,
    error: 'DENIED_A',
    details: { connectionInstanceIds: ['A'] },
  })
})

describe('Multi-source authorization failures', () => {
  it('invalidates only the connection identified by the query error', async () => {
    const onUnauthorized = vi.fn()
    renderHook(() => useAnalyticsQuery(input, 'version', onUnauthorized))
    await waitFor(() =>
      expect(onUnauthorized).toHaveBeenCalledWith(['A'], 'DENIED_A'),
    )
    expect(onUnauthorized.mock.calls.every(([ids]) => !ids.includes('B'))).toBe(
      true,
    )
  })

  it('keeps healthy ancestors when combined node preview is forbidden', async () => {
    const onUnauthorized = vi.fn()
    calls.query.mockImplementation(async ({ body }) => {
      if (body.targetNodeId === 'b')
        return {
          isSuccess: true,
          statusCode: 200,
          data: {
            columns: [],
            rows: [],
            totalRows: 0,
            offset: 0,
            limit: 100,
            hasMore: false,
            version: 'b',
            coverage: 'complete',
            loadedAt: '2026-11-10T00:00:00Z',
            remoteAggregate: false,
          },
        }
      return {
        isSuccess: false,
        statusCode: 403,
        error: 'DENIED_A',
        details: { connectionInstanceIds: ['A'] },
      }
    })
    renderHook(() =>
      useAnalyticsNodePages(
        0,
        'workspace',
        nodes,
        'version',
        onUnauthorized,
        undefined,
      ),
    )
    await waitFor(() => expect(calls.query).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(2))
    expect(
      onUnauthorized.mock.calls.every(
        ([ids]) => ids.length === 1 && ids.includes('A'),
      ),
    ).toBe(true)
  })
})
