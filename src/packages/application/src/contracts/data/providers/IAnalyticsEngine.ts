import type { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  AnalyticsDatasetRow,
} from './IAnalyticsProvider'

export type AnalyticsFilterOperator =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_empty'

export type AnalyticsAggregationOperator =
  'sum' | 'count' | 'count_distinct' | 'avg'

export type AnalyticsFormulaOperator =
  'divide' | 'multiply' | 'subtract' | 'add' | 'percent_of'

export interface AnalyticsCaseRule {
  whenColumn: string
  operator: AnalyticsFilterOperator
  whenValue: string
  thenMode: 'column' | 'literal'
  thenValue: string
}

export interface AnalyticsNodeTransformConfig {
  filterColumn?: string
  filterOperator?: AnalyticsFilterOperator
  filterValue?: string
  additionalFilters?: {
    filterColumn: string
    filterOperator: AnalyticsFilterOperator
    filterValue: string
  }[]
  caseColumnName?: string
  caseWhenColumn?: string
  caseWhenValue?: string
  caseThenValue?: string
  caseRules?: AnalyticsCaseRule[]
  caseElseMode?: 'column' | 'literal'
  caseElseValue?: string
  groupByColumn?: string
  pivotColumn?: string
  valueColumn?: string
  aggregation?: AnalyticsAggregationOperator
  formulaColumnName?: string
  formulaLeftColumn?: string
  formulaOperator?: AnalyticsFormulaOperator
  formulaRightColumn?: string
}

export interface AnalyticsNodeJoinConfig {
  joinType: 'inner' | 'left' | 'full' | 'union'
  leftNodeId?: string
  rightNodeId?: string
  leftKey: string
  rightKey: string
  formulaColumnName?: string
  formulaLeftColumn?: string
  formulaOperator?: AnalyticsFormulaOperator
  formulaRightColumn?: string
  postFormulaColumnName?: string
  postFormulaLeftColumn?: string
  postFormulaOperator?: AnalyticsFormulaOperator
  postFormulaRightColumn?: string
}

export interface AnalyticsNodeSqlConfig {
  sqlQuery: string
  templateId?: string
  snippetId?: string
}

export type AnalyticsPlanNode =
  | {
      id: string
      kind: 'source'
      connectionInstanceId: string
      selectionKey: string
      columns?: string[]
      casts?: Record<string, 'string' | 'number' | 'date'>
    }
  | {
      id: string
      kind: 'transform' | 'filter' | 'aggregate'
      upstreamNodeIds: string[]
      transformConfig: AnalyticsNodeTransformConfig
    }
  | {
      id: string
      kind: 'join'
      upstreamNodeIds: string[]
      joinConfig: AnalyticsNodeJoinConfig
    }
  | {
      id: string
      kind: 'sql'
      upstreamNodeIds: string[]
      sqlConfig: AnalyticsNodeSqlConfig
    }
  | { id: string; kind: 'output'; upstreamNodeIds: string[] }

export interface AnalyticsLocalFilter {
  column: string
  operator: AnalyticsFilterOperator
  value: string
}

export interface AnalyticsLocalMeasure {
  name: string
  column?: string
  operator: AnalyticsAggregationOperator
}

export interface AnalyticsQueryInput {
  workspaceId: string
  nodes: AnalyticsPlanNode[]
  targetNodeId: string
  projection?: string[]
  filters?: AnalyticsLocalFilter[]
  search?: string
  calculation?: AnalyticsNodeTransformConfig
  rollup?: boolean
  groupBy?: string[]
  measures?: AnalyticsLocalMeasure[]
  pivot?: {
    rowColumn: string
    pivotColumn: string
    valueColumn?: string
    operator: AnalyticsAggregationOperator
  }
  offset: number
  limit: number
  version?: string
}

export interface AnalyticsQueryResult {
  columns: AnalyticsColumnSchema[]
  rows: AnalyticsDatasetRow[]
  totalRows: number
  offset: number
  limit: number
  hasMore: boolean
  version: string
  coverage: 'complete' | 'unverified'
  coverageReason?: string
  loadedAt: string
  remoteAggregate: boolean
  groupingColumn?: string
}

export interface AnalyticsPublication {
  generationId: string
  selectionKey: string
  connectionInstanceId: string
  manifest: AnalyticsDatasetManifest
  query: AnalyticsDatasetQueryInput
  rowCount: number
  coverage: 'complete' | 'unverified'
  coverageReason?: string
  loadedAt: string
  fetchedAt: string
  remoteAggregate: boolean
}

export type AnalyticsRefreshMode = 'auto' | 'fast' | 'full'

export interface AnalyticsRefreshPolicy {
  mode?: AnalyticsRefreshMode
  rollingWindowDays?: number
  fullReconcileIntervalMinutes?: number
}

export type AnalyticsSyncStrategy =
  'incremental_changes' | 'window_rescan' | 'full_replace'

export interface AnalyticsSyncState {
  connectionInstanceId: string
  selectionKey: string
  datasetId: string
  strategy: AnalyticsSyncStrategy
  checkpoint?: string
  lastFastSyncAt: string
  lastFullReconcileAt: string
  coverage: 'complete' | 'unverified'
  coverageReason?: string
  lastWindowStart?: string
  lastWindowEnd?: string
  lastRecentReconcileAt?: string
  lastRecentStart?: string
  lastRecentEnd?: string
  lastError?: string
  lastErrorAt?: string
  lastRunRequests?: number
  lastRunPages?: number
  lastRunDurationMs?: number
  lastRunRetries?: number
  lastRunBytes?: number
}

export interface AnalyticsSyncMetadata {
  strategy: AnalyticsSyncStrategy
  checkpoint?: string
  coverageReason?: string
  lastWindowStart?: string
  lastWindowEnd?: string
  lastRecentReconcileAt?: string
  lastRecentStart?: string
  lastRecentEnd?: string
  lastFullReconcileAt?: string
  lastRunRequests?: number
  lastRunPages?: number
  lastRunDurationMs?: number
  lastRunRetries?: number
  lastRunBytes?: number
}

export interface AnalyticsWindowBounds {
  dateColumn: string
  startDate: string
  endDate: string
}

export interface AnalyticsWorkspaceState {
  workspaceId: string
  pollingIntervalMinutes: number
  spacesJson?: string
  startDate?: string
  endDate?: string
  updatedAt: string
}

export interface SaveAnalyticsWorkspaceStateInput {
  workspaceId: string
  pollingIntervalMinutes: number
  spacesJson?: string
  startDate?: string
  endDate?: string
}

export interface AnalyticsPublicationEntry {
  publication: AnalyticsPublication
  syncState: AnalyticsSyncState
}

export interface AnalyticsHydrateInput {
  workspaceId: string
}

export interface AnalyticsHydrateResult {
  settings?: AnalyticsWorkspaceState
  publications: AnalyticsPublicationEntry[]
}

export interface AnalyticsResetStorageInput {
  workspaceId: string
}

export interface AnalyticsResetStorageResult {
  workspaceId: string
  removed: boolean
}

export interface AnalyticsLoadInput {
  workspaceId: string
  connectionInstanceId: string
  query: AnalyticsDatasetQueryInput
  policy?: AnalyticsRefreshPolicy
}

export interface AnalyticsLoadResult {
  publication: AnalyticsPublication
  syncState: AnalyticsSyncState
  strategy: AnalyticsSyncStrategy
  reused?: boolean
}

/** Owner metadata remains internal; callers cannot choose an authorization key. */
export interface AnalyticsGenerationOwner {
  workspaceId: string
  connectionInstanceId: string
  authorizationKey: string
  selectionKey: string
}

export interface AnalyticsGeneration extends AnalyticsGenerationOwner {
  generationId: string
  manifest: AnalyticsDatasetManifest
  query: AnalyticsDatasetQueryInput
}

export interface AnalyticsQueryAuthorization {
  connectionInstanceId: string
  authorizationKey: string
}

/** Desktop-native persistence/transaction capability, never an operational domain repository. */
export interface IAnalyticsEngine {
  create(
    owner: AnalyticsGenerationOwner,
    manifest: AnalyticsDatasetManifest,
    query: AnalyticsDatasetQueryInput,
  ): Promise<Either<AppError, AnalyticsGeneration>>
  append(
    generation: AnalyticsGeneration,
    batch: AnalyticsDatasetResult,
  ): Promise<Either<AppError, void>>
  publish(
    generation: AnalyticsGeneration,
    coverage: 'complete' | 'unverified',
    fetchedAt: string,
    syncMeta: AnalyticsSyncMetadata,
  ): Promise<Either<AppError, AnalyticsPublication>>
  publishWindowMerge(
    owner: AnalyticsGenerationOwner,
    baseGenerationId: string,
    windowGeneration: AnalyticsGeneration | undefined,
    windowBounds: AnalyticsWindowBounds,
    coverage: 'complete' | 'unverified',
    fetchedAt: string,
    syncMeta: AnalyticsSyncMetadata,
  ): Promise<Either<AppError, AnalyticsPublication>>
  publishChangesMerge(
    owner: AnalyticsGenerationOwner,
    baseGenerationId: string,
    deltaGeneration: AnalyticsGeneration | undefined,
    deletedIds: string[],
    deletions: 'none' | 'explicit',
    coverage: 'complete' | 'unverified',
    fetchedAt: string,
    syncMeta: AnalyticsSyncMetadata,
  ): Promise<Either<AppError, AnalyticsPublication>>
  listPublications(
    workspaceId: string,
    authorizations: AnalyticsQueryAuthorization[],
  ): Promise<Either<AppError, AnalyticsPublicationEntry[]>>
  getSyncState(
    owner: AnalyticsGenerationOwner,
  ): Promise<Either<AppError, AnalyticsSyncState | undefined>>
  recordSyncFailure(
    owner: AnalyticsGenerationOwner,
    errorMessage: string,
    failedAt: string,
  ): Promise<Either<AppError, void>>
  revokeConnection(
    workspaceId: string,
    connectionInstanceId: string,
  ): Promise<Either<AppError, void>>
  getWorkspaceState(
    workspaceId: string,
  ): Promise<Either<AppError, AnalyticsWorkspaceState | undefined>>
  saveWorkspaceState(
    input: SaveAnalyticsWorkspaceStateInput,
  ): Promise<Either<AppError, AnalyticsWorkspaceState>>
  resetStorage(
    workspaceId: string,
  ): Promise<Either<AppError, AnalyticsResetStorageResult>>
  remove(generation: AnalyticsGeneration): Promise<Either<AppError, void>>
  query(
    input: AnalyticsQueryInput,
    authorizations: AnalyticsQueryAuthorization[],
  ): Promise<Either<AppError, AnalyticsQueryResult>>
  close(): Promise<void>
}

export interface IAnalyticsWarehouseUseCase {
  load(
    input: AnalyticsLoadInput,
  ): Promise<Either<AppError, AnalyticsLoadResult>>
  query(
    input: AnalyticsQueryInput,
  ): Promise<Either<AppError, AnalyticsQueryResult>>
  hydrate(
    input: AnalyticsHydrateInput,
  ): Promise<Either<AppError, AnalyticsHydrateResult>>
  saveWorkspaceState(
    input: SaveAnalyticsWorkspaceStateInput,
  ): Promise<Either<AppError, AnalyticsWorkspaceState>>
  resetStorage(
    input: AnalyticsResetStorageInput,
  ): Promise<Either<AppError, AnalyticsResetStorageResult>>
}
