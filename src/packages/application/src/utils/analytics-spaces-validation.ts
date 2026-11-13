import { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  AnalyticsAggregationOperator,
  AnalyticsFilterOperator,
  AnalyticsFormulaOperator,
} from '../contracts/data/providers/IAnalyticsEngine'
import type { JsonValue } from '../contracts/resolvers/IDataSourceResolver'

export type AnalyticsWidgetId =
  | 'bar_vertical'
  | 'bar_horizontal'
  | 'bar_stacked'
  | 'bar_grouped'
  | 'combo_multiaxis'
  | 'line'
  | 'line_reference'
  | 'split_pane_chart'
  | 'area'
  | 'area_stacked'
  | 'pie_donut'
  | 'radar'
  | 'pivot_matrix'
  | 'tree_grid'
  | 'conditional_table'
  | 'kpi_card'

export type AnalyticsReferenceLineMode =
  'none' | 'average' | 'weighted_ratio' | 'fixed_target'

export type AnalyticsWorkflowNodeKind =
  'source' | 'transform' | 'filter' | 'join' | 'aggregate' | 'sql' | 'output'

export const ANALYTICS_WIDGET_IDS: [AnalyticsWidgetId, ...AnalyticsWidgetId[]] =
  [
    'bar_vertical',
    'bar_horizontal',
    'bar_stacked',
    'bar_grouped',
    'combo_multiaxis',
    'line',
    'line_reference',
    'split_pane_chart',
    'area',
    'area_stacked',
    'pie_donut',
    'radar',
    'pivot_matrix',
    'tree_grid',
    'conditional_table',
    'kpi_card',
  ]

export const ANALYTICS_REFERENCE_LINE_MODES: [
  AnalyticsReferenceLineMode,
  ...AnalyticsReferenceLineMode[],
] = ['none', 'average', 'weighted_ratio', 'fixed_target']

export const ANALYTICS_WORKFLOW_NODE_KINDS: [
  AnalyticsWorkflowNodeKind,
  ...AnalyticsWorkflowNodeKind[],
] = ['source', 'transform', 'filter', 'join', 'aggregate', 'sql', 'output']

export const ANALYTICS_FILTER_OPERATORS: [
  AnalyticsFilterOperator,
  ...AnalyticsFilterOperator[],
] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_empty']

export const ANALYTICS_AGGREGATION_OPERATORS: [
  AnalyticsAggregationOperator,
  ...AnalyticsAggregationOperator[],
] = ['sum', 'count', 'count_distinct', 'avg']

export const ANALYTICS_FORMULA_OPERATORS: [
  AnalyticsFormulaOperator,
  ...AnalyticsFormulaOperator[],
] = ['divide', 'multiply', 'subtract', 'add', 'percent_of']

const WIDGET_ID_SET = new Set<string>(ANALYTICS_WIDGET_IDS)
const REFERENCE_LINE_MODE_SET = new Set<string>(ANALYTICS_REFERENCE_LINE_MODES)
const WORKFLOW_NODE_KIND_SET = new Set<string>(ANALYTICS_WORKFLOW_NODE_KINDS)
const FILTER_OPERATOR_SET = new Set<string>(ANALYTICS_FILTER_OPERATORS)
const AGGREGATION_OPERATOR_SET = new Set<string>(
  ANALYTICS_AGGREGATION_OPERATORS,
)
const FORMULA_OPERATOR_SET = new Set<string>(ANALYTICS_FORMULA_OPERATORS)
const CUSTOM_FIELD_TYPE_SET = new Set<string>(['string', 'number', 'date'])
const JOIN_TYPE_SET = new Set<string>(['inner', 'left', 'full', 'union'])
const THEN_MODE_SET = new Set<string>(['column', 'literal'])
const REMOTE_AGGREGATE_OPERATORS = new Set<string>([
  'count',
  'sum',
  'average',
  'minimum',
  'maximum',
])

type JsonObject = { [key: string]: JsonValue }

function invalidSpaces(): Either<AppError, void> {
  return Either.failure(
    AppError.ValidationError('ANALYTICS_SPACES_STATE_INVALID'),
  )
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonString(value: JsonValue | undefined): value is string {
  return typeof value === 'string'
}

function isNonEmptyJsonString(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && value.length >= 1
}

function isJsonFiniteNumber(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOptionalJsonString(value: JsonValue | undefined): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalJsonEnum(
  value: JsonValue | undefined,
  allowed: Set<string>,
): boolean {
  if (value === undefined) return true

  return typeof value === 'string' && allowed.has(value)
}

function isJsonStringArray(value: JsonValue | undefined): boolean {
  if (!Array.isArray(value)) return false

  return value.every((item) => typeof item === 'string')
}

function isOptionalJsonStringArray(value: JsonValue | undefined): boolean {
  if (value === undefined) return true

  return isJsonStringArray(value)
}

function isDateRangeObject(value: JsonValue | undefined): boolean {
  if (!isJsonObject(value)) return false

  return isOptionalJsonString(value.from) && isOptionalJsonString(value.to)
}

function isOptionalDateRangeObject(value: JsonValue | undefined): boolean {
  if (value === undefined) return true

  return isDateRangeObject(value)
}

function isFilterValue(value: JsonValue | undefined): boolean {
  if (value === undefined) return false
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (isJsonFiniteNumber(value)) return true
  if (Array.isArray(value)) return isJsonStringArray(value)

  return isDateRangeObject(value)
}

function isValidQueryExecution(value: JsonValue | undefined): boolean {
  if (value === undefined) return true
  if (!isJsonObject(value)) return false

  if (value.kind === 'snapshot') {
    if (!isOptionalJsonString(value.cursor)) return false

    if (value.batchSize !== undefined) {
      if (
        !isJsonFiniteNumber(value.batchSize) ||
        !Number.isInteger(value.batchSize) ||
        value.batchSize < 1
      )
        return false
    }

    return true
  }

  if (value.kind === 'changes') {
    if (!isJsonString(value.checkpoint)) return false
    if (!isOptionalJsonString(value.cursor)) return false

    if (value.batchSize !== undefined) {
      if (
        !isJsonFiniteNumber(value.batchSize) ||
        !Number.isInteger(value.batchSize) ||
        value.batchSize < 1
      )
        return false
    }

    return true
  }

  if (value.kind === 'aggregate') {
    if (!isJsonStringArray(value.groupBy)) return false
    if (!Array.isArray(value.measures)) return false
    if (!isOptionalJsonString(value.cursor)) return false

    for (const measure of value.measures) {
      if (!isJsonObject(measure)) return false
      if (!isJsonString(measure.name)) return false
      if (
        !isJsonString(measure.operator) ||
        !REMOTE_AGGREGATE_OPERATORS.has(measure.operator)
      )
        return false
      if (!isOptionalJsonString(measure.column)) return false
    }

    return true
  }

  return false
}

function isValidTransformConfig(value: JsonValue | undefined): boolean {
  if (value === undefined) return true
  if (!isJsonObject(value)) return false

  if (!isOptionalJsonString(value.filterColumn)) return false
  if (!isOptionalJsonEnum(value.filterOperator, FILTER_OPERATOR_SET))
    return false
  if (!isOptionalJsonString(value.filterValue)) return false

  if (value.additionalFilters !== undefined) {
    if (!Array.isArray(value.additionalFilters)) return false

    for (const entry of value.additionalFilters) {
      if (!isJsonObject(entry)) return false
      if (!isJsonString(entry.filterColumn)) return false
      if (
        !isJsonString(entry.filterOperator) ||
        !FILTER_OPERATOR_SET.has(entry.filterOperator)
      )
        return false
      if (!isJsonString(entry.filterValue)) return false
    }
  }

  if (!isOptionalJsonString(value.caseColumnName)) return false
  if (!isOptionalJsonString(value.caseWhenColumn)) return false
  if (!isOptionalJsonString(value.caseWhenValue)) return false
  if (!isOptionalJsonString(value.caseThenValue)) return false

  if (value.caseRules !== undefined) {
    if (!Array.isArray(value.caseRules)) return false

    for (const rule of value.caseRules) {
      if (!isJsonObject(rule)) return false
      if (!isJsonString(rule.whenColumn)) return false
      if (
        !isJsonString(rule.operator) ||
        !FILTER_OPERATOR_SET.has(rule.operator)
      )
        return false
      if (!isJsonString(rule.whenValue)) return false
      if (!isJsonString(rule.thenMode) || !THEN_MODE_SET.has(rule.thenMode))
        return false
      if (!isJsonString(rule.thenValue)) return false
    }
  }

  if (!isOptionalJsonEnum(value.caseElseMode, THEN_MODE_SET)) return false
  if (!isOptionalJsonString(value.caseElseValue)) return false
  if (!isOptionalJsonString(value.groupByColumn)) return false
  if (!isOptionalJsonString(value.pivotColumn)) return false
  if (!isOptionalJsonString(value.valueColumn)) return false
  if (!isOptionalJsonEnum(value.aggregation, AGGREGATION_OPERATOR_SET))
    return false
  if (!isOptionalJsonString(value.formulaColumnName)) return false
  if (!isOptionalJsonString(value.formulaLeftColumn)) return false
  if (!isOptionalJsonEnum(value.formulaOperator, FORMULA_OPERATOR_SET))
    return false

  return isOptionalJsonString(value.formulaRightColumn)
}

function isValidJoinConfig(value: JsonValue | undefined): boolean {
  if (value === undefined) return true
  if (!isJsonObject(value)) return false

  if (!isJsonString(value.joinType) || !JOIN_TYPE_SET.has(value.joinType))
    return false
  if (!isOptionalJsonString(value.leftNodeId)) return false
  if (!isOptionalJsonString(value.rightNodeId)) return false
  if (!isJsonString(value.leftKey)) return false
  if (!isJsonString(value.rightKey)) return false
  if (!isOptionalJsonString(value.formulaColumnName)) return false
  if (!isOptionalJsonString(value.formulaLeftColumn)) return false
  if (!isOptionalJsonEnum(value.formulaOperator, FORMULA_OPERATOR_SET))
    return false
  if (!isOptionalJsonString(value.formulaRightColumn)) return false
  if (!isOptionalJsonString(value.postFormulaColumnName)) return false
  if (!isOptionalJsonString(value.postFormulaLeftColumn)) return false
  if (!isOptionalJsonEnum(value.postFormulaOperator, FORMULA_OPERATOR_SET))
    return false

  return isOptionalJsonString(value.postFormulaRightColumn)
}

function isValidSqlConfig(value: JsonValue | undefined): boolean {
  if (value === undefined) return true
  if (!isJsonObject(value)) return false

  return (
    isJsonString(value.sqlQuery) &&
    isOptionalJsonString(value.templateId) &&
    isOptionalJsonString(value.snippetId)
  )
}

function isValidWidget(value: JsonValue): boolean {
  if (!isJsonObject(value)) return false
  if (!isNonEmptyJsonString(value.id)) return false
  if (!isJsonString(value.widgetType) || !WIDGET_ID_SET.has(value.widgetType))
    return false
  if (!isJsonString(value.title)) return false
  if (!isJsonString(value.subtitle)) return false
  if (!isJsonString(value.datasetBadge)) return false
  if (!isJsonString(value.sourceNodeId)) return false
  if (!isOptionalJsonString(value.outputNodeId)) return false
  if (
    !isJsonString(value.chartVisualType) ||
    !WIDGET_ID_SET.has(value.chartVisualType)
  )
    return false
  if (value.span !== 1 && value.span !== 2 && value.span !== 3) return false
  if (typeof value.visible !== 'boolean') return false
  if (!isOptionalJsonString(value.categoryColumn)) return false
  if (!isOptionalJsonString(value.metricColumn)) return false
  if (!isOptionalJsonString(value.secondaryMetricColumn)) return false
  if (!isOptionalJsonString(value.stackColumn)) return false
  if (!isOptionalJsonEnum(value.referenceLineMode, REFERENCE_LINE_MODE_SET))
    return false
  if (
    value.referenceLineTarget !== undefined &&
    !isJsonFiniteNumber(value.referenceLineTarget)
  )
    return false

  return isOptionalJsonStringArray(value.hierarchyColumns)
}

function isValidWorkflowNode(value: JsonValue): boolean {
  if (!isJsonObject(value)) return false
  if (!isNonEmptyJsonString(value.id)) return false
  if (!isJsonFiniteNumber(value.positionX)) return false
  if (!isJsonFiniteNumber(value.positionY)) return false
  if (!isJsonString(value.label)) return false
  if (!isJsonString(value.subtitle)) return false
  if (!isJsonString(value.badge)) return false
  if (!isJsonString(value.kind) || !WORKFLOW_NODE_KIND_SET.has(value.kind))
    return false
  if (!isOptionalJsonString(value.connectionId)) return false
  if (!isJsonString(value.dataSourceName)) return false
  if (!isJsonString(value.datasetId)) return false
  if (!isOptionalJsonString(value.selectedProject)) return false
  if (!isOptionalJsonStringArray(value.selectedColumns)) return false

  if (value.customFieldTypes !== undefined) {
    if (!isJsonObject(value.customFieldTypes)) return false

    for (const fieldType of Object.values(value.customFieldTypes)) {
      if (!isJsonString(fieldType) || !CUSTOM_FIELD_TYPE_SET.has(fieldType))
        return false
    }
  }

  if (!isOptionalDateRangeObject(value.customDateRange)) return false
  if (!isValidQueryExecution(value.queryExecution)) return false

  if (value.filterValues !== undefined) {
    if (!isJsonObject(value.filterValues)) return false

    for (const filterValue of Object.values(value.filterValues)) {
      if (!isFilterValue(filterValue)) return false
    }
  }

  if (!isValidTransformConfig(value.transformConfig)) return false
  if (!isValidJoinConfig(value.joinConfig)) return false
  if (!isValidSqlConfig(value.sqlConfig)) return false
  if (!isJsonString(value.ruleSummary)) return false
  if (!isJsonString(value.sqlPreview)) return false

  return isJsonStringArray(value.upstreamNodeIds)
}

function isValidWorkflowEdge(value: JsonValue): boolean {
  if (!isJsonObject(value)) return false

  return (
    isNonEmptyJsonString(value.id) &&
    isJsonString(value.source) &&
    isJsonString(value.target) &&
    isOptionalJsonString(value.label)
  )
}

function isValidSpace(value: JsonValue): boolean {
  if (!isJsonObject(value)) return false
  if (!isNonEmptyJsonString(value.id)) return false
  if (!isJsonString(value.title)) return false
  if (!isJsonString(value.subtitle)) return false
  if (!isJsonString(value.badge)) return false

  if (!Array.isArray(value.widgets) || !value.widgets.every(isValidWidget))
    return false

  if (
    !Array.isArray(value.workflowNodes) ||
    !value.workflowNodes.every(isValidWorkflowNode)
  )
    return false

  return (
    Array.isArray(value.workflowEdges) &&
    value.workflowEdges.every(isValidWorkflowEdge)
  )
}

export function validatePersistedAnalyticsSpacesJson(
  spacesJson: string,
): Either<AppError, void> {
  try {
    const parsed: JsonValue = JSON.parse(spacesJson)
    if (!Array.isArray(parsed)) return invalidSpaces()

    for (const space of parsed) {
      if (!isValidSpace(space)) return invalidSpaces()
    }

    return Either.success(undefined)
  } catch {
    return invalidSpaces()
  }
}
