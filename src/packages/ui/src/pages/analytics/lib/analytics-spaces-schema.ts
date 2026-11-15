import {
  ANALYTICS_AGGREGATION_OPERATORS,
  ANALYTICS_FILTER_OPERATORS,
  ANALYTICS_FORMULA_OPERATORS,
  ANALYTICS_REFERENCE_LINE_MODES,
  ANALYTICS_WIDGET_IDS,
  ANALYTICS_WORKFLOW_NODE_KINDS,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { z } from 'zod'

import type { AnalyticsSpaceConfig } from './analytics-types'

const widgetIdSchema = z.enum(ANALYTICS_WIDGET_IDS)

const widgetColSpanSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.literal(11),
  z.literal(12),
])

const widgetRowSpanSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
])

const referenceLineModeSchema = z.enum(ANALYTICS_REFERENCE_LINE_MODES)

const workflowNodeKindSchema = z.enum(ANALYTICS_WORKFLOW_NODE_KINDS)

const filterOperatorSchema = z.enum(ANALYTICS_FILTER_OPERATORS)

const aggregationOperatorSchema = z.enum(ANALYTICS_AGGREGATION_OPERATORS)

const formulaOperatorSchema = z.enum(ANALYTICS_FORMULA_OPERATORS)

const dateRangeFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
})

const analyticsFilterValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.number().finite(),
  z.boolean(),
  dateRangeFilterSchema,
])

const queryExecutionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('snapshot'),
    cursor: z.string().optional(),
    batchSize: z.number().int().min(1).optional(),
  }),
  z.object({
    kind: z.literal('changes'),
    checkpoint: z.string(),
    cursor: z.string().optional(),
    batchSize: z.number().int().min(1).optional(),
  }),
  z.object({
    kind: z.literal('aggregate'),
    groupBy: z.array(z.string()),
    measures: z.array(
      z.object({
        name: z.string(),
        operator: z.enum(['count', 'sum', 'average', 'minimum', 'maximum']),
        column: z.string().optional(),
      }),
    ),
    cursor: z.string().optional(),
  }),
])

const caseWhenRuleSchema = z.object({
  whenColumn: z.string(),
  operator: filterOperatorSchema,
  whenValue: z.string(),
  thenMode: z.enum(['column', 'literal']),
  thenValue: z.string(),
})

const transformConfigSchema = z.object({
  filterColumn: z.string().optional(),
  filterOperator: filterOperatorSchema.optional(),
  filterValue: z.string().optional(),
  additionalFilters: z
    .array(
      z.object({
        filterColumn: z.string(),
        filterOperator: filterOperatorSchema,
        filterValue: z.string(),
      }),
    )
    .optional(),
  caseColumnName: z.string().optional(),
  caseWhenColumn: z.string().optional(),
  caseWhenValue: z.string().optional(),
  caseThenValue: z.string().optional(),
  caseRules: z.array(caseWhenRuleSchema).optional(),
  caseElseMode: z.enum(['column', 'literal']).optional(),
  caseElseValue: z.string().optional(),
  groupByColumn: z.string().optional(),
  pivotColumn: z.string().optional(),
  valueColumn: z.string().optional(),
  aggregation: aggregationOperatorSchema.optional(),
  formulaColumnName: z.string().optional(),
  formulaLeftColumn: z.string().optional(),
  formulaOperator: formulaOperatorSchema.optional(),
  formulaRightColumn: z.string().optional(),
})

const joinConfigSchema = z.object({
  joinType: z.enum(['inner', 'left', 'full', 'union']),
  leftNodeId: z.string().optional(),
  rightNodeId: z.string().optional(),
  leftKey: z.string(),
  rightKey: z.string(),
  formulaColumnName: z.string().optional(),
  formulaLeftColumn: z.string().optional(),
  formulaOperator: formulaOperatorSchema.optional(),
  formulaRightColumn: z.string().optional(),
  postFormulaColumnName: z.string().optional(),
  postFormulaLeftColumn: z.string().optional(),
  postFormulaOperator: formulaOperatorSchema.optional(),
  postFormulaRightColumn: z.string().optional(),
})

const sqlConfigSchema = z.object({
  sqlQuery: z.string(),
  inputAliases: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/u)).optional(),
  templateId: z.string().optional(),
  snippetId: z.string().optional(),
})

const sourceFilterBindingSchema = z.object({
  targetFilterId: z.string().min(1),
  upstreamNodeId: z.string().min(1),
  sourceColumn: z.string().min(1),
  onEmptyUpstream: z.enum(['skip_empty', 'fail']),
})

const transformInputBindingSchema = z.object({
  nodeId: z.string().min(1),
  alias: z.string().regex(/^[a-z][a-z0-9_]*$/u),
})

const spaceWidgetSchema = z.object({
  id: z.string().min(1),
  widgetType: widgetIdSchema,
  title: z.string(),
  subtitle: z.string(),
  datasetBadge: z.string(),
  sourceNodeId: z.string(),
  outputNodeId: z.string().optional(),
  chartVisualType: widgetIdSchema,
  colSpan: widgetColSpanSchema,
  rowSpan: widgetRowSpanSchema,
  visible: z.boolean(),
  categoryColumn: z.string().optional(),
  metricColumn: z.string().optional(),
  secondaryMetricColumn: z.string().optional(),
  stackColumn: z.string().optional(),
  categoryLabel: z.string().optional(),
  metricLabel: z.string().optional(),
  secondaryMetricLabel: z.string().optional(),
  showAllRows: z.boolean().optional(),
  maxRows: z.number().int().min(1).optional(),
  valueDisplayMode: z.enum(['absolute', 'percentage']).optional(),
  tooltipEnabled: z.boolean().optional(),
  tooltipFields: z
    .array(
      z.enum([
        'category',
        'primary',
        'secondary',
        'series',
        'percentage',
        'total',
      ]),
    )
    .optional(),
  referenceLineMode: referenceLineModeSchema.optional(),
  referenceLineTarget: z.number().optional(),
  hierarchyColumns: z.array(z.string()).optional(),
})

const spaceWorkflowNodeSchema = z.object({
  id: z.string().min(1),
  positionX: z.number(),
  positionY: z.number(),
  label: z.string(),
  subtitle: z.string(),
  badge: z.string(),
  kind: workflowNodeKindSchema,
  connectionId: z.string().optional(),
  dataSourceName: z.string(),
  datasetId: z.string(),
  selectedProject: z.string().optional(),
  selectedColumns: z.array(z.string()).optional(),
  customFieldTypes: z
    .record(z.string(), z.enum(['string', 'number', 'date']))
    .optional(),
  customDateRange: dateRangeFilterSchema.optional(),
  queryExecution: queryExecutionSchema.optional(),
  filterValues: z.record(z.string(), analyticsFilterValueSchema).optional(),
  filterBindings: z.array(sourceFilterBindingSchema).optional(),
  transformInputs: z.array(transformInputBindingSchema).optional(),
  transformConfig: transformConfigSchema.optional(),
  joinConfig: joinConfigSchema.optional(),
  sqlConfig: sqlConfigSchema.optional(),
  ruleSummary: z.string(),
  sqlPreview: z.string(),
  upstreamNodeIds: z.array(z.string()),
})

const spaceWorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
})

export const analyticsSpacesSchema: z.ZodType<AnalyticsSpaceConfig[]> = z.array(
  z.object({
    id: z.string().min(1),
    title: z.string(),
    subtitle: z.string(),
    badge: z.string(),
    widgets: z.array(spaceWidgetSchema),
    workflowNodes: z.array(spaceWorkflowNodeSchema),
    workflowEdges: z.array(spaceWorkflowEdgeSchema),
  }),
)

export function isIsoDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  if (!Number.isFinite(Date.parse(value))) return false

  return new Date(value).toISOString().slice(0, 10) === value
}

export function isoDateToLocalDate(value: string): Date | undefined {
  if (!isIsoDateString(value)) return undefined

  const [yearStr, monthStr, dayStr] = value.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  )
    return undefined

  return new Date(year, month - 1, day)
}

export function parsePersistedSpaces(
  spacesJson: string,
): Either<AppError, AnalyticsSpaceConfig[]> {
  try {
    const parsed = analyticsSpacesSchema.safeParse(JSON.parse(spacesJson))
    if (!parsed.success)
      return Either.failure(
        AppError.ValidationError('ANALYTICS_SPACES_STATE_INVALID'),
      )

    return Either.success(parsed.data)
  } catch {
    return Either.failure(
      AppError.ValidationError('ANALYTICS_SPACES_STATE_INVALID'),
    )
  }
}
