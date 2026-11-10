import {
  type AnalyticsDatasetManifest,
  type AnalyticsDatasetQueryInput,
  type AnalyticsDatasetResult,
  type AnalyticsDatasetRow,
  type AnalyticsFilterDynamicSource,
  type AnalyticsFilterOption,
  type AnalyticsFilterValue,
  AppError,
  createAnalyticsDatasetScope,
  Either,
  type IAnalyticsProvider,
  type TaskDTO,
} from '@mr-tick/sdk'

import { FAKE_MEMBER } from './fakeData'
import {
  type DeletedTaskLogEntry,
  FakeDatabaseStore,
} from './FakeDatabaseStore'

const FAKE_ANALYTICS_DATASETS: AnalyticsDatasetManifest[] = [
  {
    id: 'fake_time_entries',
    name: 'Apontamentos',
    description: '/fake/time_entries',
    selection: { dateRange: true, project: true },
    extraction: {
      modes: ['snapshot', 'aggregate'],
      identity: { kind: 'row', columns: ['id'] },
      windowRescan: { dateColumn: 'date' },
      aggregation: {
        groupByColumns: ['project', 'user', 'activity'],
        operators: ['count', 'sum', 'average', 'minimum', 'maximum'],
        postProcessing: 'projection-only',
      },
    },
    sourceFormat: 'json',
    endpoint: '/fake/time_entries',
    columns: [
      { name: 'id', label: 'ID', type: 'string', unit: 'none' },
      { name: 'project', label: 'Projeto', type: 'string', unit: 'none' },
      { name: 'date', label: 'Data', type: 'date', unit: 'none' },
      { name: 'user', label: 'Usuário', type: 'string', unit: 'none' },
      { name: 'activity', label: 'Atividade', type: 'string', unit: 'none' },
      { name: 'issue', label: 'Tarefa', type: 'string', unit: 'none' },
      { name: 'issue_id', label: 'ID Tarefa', type: 'string', unit: 'none' },
      {
        name: 'issue_tracker',
        label: 'Rastreador',
        type: 'string',
        unit: 'none',
      },
      { name: 'hours', label: 'Horas', type: 'number', unit: 'hours' },
      { name: 'comment', label: 'Comentário', type: 'string', unit: 'none' },
    ],
    supportedFilters: [
      {
        id: 'project_id',
        label: 'Projeto',
        type: 'select',
        dynamicOptionsSource: 'projects',
      },
      {
        id: 'user_id',
        label: 'Usuários',
        type: 'multi_select',
        dynamicOptionsSource: 'members',
      },
      {
        id: 'activity_id',
        label: 'Atividades',
        type: 'multi_select',
        dynamicOptionsSource: 'activities',
      },
    ],
  },
  {
    id: 'fake_issues',
    name: 'Tarefas',
    description: '/fake/issues',
    selection: { dateRange: true, project: true },
    extraction: {
      modes: ['snapshot', 'changes'],
      identity: { kind: 'row', columns: ['id'] },
      changes: { deletions: 'explicit' },
    },
    sourceFormat: 'json',
    endpoint: '/fake/issues',
    columns: [
      { name: 'id', label: 'ID', type: 'string', unit: 'none' },
      {
        name: 'parent_id',
        label: 'Tarefa Pai',
        type: 'string',
        unit: 'none',
      },
      { name: 'title', label: 'Título', type: 'string', unit: 'none' },
      { name: 'subject', label: 'Assunto', type: 'string', unit: 'none' },
      { name: 'project', label: 'Projeto', type: 'string', unit: 'none' },
      { name: 'tracker', label: 'Rastreador', type: 'string', unit: 'none' },
      { name: 'status', label: 'Situação', type: 'string', unit: 'none' },
      { name: 'is_closed', label: 'Concluída', type: 'boolean', unit: 'none' },
      {
        name: 'assignee',
        label: 'Atribuído para',
        type: 'string',
        unit: 'none',
      },
      {
        name: 'target_version',
        label: 'Versão',
        type: 'string',
        unit: 'none',
      },
      {
        name: 'estimated_hours',
        label: 'Horas Estimadas',
        type: 'number',
        unit: 'hours',
      },
      {
        name: 'spent_hours',
        label: 'Horas Gastas',
        type: 'number',
        unit: 'hours',
      },
      {
        name: 'done_ratio',
        label: '% Concluído',
        type: 'number',
        unit: 'percent',
      },
      {
        name: 'created_date',
        label: 'Data Criação',
        type: 'date',
        unit: 'none',
      },
      {
        name: 'updated_date',
        label: 'Data Atualização',
        type: 'date',
        unit: 'none',
      },
      {
        name: 'closed_date',
        label: 'Data Fechamento',
        type: 'date',
        unit: 'none',
      },
      {
        name: 'custom_pontos',
        label: 'Pontos de Complexidade',
        type: 'number',
        unit: 'points',
        origin: 'custom',
        providerFieldId: 'cf_1',
      },
      {
        name: 'custom_revisor',
        label: 'Responsável Revisão',
        type: 'string',
        unit: 'none',
        origin: 'custom',
        providerFieldId: 'cf_2',
      },
      {
        name: 'custom_qa',
        label: 'Responsável QA',
        type: 'string',
        unit: 'none',
        origin: 'custom',
        providerFieldId: 'cf_3',
      },
    ],
    supportedFilters: [
      {
        id: 'project_id',
        label: 'Projeto',
        type: 'select',
        dynamicOptionsSource: 'projects',
      },
      {
        id: 'assignee_id',
        label: 'Responsáveis',
        type: 'multi_select',
        dynamicOptionsSource: 'members',
      },
      {
        id: 'status_id',
        label: 'Situação',
        type: 'multi_select',
        dynamicOptionsSource: 'task_statuses',
      },
    ],
  },
  {
    id: 'fake_projects',
    name: 'Projetos',
    description: '/fake/projects',
    selection: { dateRange: false, project: false },
    extraction: { modes: ['snapshot'], identity: { kind: 'scope' } },
    sourceFormat: 'json',
    endpoint: '/fake/projects',
    columns: [
      { name: 'id', label: 'ID', type: 'string', unit: 'none' },
      { name: 'name', label: 'Nome do Projeto', type: 'string', unit: 'none' },
      {
        name: 'identifier',
        label: 'Identificador',
        type: 'string',
        unit: 'none',
      },
      { name: 'status', label: 'Status', type: 'string', unit: 'none' },
    ],
  },
  {
    id: 'fake_users',
    name: 'Usuários',
    description: '/fake/users',
    selection: { dateRange: false, project: false },
    extraction: { modes: ['snapshot'], identity: { kind: 'scope' } },
    sourceFormat: 'json',
    endpoint: '/fake/users',
    columns: [
      { name: 'id', label: 'ID', type: 'string', unit: 'none' },
      { name: 'name', label: 'Nome Completo', type: 'string', unit: 'none' },
      { name: 'email', label: 'Email', type: 'string', unit: 'none' },
      { name: 'role', label: 'Função', type: 'string', unit: 'none' },
    ],
  },
  {
    id: 'fake_versions',
    name: 'Versões',
    description: '/fake/versions',
    selection: { dateRange: false, project: true },
    extraction: { modes: ['snapshot'], identity: { kind: 'scope' } },
    sourceFormat: 'json',
    endpoint: '/fake/versions',
    columns: [
      { name: 'id', label: 'ID Versão', type: 'string', unit: 'none' },
      { name: 'project', label: 'Projeto', type: 'string', unit: 'none' },
      { name: 'name', label: 'Nome', type: 'string', unit: 'none' },
      { name: 'status', label: 'Status', type: 'string', unit: 'none' },
      { name: 'due_date', label: 'Data Limite', type: 'date', unit: 'none' },
    ],
    supportedFilters: [
      {
        id: 'project_id',
        label: 'Projeto',
        type: 'select',
        dynamicOptionsSource: 'projects',
      },
    ],
  },
  {
    id: 'fake_issue_journals',
    name: 'Histórico',
    description: '/fake/journals',
    selection: { dateRange: false, project: false },
    extraction: { modes: ['snapshot'], identity: { kind: 'scope' } },
    sourceFormat: 'json',
    endpoint: '/fake/journals',
    columns: [
      { name: 'issue_id', label: 'ID Tarefa', type: 'string', unit: 'none' },
      {
        name: 'journal_id',
        label: 'ID Histórico',
        type: 'string',
        unit: 'none',
      },
      { name: 'user', label: 'Usuário', type: 'string', unit: 'none' },
      {
        name: 'field_name',
        label: 'Campo Alterado',
        type: 'string',
        unit: 'none',
      },
      {
        name: 'old_value',
        label: 'Valor Anterior',
        type: 'string',
        unit: 'none',
      },
      { name: 'new_value', label: 'Novo Valor', type: 'string', unit: 'none' },
      { name: 'notes', label: 'Notas', type: 'string', unit: 'none' },
      { name: 'created_date', label: 'Data', type: 'date', unit: 'none' },
    ],
  },
]

interface CursorState {
  kind: 'snapshot' | 'changes'
  scope: string
  offset: number
  touched: number
  rows: AnalyticsDatasetRow[]
  deletedIds: string[]
  finalCheckpoint?: string
}

function isIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  if (!Number.isFinite(Date.parse(value))) return false

  return new Date(value).toISOString().slice(0, 10) === value
}

function validateScopeSelection(
  manifest: AnalyticsDatasetManifest,
  input: AnalyticsDatasetQueryInput,
): Either<AppError, void> {
  if (
    (input.startDate !== undefined || input.endDate !== undefined) &&
    manifest.selection?.dateRange !== true
  )
    return Either.failure(
      AppError.ValidationError('ANALYTICS_DATE_SELECTION_NOT_SUPPORTED'),
    )

  if (input.startDate !== undefined && !isIsoDateOnly(input.startDate))
    return Either.failure(
      AppError.ValidationError('ANALYTICS_DATE_FILTER_INVALID'),
    )

  if (input.endDate !== undefined && !isIsoDateOnly(input.endDate))
    return Either.failure(
      AppError.ValidationError('ANALYTICS_DATE_FILTER_INVALID'),
    )

  if (
    input.startDate !== undefined &&
    input.endDate !== undefined &&
    input.startDate > input.endDate
  )
    return Either.failure(
      AppError.ValidationError('ANALYTICS_DATE_RANGE_INVALID'),
    )

  if (
    input.projectId !== undefined &&
    input.projectId !== 'all' &&
    manifest.selection?.project !== true
  )
    return Either.failure(
      AppError.ValidationError('ANALYTICS_PROJECT_SELECTION_NOT_SUPPORTED'),
    )

  if (input.filters !== undefined) {
    for (const name of Object.keys(input.filters)) {
      if (!manifest.supportedFilters?.some((filter) => filter.id === name))
        return Either.failure(
          AppError.ValidationError('ANALYTICS_FILTER_NOT_SUPPORTED'),
        )
    }
  }

  return Either.success(undefined)
}

function matchesSelectionValue(
  filterValue: AnalyticsFilterValue,
  candidates: readonly (string | undefined)[],
): boolean {
  if (Array.isArray(filterValue)) {
    if (filterValue.length === 0) return true

    return filterValue.some((target) =>
      candidates.some((candidate) => candidate === target),
    )
  }

  if (typeof filterValue === 'string') {
    const trimmed = filterValue.trim()
    if (trimmed === '' || trimmed === 'all') return true

    return candidates.some((candidate) => candidate === trimmed)
  }

  return true
}

function matchesIssueScope(
  issue: Pick<
    TaskDTO | DeletedTaskLogEntry,
    'projectName' | 'status' | 'assignedTo' | 'createdAt'
  >,
  input: AnalyticsDatasetQueryInput,
): boolean {
  let projectVal = 'Projeto Alpha'
  if (issue.projectName) projectVal = issue.projectName

  if (
    input.projectId !== undefined &&
    input.projectId !== 'all' &&
    projectVal !== input.projectId
  )
    return false

  const createdDate = issue.createdAt.toISOString().slice(0, 10)
  if (input.startDate !== undefined && createdDate < input.startDate)
    return false
  if (input.endDate !== undefined && createdDate > input.endDate) return false

  if (input.filters === undefined) return true

  const projectFilter = input.filters.project_id
  if (
    typeof projectFilter === 'string' &&
    projectFilter !== '' &&
    projectFilter !== 'all' &&
    projectVal !== projectFilter
  )
    return false

  let assigneeName = 'Não atribuído'
  if (issue.assignedTo && issue.assignedTo.name)
    assigneeName = issue.assignedTo.name

  const assigneeFilter = input.filters.assignee_id
  if (
    assigneeFilter !== undefined &&
    !matchesSelectionValue(assigneeFilter, [
      issue.assignedTo?.id,
      issue.assignedTo?.name,
      assigneeName,
    ])
  )
    return false

  const statusFilter = input.filters.status_id
  if (
    statusFilter !== undefined &&
    !matchesSelectionValue(statusFilter, [issue.status.id, issue.status.name])
  )
    return false

  return true
}

function toIssueRow(task: TaskDTO): AnalyticsDatasetRow {
  let projectVal = 'Projeto Alpha'
  if (task.projectName) projectVal = task.projectName

  let assigneeName = 'Não atribuído'
  if (task.assignedTo && task.assignedTo.name)
    assigneeName = task.assignedTo.name

  let doneRatio = 50
  if (task.doneRatio !== undefined) doneRatio = task.doneRatio

  const isClosedVal = doneRatio >= 100
  const updatedIso = task.updatedAt.toISOString()

  let closedDate: string | null = null
  if (isClosedVal) closedDate = updatedIso.slice(0, 10)

  return {
    id: task.id,
    parent_id: '',
    title: task.title,
    subject: task.title,
    project: projectVal,
    tracker: 'Feature',
    status: task.status.name,
    is_closed: isClosedVal,
    assignee: assigneeName,
    target_version: 'Sprint 308',
    estimated_hours: 8,
    spent_hours: 4.5,
    done_ratio: doneRatio,
    created_date: task.createdAt.toISOString().slice(0, 10),
    updated_date: updatedIso,
    closed_date: closedDate,
    custom_pontos: 5,
    custom_revisor: 'Carlos Silva',
    custom_qa: 'Beatriz Ramos',
  }
}

export class FakeAnalyticsProvider implements IAnalyticsProvider {
  private readonly cursors = new Map<string, CursorState>()
  private readonly store = FakeDatabaseStore.getInstance()

  public async getFilterOptions(
    source: AnalyticsFilterDynamicSource,
  ): Promise<Either<AppError, AnalyticsFilterOption[]>> {
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('FAKE_UNAUTHORIZED'))

    const metadata = this.store.getMetadata()
    let items: { id: string; name: string }[] = []

    switch (source) {
      case 'projects':
        return Either.success([
          { value: 'Projeto Alpha', label: 'Projeto Alpha' },
          { value: 'Projeto Beta', label: 'Projeto Beta' },
        ])
      case 'members':
        return Either.success([
          {
            value: String(FAKE_MEMBER.id),
            label: `${FAKE_MEMBER.firstname} ${FAKE_MEMBER.lastname}`,
          },
        ])
      case 'activities':
        items = metadata.activities
        break
      case 'task_statuses':
        items = metadata.taskStatuses
        break
      case 'task_trackers':
        items = metadata.trackStatuses
        break
      case 'task_priorities':
        items = metadata.taskPriorities
        break
      default: {
        const datasets: Partial<Record<AnalyticsFilterDynamicSource, string>> =
          {
            sprints_versions: 'fake_versions',
          }
        const datasetId = datasets[source]
        if (datasetId === undefined)
          return Either.failure(
            AppError.ValidationError('ANALYTICS_FILTER_SOURCE_NOT_SUPPORTED'),
          )
        const manifest = FAKE_ANALYTICS_DATASETS.find(
          (item) => item.id === datasetId,
        )
        if (manifest === undefined)
          return Either.failure(
            AppError.ValidationError('ANALYTICS_FILTER_SOURCE_NOT_SUPPORTED'),
          )
        const data = this.buildSnapshotData(manifest, { datasetId })
        return Either.success(
          data.rows.flatMap((row) => {
            if (typeof row.id !== 'string' || typeof row.name !== 'string')
              return []
            return [{ value: row.id, label: row.name }]
          }),
        )
      }
    }

    return Either.success(
      items.map((item) => ({ value: item.id, label: item.name })),
    )
  }

  public async listAnalyticsDatasets(): Promise<
    Either<AppError, AnalyticsDatasetManifest[]>
  > {
    return Either.success(FAKE_ANALYTICS_DATASETS)
  }

  /** Synthetic remote server for exercising the public aggregation contract. */
  private async aggregateFixture(
    manifest: AnalyticsDatasetManifest,
    input: AnalyticsDatasetQueryInput,
  ): Promise<Either<AppError, AnalyticsDatasetResult>> {
    const execution = input.execution

    if (
      execution?.kind !== 'aggregate' ||
      manifest.extraction.aggregation === undefined
    )
      return Either.failure(
        AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
      )

    const descriptor = manifest.extraction.aggregation

    if (
      execution.cursor !== undefined ||
      execution.groupBy.some(
        (name) => !descriptor.groupByColumns.includes(name),
      ) ||
      execution.measures.some(
        (measure) => !descriptor.operators.includes(measure.operator),
      )
    )
      return Either.failure(
        AppError.ValidationError('ANALYTICS_AGGREGATE_INVALID'),
      )

    const names = [
      ...execution.groupBy,
      ...execution.measures.map((measure) => measure.name),
    ]
    if (execution.measures.length === 0 || new Set(names).size !== names.length)
      return Either.failure(
        AppError.ValidationError('ANALYTICS_AGGREGATE_INVALID'),
      )

    for (const measure of execution.measures) {
      if (measure.operator === 'count' && measure.column === undefined) continue
      const column = manifest.columns.find(
        (item) => item.name === measure.column,
      )
      if (
        column === undefined ||
        (measure.operator !== 'count' && column.type !== 'number')
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_AGGREGATE_MEASURE_INVALID'),
        )
    }

    const full = this.buildSnapshotData(
      manifest,
      createAnalyticsDatasetScope(input),
    )
    const groups = new Map<string, AnalyticsDatasetRow[]>()
    if (execution.groupBy.length === 0) groups.set('[]', [])

    for (const row of full.rows) {
      const key = JSON.stringify(execution.groupBy.map((name) => row[name]))
      const group = groups.get(key)

      if (group !== undefined) {
        group.push(row)
        continue
      }

      groups.set(key, [row])
    }

    const rows: AnalyticsDatasetRow[] = []

    for (const group of groups.values()) {
      const row: AnalyticsDatasetRow = {}
      const representative = group.find(() => true)
      if (representative !== undefined)
        for (const name of execution.groupBy) row[name] = representative[name]

      for (const measure of execution.measures) {
        const values: number[] = []

        for (const item of group) {
          if (measure.column === undefined) continue
          const value = item[measure.column]
          if (typeof value === 'number') values.push(value)
        }

        const total = values.reduce((sum, value) => sum + value, 0)

        switch (measure.operator) {
          case 'count':
            row[measure.name] = group.length
            if (measure.column !== undefined) {
              const name = measure.column
              row[measure.name] = group.filter(
                (item) => item[name] !== null && item[name] !== undefined,
              ).length
            }
            break
          case 'sum':
            row[measure.name] = null
            if (values.length > 0) row[measure.name] = total
            break
          case 'average':
            row[measure.name] = null
            if (values.length > 0) row[measure.name] = total / values.length
            break
          case 'minimum':
            row[measure.name] = null
            if (values.length > 0) row[measure.name] = Math.min(...values)
            break
          case 'maximum':
            row[measure.name] = null
            if (values.length > 0) row[measure.name] = Math.max(...values)
            break
        }
      }

      rows.push(row)
    }

    const columns: AnalyticsDatasetManifest['columns'] = []

    for (const name of execution.groupBy) {
      const column = manifest.columns.find((item) => item.name === name)
      if (column === undefined)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_COLUMN_NOT_FOUND'),
        )
      columns.push(column)
    }

    for (const measure of execution.measures) {
      columns.push({
        name: measure.name,
        label: measure.name,
        type: 'number',
        origin: 'computed',
      })
    }

    return Either.success({
      dataset: { ...manifest, columns },
      rows,
      fetchedAt: new Date().toISOString(),
      execution: {
        kind: 'aggregate',
        scope: createAnalyticsDatasetScope(input),
        coverage: 'complete',
      },
    })
  }

  public async fetchAnalyticsDataset(
    input: AnalyticsDatasetQueryInput,
  ): Promise<Either<AppError, AnalyticsDatasetResult>> {
    if (this.store.getSimulateAuthError())
      return Either.failure(AppError.Unauthorized('FAKE_UNAUTHORIZED'))

    const manifest = FAKE_ANALYTICS_DATASETS.find(
      (item) => item.id === input.datasetId,
    )
    if (manifest === undefined)
      return Either.failure(
        AppError.NotFound(
          `Dataset analítico simulado não encontrado: ${input.datasetId}`,
        ),
      )

    const validScope = validateScopeSelection(manifest, input)
    if (validScope.isFailure()) return validScope.forwardFailure()

    if (input.execution?.kind === 'aggregate')
      return this.aggregateFixture(manifest, input)

    let requestedKind: 'snapshot' | 'changes' = 'snapshot'

    if (input.execution !== undefined) {
      if (
        input.execution.kind !== 'snapshot' &&
        input.execution.kind !== 'changes'
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
        )

      requestedKind = input.execution.kind
    }

    if (!manifest.extraction.modes.includes(requestedKind))
      return Either.failure(
        AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
      )

    let batchSize = 100
    if (input.execution?.batchSize !== undefined)
      batchSize = input.execution.batchSize

    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
      return Either.failure(
        AppError.ValidationError('ANALYTICS_BATCH_SIZE_INVALID'),
      )

    const nowMs = Date.now()

    for (const [key, entry] of this.cursors) {
      if (nowMs - entry.touched > 600000) this.cursors.delete(key)
    }

    if (input.execution?.kind === 'changes')
      return this.fetchChangesBatch(
        manifest,
        input,
        input.execution.checkpoint,
        input.execution.cursor,
        batchSize,
        nowMs,
      )

    return this.fetchSnapshotBatch(
      manifest,
      input,
      input.execution?.cursor,
      batchSize,
      nowMs,
    )
  }

  private fetchChangesBatch(
    manifest: AnalyticsDatasetManifest,
    input: AnalyticsDatasetQueryInput,
    checkpoint: string,
    cursor: string | undefined,
    batchSize: number,
    nowMs: number,
  ): Either<AppError, AnalyticsDatasetResult> {
    const checkpointMs = Date.parse(checkpoint)
    if (checkpoint.trim() === '' || !Number.isFinite(checkpointMs))
      return Either.failure(
        AppError.ValidationError('ANALYTICS_CHANGES_CHECKPOINT_INVALID'),
      )

    const scope = createAnalyticsDatasetScope(input)
    const scopeKey = JSON.stringify([scope, 'changes', checkpoint, batchSize])
    let offset = 0
    let rows: AnalyticsDatasetRow[] = []
    let deletedIds: string[] = []
    let finalCheckpoint = checkpoint

    if (cursor !== undefined) {
      const entry = this.cursors.get(cursor)
      if (
        entry === undefined ||
        entry.kind !== 'changes' ||
        entry.scope !== scopeKey
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_CURSOR_INVALID_OR_EXPIRED'),
        )

      this.cursors.delete(cursor)
      offset = entry.offset
      rows = entry.rows
      deletedIds = entry.deletedIds
      if (entry.finalCheckpoint !== undefined)
        finalCheckpoint = entry.finalCheckpoint
    }

    if (cursor === undefined) {
      const delta = this.buildIssueDelta(input, checkpoint, checkpointMs)
      rows = delta.rows
      deletedIds = delta.deletedIds
      finalCheckpoint = delta.finalCheckpoint
    }

    const total = rows.length
    const slice = rows.slice(offset, offset + batchSize)
    const finished = offset + slice.length >= total
    let continuation: { cursor: string } | undefined

    if (!finished) {
      if (this.cursors.size >= 64)
        return Either.failure(
          AppError.Http(429, 'ANALYTICS_ACTIVE_SCANS_LIMIT'),
        )

      continuation = { cursor: crypto.randomUUID() }
      this.cursors.set(continuation.cursor, {
        kind: 'changes',
        scope: scopeKey,
        offset: offset + slice.length,
        touched: nowMs,
        rows,
        deletedIds,
        finalCheckpoint,
      })
    }

    let batchDeletedIds: string[] = []
    if (offset === 0) batchDeletedIds = deletedIds

    let coverage: 'complete' | 'partial' = 'partial'
    if (finished) coverage = 'complete'

    let responseCheckpoint = checkpoint
    if (finished) responseCheckpoint = finalCheckpoint

    return Either.success({
      dataset: manifest,
      rows: slice,
      fetchedAt: new Date().toISOString(),
      execution: {
        kind: 'changes',
        scope,
        checkpoint: responseCheckpoint,
        deletedIds: batchDeletedIds,
        coverage,
        batch: {
          index: Math.floor(offset / batchSize),
          offset,
          finished,
          totalRows: total,
        },
        continuation,
      },
    })
  }

  private fetchSnapshotBatch(
    manifest: AnalyticsDatasetManifest,
    input: AnalyticsDatasetQueryInput,
    cursor: string | undefined,
    batchSize: number,
    nowMs: number,
  ): Either<AppError, AnalyticsDatasetResult> {
    const scope = createAnalyticsDatasetScope(input)
    const scopeKey = JSON.stringify([scope, 'snapshot', batchSize])
    let offset = 0
    let rows: AnalyticsDatasetRow[] = []
    let finalCheckpoint: string | undefined

    if (cursor !== undefined) {
      const entry = this.cursors.get(cursor)
      if (
        entry === undefined ||
        entry.kind !== 'snapshot' ||
        entry.scope !== scopeKey
      )
        return Either.failure(
          AppError.ValidationError('ANALYTICS_CURSOR_INVALID_OR_EXPIRED'),
        )

      this.cursors.delete(cursor)
      offset = entry.offset
      rows = entry.rows
      finalCheckpoint = entry.finalCheckpoint
    }

    if (cursor === undefined) {
      const snapshot = this.buildSnapshotData(manifest, input)
      rows = snapshot.rows
      finalCheckpoint = snapshot.finalCheckpoint
    }

    const total = rows.length
    const slice = rows.slice(offset, offset + batchSize)
    const finished = offset + slice.length >= total
    let continuation: { cursor: string } | undefined

    if (!finished) {
      if (this.cursors.size >= 64)
        return Either.failure(
          AppError.Http(429, 'ANALYTICS_ACTIVE_SCANS_LIMIT'),
        )

      continuation = { cursor: crypto.randomUUID() }
      this.cursors.set(continuation.cursor, {
        kind: 'snapshot',
        scope: scopeKey,
        offset: offset + slice.length,
        touched: nowMs,
        rows,
        deletedIds: [],
        finalCheckpoint,
      })
    }

    let coverage: 'complete' | 'partial' | 'unverified' = 'partial'
    let coverageReason: string | undefined
    let checkpoint: string | undefined

    if (finished && manifest.id === 'fake_issues') {
      coverage = 'complete'
      checkpoint = finalCheckpoint
    }

    if (finished && manifest.id !== 'fake_issues') {
      coverage = 'unverified'
      coverageReason = 'FIXTURE_PREVIEW'
    }

    return Either.success({
      dataset: manifest,
      rows: slice,
      fetchedAt: new Date().toISOString(),
      execution: {
        kind: 'snapshot',
        scope,
        coverage,
        coverageReason,
        checkpoint,
        batch: {
          index: Math.floor(offset / batchSize),
          offset,
          finished,
          totalRows: total,
        },
        continuation,
      },
    })
  }

  private buildIssueDelta(
    input: AnalyticsDatasetQueryInput,
    checkpoint: string,
    checkpointMs: number,
  ): {
    rows: AnalyticsDatasetRow[]
    deletedIds: string[]
    finalCheckpoint: string
  } {
    let maxMs = checkpointMs
    const changedTasks = this.store
      .getTasks()
      .filter(
        (task) =>
          task.updatedAt.getTime() > checkpointMs &&
          matchesIssueScope(task, input),
      )
      .sort((left, right) => {
        const timeDiff = left.updatedAt.getTime() - right.updatedAt.getTime()
        if (timeDiff !== 0) return timeDiff

        return left.id.localeCompare(right.id)
      })

    const rows: AnalyticsDatasetRow[] = []

    for (const task of changedTasks) {
      const updatedMs = task.updatedAt.getTime()
      if (updatedMs > maxMs) maxMs = updatedMs
      rows.push(toIssueRow(task))
    }

    const deletedSet = new Set<string>()

    for (const entry of this.store.getDeletedTasksSince(checkpointMs)) {
      if (!matchesIssueScope(entry, input)) continue
      const deletedMs = entry.deletedAt.getTime()
      if (deletedMs > maxMs) maxMs = deletedMs
      deletedSet.add(entry.id)
    }

    let finalCheckpoint = checkpoint
    if (maxMs > checkpointMs) finalCheckpoint = new Date(maxMs).toISOString()

    return {
      rows,
      deletedIds: Array.from(deletedSet),
      finalCheckpoint,
    }
  }

  /** Synthetic development data, not an example of remote extraction. */
  private buildSnapshotData(
    manifest: AnalyticsDatasetManifest,
    input: AnalyticsDatasetQueryInput,
  ): {
    rows: AnalyticsDatasetRow[]
    finalCheckpoint?: string
  } {
    if (manifest.id === 'fake_time_entries')
      return { rows: this.buildTimeEntryRows(input) }

    if (manifest.id === 'fake_projects') {
      return {
        rows: [
          {
            id: 'proj_alpha',
            name: 'Projeto Alpha',
            identifier: 'alpha',
            status: 'Ativo',
          },
          {
            id: 'proj_beta',
            name: 'Projeto Beta',
            identifier: 'beta',
            status: 'Ativo',
          },
        ],
      }
    }

    if (manifest.id === 'fake_users') {
      return {
        rows: [
          {
            id: 'user_1',
            name: 'Carlos Silva',
            email: 'carlos@empresa.com',
            role: 'Desenvolvedor',
          },
          {
            id: 'user_2',
            name: 'Mariana Souza',
            email: 'mariana@empresa.com',
            role: 'Gestora',
          },
          {
            id: 'user_3',
            name: 'Beatriz Ramos',
            email: 'beatriz@empresa.com',
            role: 'QA',
          },
        ],
      }
    }

    if (manifest.id === 'fake_versions') {
      const sprintRows: AnalyticsDatasetRow[] = [
        {
          id: 'v_1',
          project: 'Projeto Alpha',
          name: 'Sprint 308',
          status: 'Fechada',
          due_date: '2026-09-15',
        },
        {
          id: 'v_2',
          project: 'Projeto Alpha',
          name: 'Sprint 309',
          status: 'Aberta',
          due_date: '2026-09-30',
        },
      ]

      let projectFilter = input.projectId
      if (
        (projectFilter === undefined || projectFilter === 'all') &&
        input.filters !== undefined &&
        typeof input.filters.project_id === 'string'
      )
        projectFilter = input.filters.project_id

      if (projectFilter !== undefined && projectFilter !== 'all')
        return {
          rows: sprintRows.filter((row) => row.project === projectFilter),
        }

      return { rows: sprintRows }
    }

    if (manifest.id === 'fake_issue_journals') {
      return {
        rows: [
          {
            issue_id: '101',
            journal_id: 'j_1',
            user: 'Carlos Silva',
            field_name: 'status_id',
            old_value: 'Em Revisão',
            new_value: 'Validada',
            notes: 'Código aprovado sem ressalvas',
            created_date: '2026-09-12',
          },
          {
            issue_id: '102',
            journal_id: 'j_2',
            user: 'Beatriz Ramos',
            field_name: 'status_id',
            old_value: 'Em Revisão',
            new_value: 'Rejeitada Revisão',
            notes: 'Faltou validar arredondamento de casas decimais',
            created_date: '2026-09-15',
          },
        ],
      }
    }

    const tasks = this.store
      .getTasks()
      .filter((task) => matchesIssueScope(task, input))
      .sort((left, right) => {
        const timeDiff = left.updatedAt.getTime() - right.updatedAt.getTime()
        if (timeDiff !== 0) return timeDiff

        return left.id.localeCompare(right.id)
      })

    let maxUpdatedMs: number | undefined
    const rows: AnalyticsDatasetRow[] = []

    for (const task of tasks) {
      const updatedMs = task.updatedAt.getTime()
      if (maxUpdatedMs === undefined || updatedMs > maxUpdatedMs)
        maxUpdatedMs = updatedMs

      rows.push(toIssueRow(task))
    }

    let finalCheckpoint: string | undefined
    if (maxUpdatedMs !== undefined)
      finalCheckpoint = new Date(maxUpdatedMs).toISOString()

    return { rows, finalCheckpoint }
  }

  private buildTimeEntryRows(
    input: AnalyticsDatasetQueryInput,
  ): AnalyticsDatasetRow[] {
    const allEntries = this.store.getTimeEntries()
    const rows: AnalyticsDatasetRow[] = []

    for (const entry of allEntries) {
      let entryDate: string | null = null
      let sourceDate = entry.startDate
      if (sourceDate === undefined) sourceDate = entry.createdAt

      const [isoPart] = sourceDate.toISOString().split('T')
      if (isoPart) entryDate = isoPart

      if (
        input.startDate !== undefined &&
        entryDate !== null &&
        entryDate < input.startDate
      )
        continue

      if (
        input.endDate !== undefined &&
        entryDate !== null &&
        entryDate > input.endDate
      )
        continue

      const projectVal = 'Projeto Alpha'
      if (
        input.projectId !== undefined &&
        input.projectId !== 'all' &&
        projectVal !== input.projectId
      )
        continue

      let entryId = ''
      if (entry.id) entryId = entry.id

      let userName = 'Usuário Simulado'
      if (entry.user.name) userName = entry.user.name

      let activityName = 'Desenvolvimento'
      if (entry.activity.name) activityName = entry.activity.name

      let commentText = ''
      if (entry.comments) commentText = entry.comments

      if (input.filters !== undefined) {
        const projectFilter = input.filters.project_id
        if (
          typeof projectFilter === 'string' &&
          projectFilter !== '' &&
          projectFilter !== 'all' &&
          projectVal !== projectFilter
        )
          continue

        const userFilter = input.filters.user_id
        if (
          userFilter !== undefined &&
          !matchesSelectionValue(userFilter, [
            entry.user.id,
            entry.user.name,
            userName,
          ])
        )
          continue

        const activityFilter = input.filters.activity_id
        if (
          activityFilter !== undefined &&
          !matchesSelectionValue(activityFilter, [
            entry.activity.id,
            entry.activity.name,
            activityName,
          ])
        )
          continue
      }

      rows.push({
        id: entryId,
        project: projectVal,
        date: entryDate,
        user: userName,
        activity: activityName,
        issue: entry.task.id,
        issue_id: entry.task.id,
        issue_tracker: 'Feature',
        hours: Math.round((entry.timeSpent / 3600) * 100) / 100,
        comment: commentText,
      })
    }

    return rows
  }
}
