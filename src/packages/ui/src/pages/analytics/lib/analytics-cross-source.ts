import type { AnalyticsDatasetRow } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  AnalyticsFilterValue,
  SpaceWorkflowEdgeConfig,
  SpaceWorkflowNodeConfig,
} from './analytics-types'

export const DEFAULT_CROSS_SOURCE_MAX_VALUES = 500

export interface WorkflowDependencyOrder {
  orderedNodeIds: string[]
  orderedSourceIds: string[]
}

export interface AppliedFilterBindingsResult {
  filterValues: Record<string, AnalyticsFilterValue> | undefined
  status: 'ready' | 'waiting' | 'skipped_empty' | 'failed'
  reason?: string
}

export function sanitizeSqlAlias(
  rawLabel: string,
  fallbackIndex: number,
): string {
  const ascii = rawLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')

  if (ascii.length === 0) return `fonte_${fallbackIndex}`

  if (/^[0-9]/u.test(ascii)) return `f_${ascii}`

  return ascii
}

export function getBindingCacheKey(
  upstreamNodeId: string,
  sourceColumn: string,
): string {
  return `${upstreamNodeId}::${sourceColumn}`
}

export function collectNodeDependencies(
  node: SpaceWorkflowNodeConfig,
): string[] {
  const deps = new Set<string>()

  if (node.filterBindings !== undefined) {
    for (const binding of node.filterBindings) {
      if (binding.upstreamNodeId.trim() !== '') deps.add(binding.upstreamNodeId)
    }
  }

  if (node.transformInputs !== undefined && node.transformInputs.length > 0) {
    for (const input of node.transformInputs) {
      if (input.nodeId.trim() !== '') deps.add(input.nodeId)
    }
  }

  for (const upstreamId of node.upstreamNodeIds) {
    if (upstreamId.trim() !== '') deps.add(upstreamId)
  }

  return Array.from(deps)
}

export function resolveWorkflowFilterDependencies(
  nodes: SpaceWorkflowNodeConfig[],
): Either<AppError, WorkflowDependencyOrder> {
  const nodeById = new Map<string, SpaceWorkflowNodeConfig>()
  const dependenciesById = new Map<string, string[]>()
  const dependentsById = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const node of nodes) {
    nodeById.set(node.id, node)
    dependenciesById.set(node.id, [])
    dependentsById.set(node.id, [])
    inDegree.set(node.id, 0)
  }

  for (const node of nodes) {
    const rawDeps = collectNodeDependencies(node)
    const validDeps = rawDeps.filter((depId) => nodeById.has(depId))

    dependenciesById.set(node.id, validDeps)
    inDegree.set(node.id, validDeps.length)

    for (const depId of validDeps) {
      if (depId === node.id)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_DEPENDENCY_CYCLE'),
        )

      const list = dependentsById.get(depId)

      if (list !== undefined) list.push(node.id)
    }
  }

  const queue: string[] = []

  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(nodeId)
  }

  const orderedNodeIds: string[] = []
  let cursor = 0

  while (cursor < queue.length) {
    const currentId = queue.find((_, index) => index === cursor)
    cursor += 1

    if (currentId === undefined) continue

    orderedNodeIds.push(currentId)
    const dependents = dependentsById.get(currentId)

    if (dependents === undefined) continue

    for (const dependentId of dependents) {
      const currentDegree = inDegree.get(dependentId)
      let nextDegree = -1

      if (currentDegree !== undefined) nextDegree = currentDegree - 1

      inDegree.set(dependentId, nextDegree)

      if (nextDegree === 0) queue.push(dependentId)
    }
  }

  if (orderedNodeIds.length !== nodes.length)
    return Either.failure(
      AppError.ValidationError('ANALYTICS_DEPENDENCY_CYCLE'),
    )

  const orderedSourceIds = orderedNodeIds.filter((id) => {
    const matched = nodeById.get(id)
    return matched !== undefined && matched.kind === 'source'
  })

  return Either.success({ orderedNodeIds, orderedSourceIds })
}

export function extractDistinctFilterValuesFromRows(
  rows: AnalyticsDatasetRow[],
  sourceColumn: string,
  maxValues = DEFAULT_CROSS_SOURCE_MAX_VALUES,
): Either<AppError, string[]> {
  const unique = new Set<string>()

  for (const row of rows) {
    const raw = row[sourceColumn]

    if (raw === null || raw === undefined) continue

    const text = String(raw).trim()

    if (text === '') continue

    unique.add(text)

    if (unique.size > maxValues)
      return Either.failure(
        AppError.ValidationError('ANALYTICS_CROSS_SOURCE_CARDINALITY_EXCEEDED'),
      )
  }

  return Either.success(Array.from(unique))
}

export function applyResolvedFilterBindings(
  node: SpaceWorkflowNodeConfig,
  resolvedValuesByBindingKey: Record<string, string[]>,
  upstreamReadyByNodeId: Record<string, boolean>,
): AppliedFilterBindingsResult {
  let baseFilters: Record<string, AnalyticsFilterValue> = {}

  if (node.filterValues !== undefined) baseFilters = { ...node.filterValues }

  if (node.filterBindings === undefined || node.filterBindings.length === 0)
    return {
      filterValues: baseFilters,
      status: 'ready',
    }

  for (const binding of node.filterBindings) {
    const ready = upstreamReadyByNodeId[binding.upstreamNodeId]

    if (!ready)
      return {
        filterValues: undefined,
        status: 'waiting',
        reason: 'Aguardando execução da fonte anterior para resolver o filtro.',
      }

    const key = getBindingCacheKey(binding.upstreamNodeId, binding.sourceColumn)
    const values = resolvedValuesByBindingKey[key]

    if (values === undefined)
      return {
        filterValues: undefined,
        status: 'waiting',
        reason: 'Resolvendo valores distintos do filtro dinâmico.',
      }

    if (values.length === 0) {
      if (binding.onEmptyUpstream === 'fail')
        return {
          filterValues: undefined,
          status: 'failed',
          reason: `Filtro "${binding.targetFilterId}" falhou: coluna "${binding.sourceColumn}" da fonte anterior retornou 0 valores.`,
        }

      return {
        filterValues: undefined,
        status: 'skipped_empty',
        reason: '0 registros (filtro anterior vazio)',
      }
    }

    baseFilters[binding.targetFilterId] = values
  }

  return {
    filterValues: baseFilters,
    status: 'ready',
  }
}

export function syncEdgesForNode(
  existingEdges: SpaceWorkflowEdgeConfig[],
  node: SpaceWorkflowNodeConfig,
): SpaceWorkflowEdgeConfig[] {
  const preserved = existingEdges.filter((edge) => edge.target !== node.id)
  const nextEdges: SpaceWorkflowEdgeConfig[] = [...preserved]
  const seenEdgeKeys = new Set<string>()

  if (node.filterBindings !== undefined) {
    for (const binding of node.filterBindings) {
      const edgeKey = `${binding.upstreamNodeId}::${node.id}::filtro`
      if (seenEdgeKeys.has(edgeKey)) continue
      seenEdgeKeys.add(edgeKey)
      nextEdges.push({
        id: `e_${binding.upstreamNodeId}_${node.id}_filtro`,
        source: binding.upstreamNodeId,
        target: node.id,
        label: 'Filtro',
      })
    }
  }

  if (node.transformInputs !== undefined && node.transformInputs.length > 0) {
    for (const input of node.transformInputs) {
      const edgeKey = `${input.nodeId}::${node.id}::${input.alias}`
      if (seenEdgeKeys.has(edgeKey)) continue
      seenEdgeKeys.add(edgeKey)
      nextEdges.push({
        id: `e_${input.nodeId}_${node.id}_${input.alias}`,
        source: input.nodeId,
        target: node.id,
        label: input.alias,
      })
    }

    return nextEdges
  }

  for (const upstreamId of node.upstreamNodeIds) {
    const edgeKey = `${upstreamId}::${node.id}`
    if (seenEdgeKeys.has(edgeKey)) continue
    seenEdgeKeys.add(edgeKey)
    nextEdges.push({
      id: `e_${upstreamId}_${node.id}`,
      source: upstreamId,
      target: node.id,
    })
  }

  return nextEdges
}
