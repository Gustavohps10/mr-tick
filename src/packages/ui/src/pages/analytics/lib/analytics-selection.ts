import type {
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetScope,
  AnalyticsFilterValue,
} from '@mr-tick/application'
import {
  createAnalyticsDatasetScope,
  pruneAnalyticsFilters,
} from '@mr-tick/application'

function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined

  return trimmed
}

export function normalizeCustomDateRange(
  range: { from?: string; to?: string } | undefined,
): { from?: string; to?: string } | undefined {
  if (range === undefined) return undefined
  const from = normalizeOptionalString(range.from)
  const to = normalizeOptionalString(range.to)
  if (from === undefined && to === undefined) return undefined

  const normalized: { from?: string; to?: string } = {}
  if (from !== undefined) normalized.from = from
  if (to !== undefined) normalized.to = to

  return normalized
}

export function resolveEffectiveNodeDates(
  customDateRange: { from?: string; to?: string } | undefined,
  fallbackStart: string,
  fallbackEnd: string,
): { from?: string; to?: string } {
  const custom = normalizeCustomDateRange(customDateRange)
  if (custom !== undefined) return custom

  const resolved: { from?: string; to?: string } = {}
  const start = normalizeOptionalString(fallbackStart)
  const end = normalizeOptionalString(fallbackEnd)
  if (start !== undefined) resolved.from = start
  if (end !== undefined) resolved.to = end

  return resolved
}

export function resolveEffectiveNodeProject(
  filterValues: Record<string, AnalyticsFilterValue> | undefined,
): string | undefined {
  if (filterValues === undefined) return undefined
  const project = filterValues.project_id
  if (typeof project !== 'string') return undefined
  const trimmed = project.trim()
  if (trimmed === '' || trimmed === 'all') return undefined

  return trimmed
}

export function normalizeSourceFilters(
  filterValues: Record<string, AnalyticsFilterValue> | undefined,
): Record<string, AnalyticsFilterValue> | undefined {
  if (filterValues === undefined) return undefined

  const filtered: Record<string, AnalyticsFilterValue> = {}

  for (const [name, value] of Object.entries(filterValues)) {
    if (name === 'date_range') continue

    if (name === 'project_id' && typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '' || trimmed === 'all') continue
    }

    filtered[name] = value
  }

  return pruneAnalyticsFilters(filtered)
}

export function queryWithDatasetSelection(
  input: AnalyticsDatasetQueryInput,
  manifest: AnalyticsDatasetManifest | undefined,
): AnalyticsDatasetQueryInput {
  const scope: AnalyticsDatasetScope = createAnalyticsDatasetScope({
    ...input,
    projectId: normalizeOptionalString(input.projectId),
    startDate: normalizeOptionalString(input.startDate),
    endDate: normalizeOptionalString(input.endDate),
    filters: normalizeSourceFilters(input.filters),
  })

  if (manifest !== undefined && manifest.selection?.dateRange !== true) {
    delete scope.startDate
    delete scope.endDate
  }

  if (manifest !== undefined && manifest.selection?.project !== true)
    delete scope.projectId

  const cleaned: AnalyticsDatasetQueryInput = {
    datasetId: scope.datasetId,
  }

  if (scope.projectId !== undefined) cleaned.projectId = scope.projectId
  if (scope.startDate !== undefined) cleaned.startDate = scope.startDate
  if (scope.endDate !== undefined) cleaned.endDate = scope.endDate
  if (scope.filters !== undefined) cleaned.filters = scope.filters
  if (input.execution !== undefined) cleaned.execution = input.execution

  return cleaned
}

export function selectionSignature(input: AnalyticsDatasetQueryInput): string {
  const cleanedFilters = pruneAnalyticsFilters(input.filters)
  let sortedFilters: Array<[string, AnalyticsFilterValue]> = []

  if (cleanedFilters !== undefined)
    sortedFilters = Object.entries(cleanedFilters).sort(([left], [right]) =>
      left.localeCompare(right),
    )

  const scopeDef = JSON.stringify([
    input.datasetId,
    normalizeOptionalString(input.projectId),
    normalizeOptionalString(input.startDate),
    normalizeOptionalString(input.endDate),
    sortedFilters.map(([name, value]) => {
      if (typeof value === 'object' && !Array.isArray(value))
        return [name, { from: value.from, to: value.to }]

      return [name, value]
    }),
  ])

  let execution:
    | { kind: 'snapshot' }
    | {
        kind: 'aggregate'
        groupBy: string[]
        measures: Array<[string, string, string | undefined]>
      } = { kind: 'snapshot' }

  if (input.execution?.kind === 'aggregate')
    execution = {
      kind: 'aggregate',
      groupBy: input.execution.groupBy,
      measures: input.execution.measures.map((measure) => [
        measure.name,
        measure.operator,
        measure.column,
      ]),
    }

  return JSON.stringify([scopeDef, execution])
}
