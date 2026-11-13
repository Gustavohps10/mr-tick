import { createHash } from 'node:crypto'

import { DuckDBConnection, DuckDBTypeId } from '@duckdb/node-api'
import type {
  AnalyticsAggregationOperator,
  AnalyticsColumnSchema,
  AnalyticsDatasetCellValue,
  AnalyticsFilterOperator,
  AnalyticsLocalFilter,
  AnalyticsLocalMeasure,
  AnalyticsNodeJoinConfig,
  AnalyticsNodeTransformConfig,
  AnalyticsPlanNode,
  AnalyticsQueryInput,
  JsonValue,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

import { jsonValueSchema } from '../../validation/analyticsWarehouse'

export type SqlScalar = AnalyticsDatasetCellValue
export interface SqlRelation {
  sql: string
  values: SqlScalar[]
  columns: AnalyticsColumnSchema[]
  remoteAggregate: boolean
  ordered?: boolean
  groupingColumn?: string
}
export interface StoredAnalyticsSource {
  tableName: string
  columns: AnalyticsColumnSchema[]
  remoteAggregate: boolean
  generationId: string
  coverage: 'complete' | 'unverified'
  loadedAt: string
}

export function identifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function storageType(type: AnalyticsColumnSchema['type']): string {
  if (type === 'number') return 'DOUBLE'
  if (type === 'boolean') return 'BOOLEAN'
  return 'VARCHAR'
}

function invalid(message: string) {
  return Either.failure(AppError.ValidationError(message))
}

function computed(
  name: string,
  type: AnalyticsColumnSchema['type'],
): AnalyticsColumnSchema {
  return { name, label: name, type, origin: 'computed' }
}

function selectColumns(
  columns: AnalyticsColumnSchema[],
  alias?: string,
): string {
  return columns
    .map((column) => {
      if (alias !== undefined)
        return `${identifier(alias)}.${identifier(column.name)}`
      return identifier(column.name)
    })
    .join(', ')
}

function literal(
  column: AnalyticsColumnSchema,
  value: string,
): Either<AppError, SqlScalar> {
  if (column.type === 'string') return Either.success(value)

  if (column.type === 'date') {
    if (!Number.isFinite(Date.parse(value)))
      return invalid('ANALYTICS_DATE_VALUE_INVALID')
    return Either.success(value)
  }

  if (column.type === 'boolean') {
    if (value === 'true') return Either.success(true)
    if (value === 'false') return Either.success(false)
    return invalid('ANALYTICS_BOOLEAN_VALUE_INVALID')
  }

  if (value.trim() === '' || !Number.isFinite(Number(value)))
    return invalid('ANALYTICS_NUMBER_VALUE_INVALID')
  return Either.success(Number(value))
}

function predicate(
  columns: AnalyticsColumnSchema[],
  filter: AnalyticsLocalFilter,
): Either<AppError, { sql: string; values: SqlScalar[] }> {
  const column = columns.find((item) => item.name === filter.column)
  if (column === undefined) return invalid('ANALYTICS_COLUMN_NOT_FOUND')
  let left = identifier(column.name)
  if (filter.operator === 'not_empty')
    return Either.success({
      sql: `${left} IS NOT NULL AND CAST(${left} AS VARCHAR) <> ''`,
      values: [],
    })
  if (filter.operator === 'contains')
    return Either.success({
      sql: `contains(lower(CAST(${left} AS VARCHAR)), lower(?))`,
      values: [filter.value],
    })
  const value = literal(column, filter.value)
  if (value.isFailure()) return value.forwardFailure()
  let right = '?'

  if (column.type === 'date') {
    left = `CAST(${left} AS TIMESTAMPTZ)`
    right = 'CAST(? AS TIMESTAMPTZ)'
  }

  const operators: Record<
    Exclude<AnalyticsFilterOperator, 'contains' | 'not_empty'>,
    string
  > = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }
  return Either.success({
    sql: `${left} ${operators[filter.operator]} ${right}`,
    values: [value.success],
  })
}

function operand(
  columns: AnalyticsColumnSchema[],
  name: string,
): Either<AppError, { sql: string; values: SqlScalar[] }> {
  const column = columns.find((item) => item.name === name)

  if (column !== undefined) {
    if (column.type !== 'number')
      return invalid('ANALYTICS_FORMULA_REQUIRES_NUMBER')
    return Either.success({ sql: identifier(name), values: [] })
  }

  if (name.trim() === '' || !Number.isFinite(Number(name)))
    return invalid('ANALYTICS_FORMULA_OPERAND_INVALID')
  return Either.success({ sql: '?', values: [Number(name)] })
}

function aggregateExpression(
  columns: AnalyticsColumnSchema[],
  measure: AnalyticsLocalMeasure,
): Either<AppError, string> {
  if (measure.operator === 'count' && measure.column === undefined)
    return Either.success('CAST(count(1) AS DOUBLE)')
  const column = columns.find((item) => item.name === measure.column)
  if (column === undefined) return invalid('ANALYTICS_MEASURE_COLUMN_REQUIRED')
  if (measure.operator === 'count_distinct')
    return Either.success(
      `CAST(count(DISTINCT ${identifier(column.name)}) AS DOUBLE)`,
    )
  if (measure.operator === 'count')
    return Either.success(`CAST(count(${identifier(column.name)}) AS DOUBLE)`)
  if (column.type !== 'number')
    return invalid('ANALYTICS_MEASURE_REQUIRES_NUMBER')
  return Either.success(`${measure.operator}(${identifier(column.name)})`)
}

export class AnalyticsSqlCompiler {
  private readonly compiled = new Map<string, SqlRelation>()
  private readonly visiting = new Set<string>()

  constructor(
    private readonly connection: DuckDBConnection,
    private readonly sources: Map<string, StoredAnalyticsSource>,
  ) {}

  public async compile(
    input: AnalyticsQueryInput,
  ): Promise<Either<AppError, SqlRelation>> {
    if (
      input.nodes.length > 64 ||
      new Set(input.nodes.map((node) => node.id)).size !== input.nodes.length
    )
      return invalid('ANALYTICS_PLAN_INVALID')
    const base = await this.node(input.nodes, input.targetNodeId)
    if (base.isFailure()) return base.forwardFailure()
    let relation = base.success

    if (input.filters !== undefined) {
      const filtered = this.filter(relation, input.filters)
      if (filtered.isFailure()) return filtered.forwardFailure()
      relation = filtered.success
    }

    if (input.search !== undefined && input.search !== '') {
      const search = input.search
      const clauses = relation.columns.map(
        (column) =>
          `contains(lower(CAST(${identifier(column.name)} AS VARCHAR)), lower(?))`,
      )
      relation = {
        ...relation,
        sql: `WITH input AS (${relation.sql}) SELECT ${selectColumns(relation.columns)} FROM input WHERE ${clauses.map((clause) => `(${clause})`).join(' OR ')}`,
        values: [...relation.values, ...relation.columns.map(() => search)],
      }
    }

    if (input.pivot !== undefined) {
      const pivoted = await this.pivot(
        relation,
        input.pivot.rowColumn,
        input.pivot.pivotColumn,
        input.pivot.valueColumn,
        input.pivot.operator,
      )
      if (pivoted.isFailure()) return pivoted.forwardFailure()
      relation = pivoted.success
    }

    if (input.measures !== undefined) {
      let groups: string[] = []
      if (input.groupBy !== undefined) groups = input.groupBy
      const grouped = this.group(relation, groups, input.measures, input.rollup)
      if (grouped.isFailure()) return grouped.forwardFailure()
      relation = grouped.success
    }

    if (input.calculation !== undefined) {
      const calculated = await this.transform(relation, input.calculation)
      if (calculated.isFailure()) return calculated.forwardFailure()
      relation = calculated.success
    }

    if (input.projection !== undefined)
      return this.project(relation, input.projection, {})
    return Either.success(relation)
  }

  private async node(
    nodes: AnalyticsPlanNode[],
    id: string,
  ): Promise<Either<AppError, SqlRelation>> {
    const cached = this.compiled.get(id)
    if (cached !== undefined) return Either.success(cached)
    if (this.visiting.has(id)) return invalid('ANALYTICS_PLAN_CYCLE')
    const node = nodes.find((item) => item.id === id)
    if (node === undefined) return invalid('ANALYTICS_PLAN_INPUT_MISSING')
    this.visiting.add(id)
    const result = await this.compileNode(nodes, node)
    this.visiting.delete(id)
    if (result.isSuccess()) this.compiled.set(id, result.success)
    return result
  }

  private async compileNode(
    nodes: AnalyticsPlanNode[],
    node: AnalyticsPlanNode,
  ): Promise<Either<AppError, SqlRelation>> {
    if (node.kind === 'source') {
      const source = this.sources.get(node.id)
      if (source === undefined)
        return invalid('ANALYTICS_PUBLICATION_NOT_AVAILABLE')
      const base: SqlRelation = {
        sql: `SELECT ${selectColumns(source.columns)} FROM ${identifier(source.tableName)}`,
        values: [],
        columns: source.columns,
        remoteAggregate: source.remoteAggregate,
      }
      let columns = source.columns.map((column) => column.name)
      let casts: Record<string, 'string' | 'number' | 'date'> = {}
      if (node.columns !== undefined) columns = node.columns
      if (node.casts !== undefined) casts = node.casts
      return this.project(base, columns, casts)
    }

    const inputs: SqlRelation[] = []

    for (const upstream of node.upstreamNodeIds) {
      const compiled = await this.node(nodes, upstream)
      if (compiled.isFailure()) return compiled.forwardFailure()
      inputs.push(compiled.success)
    }

    if (node.kind === 'join') {
      const leftId = node.joinConfig.leftNodeId,
        rightId = node.joinConfig.rightNodeId
      if (leftId === undefined || rightId === undefined || leftId === rightId)
        return invalid('ANALYTICS_JOIN_INPUT_SELECTION_REQUIRED')
      const left = inputs.find(
        (input, index) => node.upstreamNodeIds[index] === leftId,
      )
      const right = inputs.find(
        (input, index) => node.upstreamNodeIds[index] === rightId,
      )
      if (left === undefined || right === undefined || inputs.length !== 2)
        return invalid('ANALYTICS_JOIN_INPUT_SELECTION_REQUIRED')
      return this.join([left, right], node.joinConfig)
    }

    if (node.kind === 'sql') return this.sql(inputs, node.sqlConfig.sqlQuery)
    if (inputs.length !== 1) return invalid('ANALYTICS_SINGLE_INPUT_REQUIRED')
    const sole = inputs.find(() => true)
    if (sole === undefined) return invalid('ANALYTICS_PLAN_INPUT_MISSING')
    if (node.kind === 'output') return Either.success(sole)
    return this.transform(sole, node.transformConfig)
  }

  private project(
    base: SqlRelation,
    names: string[],
    casts: Record<string, 'string' | 'number' | 'date'>,
  ): Either<AppError, SqlRelation> {
    if (names.length === 0 || new Set(names).size !== names.length)
      return invalid('ANALYTICS_PROJECTION_REQUIRED')
    const columns: AnalyticsColumnSchema[] = []
    const expressions: string[] = []

    for (const name of names) {
      const column = base.columns.find((item) => item.name === name)
      if (column === undefined) return invalid('ANALYTICS_COLUMN_NOT_FOUND')
      const cast = casts[name]

      if (cast !== undefined) {
        if (base.remoteAggregate)
          return invalid('ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY')
        let expression = `CAST(${identifier(name)} AS ${storageType(cast)})`
        if (cast === 'date')
          expression = `CAST(CAST(${identifier(name)} AS TIMESTAMPTZ) AS VARCHAR)`
        expressions.push(`${expression} AS ${identifier(name)}`)
        columns.push({ ...column, type: cast, origin: 'computed' })
        continue
      }

      expressions.push(identifier(name))
      columns.push(column)
    }

    return Either.success({
      ...base,
      sql: `WITH input AS (${base.sql}) SELECT ${expressions.join(', ')} FROM input`,
      columns,
    })
  }

  public filter(
    base: SqlRelation,
    filters: AnalyticsLocalFilter[],
  ): Either<AppError, SqlRelation> {
    const clauses: string[] = []
    const values: SqlScalar[] = [...base.values]

    for (const filter of filters) {
      const expression = predicate(base.columns, filter)
      if (expression.isFailure()) return expression.forwardFailure()
      clauses.push(`(${expression.success.sql})`)
      values.push(...expression.success.values)
    }

    if (clauses.length === 0) return Either.success(base)
    return Either.success({
      ...base,
      sql: `WITH input AS (${base.sql}) SELECT ${selectColumns(base.columns)} FROM input WHERE ${clauses.join(' AND ')}`,
      values,
    })
  }

  private formula(
    base: SqlRelation,
    config: AnalyticsNodeTransformConfig,
  ): Either<AppError, SqlRelation> {
    if (
      config.formulaColumnName === undefined ||
      config.formulaColumnName === ''
    )
      return Either.success(base)
    if (base.remoteAggregate)
      return invalid('ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY')
    if (
      config.formulaLeftColumn === undefined ||
      config.formulaRightColumn === undefined ||
      config.formulaOperator === undefined
    )
      return invalid('ANALYTICS_FORMULA_INCOMPLETE')
    const left = operand(base.columns, config.formulaLeftColumn),
      right = operand(base.columns, config.formulaRightColumn)
    if (left.isFailure()) return left.forwardFailure()
    if (right.isFailure()) return right.forwardFailure()
    let expression = ''

    switch (config.formulaOperator) {
      case 'add':
        expression = `${left.success.sql} + ${right.success.sql}`
        break
      case 'subtract':
        expression = `${left.success.sql} - ${right.success.sql}`
        break
      case 'multiply':
        expression = `${left.success.sql} * ${right.success.sql}`
        break
      case 'divide':
        expression = `${left.success.sql} / NULLIF(${right.success.sql},0)`
        break
      case 'percent_of':
        expression = `100.0 * ${left.success.sql} / NULLIF(${right.success.sql},0)`
        break
    }

    const columns = base.columns.filter(
      (column) => column.name !== config.formulaColumnName,
    )
    const expressions = columns.map((column) => identifier(column.name))
    columns.push(computed(config.formulaColumnName, 'number'))
    expressions.push(
      `(${expression}) AS ${identifier(config.formulaColumnName)}`,
    )
    return Either.success({
      ...base,
      sql: `WITH input AS (${base.sql}) SELECT ${expressions.join(', ')} FROM input`,
      values: [...base.values, ...left.success.values, ...right.success.values],
      columns,
    })
  }

  private async transform(
    base: SqlRelation,
    config: AnalyticsNodeTransformConfig,
  ): Promise<Either<AppError, SqlRelation>> {
    const filters: AnalyticsLocalFilter[] = []

    if (config.filterColumn !== undefined && config.filterColumn !== '') {
      if (
        config.filterOperator === undefined ||
        config.filterValue === undefined
      )
        return invalid('ANALYTICS_FILTER_INCOMPLETE')
      filters.push({
        column: config.filterColumn,
        operator: config.filterOperator,
        value: config.filterValue,
      })
    }

    if (config.additionalFilters !== undefined)
      for (const filter of config.additionalFilters)
        filters.push({
          column: filter.filterColumn,
          operator: filter.filterOperator,
          value: filter.filterValue,
        })

    const filtered = this.filter(base, filters)
    if (filtered.isFailure()) return filtered.forwardFailure()
    let relation = filtered.success

    if (config.caseColumnName !== undefined && config.caseColumnName !== '') {
      const cases = this.caseExpression(relation, config)
      if (cases.isFailure()) return cases.forwardFailure()
      relation = cases.success
    }

    if (config.groupByColumn !== undefined && config.groupByColumn !== '') {
      if (config.aggregation === undefined)
        return invalid('ANALYTICS_AGGREGATION_REQUIRED')

      if (config.pivotColumn !== undefined && config.pivotColumn !== '') {
        const pivoted = await this.pivot(
          relation,
          config.groupByColumn,
          config.pivotColumn,
          config.valueColumn,
          config.aggregation,
        )
        if (pivoted.isFailure()) return pivoted.forwardFailure()
        relation = pivoted.success
      }

      if (config.pivotColumn === undefined || config.pivotColumn === '') {
        const name = config.valueColumn
        const measures: AnalyticsLocalMeasure[] = [
          { name: 'records_count', operator: 'count' },
        ]
        if (name !== undefined && name !== '')
          measures.push({ name, column: name, operator: config.aggregation })
        if (
          (name === undefined || name === '') &&
          config.aggregation !== 'count'
        )
          return invalid('ANALYTICS_MEASURE_COLUMN_REQUIRED')
        const grouped = this.group(relation, [config.groupByColumn], measures)
        if (grouped.isFailure()) return grouped.forwardFailure()
        relation = grouped.success
      }
    }

    return this.formula(relation, config)
  }

  private caseExpression(
    base: SqlRelation,
    config: AnalyticsNodeTransformConfig,
  ): Either<AppError, SqlRelation> {
    if (base.remoteAggregate)
      return invalid('ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY')
    if (config.caseColumnName === undefined)
      return invalid('ANALYTICS_CASE_NAME_REQUIRED')
    let rules = config.caseRules

    if (rules === undefined || rules.length === 0) {
      if (
        config.caseWhenColumn === undefined ||
        config.caseWhenValue === undefined ||
        config.caseThenValue === undefined
      )
        return invalid('ANALYTICS_CASE_INCOMPLETE')
      rules = [
        {
          whenColumn: config.caseWhenColumn,
          operator: 'eq',
          whenValue: config.caseWhenValue,
          thenMode: 'literal',
          thenValue: config.caseThenValue,
        },
      ]
    }

    const references = rules
      .filter((rule) => rule.thenMode === 'column')
      .map((rule) => rule.thenValue)

    if (config.caseElseMode === 'column') {
      if (config.caseElseValue === undefined)
        return invalid('ANALYTICS_CASE_INCOMPLETE')
      references.push(config.caseElseValue)
    }

    let referencedType: AnalyticsColumnSchema['type'] | undefined

    for (const name of references) {
      const column = base.columns.find((item) => item.name === name)
      if (column === undefined)
        return invalid('ANALYTICS_CASE_COLUMN_NOT_FOUND')
      if (referencedType !== undefined && referencedType !== column.type)
        return invalid('ANALYTICS_CASE_TYPE_MISMATCH')
      referencedType = column.type
    }

    // Without a column reference, literal values have the string type declared by the API.
    let resultType: AnalyticsColumnSchema['type'] = 'string'
    if (referencedType !== undefined) resultType = referencedType

    const values: SqlScalar[] = [...base.values]
    const clauses: string[] = []
    const resultColumn = computed(config.caseColumnName, resultType)

    for (const rule of rules) {
      const condition = predicate(base.columns, {
        column: rule.whenColumn,
        operator: rule.operator,
        value: rule.whenValue,
      })
      if (condition.isFailure()) return condition.forwardFailure()
      values.push(...condition.success.values)

      if (rule.thenMode === 'column') {
        const target = base.columns.find(
          (column) => column.name === rule.thenValue,
        )
        if (target === undefined || target.type !== resultType)
          return invalid('ANALYTICS_CASE_TYPE_MISMATCH')
        clauses.push(
          `WHEN ${condition.success.sql} THEN ${identifier(rule.thenValue)}`,
        )
        continue
      }

      const value = literal(resultColumn, rule.thenValue)
      if (value.isFailure()) return value.forwardFailure()
      values.push(value.success)
      clauses.push(`WHEN ${condition.success.sql} THEN ?`)
    }

    let otherwise = 'NULL'

    if (
      config.caseElseMode === 'column' &&
      config.caseElseValue !== undefined
    ) {
      const column = base.columns.find(
        (item) => item.name === config.caseElseValue,
      )
      if (column === undefined || column.type !== resultType)
        return invalid('ANALYTICS_CASE_TYPE_MISMATCH')
      otherwise = identifier(column.name)
    }

    if (
      config.caseElseMode === 'literal' &&
      config.caseElseValue !== undefined
    ) {
      const value = literal(resultColumn, config.caseElseValue)
      if (value.isFailure()) return value.forwardFailure()
      values.push(value.success)
      otherwise = '?'
    }

    const columns = base.columns.filter(
      (column) => column.name !== config.caseColumnName,
    )
    const expressions = columns.map((column) => identifier(column.name))
    expressions.push(
      `CASE ${clauses.join(' ')} ELSE ${otherwise} END AS ${identifier(config.caseColumnName)}`,
    )
    columns.push(resultColumn)
    return Either.success({
      ...base,
      sql: `WITH input AS (${base.sql}) SELECT ${expressions.join(', ')} FROM input`,
      values,
      columns,
    })
  }

  public group(
    base: SqlRelation,
    groups: string[],
    measures: AnalyticsLocalMeasure[],
    rollup = false,
  ): Either<AppError, SqlRelation> {
    if (base.remoteAggregate)
      return invalid('ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY')
    if (measures.length === 0) return invalid('ANALYTICS_MEASURES_REQUIRED')
    const columns: AnalyticsColumnSchema[] = []
    const expressions: string[] = []

    for (const name of groups) {
      const column = base.columns.find((item) => item.name === name)
      if (column === undefined) return invalid('ANALYTICS_COLUMN_NOT_FOUND')
      columns.push(column)
      expressions.push(identifier(name))
    }

    for (const measure of measures) {
      const expression = aggregateExpression(base.columns, measure)
      if (expression.isFailure()) return expression.forwardFailure()
      columns.push(computed(measure.name, 'number'))
      expressions.push(`${expression.success} AS ${identifier(measure.name)}`)
    }

    if (new Set(columns.map((column) => column.name)).size !== columns.length)
      return invalid('ANALYTICS_DUPLICATE_OUTPUT_COLUMN')
    let groupSql = ''
    let groupingColumn: string | undefined

    if (rollup) {
      if (groups.length === 0)
        return invalid('ANALYTICS_ROLLUP_GROUPS_REQUIRED')
      groupingColumn = 'analytics_grouping_level'
      if (columns.some((column) => column.name === groupingColumn))
        return invalid('ANALYTICS_DUPLICATE_OUTPUT_COLUMN')
      columns.push(computed(groupingColumn, 'number'))
      expressions.push(
        `GROUPING_ID(${groups.map(identifier).join(', ')}) AS ${identifier(groupingColumn)}`,
      )
      groupSql = ` GROUP BY ROLLUP (${groups.map(identifier).join(', ')})`
    }

    if (groups.length > 0 && !rollup)
      groupSql = ` GROUP BY ${groups.map(identifier).join(', ')}`
    return Either.success({
      ...base,
      sql: `WITH input AS (${base.sql}) SELECT ${expressions.join(', ')} FROM input${groupSql}`,
      columns,
      groupingColumn,
      ordered: false,
    })
  }

  private async pivot(
    base: SqlRelation,
    rowName: string,
    pivotName: string,
    valueName: string | undefined,
    operator: AnalyticsAggregationOperator,
  ): Promise<Either<AppError, SqlRelation>> {
    if (base.remoteAggregate)
      return invalid('ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY')
    const rowColumn = base.columns.find((column) => column.name === rowName),
      pivotColumn = base.columns.find((column) => column.name === pivotName)
    if (rowColumn === undefined || pivotColumn === undefined)
      return invalid('ANALYTICS_PIVOT_COLUMNS_REQUIRED')
    const total = aggregateExpression(base.columns, {
      name: 'total',
      column: valueName,
      operator,
    })
    if (total.isFailure()) return total.forwardFailure()
    const reader = await this.connection.runAndReadAll(
      `WITH input AS (${base.sql}) SELECT DISTINCT ${identifier(pivotName)} AS pivot_value FROM input ORDER BY pivot_value LIMIT 65`,
      base.values,
    )
    const distinct = reader.getRowObjects()
    reader.closeSync()
    if (distinct.length > 64) return invalid('ANALYTICS_PIVOT_COLUMNS_LIMIT')
    const columns: AnalyticsColumnSchema[] = [rowColumn]
    const expressions: string[] = [identifier(rowName)]
    const values: SqlScalar[] = [...base.values]

    for (const item of distinct) {
      const value = item.pivot_value
      if (
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      )
        return invalid('ANALYTICS_PIVOT_VALUE_INVALID')
      const name = `pivot_${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}`
      let body = '1'
      if (valueName !== undefined) body = identifier(valueName)
      let expression = ''
      if (operator === 'count')
        expression = `CAST(count(CASE WHEN ${identifier(pivotName)} IS NOT DISTINCT FROM ? THEN ${body} END) AS DOUBLE)`
      if (operator === 'count_distinct')
        expression = `CAST(count(DISTINCT CASE WHEN ${identifier(pivotName)} IS NOT DISTINCT FROM ? THEN ${body} END) AS DOUBLE)`
      if (operator === 'sum' || operator === 'avg')
        expression = `${operator}(CASE WHEN ${identifier(pivotName)} IS NOT DISTINCT FROM ? THEN ${body} END)`
      expressions.push(`${expression} AS ${identifier(name)}`)
      values.push(value)
      columns.push({ ...computed(name, 'number'), label: String(value) })
    }

    expressions.push(`${total.success} AS total`)
    columns.push(computed('total', 'number'))
    if (new Set(columns.map((column) => column.name)).size !== columns.length)
      return invalid('ANALYTICS_DUPLICATE_OUTPUT_COLUMN')
    return Either.success({
      ...base,
      sql: `WITH input AS (${base.sql}) SELECT ${expressions.join(', ')} FROM input GROUP BY ${identifier(rowName)}`,
      ordered: false,
      values,
      columns,
    })
  }

  private async join(
    inputs: SqlRelation[],
    config: AnalyticsNodeJoinConfig,
  ): Promise<Either<AppError, SqlRelation>> {
    if (inputs.length !== 2)
      return invalid('ANALYTICS_JOIN_REQUIRES_TWO_INPUTS')
    const [left, right] = inputs
    if (left === undefined || right === undefined)
      return invalid('ANALYTICS_JOIN_REQUIRES_TWO_INPUTS')
    if (left.remoteAggregate || right.remoteAggregate)
      return invalid('ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY')
    let relation: SqlRelation | undefined

    if (config.joinType === 'union') {
      const columns = [...left.columns]

      for (const column of right.columns) {
        const existing = columns.find((item) => item.name === column.name)
        if (existing !== undefined && existing.type !== column.type)
          return invalid('ANALYTICS_UNION_TYPE_MISMATCH')
        if (existing === undefined) columns.push(column)
      }

      const projection = (input: SqlRelation) =>
        columns
          .map((column) => {
            if (input.columns.some((item) => item.name === column.name))
              return identifier(column.name)
            return `CAST(NULL AS ${storageType(column.type)}) AS ${identifier(column.name)}`
          })
          .join(', ')
      relation = {
        sql: `WITH lhs AS (${left.sql}), rhs AS (${right.sql}) SELECT ${projection(left)} FROM lhs UNION ALL SELECT ${projection(right)} FROM rhs`,
        values: [...left.values, ...right.values],
        columns,
        remoteAggregate: false,
      }
    }

    if (config.joinType !== 'union') {
      const leftKey = left.columns.find(
          (column) => column.name === config.leftKey,
        ),
        rightKey = right.columns.find(
          (column) => column.name === config.rightKey,
        )
      if (
        leftKey === undefined ||
        rightKey === undefined ||
        leftKey.type !== rightKey.type
      )
        return invalid('ANALYTICS_JOIN_KEYS_INVALID')
      const columns = [...left.columns]
      const expressions = left.columns.map(
        (column) => `lhs.${identifier(column.name)}`,
      )

      for (const column of right.columns) {
        let name = column.name

        while (columns.some((item) => item.name === name))
          name = `right_${name}`

        columns.push({ ...column, name })
        expressions.push(
          `rhs.${identifier(column.name)} AS ${identifier(name)}`,
        )
      }

      const joins: Record<'inner' | 'left' | 'full', string> = {
        inner: 'INNER',
        left: 'LEFT',
        full: 'FULL OUTER',
      }
      relation = {
        sql: `WITH lhs AS (${left.sql}), rhs AS (${right.sql}) SELECT ${expressions.join(', ')} FROM lhs ${joins[config.joinType]} JOIN rhs ON lhs.${identifier(config.leftKey)} = rhs.${identifier(config.rightKey)}`,
        values: [...left.values, ...right.values],
        columns,
        remoteAggregate: false,
      }
    }

    if (relation === undefined) return invalid('ANALYTICS_JOIN_INVALID')
    const first = this.formula(relation, config)
    if (first.isFailure()) return first.forwardFailure()
    return this.formula(first.success, {
      formulaColumnName: config.postFormulaColumnName,
      formulaLeftColumn: config.postFormulaLeftColumn,
      formulaOperator: config.postFormulaOperator,
      formulaRightColumn: config.postFormulaRightColumn,
    })
  }

  private async sql(
    inputs: SqlRelation[],
    text: string,
  ): Promise<Either<AppError, SqlRelation>> {
    if (inputs.length === 0 || text.trim() === '')
      return invalid('ANALYTICS_SQL_REQUIRED')
    if (inputs.some((input) => input.remoteAggregate))
      return invalid('ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY')
    const aliases = inputs.map((input, index) => {
      if (inputs.length === 1) return { alias: 'input', input }
      return { alias: `input_${index + 1}`, input }
    })
    const parser = await this.connection.runAndReadAll(
      'SELECT json_serialize_sql(?) AS ast',
      [text],
    )
    const raw = parser.getRowObjects().find(() => true)?.ast
    parser.closeSync()
    if (typeof raw !== 'string') return invalid('ANALYTICS_SQL_PARSE_FAILED')
    const parsed = jsonValueSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return invalid('ANALYTICS_SQL_PARSE_FAILED')
    const approved = validateSelectAst(
      parsed.data,
      new Set(aliases.map((item) => item.alias)),
    )
    if (approved.isFailure()) return approved.forwardFailure()
    const definitions = aliases
      .map((item) => `${identifier(item.alias)} AS (${item.input.sql})`)
      .join(', ')
    const values = inputs.flatMap((input) => input.values)
    const initialSql = `WITH ${definitions} ${text.trim().replace(/;\s*$/u, '')}\n`
    const projection = await projectionForSql(
      this.connection,
      initialSql,
      values,
    )
    const described = await this.connection.runAndReadAll(
      `SELECT ${projection} FROM (${initialSql}) AS result LIMIT 0`,
      values,
    )
    const ordered = appendSqlOrdering(parsed.data, described.columnCount)
    described.closeSync()
    if (ordered.isFailure()) return ordered.forwardFailure()
    const serialized = await this.connection.runAndReadAll(
      'SELECT json_deserialize_sql(?) AS sql',
      [JSON.stringify(parsed.data)],
    )
    const nativeSql = serialized
      .getRowObjects()
      .find((row) => typeof row.sql === 'string')?.sql
    serialized.closeSync()
    if (typeof nativeSql !== 'string')
      return invalid('ANALYTICS_SQL_PARSE_FAILED')
    const sql = `WITH ${definitions} ${nativeSql}`
    const reader = await this.connection.runAndReadAll(
      `SELECT ${projection} FROM (${sql}) AS result LIMIT 0`,
      values,
    )
    const columns: AnalyticsColumnSchema[] = []

    for (let index = 0; index < reader.columnCount; index += 1) {
      const name = reader.columnName(index),
        type = reader.columnTypeId(index)
      const supported = [
        DuckDBTypeId.TINYINT,
        DuckDBTypeId.SMALLINT,
        DuckDBTypeId.INTEGER,
        DuckDBTypeId.BIGINT,
        DuckDBTypeId.UTINYINT,
        DuckDBTypeId.USMALLINT,
        DuckDBTypeId.UINTEGER,
        DuckDBTypeId.UBIGINT,
        DuckDBTypeId.HUGEINT,
        DuckDBTypeId.FLOAT,
        DuckDBTypeId.DOUBLE,
        DuckDBTypeId.DECIMAL,
        DuckDBTypeId.VARCHAR,
        DuckDBTypeId.ENUM,
        DuckDBTypeId.BOOLEAN,
        DuckDBTypeId.DATE,
        DuckDBTypeId.TIMESTAMP,
        DuckDBTypeId.TIMESTAMP_TZ,
        DuckDBTypeId.TIMESTAMP_MS,
        DuckDBTypeId.TIMESTAMP_NS,
        DuckDBTypeId.TIMESTAMP_S,
      ]

      if (!supported.includes(type)) {
        reader.closeSync()
        return invalid('ANALYTICS_SQL_OUTPUT_TYPE_NOT_SUPPORTED')
      }

      let logical: AnalyticsColumnSchema['type'] = 'number'
      if (type === DuckDBTypeId.VARCHAR || type === DuckDBTypeId.ENUM)
        logical = 'string'
      if (type === DuckDBTypeId.BOOLEAN) logical = 'boolean'
      if (
        [
          DuckDBTypeId.DATE,
          DuckDBTypeId.TIMESTAMP,
          DuckDBTypeId.TIMESTAMP_TZ,
          DuckDBTypeId.TIMESTAMP_MS,
          DuckDBTypeId.TIMESTAMP_NS,
          DuckDBTypeId.TIMESTAMP_S,
        ].includes(type)
      )
        logical = 'date'
      columns.push(computed(name, logical))
    }

    reader.closeSync()
    if (new Set(columns.map((column) => column.name)).size !== columns.length)
      return invalid('ANALYTICS_DUPLICATE_OUTPUT_COLUMN')
    return Either.success({
      sql,
      values,
      columns,
      remoteAggregate: false,
      ordered: true,
    })
  }
}

async function projectionForSql(
  connection: DuckDBConnection,
  sql: string,
  values: SqlScalar[],
): Promise<string> {
  const reader = await connection.runAndReadAll(`DESCRIBE (${sql})`, values)
  const columns = reader
    .getRowObjects()
    .map((row) => row.column_name)
    .filter((value) => typeof value === 'string')
  reader.closeSync()
  return columns.map(identifier).join(', ')
}

function validateSelectAst(
  value: JsonValue,
  tables: Set<string>,
  depth = 0,
): Either<AppError, void> {
  if (depth > 128) return invalid('ANALYTICS_SQL_COMPLEXITY_LIMIT')
  if (value === null || typeof value !== 'object')
    return Either.success(undefined)

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = validateSelectAst(item, tables, depth + 1)
      if (result.isFailure()) return result.forwardFailure()
    }

    return Either.success(undefined)
  }

  if (value.error === true) {
    if (typeof value.error_message === 'string')
      return Either.failure(
        AppError.ValidationError('ANALYTICS_SQL_PARSE_FAILED', {
          sql: [value.error_message],
        }),
      )
    return invalid('ANALYTICS_SQL_PARSE_FAILED')
  }

  if (
    value.statements !== undefined &&
    (!Array.isArray(value.statements) || value.statements.length !== 1)
  )
    return invalid('ANALYTICS_SQL_SINGLE_SELECT_REQUIRED')
  if (
    value.type === 'BASE_TABLE' &&
    (typeof value.table_name !== 'string' ||
      !tables.has(value.table_name) ||
      value.schema_name !== '' ||
      value.catalog_name !== '')
  )
    return invalid('ANALYTICS_SQL_INPUT_NOT_AUTHORIZED')
  if (value.type === 'STAR' || value.class === 'STAR')
    return invalid('ANALYTICS_SQL_EXPLICIT_PROJECTION_REQUIRED')

  if (value.class === 'FUNCTION') {
    const functions = new Set([
      'sum',
      'avg',
      'count',
      'count_star',
      'min',
      'max',
      'lower',
      'upper',
      'length',
      'abs',
      'round',
      'coalesce',
      'nullif',
      'concat',
      'trim',
      'date_trunc',
      'date_part',
      '+',
      '-',
      '*',
      '/',
      '%',
      '~~',
      '!~~',
    ])
    if (
      typeof value.function_name !== 'string' ||
      !functions.has(value.function_name.toLowerCase()) ||
      value.schema !== '' ||
      value.catalog !== ''
    )
      return invalid('ANALYTICS_SQL_FUNCTION_NOT_SUPPORTED')
  }

  if (
    value.class !== undefined &&
    (typeof value.class !== 'string' ||
      ![
        'COLUMN_REF',
        'CONSTANT',
        'FUNCTION',
        'COMPARISON',
        'CONJUNCTION',
        'CASE',
        'CAST',
        'OPERATOR',
        'SUBQUERY',
      ].includes(value.class))
  )
    return invalid('ANALYTICS_SQL_EXPRESSION_NOT_SUPPORTED')
  if (
    value.class === undefined &&
    value.type !== undefined &&
    (typeof value.type !== 'string' ||
      ![
        'SELECT_NODE',
        'SET_OPERATION_NODE',
        'BASE_TABLE',
        'JOIN',
        'SUBQUERY',
        'EMPTY_FROM',
        'ORDER_MODIFIER',
        'LIMIT_MODIFIER',
        'DISTINCT_MODIFIER',
        'ASCENDING',
        'DESCENDING',
        'ORDER_DEFAULT',
      ].includes(value.type))
  )
    return invalid('ANALYTICS_SQL_STATEMENT_NOT_SUPPORTED')
  if (
    value.cte_map !== undefined &&
    typeof value.cte_map === 'object' &&
    value.cte_map !== null &&
    !Array.isArray(value.cte_map) &&
    Array.isArray(value.cte_map.map) &&
    value.cte_map.map.length > 0
  )
    return invalid('ANALYTICS_SQL_CTE_NOT_SUPPORTED')

  for (const item of Object.values(value)) {
    const result = validateSelectAst(item, tables, depth + 1)
    if (result.isFailure()) return result.forwardFailure()
  }

  return Either.success(undefined)
}

function jsonObject(
  value: JsonValue | undefined,
): Record<string, JsonValue> | undefined {
  if (
    value === undefined ||
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    return undefined
  return value
}

function appendSqlOrdering(
  ast: JsonValue,
  columnCount: number,
): Either<AppError, void> {
  const root = jsonObject(ast)
  if (root === undefined || !Array.isArray(root.statements))
    return invalid('ANALYTICS_SQL_PARSE_FAILED')
  const statement = root.statements
    .map(jsonObject)
    .find((item) => item?.node !== undefined)
  const node = jsonObject(statement?.node)
  if (node === undefined || !Array.isArray(node.modifiers))
    return invalid('ANALYTICS_SQL_PARSE_FAILED')
  let modifier = node.modifiers
    .map(jsonObject)
    .find((item) => item?.type === 'ORDER_MODIFIER')

  if (modifier === undefined) {
    modifier = { type: 'ORDER_MODIFIER', orders: [] }
    node.modifiers.push(modifier)
  }

  if (!Array.isArray(modifier.orders))
    return invalid('ANALYTICS_SQL_PARSE_FAILED')

  for (let index = 1; index <= columnCount; index += 1)
    modifier.orders.push({
      type: 'ASCENDING',
      null_order: 'NULLS_LAST',
      expression: {
        class: 'CONSTANT',
        type: 'VALUE_CONSTANT',
        alias: '',
        query_location: 0,
        query_location_length: 0,
        literal: { kind: 'INTEGER', text: String(index) },
      },
    })

  return Either.success(undefined)
}
