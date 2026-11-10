import { createAnalyticsDatasetScope } from '@mr-tick/sdk'
import {
  type AnalyticsDatasetManifest,
  type AnalyticsDatasetQueryInput,
  type AnalyticsDatasetResult,
  type AnalyticsDatasetRow,
  type AnalyticsFilterDynamicSource,
  type AnalyticsFilterOption,
  AppError,
  Either,
  type IAnalyticsProvider,
} from '@mr-tick/sdk'

import { FAKE_MEMBER } from './fakeData'
import { FakeDatabaseStore } from './FakeDatabaseStore'

const FAKE_ANALYTICS_DATASETS: AnalyticsDatasetManifest[] = [
  {
    id: 'fake_time_entries',
    name: 'Apontamentos',
    description: '/fake/time_entries',
    extraction: {
      modes: ['snapshot', 'aggregate'],
      identity: { kind: 'scope' },
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
        id: 'date_range',
        label: 'Período',
        type: 'date_range',
        required: true,
      },
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
    extraction: { modes: ['snapshot'], identity: { kind: 'scope' } },
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
        id: 'date_range',
        label: 'Data Criação',
        type: 'date_range',
        required: true,
      },
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

for (const dataset of FAKE_ANALYTICS_DATASETS) {
  let dateRange = false
  let project = false

  if (dataset.supportedFilters !== undefined) {
    dateRange = dataset.supportedFilters.some(
      (filter) => filter.id === 'date_range',
    )
    project = dataset.supportedFilters.some(
      (filter) => filter.id === 'project_id',
    )
  }

  dataset.selection = { dateRange, project }
}

export class FakeAnalyticsProvider implements IAnalyticsProvider {
  private readonly cursors = new Map<
    string,
    { scope: string; offset: number; touched: number }
  >()
  private readonly store = FakeDatabaseStore.getInstance()

  public async getFilterOptions(
    source: AnalyticsFilterDynamicSource,
  ): Promise<Either<AppError, AnalyticsFilterOption[]>> {
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
        const result = await this.fetchFixtureDataset({ datasetId })
        if (result.isFailure()) return result.forwardFailure()
        return Either.success(
          result.success.rows.flatMap((row) => {
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
    input: AnalyticsDatasetQueryInput,
  ): Promise<Either<AppError, AnalyticsDatasetResult>> {
    const execution = input.execution
    const manifest = FAKE_ANALYTICS_DATASETS.find(
      (item) => item.id === input.datasetId,
    )
    if (
      execution?.kind !== 'aggregate' ||
      manifest?.extraction.aggregation === undefined
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
    const full = await this.fetchFixtureDataset(
      createAnalyticsDatasetScope(input),
    )
    if (full.isFailure()) return full.forwardFailure()
    const groups = new Map<string, AnalyticsDatasetRow[]>()
    if (execution.groupBy.length === 0) groups.set('[]', [])
    for (const row of full.success.rows) {
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
    for (const measure of execution.measures)
      columns.push({
        name: measure.name,
        label: measure.name,
        type: 'number',
        origin: 'computed',
      })
    return Either.success({
      dataset: { ...manifest, columns },
      rows,
      fetchedAt: full.success.fetchedAt,
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
    if (input.execution?.kind === 'aggregate')
      return this.aggregateFixture(input)
    if (input.execution !== undefined && input.execution.kind !== 'snapshot')
      return Either.failure(
        AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
      )
    let batchSize = 10
    if (input.execution?.batchSize !== undefined)
      batchSize = input.execution.batchSize
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
      return Either.failure(
        AppError.ValidationError('ANALYTICS_BATCH_SIZE_INVALID'),
      )
    const scope = createAnalyticsDatasetScope(input)
    const scopeKey = JSON.stringify([scope, batchSize])
    let offset = 0

    for (const [key, entry] of this.cursors) {
      if (Date.now() - entry.touched > 600000) this.cursors.delete(key)
    }

    if (input.execution?.cursor !== undefined) {
      const entry = this.cursors.get(input.execution.cursor)
      if (entry === undefined || entry.scope !== scopeKey)
        return Either.failure(
          AppError.ValidationError('ANALYTICS_CURSOR_INVALID_OR_EXPIRED'),
        )
      offset = entry.offset
    }

    const full = await this.fetchFixtureDataset(scope)
    if (full.isFailure()) return full.forwardFailure()
    const total = full.success.rows.length
    const rows = full.success.rows.slice(offset, offset + batchSize)
    const finished = offset + rows.length >= total
    let continuation: { cursor: string } | undefined

    if (!finished) {
      if (this.cursors.size >= 64)
        return Either.failure(
          AppError.Http(429, 'ANALYTICS_ACTIVE_SCANS_LIMIT'),
        )
      continuation = { cursor: crypto.randomUUID() }
      this.cursors.set(continuation.cursor, {
        scope: scopeKey,
        offset: offset + rows.length,
        touched: Date.now(),
      })
    }

    return Either.success({
      ...full.success,
      rows,
      execution: {
        kind: 'snapshot',
        scope,
        coverage: 'unverified',
        coverageReason: 'FIXTURE_PREVIEW',
        batch: {
          index: offset / batchSize,
          offset,
          finished,
          totalRows: total,
        },
        continuation,
      },
    })
  }

  /** Synthetic development data, not an example of remote extraction. */
  private async fetchFixtureDataset(
    input: AnalyticsDatasetQueryInput,
  ): Promise<Either<AppError, AnalyticsDatasetResult>> {
    const request = input.execution
    if (
      request !== undefined &&
      (request.kind !== 'snapshot' ||
        request.cursor !== undefined ||
        request.batchSize !== undefined)
    )
      return Either.failure(
        AppError.ValidationError('ANALYTICS_EXECUTION_NOT_SUPPORTED'),
      )

    const dataset = FAKE_ANALYTICS_DATASETS.find(
      (d) => d.id === input.datasetId,
    )

    if (!dataset) {
      return Either.failure(
        AppError.NotFound(
          `Dataset analítico simulado não encontrado: ${input.datasetId}`,
        ),
      )
    }

    if (input.datasetId === 'fake_time_entries') {
      const allEntries = this.store.getTimeEntries()
      const rows: AnalyticsDatasetRow[] = []

      for (const entry of allEntries) {
        let entryDate = ''
        if (entry.startDate) {
          const [isoPart] = entry.startDate.toISOString().split('T')
          if (isoPart) entryDate = isoPart
        }

        if (input.startDate && entryDate && entryDate < input.startDate) {
          continue
        }

        if (input.endDate && entryDate && entryDate > input.endDate) {
          continue
        }

        const projectVal = 'Projeto Alpha'
        if (
          input.projectId &&
          input.projectId !== 'all' &&
          projectVal !== input.projectId
        ) {
          continue
        }

        let entryId = ''
        if (entry.id) {
          entryId = entry.id
        }

        let userName = 'Usuário Simulado'
        if (entry.user.name) {
          userName = entry.user.name
        }

        let activityName = 'Desenvolvimento'
        if (entry.activity.name) {
          activityName = entry.activity.name
        }

        let commentText = ''
        if (entry.comments) {
          commentText = entry.comments
        }

        if (input.filters) {
          if (input.filters.project_id && input.filters.project_id !== 'all') {
            if (projectVal !== input.filters.project_id) {
              continue
            }
          }

          if (input.filters.user_id) {
            const userFilter = input.filters.user_id
            if (Array.isArray(userFilter) && userFilter.length > 0) {
              const matches = userFilter.some(
                (target) =>
                  target === entry.user.id ||
                  target === entry.user.name ||
                  target === userName,
              )
              if (!matches) {
                continue
              }
            }
            if (
              typeof userFilter === 'string' &&
              userFilter !== 'all' &&
              userFilter.trim().length > 0
            ) {
              if (
                userFilter !== entry.user.id &&
                userFilter !== entry.user.name &&
                userFilter !== userName
              ) {
                continue
              }
            }
          }

          if (input.filters.activity_id) {
            const actFilter = input.filters.activity_id
            if (Array.isArray(actFilter) && actFilter.length > 0) {
              const matches = actFilter.some(
                (target) =>
                  target === entry.activity.id ||
                  target === entry.activity.name ||
                  target === activityName,
              )
              if (!matches) {
                continue
              }
            }
            if (
              typeof actFilter === 'string' &&
              actFilter !== 'all' &&
              actFilter.trim().length > 0
            ) {
              if (
                actFilter !== entry.activity.id &&
                actFilter !== entry.activity.name &&
                actFilter !== activityName
              ) {
                continue
              }
            }
          }
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

      return Either.success({
        dataset,
        rows,
        fetchedAt: new Date().toISOString(),
        execution: {
          kind: 'snapshot',
          coverage: 'unverified',
          scope: createAnalyticsDatasetScope(input),
        },
      })
    }

    if (input.datasetId === 'fake_projects') {
      const rows: AnalyticsDatasetRow[] = [
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
      ]

      return Either.success({
        dataset,
        rows,
        fetchedAt: new Date().toISOString(),
        execution: {
          kind: 'snapshot',
          coverage: 'unverified',
          scope: createAnalyticsDatasetScope(input),
        },
      })
    }

    if (input.datasetId === 'fake_users') {
      const rows: AnalyticsDatasetRow[] = [
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
      ]

      return Either.success({
        dataset,
        rows,
        fetchedAt: new Date().toISOString(),
        execution: {
          kind: 'snapshot',
          coverage: 'unverified',
          scope: createAnalyticsDatasetScope(input),
        },
      })
    }

    if (input.datasetId === 'fake_versions') {
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

      return Either.success({
        dataset,
        rows: sprintRows,
        fetchedAt: new Date().toISOString(),
        execution: {
          kind: 'snapshot',
          coverage: 'unverified',
          scope: createAnalyticsDatasetScope(input),
        },
      })
    }

    if (input.datasetId === 'fake_issue_journals') {
      const journalRows: AnalyticsDatasetRow[] = [
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
      ]

      return Either.success({
        dataset,
        rows: journalRows,
        fetchedAt: new Date().toISOString(),
        execution: {
          kind: 'snapshot',
          coverage: 'unverified',
          scope: createAnalyticsDatasetScope(input),
        },
      })
    }

    const tasksPage = this.store.listTasks()
    const rows: AnalyticsDatasetRow[] = []

    for (const task of tasksPage.items) {
      let projectVal = 'Projeto Alpha'
      if (task.projectName) {
        projectVal = task.projectName
      }

      if (
        input.projectId &&
        input.projectId !== 'all' &&
        projectVal !== input.projectId
      ) {
        continue
      }

      let assigneeName = 'Não atribuído'
      if (task.assignedTo && task.assignedTo.name) {
        assigneeName = task.assignedTo.name
      }

      if (input.filters) {
        if (input.filters.project_id && input.filters.project_id !== 'all') {
          if (projectVal !== input.filters.project_id) {
            continue
          }
        }

        if (input.filters.assignee_id) {
          const assFilter = input.filters.assignee_id
          if (Array.isArray(assFilter) && assFilter.length > 0) {
            const matches = assFilter.some(
              (target) =>
                (task.assignedTo && target === task.assignedTo.id) ||
                (task.assignedTo && target === task.assignedTo.name) ||
                target === assigneeName,
            )
            if (!matches) {
              continue
            }
          }
          if (
            typeof assFilter === 'string' &&
            assFilter !== 'all' &&
            assFilter.trim().length > 0
          ) {
            const matches =
              (task.assignedTo && assFilter === task.assignedTo.id) ||
              (task.assignedTo && assFilter === task.assignedTo.name) ||
              assFilter === assigneeName
            if (!matches) {
              continue
            }
          }
        }

        if (input.filters.status_id) {
          const stFilter = input.filters.status_id
          if (Array.isArray(stFilter) && stFilter.length > 0) {
            const matches = stFilter.some(
              (target) =>
                target === task.status.id || target === task.status.name,
            )
            if (!matches) {
              continue
            }
          }
          if (
            typeof stFilter === 'string' &&
            stFilter !== 'all' &&
            stFilter.trim().length > 0
          ) {
            if (stFilter !== task.status.id && stFilter !== task.status.name) {
              continue
            }
          }
        }
      }

      let doneRatio = 50
      if (task.doneRatio !== undefined) {
        doneRatio = task.doneRatio
      }

      const isClosedVal = doneRatio >= 100
      let closedDate = ''
      if (isClosedVal) {
        closedDate = '2026-09-18'
      }

      rows.push({
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
        created_date: '2026-09-05',
        closed_date: closedDate,
        custom_pontos: 5,
        custom_revisor: 'Carlos Silva',
        custom_qa: 'Beatriz Ramos',
      })
    }

    return Either.success({
      dataset,
      rows,
      fetchedAt: new Date().toISOString(),
      execution: {
        kind: 'snapshot',
        coverage: 'unverified',
        scope: createAnalyticsDatasetScope(input),
      },
    })
  }
}
