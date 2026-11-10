import type {
  AnalyticsPlanNode,
  AnalyticsPublication,
} from '@mr-tick/application'

import type { SpaceWorkflowNodeConfig, WidgetId } from './analytics-types'

/** The request and any authorization invalidation belong only to this target's inputs. */

export function selectAnalyticsQueryInputs(
  nodes: AnalyticsPlanNode[],
  targetNodeId: string,
): AnalyticsPlanNode[] {
  const selected = new Set<string>()
  const visit = (id: string) => {
    if (selected.has(id)) return
    selected.add(id)
    const node = nodes.find((item) => item.id === id)
    if (node === undefined || node.kind === 'source') return
    for (const upstream of node.upstreamNodeIds) visit(upstream)
  }
  visit(targetNodeId)
  return nodes.filter((node) => selected.has(node.id))
}

export function isRemoteAggregateUpstream(
  nodes: SpaceWorkflowNodeConfig[],
  nodeId: string,
  visited = new Set<string>(),
): boolean {
  if (nodeId === '' || visited.has(nodeId)) return false
  visited.add(nodeId)
  const target = nodes.find((item) => item.id === nodeId)
  if (target === undefined) return false
  if (target.kind === 'source')
    return target.queryExecution?.kind === 'aggregate'
  return target.upstreamNodeIds.some((upstreamId) =>
    isRemoteAggregateUpstream(nodes, upstreamId, visited),
  )
}

export function isRemoteAggregateUnsupportedVisual(visual: WidgetId): boolean {
  return (
    visual === 'pivot_matrix' ||
    visual === 'tree_grid' ||
    visual === 'conditional_table'
  )
}

export function collectUpstreamSourceNodeIds(
  nodes: SpaceWorkflowNodeConfig[],
  targetNodeId: string,
): string[] {
  const sourceIds: string[] = []
  const visited = new Set<string>()

  const visit = (id: string) => {
    if (id === '' || visited.has(id)) return
    visited.add(id)
    const node = nodes.find((item) => item.id === id)
    if (node === undefined) return

    if (node.kind === 'source') {
      if (!sourceIds.includes(node.id)) sourceIds.push(node.id)
      return
    }

    for (const upstreamId of node.upstreamNodeIds) visit(upstreamId)
  }

  visit(targetNodeId)

  return sourceIds
}

export function buildAnalyticsPlan(
  nodes: SpaceWorkflowNodeConfig[],
  publications: Record<string, AnalyticsPublication>,
): AnalyticsPlanNode[] {
  const result: AnalyticsPlanNode[] = []

  for (const node of nodes) {
    if (node.kind === 'source') {
      const publication = publications[node.id]
      if (
        publication === undefined ||
        publication.connectionInstanceId !== node.connectionId
      )
        continue
      let columns = node.selectedColumns
      let casts = node.customFieldTypes

      if (publication.remoteAggregate) {
        columns = publication.manifest.columns.map((column) => column.name)
        casts = undefined
      }

      result.push({
        id: node.id,
        kind: 'source',
        connectionInstanceId: publication.connectionInstanceId,
        selectionKey: publication.selectionKey,
        columns,
        casts,
      })
      continue
    }

    if (node.kind === 'output') {
      result.push({
        id: node.id,
        kind: 'output',
        upstreamNodeIds: node.upstreamNodeIds,
      })
      continue
    }

    if (node.kind === 'sql') {
      if (node.sqlConfig !== undefined)
        result.push({
          id: node.id,
          kind: 'sql',
          upstreamNodeIds: node.upstreamNodeIds,
          sqlConfig: node.sqlConfig,
        })
      continue
    }

    if (node.kind === 'join') {
      if (node.joinConfig !== undefined)
        result.push({
          id: node.id,
          kind: 'join',
          upstreamNodeIds: node.upstreamNodeIds,
          joinConfig: node.joinConfig,
        })
      continue
    }

    if (node.transformConfig !== undefined)
      result.push({
        id: node.id,
        kind: node.kind,
        upstreamNodeIds: node.upstreamNodeIds,
        transformConfig: node.transformConfig,
      })
  }

  return result
}
