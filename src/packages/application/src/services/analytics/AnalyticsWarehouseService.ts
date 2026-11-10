import { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  AnalyticsDatasetScope,
  AnalyticsFilterValue,
  AnalyticsGeneration,
  AnalyticsLoadInput,
  AnalyticsLoadResult,
  AnalyticsPlanNode,
  AnalyticsQueryAuthorization,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
  IAnalyticsEngine,
  IAnalyticsProvider,
  IAnalyticsResolver,
  IAnalyticsWarehouseUseCase,
} from '@/contracts'

function invalid(message: string) {
  return Either.failure(AppError.ValidationError(message))
}

function scopeDefinition(input: AnalyticsDatasetScope): string {
  let filters: Array<[string, AnalyticsFilterValue]> = []
  if (input.filters !== undefined)
    filters = Object.entries(input.filters).sort(([left], [right]) =>
      left.localeCompare(right),
    )
  return JSON.stringify([
    input.datasetId,
    input.projectId,
    input.startDate,
    input.endDate,
    filters.map(([name, value]) => {
      if (typeof value === 'object' && !Array.isArray(value))
        return [name, { from: value.from, to: value.to }]
      return [name, value]
    }),
  ])
}

export async function analyticsSelectionKey(
  input: AnalyticsDatasetQueryInput,
): Promise<string> {
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
      measures: input.execution.measures.map(
        (measure): [string, string, string | undefined] => [
          measure.name,
          measure.operator,
          measure.column,
        ],
      ),
    }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify([scopeDefinition(input), execution]),
    ),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function initialQuery(
  input: AnalyticsDatasetQueryInput,
): AnalyticsDatasetQueryInput {
  const scope: AnalyticsDatasetQueryInput = {
    datasetId: input.datasetId,
    projectId: input.projectId,
    startDate: input.startDate,
    endDate: input.endDate,
    filters: input.filters,
  }
  if (input.execution?.kind === 'aggregate')
    scope.execution = {
      kind: 'aggregate',
      groupBy: input.execution.groupBy,
      measures: input.execution.measures,
    }
  return scope
}

function reachable(
  nodes: AnalyticsPlanNode[],
  target: string,
): Either<AppError, AnalyticsPlanNode[]> {
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length)
    return invalid('ANALYTICS_PLAN_INVALID')
  const result: AnalyticsPlanNode[] = []
  const visiting = new Set<string>(),
    done = new Set<string>()
  const visit = (id: string): Either<AppError, void> => {
    if (visiting.has(id)) return invalid('ANALYTICS_PLAN_CYCLE')
    if (done.has(id)) return Either.success(undefined)
    if (done.size + visiting.size >= 64) return invalid('ANALYTICS_PLAN_LIMIT')
    const node = nodes.find((item) => item.id === id)
    if (node === undefined) return invalid('ANALYTICS_PLAN_INPUT_MISSING')
    visiting.add(id)
    if (node.kind !== 'source')
      for (const upstream of node.upstreamNodeIds) {
        const visited = visit(upstream)
        if (visited.isFailure()) return visited.forwardFailure()
      }

    visiting.delete(id)
    done.add(id)
    result.push(node)
    return Either.success(undefined)
  }
  const visited = visit(target)
  if (visited.isFailure()) return visited.forwardFailure()
  return Either.success(result)
}

/** Coordinates provider effects and the warehouse's own atomic writes. */

export class AnalyticsWarehouseService implements IAnalyticsWarehouseUseCase {
  private readonly loads = new Map<
    string,
    Promise<Either<AppError, AnalyticsLoadResult>>
  >()

  constructor(
    private readonly analyticsResolver: IAnalyticsResolver,
    private readonly analyticsEngine: IAnalyticsEngine,
  ) {}

  public async load(
    input: AnalyticsLoadInput,
  ): Promise<Either<AppError, AnalyticsLoadResult>> {
    if (input.query.execution?.kind === 'changes')
      return invalid('ANALYTICS_CHANGES_INGESTION_NOT_IMPLEMENTED')
    if (
      input.query.execution !== undefined &&
      input.query.execution.cursor !== undefined
    )
      return invalid('ANALYTICS_LOAD_STARTS_WITHOUT_CURSOR')
    const resolution = await this.analyticsResolver.resolve(
      input.workspaceId,
      input.connectionInstanceId,
    )
    if (resolution.isFailure()) return resolution.forwardFailure()
    const selectionKey = await analyticsSelectionKey(input.query)
    const key = JSON.stringify([
      input.workspaceId,
      input.connectionInstanceId,
      resolution.success.authorizationKey,
      selectionKey,
    ])
    const existing = this.loads.get(key)
    if (existing !== undefined) return existing
    if (this.loads.size >= 8)
      return Either.failure(AppError.Http(429, 'ANALYTICS_ACTIVE_LOADS_LIMIT'))
    const work = this.extract(
      input,
      resolution.success.provider,
      resolution.success.authorizationKey,
      selectionKey,
    ).finally(() => this.loads.delete(key))
    this.loads.set(key, work)
    return work
  }

  private async extract(
    input: AnalyticsLoadInput,
    provider: IAnalyticsProvider,
    authorizationKey: string,
    selectionKey: string,
  ): Promise<Either<AppError, AnalyticsLoadResult>> {
    const catalog = await provider.listAnalyticsDatasets()
    if (catalog.isFailure()) return catalog.forwardFailure()
    const manifest = catalog.success.find(
      (item) => item.id === input.query.datasetId,
    )
    if (manifest === undefined)
      return invalid('ANALYTICS_DATASET_NOT_AVAILABLE')
    const request = initialQuery(input.query)
    let mode: 'snapshot' | 'aggregate' = 'snapshot'
    if (request.execution?.kind === 'aggregate') mode = 'aggregate'
    if (!manifest.extraction.modes.includes(mode))
      return invalid('ANALYTICS_EXECUTION_NOT_SUPPORTED')
    if (
      (request.startDate !== undefined || request.endDate !== undefined) &&
      manifest.selection?.dateRange !== true
    )
      return invalid('ANALYTICS_DATE_SELECTION_NOT_SUPPORTED')
    if (request.projectId !== undefined && manifest.selection?.project !== true)
      return invalid('ANALYTICS_PROJECT_SELECTION_NOT_SUPPORTED')
    if (request.filters !== undefined)
      for (const name of Object.keys(request.filters)) {
        if (!manifest.supportedFilters?.some((filter) => filter.id === name))
          return invalid('ANALYTICS_FILTER_NOT_DECLARED')
      }

    if (mode === 'aggregate') {
      const valid = this.validateAggregate(manifest, request)
      if (valid.isFailure()) return valid.forwardFailure()
    }

    let generation: AnalyticsGeneration | undefined
    let published = false
    let cursor: string | undefined
    let count = 0
    let expectedTotal: number | undefined
    let sawUnverified = false
    const cursors = new Set<string>()

    try {
      for (let index = 0; index < 1000; index += 1) {
        let execution: AnalyticsDatasetQueryInput['execution'] = {
          kind: 'snapshot',
          cursor,
        }
        if (
          execution.kind === 'snapshot' &&
          input.query.execution?.kind === 'snapshot' &&
          input.query.execution.batchSize !== undefined
        )
          execution.batchSize = input.query.execution.batchSize
        if (request.execution?.kind === 'aggregate')
          execution = { ...request.execution, cursor }
        const response = await provider.fetchAnalyticsDataset({
          ...request,
          execution,
        })
        if (response.isFailure()) return response.forwardFailure()
        const batch = response.success
        if (
          batch.execution.kind !== mode ||
          scopeDefinition(batch.execution.scope) !== scopeDefinition(request)
        )
          return invalid('ANALYTICS_BATCH_SCOPE_MISMATCH')
        if (
          batch.dataset.id !== request.datasetId ||
          !Number.isFinite(Date.parse(batch.fetchedAt))
        )
          return invalid('ANALYTICS_BATCH_METADATA_INVALID')
        if (batch.rows.length > 50000 || count + batch.rows.length > 50000)
          return invalid('ANALYTICS_LOAD_ROWS_LIMIT')
        const progress = batch.execution
        if (progress.kind === 'snapshot' && progress.coverage === 'unverified')
          sawUnverified = true
        const continuation = progress.continuation

        if (progress.kind === 'snapshot' && progress.batch !== undefined) {
          if (progress.batch.index !== index || progress.batch.offset !== count)
            return invalid('ANALYTICS_BATCH_PROGRESS_MISMATCH')
          if (
            expectedTotal !== undefined &&
            progress.batch.totalRows !== expectedTotal
          )
            return invalid('ANALYTICS_COLLECTION_CHANGED')
          expectedTotal = progress.batch.totalRows
          if (progress.batch.finished !== (continuation === undefined))
            return invalid('ANALYTICS_BATCH_COMPLETION_MISMATCH')
        }

        if (
          continuation !== undefined &&
          (progress.coverage === 'complete' ||
            batch.rows.length === 0 ||
            cursors.has(continuation.cursor))
        )
          return invalid('ANALYTICS_CONTINUATION_INVALID')
        if (continuation === undefined && progress.coverage === 'partial')
          return invalid('ANALYTICS_INCOMPLETE_LOAD')
        let storedBatch: AnalyticsDatasetResult = batch

        if (mode === 'aggregate') {
          const approved = this.validateAggregateResult(
            manifest,
            request,
            batch,
          )
          if (approved.isFailure()) return approved.forwardFailure()
          storedBatch = {
            ...batch,
            dataset: {
              ...batch.dataset,
              extraction: {
                ...batch.dataset.extraction,
                identity: { kind: 'scope' },
              },
            },
          }
        }

        if (generation === undefined) {
          const created = await this.analyticsEngine.create(
            {
              workspaceId: input.workspaceId,
              connectionInstanceId: input.connectionInstanceId,
              authorizationKey,
              selectionKey,
            },
            storedBatch.dataset,
            request,
          )
          if (created.isFailure()) return created.forwardFailure()
          generation = created.success
        }

        const appended = await this.analyticsEngine.append(
          generation,
          storedBatch,
        )
        if (appended.isFailure()) return appended.forwardFailure()
        count += batch.rows.length

        if (continuation !== undefined) {
          cursor = continuation.cursor
          cursors.add(cursor)
          continue
        }

        if (expectedTotal !== undefined && expectedTotal !== count)
          return invalid('ANALYTICS_LOAD_TOTAL_MISMATCH')
        const current = await this.analyticsResolver.resolve(
          input.workspaceId,
          input.connectionInstanceId,
        )
        if (current.isFailure()) return current.forwardFailure()
        if (
          current.success.authorizationKey !== authorizationKey ||
          current.success.provider !== provider
        )
          return Either.failure(
            AppError.Unauthorized('ANALYTICS_AUTHORIZATION_CHANGED'),
          )
        if (progress.coverage === 'partial')
          return invalid('ANALYTICS_INCOMPLETE_LOAD')
        let coverage = progress.coverage
        if (sawUnverified) coverage = 'unverified'
        const publication = await this.analyticsEngine.publish(
          generation,
          coverage,
          batch.fetchedAt,
        )
        if (publication.isFailure()) return publication.forwardFailure()
        published = true
        return Either.success({ publication: publication.success })
      }

      return invalid('ANALYTICS_LOAD_PAGES_LIMIT')
    } finally {
      if (generation !== undefined && !published)
        await this.analyticsEngine.remove(generation)
    }
  }

  private validateAggregate(
    manifest: AnalyticsDatasetManifest,
    query: AnalyticsDatasetQueryInput,
  ): Either<AppError, void> {
    const execution = query.execution
    const descriptor = manifest.extraction.aggregation
    if (
      execution?.kind !== 'aggregate' ||
      descriptor === undefined ||
      descriptor.postProcessing !== 'projection-only'
    )
      return invalid('ANALYTICS_AGGREGATION_CONTRACT_REQUIRED')
    const names = [
      ...execution.groupBy,
      ...execution.measures.map((measure) => measure.name),
    ]
    if (execution.measures.length === 0 || new Set(names).size !== names.length)
      return invalid('ANALYTICS_AGGREGATE_PROJECTION_INVALID')
    if (
      execution.groupBy.some(
        (name) =>
          !descriptor.groupByColumns.includes(name) ||
          !manifest.columns.some((column) => column.name === name),
      )
    )
      return invalid('ANALYTICS_AGGREGATE_GROUP_NOT_SUPPORTED')

    for (const measure of execution.measures) {
      if (!descriptor.operators.includes(measure.operator))
        return invalid('ANALYTICS_AGGREGATE_OPERATOR_NOT_SUPPORTED')
      if (measure.operator === 'count' && measure.column === undefined) continue
      const column = manifest.columns.find(
        (item) => item.name === measure.column,
      )
      if (
        column === undefined ||
        (measure.operator !== 'count' && column.type !== 'number')
      )
        return invalid('ANALYTICS_AGGREGATE_MEASURE_INVALID')
    }

    return Either.success(undefined)
  }

  private validateAggregateResult(
    manifest: AnalyticsDatasetManifest,
    query: AnalyticsDatasetQueryInput,
    batch: AnalyticsDatasetResult,
  ): Either<AppError, void> {
    const execution = query.execution
    if (execution?.kind !== 'aggregate')
      return invalid('ANALYTICS_AGGREGATE_REQUEST_REQUIRED')
    const names = new Set([
      ...execution.groupBy,
      ...execution.measures.map((measure) => measure.name),
    ])
    if (
      batch.dataset.columns.length !== names.size ||
      batch.dataset.columns.some((column) => !names.has(column.name))
    )
      return invalid('ANALYTICS_AGGREGATE_SCHEMA_MISMATCH')

    for (const column of batch.dataset.columns) {
      if (
        execution.measures.some((measure) => measure.name === column.name) &&
        column.type !== 'number'
      )
        return invalid('ANALYTICS_AGGREGATE_SCHEMA_MISMATCH')
      if (
        execution.groupBy.includes(column.name) &&
        !manifest.columns.some(
          (item) => item.name === column.name && item.type === column.type,
        )
      )
        return invalid('ANALYTICS_AGGREGATE_SCHEMA_MISMATCH')
    }

    return Either.success(undefined)
  }

  public async query(
    input: AnalyticsQueryInput,
  ): Promise<Either<AppError, AnalyticsQueryResult>> {
    const plan = reachable(input.nodes, input.targetNodeId)
    if (plan.isFailure()) return plan.forwardFailure()
    const authorizations: AnalyticsQueryAuthorization[] = []
    const providers = new Map<string, IAnalyticsProvider>()

    for (const node of plan.success) {
      if (node.kind !== 'source' || providers.has(node.connectionInstanceId))
        continue
      const resolution = await this.analyticsResolver.resolve(
        input.workspaceId,
        node.connectionInstanceId,
      )
      if (resolution.isFailure()) return resolution.forwardFailure()
      providers.set(node.connectionInstanceId, resolution.success.provider)
      authorizations.push({
        connectionInstanceId: node.connectionInstanceId,
        authorizationKey: resolution.success.authorizationKey,
      })
    }

    const result = await this.analyticsEngine.query(
      { ...input, nodes: plan.success },
      authorizations,
    )
    if (result.isFailure()) return result.forwardFailure()

    for (const authorization of authorizations) {
      const current = await this.analyticsResolver.resolve(
        input.workspaceId,
        authorization.connectionInstanceId,
      )
      if (current.isFailure()) return current.forwardFailure()
      if (
        current.success.authorizationKey !== authorization.authorizationKey ||
        current.success.provider !==
          providers.get(authorization.connectionInstanceId)
      )
        return Either.failure(
          AppError.Unauthorized('ANALYTICS_AUTHORIZATION_CHANGED'),
        )
    }

    return result
  }
}
