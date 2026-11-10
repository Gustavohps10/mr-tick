import type { AppError, Either } from '@mr-tick/shared/helpers'

export type AnalyticsColumnType = 'string' | 'number' | 'boolean' | 'date'

export type AnalyticsColumnUnit =
  'hours' | 'points' | 'count' | 'percent' | 'none'

export type AnalyticsColumnOrigin = 'native' | 'custom' | 'computed'

export interface AnalyticsColumnSchema {
  name: string
  label: string
  type: AnalyticsColumnType
  unit?: AnalyticsColumnUnit
  origin?: AnalyticsColumnOrigin
  providerFieldId?: string
}

export type AnalyticsCanonicalEntity =
  | 'time_entries'
  | 'issues'
  | 'issue_transitions'
  | 'sprints_versions'
  | 'member_capacity'
  | 'custom_report'

export type AnalyticsFilterType =
  'date_range' | 'select' | 'multi_select' | 'text' | 'number' | 'boolean'

export interface AnalyticsFilterOption {
  value: string
  label: string
}

export type AnalyticsFilterDynamicSource =
  | 'projects'
  | 'members'
  | 'task_statuses'
  | 'task_priorities'
  | 'task_trackers'
  | 'activities'
  | 'sprints_versions'

export const ANALYTICS_FILTER_DYNAMIC_SOURCES: readonly AnalyticsFilterDynamicSource[] =
  [
    'projects',
    'members',
    'task_statuses',
    'task_priorities',
    'task_trackers',
    'activities',
    'sprints_versions',
  ]

export interface AnalyticsFilterDefinition {
  id: string
  label: string
  type: AnalyticsFilterType
  description?: string
  required?: boolean
  defaultValue?: string | string[]
  options?: AnalyticsFilterOption[]
  dynamicOptionsSource?: AnalyticsFilterDynamicSource
}

export type AnalyticsFilterValue =
  string | string[] | number | boolean | { from?: string; to?: string }

export type AnalyticsExecutionKind = 'snapshot' | 'changes' | 'aggregate'

export type AnalyticsRowIdentity =
  { kind: 'scope' } | { kind: 'row'; columns: readonly string[] }

export interface AnalyticsExtractionDescriptor {
  modes: readonly AnalyticsExecutionKind[]
  identity: AnalyticsRowIdentity
  changes?: {
    deletions: 'none' | 'explicit'
  }
  windowRescan?: {
    dateColumn: string
  }
  aggregation?: {
    groupByColumns: readonly string[]
    operators: readonly AnalyticsAggregateMeasure['operator'][]
    postProcessing: 'projection-only'
  }
}

export interface AnalyticsDatasetManifest {
  id: string
  canonicalEntity?: AnalyticsCanonicalEntity
  name: string
  description: string
  extraction: AnalyticsExtractionDescriptor
  /** Omission means that built-in date/project selection is unsupported. */
  selection?: { dateRange: boolean; project: boolean }
  sourceFormat: 'csv' | 'json'
  endpoint: string
  columns: AnalyticsColumnSchema[]
  supportedFilters?: AnalyticsFilterDefinition[]
}

export interface AnalyticsAggregateMeasure {
  name: string
  operator: 'count' | 'sum' | 'average' | 'minimum' | 'maximum'
  column?: string
}

/** Omission means the dataset's initial snapshot request. Unsupported requests fail explicitly. */
export type AnalyticsExecutionRequest =
  | { kind: 'snapshot'; cursor?: string; batchSize?: number }
  | { kind: 'changes'; checkpoint: string; cursor?: string; batchSize?: number }
  | {
      kind: 'aggregate'
      groupBy: string[]
      measures: AnalyticsAggregateMeasure[]
      cursor?: string
    }

export interface AnalyticsDatasetQueryInput extends AnalyticsDatasetScope {
  execution?: AnalyticsExecutionRequest
}

export type AnalyticsDatasetCellValue = string | number | boolean | null

export type AnalyticsDatasetRow = Record<string, AnalyticsDatasetCellValue>

export interface AnalyticsDatasetPayload {
  dataset: AnalyticsDatasetManifest
  rows: AnalyticsDatasetRow[]
  fetchedAt: string
  rawCsvSample?: string
}

/** A selection in provider terms; transport cursors never become domain identifiers. */
export interface AnalyticsDatasetScope {
  datasetId: string
  startDate?: string
  endDate?: string
  projectId?: string
  filters?: Record<string, AnalyticsFilterValue>
}

export interface AnalyticsContinuation {
  cursor: string
  checkpoint?: string
}

/** Completion of traversal does not prove a remotely consistent snapshot. */
export interface AnalyticsBatchInfo {
  index: number
  offset: number
  finished: boolean
  totalRows?: number
}

/** Complete refers only to the declared scope, never to the whole provider. */
export type AnalyticsDatasetExecution =
  | {
      kind: 'snapshot'
      scope: AnalyticsDatasetScope
      coverage: 'complete' | 'partial' | 'unverified'
      coverageReason?: string
      checkpoint?: string
      batch?: AnalyticsBatchInfo
      continuation?: AnalyticsContinuation
    }
  | {
      kind: 'changes'
      scope: AnalyticsDatasetScope
      checkpoint: string
      deletedIds: string[]
      coverage: 'complete' | 'partial' | 'unverified'
      coverageReason?: string
      batch?: AnalyticsBatchInfo
      continuation?: AnalyticsContinuation
    }
  | {
      kind: 'aggregate'
      scope: AnalyticsDatasetScope
      coverage: 'complete' | 'partial'
      continuation?: AnalyticsContinuation
    }

export interface AnalyticsDatasetResult extends AnalyticsDatasetPayload {
  execution: AnalyticsDatasetExecution
}

export interface IAnalyticsProvider {
  listAnalyticsDatasets(): Promise<Either<AppError, AnalyticsDatasetManifest[]>>
  fetchAnalyticsDataset(
    input: AnalyticsDatasetQueryInput,
  ): Promise<Either<AppError, AnalyticsDatasetResult>>
  getFilterOptions(
    source: AnalyticsFilterDynamicSource,
  ): Promise<Either<AppError, AnalyticsFilterOption[]>>
}

/** A continuation changes progress, never the identity of the selected data. */
export function createAnalyticsDatasetScope(
  input: AnalyticsDatasetQueryInput,
): AnalyticsDatasetScope {
  return {
    datasetId: input.datasetId,
    projectId: input.projectId,
    startDate: input.startDate,
    endDate: input.endDate,
    filters: input.filters,
  }
}
