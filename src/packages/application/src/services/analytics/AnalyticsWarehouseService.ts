import { AppError, Either } from '@mr-tick/shared/helpers'
import type {
  AnalyticsLoadProgressEvent,
  ISystemEventEmitter,
} from '@mr-tick/shared/transport'

import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  AnalyticsDatasetScope,
  AnalyticsFilterValue,
  AnalyticsGeneration,
  AnalyticsGenerationOwner,
  AnalyticsHydrateInput,
  AnalyticsHydrateResult,
  AnalyticsLoadInput,
  AnalyticsLoadResult,
  AnalyticsPlanNode,
  AnalyticsQueryAuthorization,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
  AnalyticsRefreshMode,
  AnalyticsRefreshPolicy,
  AnalyticsSyncMetadata,
  AnalyticsSyncState,
  AnalyticsSyncStrategy,
  AnalyticsWorkspaceState,
  IAnalyticsEngine,
  IAnalyticsProvider,
  IAnalyticsResolver,
  IAnalyticsWarehouseUseCase,
  SaveAnalyticsWorkspaceStateInput,
} from '@/contracts'

const DEFAULT_ROLLING_WINDOW_DAYS = 14
const DEFAULT_FULL_RECONCILE_INTERVAL_MINUTES = 360

function invalid(message: string) {
  return Either.failure(AppError.ValidationError(message))
}

function isUnauthorizedOrForbidden(error: AppError): boolean {
  return error.statusCode === 401 || error.statusCode === 403
}

function connectionFailure(
  error: AppError,
  connectionInstanceId: string,
): AppError {
  if (!isUnauthorizedOrForbidden(error)) return error

  return AppError.Http(error.statusCode, error.messageKey, {
    ...error.details,
    connectionInstanceIds: [connectionInstanceId],
  })
}

function isIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  if (!Number.isFinite(Date.parse(value))) return false

  return new Date(value).toISOString().slice(0, 10) === value
}

function shiftIsoDaysUtc(dateIso: string, daysDelta: number): string {
  const parsed = Date.parse(`${dateIso}T00:00:00.000Z`)
  const shifted = new Date(parsed + daysDelta * 86_400_000)

  return shifted.toISOString().slice(0, 10)
}

function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined

  const trimmed = value.trim()
  if (trimmed === '') return undefined

  return trimmed
}

export function pruneAnalyticsFilters(
  filters: Record<string, AnalyticsFilterValue> | undefined,
): Record<string, AnalyticsFilterValue> | undefined {
  if (filters === undefined) return undefined

  const cleaned: Record<string, AnalyticsFilterValue> = {}

  for (const [name, value] of Object.entries(filters)) {
    if (typeof value === 'string') {
      if (value.trim() !== '') cleaned[name] = value
      continue
    }

    if (Array.isArray(value)) {
      const items = value.filter((item) => item.trim() !== '')
      if (items.length > 0) cleaned[name] = items
      continue
    }

    if (typeof value === 'object') {
      const range: { from?: string; to?: string } = {}
      if (value.from !== undefined && value.from.trim() !== '')
        range.from = value.from
      if (value.to !== undefined && value.to.trim() !== '') range.to = value.to
      if (range.from !== undefined || range.to !== undefined)
        cleaned[name] = range
      continue
    }

    cleaned[name] = value
  }

  if (Object.keys(cleaned).length === 0) return undefined

  return cleaned
}

function scopeDefinition(input: AnalyticsDatasetScope): string {
  const cleanedFilters = pruneAnalyticsFilters(input.filters)
  let filters: Array<[string, AnalyticsFilterValue]> = []

  if (cleanedFilters !== undefined)
    filters = Object.entries(cleanedFilters).sort(([left], [right]) =>
      left.localeCompare(right),
    )

  return JSON.stringify([
    input.datasetId,
    normalizeOptionalString(input.projectId),
    normalizeOptionalString(input.startDate),
    normalizeOptionalString(input.endDate),
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
  }

  const projectId = normalizeOptionalString(input.projectId)
  if (projectId !== undefined) scope.projectId = projectId

  const startDate = normalizeOptionalString(input.startDate)
  if (startDate !== undefined) scope.startDate = startDate

  const endDate = normalizeOptionalString(input.endDate)
  if (endDate !== undefined) scope.endDate = endDate

  const filters = pruneAnalyticsFilters(input.filters)
  if (filters !== undefined) scope.filters = filters

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
  const visiting = new Set<string>()
  const done = new Set<string>()

  const visit = (id: string): Either<AppError, void> => {
    if (visiting.has(id)) return invalid('ANALYTICS_PLAN_CYCLE')
    if (done.has(id)) return Either.success(undefined)
    if (done.size + visiting.size >= 64) return invalid('ANALYTICS_PLAN_LIMIT')

    const node = nodes.find((item) => item.id === id)
    if (node === undefined) return invalid('ANALYTICS_PLAN_INPUT_MISSING')

    visiting.add(id)

    if (node.kind !== 'source') {
      for (const upstream of node.upstreamNodeIds) {
        const visited = visit(upstream)
        if (visited.isFailure()) return visited.forwardFailure()
      }
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

function manifestHasColumnDifference(
  baseColumns: readonly AnalyticsColumnSchema[],
  nextColumns: readonly AnalyticsColumnSchema[],
): boolean {
  for (const col of nextColumns) {
    const existing = baseColumns.find(
      (item) => item.name.toLowerCase() === col.name.toLowerCase(),
    )

    if (
      existing === undefined ||
      existing.name !== col.name ||
      existing.type !== col.type ||
      existing.providerFieldId !== col.providerFieldId
    )
      return true
  }

  return false
}

function resolveRefreshPolicy(
  policy: AnalyticsRefreshPolicy | undefined,
): Either<
  AppError,
  {
    mode: AnalyticsRefreshMode
    rollingWindowDays: number
    fullReconcileIntervalMinutes: number
  }
> {
  let mode: AnalyticsRefreshMode = 'auto'
  if (policy?.mode !== undefined) mode = policy.mode

  let rollingWindowDays = DEFAULT_ROLLING_WINDOW_DAYS

  if (policy?.rollingWindowDays !== undefined) {
    if (
      !Number.isInteger(policy.rollingWindowDays) ||
      policy.rollingWindowDays < 1 ||
      policy.rollingWindowDays > 3650
    )
      return invalid('ANALYTICS_REFRESH_POLICY_INVALID')

    rollingWindowDays = policy.rollingWindowDays
  }

  let fullReconcileIntervalMinutes = DEFAULT_FULL_RECONCILE_INTERVAL_MINUTES

  if (policy?.fullReconcileIntervalMinutes !== undefined) {
    if (
      !Number.isFinite(policy.fullReconcileIntervalMinutes) ||
      policy.fullReconcileIntervalMinutes < 0 ||
      policy.fullReconcileIntervalMinutes > 43200
    )
      return invalid('ANALYTICS_REFRESH_POLICY_INVALID')

    fullReconcileIntervalMinutes = policy.fullReconcileIntervalMinutes
  }

  return Either.success({
    mode,
    rollingWindowDays,
    fullReconcileIntervalMinutes,
  })
}

function validateExtractionDescriptors(
  manifest: AnalyticsDatasetManifest,
): Either<AppError, void> {
  const hasChangesMode = manifest.extraction.modes.includes('changes')
  const hasChangesConfig = manifest.extraction.changes !== undefined
  const isRowIdentity = manifest.extraction.identity.kind === 'row'

  if (hasChangesMode && (!isRowIdentity || !hasChangesConfig))
    return invalid('ANALYTICS_CHANGES_DESCRIPTOR_INVALID')

  if (hasChangesConfig && (!hasChangesMode || !isRowIdentity))
    return invalid('ANALYTICS_CHANGES_DESCRIPTOR_INVALID')

  const rescan = manifest.extraction.windowRescan

  if (rescan !== undefined) {
    const dateColumn = manifest.columns.find(
      (column) => column.name === rescan.dateColumn,
    )

    if (
      !isRowIdentity ||
      manifest.selection?.dateRange !== true ||
      dateColumn === undefined ||
      dateColumn.type !== 'date'
    )
      return invalid('ANALYTICS_WINDOW_RESCAN_DESCRIPTOR_INVALID')
  }

  return Either.success(undefined)
}

function canUseChanges(
  manifest: AnalyticsDatasetManifest,
  syncState: AnalyticsSyncState,
): boolean {
  if (!manifest.extraction.modes.includes('changes')) return false
  if (manifest.extraction.identity.kind !== 'row') return false
  if (manifest.extraction.changes === undefined) return false
  if (syncState.checkpoint === undefined) return false

  return syncState.checkpoint.trim() !== ''
}

function canUseWindowRescan(manifest: AnalyticsDatasetManifest): boolean {
  if (manifest.extraction.windowRescan === undefined) return false
  if (manifest.extraction.identity.kind !== 'row') return false

  return manifest.selection?.dateRange === true
}

/** Coordinates provider effects, dual-cadence reconciliation and atomic warehouse persistence. */
export class AnalyticsWarehouseService implements IAnalyticsWarehouseUseCase {
  private readonly loads = new Map<
    string,
    {
      mode: AnalyticsRefreshMode
      promise: Promise<Either<AppError, AnalyticsLoadResult>>
    }
  >()

  constructor(
    private readonly analyticsResolver: IAnalyticsResolver,
    private readonly analyticsEngine: IAnalyticsEngine,
    private readonly systemEventEmitter: ISystemEventEmitter,
  ) {}

  public async hydrate(
    input: AnalyticsHydrateInput,
  ): Promise<Either<AppError, AnalyticsHydrateResult>> {
    if (!input.workspaceId.trim()) return invalid('WORKSPACE_ID_REQUIRED')

    const authorizations =
      await this.analyticsResolver.resolveWorkspaceAuthorizations(
        input.workspaceId,
      )
    if (authorizations.isFailure()) return authorizations.forwardFailure()

    const settings = await this.analyticsEngine.getWorkspaceState(
      input.workspaceId,
    )
    if (settings.isFailure()) return settings.forwardFailure()

    const publications = await this.analyticsEngine.listPublications(
      input.workspaceId,
      authorizations.success,
    )
    if (publications.isFailure()) return publications.forwardFailure()

    const current = await this.analyticsResolver.resolveWorkspaceAuthorizations(
      input.workspaceId,
    )
    if (current.isFailure()) return current.forwardFailure()
    const stableConnections = new Set<string>()

    for (const authorization of authorizations.success) {
      if (
        current.success.some(
          (item) =>
            item.connectionInstanceId === authorization.connectionInstanceId &&
            item.authorizationKey === authorization.authorizationKey,
        )
      )
        stableConnections.add(authorization.connectionInstanceId)
    }

    return Either.success({
      settings: settings.success,
      publications: publications.success.filter((item) =>
        stableConnections.has(item.publication.connectionInstanceId),
      ),
    })
  }

  public saveWorkspaceState(
    input: SaveAnalyticsWorkspaceStateInput,
  ): Promise<Either<AppError, AnalyticsWorkspaceState>> {
    return this.analyticsEngine.saveWorkspaceState(input)
  }

  public async load(
    input: AnalyticsLoadInput,
  ): Promise<Either<AppError, AnalyticsLoadResult>> {
    if (input.query.execution?.kind === 'changes')
      return invalid('ANALYTICS_EXECUTION_ORCHESTRATED_ONLY')

    if (
      input.query.execution !== undefined &&
      input.query.execution.cursor !== undefined
    )
      return invalid('ANALYTICS_LOAD_STARTS_WITHOUT_CURSOR')

    const policyResult = resolveRefreshPolicy(input.policy)
    if (policyResult.isFailure()) return policyResult.forwardFailure()

    const policy = policyResult.success
    const resolution = await this.analyticsResolver.resolve(
      input.workspaceId,
      input.connectionInstanceId,
    )

    if (resolution.isFailure()) {
      if (isUnauthorizedOrForbidden(resolution.failure))
        await this.analyticsEngine.revokeConnection(
          input.workspaceId,
          input.connectionInstanceId,
        )

      return resolution.forwardFailure()
    }

    const selectionKey = await analyticsSelectionKey(input.query)
    const key = JSON.stringify([
      input.workspaceId,
      input.connectionInstanceId,
      resolution.success.authorizationKey,
      selectionKey,
    ])
    const existing = this.loads.get(key)

    if (existing !== undefined) {
      if (policy.mode !== 'full' || existing.mode === 'full')
        return existing.promise

      const queued = existing.promise
        .catch(() => undefined)
        .then(async () => {
          const freshResolution = await this.analyticsResolver.resolve(
            input.workspaceId,
            input.connectionInstanceId,
          )

          if (freshResolution.isFailure()) {
            if (isUnauthorizedOrForbidden(freshResolution.failure))
              await this.analyticsEngine.revokeConnection(
                input.workspaceId,
                input.connectionInstanceId,
              )

            return freshResolution.forwardFailure<AnalyticsLoadResult>()
          }

          return this.runLoad(
            input,
            freshResolution.success.provider,
            freshResolution.success.authorizationKey,
            selectionKey,
            {
              ...policy,
              mode: 'full',
            },
            true,
          )
        })
        .finally(() => {
          if (this.loads.get(key)?.promise === queued) this.loads.delete(key)
        })

      this.loads.set(key, { mode: 'full', promise: queued })
      return queued
    }

    if (this.loads.size >= 8)
      return Either.failure(AppError.Http(429, 'ANALYTICS_ACTIVE_LOADS_LIMIT'))

    const work = this.runLoad(
      input,
      resolution.success.provider,
      resolution.success.authorizationKey,
      selectionKey,
      policy,
      true,
    ).finally(() => {
      if (this.loads.get(key)?.promise === work) this.loads.delete(key)
    })

    this.loads.set(key, { mode: policy.mode, promise: work })
    return work
  }

  private emitProgress(
    input: AnalyticsLoadInput,
    selectionKey: string,
    mode: AnalyticsLoadProgressEvent['mode'],
    phase: AnalyticsLoadProgressEvent['phase'],
    batchIndex: number,
    fetchedRows: number,
    totalRows: number | undefined,
    coverage: 'complete' | 'unverified' | undefined,
  ): void {
    const payload: AnalyticsLoadProgressEvent = {
      workspaceId: input.workspaceId,
      connectionInstanceId: input.connectionInstanceId,
      selectionKey,
      datasetId: input.query.datasetId,
      mode,
      phase,
      batchIndex,
      fetchedRows,
    }

    if (totalRows !== undefined) payload.totalRows = totalRows
    if (coverage !== undefined) payload.coverage = coverage

    this.systemEventEmitter.emit('analytics:load-progress', payload)
  }

  private async runLoad(
    input: AnalyticsLoadInput,
    provider: IAnalyticsProvider,
    authorizationKey: string,
    selectionKey: string,
    policy: {
      mode: AnalyticsRefreshMode
      rollingWindowDays: number
      fullReconcileIntervalMinutes: number
    },
    allowSchemaPromotion: boolean,
  ): Promise<Either<AppError, AnalyticsLoadResult>> {
    const owner: AnalyticsGenerationOwner = {
      workspaceId: input.workspaceId,
      connectionInstanceId: input.connectionInstanceId,
      authorizationKey,
      selectionKey,
    }

    const entriesResult = await this.analyticsEngine.listPublications(
      input.workspaceId,
      [
        {
          connectionInstanceId: input.connectionInstanceId,
          authorizationKey,
        },
      ],
    )
    if (entriesResult.isFailure()) return entriesResult.forwardFailure()

    const existingEntry = entriesResult.success.find(
      (item) => item.publication.selectionKey === selectionKey,
    )

    const failLoad = async (
      error: AppError,
      mode: AnalyticsLoadProgressEvent['mode'],
      batchIndex: number,
      fetchedRows: number,
      totalRows: number | undefined,
      emitFailed: boolean,
    ): Promise<Either<AppError, AnalyticsLoadResult>> => {
      if (isUnauthorizedOrForbidden(error))
        await this.analyticsEngine.revokeConnection(
          input.workspaceId,
          input.connectionInstanceId,
        )

      if (!isUnauthorizedOrForbidden(error))
        await this.analyticsEngine.recordSyncFailure(
          owner,
          error.messageKey,
          new Date().toISOString(),
        )

      if (emitFailed)
        this.emitProgress(
          input,
          selectionKey,
          mode,
          'failed',
          batchIndex,
          fetchedRows,
          totalRows,
          undefined,
        )

      return Either.failure(error)
    }

    const catalog = await provider.listAnalyticsDatasets()
    if (catalog.isFailure())
      return failLoad(catalog.failure, 'full', 0, 0, undefined, true)

    const manifest = catalog.success.find(
      (item) => item.id === input.query.datasetId,
    )
    if (manifest === undefined)
      return failLoad(
        AppError.ValidationError('ANALYTICS_DATASET_NOT_AVAILABLE'),
        'full',
        0,
        0,
        undefined,
        false,
      )

    const descriptorsValid = validateExtractionDescriptors(manifest)
    if (descriptorsValid.isFailure())
      return failLoad(descriptorsValid.failure, 'full', 0, 0, undefined, false)

    if (input.query.filters !== undefined) {
      for (const name of Object.keys(input.query.filters)) {
        if (!manifest.supportedFilters?.some((filter) => filter.id === name))
          return failLoad(
            AppError.ValidationError('ANALYTICS_FILTER_NOT_DECLARED'),
            'full',
            0,
            0,
            undefined,
            false,
          )
      }
    }

    const request = initialQuery(input.query)
    let requestExecutionMode: 'snapshot' | 'aggregate' = 'snapshot'
    if (request.execution?.kind === 'aggregate')
      requestExecutionMode = 'aggregate'

    if (!manifest.extraction.modes.includes(requestExecutionMode))
      return failLoad(
        AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
        'full',
        0,
        0,
        undefined,
        false,
      )

    if (
      (request.startDate !== undefined || request.endDate !== undefined) &&
      manifest.selection?.dateRange !== true
    )
      return failLoad(
        AppError.ValidationError('ANALYTICS_DATE_SELECTION_NOT_SUPPORTED'),
        'full',
        0,
        0,
        undefined,
        false,
      )

    if (request.projectId !== undefined && manifest.selection?.project !== true)
      return failLoad(
        AppError.ValidationError('ANALYTICS_PROJECT_SELECTION_NOT_SUPPORTED'),
        'full',
        0,
        0,
        undefined,
        false,
      )

    if (requestExecutionMode === 'aggregate') {
      const valid = this.validateAggregate(manifest, request)
      if (valid.isFailure())
        return failLoad(valid.failure, 'full', 0, 0, undefined, false)
    }

    const nowMs = Date.now()
    let strategy: AnalyticsSyncStrategy = 'full_replace'

    if (
      allowSchemaPromotion &&
      requestExecutionMode === 'snapshot' &&
      policy.mode !== 'full' &&
      existingEntry !== undefined
    ) {
      const lastFullMs = Date.parse(existingEntry.syncState.lastFullReconcileAt)
      const reconcileDue =
        !Number.isFinite(lastFullMs) ||
        nowMs - lastFullMs >= policy.fullReconcileIntervalMinutes * 60_000

      if (policy.mode === 'fast' || !reconcileDue) {
        if (canUseChanges(manifest, existingEntry.syncState))
          strategy = 'incremental_changes'
        if (strategy === 'full_replace' && canUseWindowRescan(manifest))
          strategy = 'window_rescan'
      }
    }

    let targetScopeQuery: AnalyticsDatasetQueryInput = request
    let windowBounds:
      { dateColumn: string; startDate: string; endDate: string } | undefined

    if (strategy === 'window_rescan' && existingEntry !== undefined) {
      const startOk =
        request.startDate === undefined ||
        isIsoDateOnly(request.startDate.slice(0, 10))
      const endOk =
        request.endDate === undefined ||
        isIsoDateOnly(request.endDate.slice(0, 10))
      const orderOk =
        request.startDate === undefined ||
        request.endDate === undefined ||
        request.startDate.slice(0, 10) <= request.endDate.slice(0, 10)

      if (!startOk || !endOk || !orderOk) {
        strategy = 'full_replace'
      }

      if (
        strategy === 'window_rescan' &&
        manifest.extraction.windowRescan !== undefined
      ) {
        const todayUtc = new Date(nowMs).toISOString().slice(0, 10)
        const cutoffStart = shiftIsoDaysUtc(
          todayUtc,
          -(policy.rollingWindowDays - 1),
        )
        let windowStart = cutoffStart

        if (
          request.startDate !== undefined &&
          request.startDate.slice(0, 10) > windowStart
        )
          windowStart = request.startDate.slice(0, 10)

        let windowEnd = todayUtc

        if (
          request.endDate !== undefined &&
          request.endDate.slice(0, 10) < windowEnd
        )
          windowEnd = request.endDate.slice(0, 10)

        if (windowStart > windowEnd)
          return Either.success({
            publication: existingEntry.publication,
            syncState: existingEntry.syncState,
            strategy: 'window_rescan',
            reused: true,
          })

        windowBounds = {
          dateColumn: manifest.extraction.windowRescan.dateColumn,
          startDate: windowStart,
          endDate: windowEnd,
        }
        targetScopeQuery = {
          ...request,
          startDate: windowStart,
          endDate: windowEnd,
        }
      }
    }

    let eventMode: AnalyticsLoadProgressEvent['mode'] = 'full'
    if (strategy === 'incremental_changes') eventMode = 'changes'
    if (strategy === 'window_rescan') eventMode = 'window_rescan'

    let generation: AnalyticsGeneration | undefined
    let published = false
    let cursor: string | undefined
    let count = 0
    let expectedTotal: number | undefined
    let sawUnverified = false
    let lastCoverageReason: string | undefined
    let snapshotCheckpoint: string | undefined
    let changesCheckpoint: string | undefined
    const deletedIds: string[] = []
    const cursors = new Set<string>()
    let lastBatchIndex = 0

    try {
      for (let index = 0; index < 1000; index += 1) {
        lastBatchIndex = index
        let execution: AnalyticsDatasetQueryInput['execution']

        if (strategy === 'incremental_changes' && existingEntry !== undefined) {
          const checkpoint = existingEntry.syncState.checkpoint
          if (checkpoint === undefined || checkpoint.trim() === '')
            return failLoad(
              AppError.ValidationError('ANALYTICS_CHANGES_CHECKPOINT_INVALID'),
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )

          execution = {
            kind: 'changes',
            checkpoint,
            cursor,
          }

          if (
            input.query.execution?.kind === 'snapshot' &&
            input.query.execution.batchSize !== undefined
          )
            execution.batchSize = input.query.execution.batchSize
        }

        if (execution === undefined && request.execution?.kind === 'aggregate')
          execution = { ...request.execution, cursor }

        if (execution === undefined) {
          execution = {
            kind: 'snapshot',
            cursor,
          }

          if (
            input.query.execution?.kind === 'snapshot' &&
            input.query.execution.batchSize !== undefined
          )
            execution.batchSize = input.query.execution.batchSize
        }

        const response = await provider.fetchAnalyticsDataset({
          ...targetScopeQuery,
          execution,
        })
        if (response.isFailure())
          return failLoad(
            response.failure,
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        const batch = response.success
        let expectedExecutionKind: 'snapshot' | 'changes' | 'aggregate' =
          requestExecutionMode
        if (strategy === 'incremental_changes')
          expectedExecutionKind = 'changes'

        if (
          batch.execution.kind !== expectedExecutionKind ||
          scopeDefinition(batch.execution.scope) !==
            scopeDefinition(targetScopeQuery)
        )
          return failLoad(
            AppError.ValidationError('ANALYTICS_BATCH_SCOPE_MISMATCH'),
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        if (
          batch.dataset.id !== request.datasetId ||
          !Number.isFinite(Date.parse(batch.fetchedAt))
        )
          return failLoad(
            AppError.ValidationError('ANALYTICS_BATCH_METADATA_INVALID'),
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        if (batch.rows.length > 50000 || count + batch.rows.length > 50000)
          return failLoad(
            AppError.ValidationError('ANALYTICS_LOAD_ROWS_LIMIT'),
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        const progress = batch.execution

        if (progress.coverage === 'unverified') {
          sawUnverified = true

          if (
            (progress.kind === 'snapshot' || progress.kind === 'changes') &&
            progress.coverageReason !== undefined
          )
            lastCoverageReason = progress.coverageReason
        }

        const continuation = progress.continuation

        if (
          (progress.kind === 'snapshot' || progress.kind === 'changes') &&
          progress.batch !== undefined
        ) {
          if (progress.batch.index !== index || progress.batch.offset !== count)
            return failLoad(
              AppError.ValidationError('ANALYTICS_BATCH_PROGRESS_MISMATCH'),
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )

          if (
            expectedTotal !== undefined &&
            progress.batch.totalRows !== expectedTotal
          )
            return failLoad(
              AppError.ValidationError('ANALYTICS_COLLECTION_CHANGED'),
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )

          expectedTotal = progress.batch.totalRows

          if (progress.batch.finished !== (continuation === undefined))
            return failLoad(
              AppError.ValidationError('ANALYTICS_BATCH_COMPLETION_MISMATCH'),
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )
        }

        if (progress.kind === 'changes') {
          if (progress.checkpoint.trim() === '')
            return failLoad(
              AppError.ValidationError('ANALYTICS_CHANGES_CHECKPOINT_INVALID'),
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )

          if (
            manifest.extraction.changes?.deletions === 'none' &&
            progress.deletedIds.length > 0
          )
            return failLoad(
              AppError.ValidationError(
                'ANALYTICS_CHANGES_DELETION_NOT_ALLOWED',
              ),
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )

          for (const deletedId of progress.deletedIds)
            deletedIds.push(deletedId)
        }

        if (continuation !== undefined) {
          let emptyPage = batch.rows.length === 0
          if (progress.kind === 'changes')
            emptyPage =
              batch.rows.length === 0 && progress.deletedIds.length === 0

          if (
            progress.coverage === 'complete' ||
            emptyPage ||
            cursors.has(continuation.cursor)
          )
            return failLoad(
              AppError.ValidationError('ANALYTICS_CONTINUATION_INVALID'),
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )
        }

        if (continuation === undefined && progress.coverage === 'partial')
          return failLoad(
            AppError.ValidationError('ANALYTICS_INCOMPLETE_LOAD'),
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        let storedBatch: AnalyticsDatasetResult = batch

        if (requestExecutionMode === 'aggregate') {
          const approved = this.validateAggregateResult(
            manifest,
            request,
            batch,
          )
          if (approved.isFailure())
            return failLoad(
              approved.failure,
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )

          let aggregationDescriptor = batch.dataset.extraction.aggregation
          if (aggregationDescriptor === undefined)
            aggregationDescriptor = manifest.extraction.aggregation

          const aggregateExtraction: AnalyticsDatasetManifest['extraction'] = {
            modes: ['aggregate'],
            identity: { kind: 'scope' },
          }

          if (aggregationDescriptor !== undefined)
            aggregateExtraction.aggregation = aggregationDescriptor

          storedBatch = {
            ...batch,
            dataset: {
              ...batch.dataset,
              extraction: aggregateExtraction,
            },
          }
        }

        let shouldStageBatch = strategy === 'full_replace'

        if (!shouldStageBatch && existingEntry !== undefined)
          shouldStageBatch =
            generation !== undefined ||
            batch.rows.length > 0 ||
            manifestHasColumnDifference(
              existingEntry.publication.manifest.columns,
              storedBatch.dataset.columns,
            )

        if (shouldStageBatch) {
          if (generation === undefined) {
            let stagingQuery = targetScopeQuery

            if (
              strategy === 'incremental_changes' &&
              existingEntry?.syncState.checkpoint !== undefined
            )
              stagingQuery = {
                ...targetScopeQuery,
                execution: {
                  kind: 'changes',
                  checkpoint: existingEntry.syncState.checkpoint,
                },
              }

            const created = await this.analyticsEngine.create(
              owner,
              storedBatch.dataset,
              stagingQuery,
            )
            if (created.isFailure())
              return failLoad(
                created.failure,
                eventMode,
                index,
                count,
                expectedTotal,
                true,
              )

            generation = created.success
          }

          const appended = await this.analyticsEngine.append(
            generation,
            storedBatch,
          )
          if (appended.isFailure())
            return failLoad(
              appended.failure,
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )
        }

        count += batch.rows.length

        this.emitProgress(
          input,
          selectionKey,
          eventMode,
          'extracting',
          index,
          count,
          expectedTotal,
          undefined,
        )

        if (continuation !== undefined) {
          cursor = continuation.cursor
          cursors.add(cursor)
          continue
        }

        if (expectedTotal !== undefined && expectedTotal !== count)
          return failLoad(
            AppError.ValidationError('ANALYTICS_LOAD_TOTAL_MISMATCH'),
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        if (
          strategy === 'full_replace' &&
          progress.kind === 'snapshot' &&
          manifest.extraction.modes.includes('changes') &&
          progress.checkpoint !== undefined &&
          progress.checkpoint.trim() !== ''
        )
          snapshotCheckpoint = progress.checkpoint

        if (strategy === 'incremental_changes' && progress.kind === 'changes')
          changesCheckpoint = progress.checkpoint

        const current = await this.analyticsResolver.resolve(
          input.workspaceId,
          input.connectionInstanceId,
        )
        if (current.isFailure())
          return failLoad(
            current.failure,
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        if (
          current.success.authorizationKey !== authorizationKey ||
          current.success.provider !== provider
        )
          return failLoad(
            AppError.Unauthorized('ANALYTICS_AUTHORIZATION_CHANGED'),
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        if (progress.coverage === 'partial')
          return failLoad(
            AppError.ValidationError('ANALYTICS_INCOMPLETE_LOAD'),
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        let finalCoverage: 'complete' | 'unverified' = 'complete'
        if (progress.coverage === 'unverified' || sawUnverified)
          finalCoverage = 'unverified'

        this.emitProgress(
          input,
          selectionKey,
          eventMode,
          'publishing',
          index,
          count,
          expectedTotal,
          undefined,
        )

        let publicationResult:
          Either<AppError, AnalyticsLoadResult['publication']> | undefined

        if (
          strategy === 'window_rescan' &&
          existingEntry !== undefined &&
          windowBounds !== undefined
        ) {
          const syncMeta: AnalyticsSyncMetadata = {
            strategy: 'window_rescan',
            lastWindowStart: windowBounds.startDate,
            lastWindowEnd: windowBounds.endDate,
          }
          if (
            finalCoverage === 'unverified' &&
            lastCoverageReason !== undefined
          )
            syncMeta.coverageReason = lastCoverageReason

          publicationResult = await this.analyticsEngine.publishWindowMerge(
            owner,
            existingEntry.publication.generationId,
            generation,
            windowBounds,
            finalCoverage,
            batch.fetchedAt,
            syncMeta,
          )
        }

        if (
          publicationResult === undefined &&
          strategy === 'incremental_changes' &&
          existingEntry !== undefined
        ) {
          const syncMeta: AnalyticsSyncMetadata = {
            strategy: 'incremental_changes',
            checkpoint: changesCheckpoint,
          }
          if (
            finalCoverage === 'unverified' &&
            lastCoverageReason !== undefined
          )
            syncMeta.coverageReason = lastCoverageReason

          let deletionsMode: 'none' | 'explicit' = 'none'
          if (manifest.extraction.changes !== undefined)
            deletionsMode = manifest.extraction.changes.deletions

          publicationResult = await this.analyticsEngine.publishChangesMerge(
            owner,
            existingEntry.publication.generationId,
            generation,
            deletedIds,
            deletionsMode,
            finalCoverage,
            batch.fetchedAt,
            syncMeta,
          )
        }

        if (publicationResult === undefined) {
          if (generation === undefined)
            return failLoad(
              AppError.Internal('ANALYTICS_GENERATION_MISSING'),
              eventMode,
              index,
              count,
              expectedTotal,
              true,
            )

          const syncMeta: AnalyticsSyncMetadata = {
            strategy: 'full_replace',
          }
          if (snapshotCheckpoint !== undefined)
            syncMeta.checkpoint = snapshotCheckpoint
          if (
            finalCoverage === 'unverified' &&
            lastCoverageReason !== undefined
          )
            syncMeta.coverageReason = lastCoverageReason

          publicationResult = await this.analyticsEngine.publish(
            generation,
            finalCoverage,
            batch.fetchedAt,
            syncMeta,
          )
        }

        if (
          (strategy === 'window_rescan' ||
            strategy === 'incremental_changes') &&
          publicationResult.isFailure() &&
          publicationResult.failure.messageKey ===
            'ANALYTICS_SCHEMA_CHANGED_DURING_LOAD' &&
          allowSchemaPromotion
        ) {
          if (generation !== undefined) {
            await this.analyticsEngine.remove(generation)
            generation = undefined
          }

          return this.runLoad(
            input,
            provider,
            authorizationKey,
            selectionKey,
            {
              ...policy,
              mode: 'full',
            },
            false,
          )
        }

        if (publicationResult.isFailure())
          return failLoad(
            publicationResult.failure,
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        published = true
        const syncStateResult = await this.analyticsEngine.getSyncState(owner)
        if (syncStateResult.isFailure())
          return failLoad(
            syncStateResult.failure,
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        if (syncStateResult.success === undefined)
          return failLoad(
            AppError.Internal('ANALYTICS_STORAGE_METADATA_INVALID'),
            eventMode,
            index,
            count,
            expectedTotal,
            true,
          )

        this.emitProgress(
          input,
          selectionKey,
          eventMode,
          'completed',
          index,
          count,
          expectedTotal,
          publicationResult.success.coverage,
        )

        return Either.success({
          publication: publicationResult.success,
          syncState: syncStateResult.success,
          strategy,
        })
      }

      return failLoad(
        AppError.ValidationError('ANALYTICS_LOAD_PAGES_LIMIT'),
        eventMode,
        lastBatchIndex,
        count,
        expectedTotal,
        true,
      )
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

      if (resolution.isFailure()) {
        if (isUnauthorizedOrForbidden(resolution.failure))
          await this.analyticsEngine.revokeConnection(
            input.workspaceId,
            node.connectionInstanceId,
          )

        return Either.failure(
          connectionFailure(resolution.failure, node.connectionInstanceId),
        )
      }

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

      if (current.isFailure()) {
        if (isUnauthorizedOrForbidden(current.failure))
          await this.analyticsEngine.revokeConnection(
            input.workspaceId,
            authorization.connectionInstanceId,
          )

        return Either.failure(
          connectionFailure(
            current.failure,
            authorization.connectionInstanceId,
          ),
        )
      }

      if (
        current.success.authorizationKey !== authorization.authorizationKey ||
        current.success.provider !==
          providers.get(authorization.connectionInstanceId)
      ) {
        await this.analyticsEngine.revokeConnection(
          input.workspaceId,
          authorization.connectionInstanceId,
        )

        return Either.failure(
          AppError.Unauthorized('ANALYTICS_AUTHORIZATION_CHANGED', {
            connectionInstanceIds: [authorization.connectionInstanceId],
          }),
        )
      }
    }

    return result
  }
}
