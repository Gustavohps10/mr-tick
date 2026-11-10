import type {
  AnalyticsDatasetManifest,
  AnalyticsQueryInput,
  JsonValue,
} from '@mr-tick/application'
import { z } from 'zod'

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)
const filterOperator = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_empty',
])
const aggregation = z.enum(['sum', 'count', 'count_distinct', 'avg'])
const formula = z.enum(['divide', 'multiply', 'subtract', 'add', 'percent_of'])
const transform = z
  .object({
    filterColumn: z.string().optional(),
    filterOperator: filterOperator.optional(),
    filterValue: z.string().optional(),
    additionalFilters: z
      .array(
        z
          .object({
            filterColumn: z.string(),
            filterOperator,
            filterValue: z.string(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    caseColumnName: z.string().optional(),
    caseWhenColumn: z.string().optional(),
    caseWhenValue: z.string().optional(),
    caseThenValue: z.string().optional(),
    caseRules: z
      .array(
        z
          .object({
            whenColumn: z.string(),
            operator: filterOperator,
            whenValue: z.string(),
            thenMode: z.enum(['column', 'literal']),
            thenValue: z.string(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    caseElseMode: z.enum(['column', 'literal']).optional(),
    caseElseValue: z.string().optional(),
    groupByColumn: z.string().optional(),
    pivotColumn: z.string().optional(),
    valueColumn: z.string().optional(),
    aggregation: aggregation.optional(),
    formulaColumnName: z.string().optional(),
    formulaLeftColumn: z.string().optional(),
    formulaOperator: formula.optional(),
    formulaRightColumn: z.string().optional(),
  })
  .strict()
const join = z
  .object({
    joinType: z.enum(['inner', 'left', 'full', 'union']),
    leftNodeId: z.string().optional(),
    rightNodeId: z.string().optional(),
    leftKey: z.string(),
    rightKey: z.string(),
    formulaColumnName: z.string().optional(),
    formulaLeftColumn: z.string().optional(),
    formulaOperator: formula.optional(),
    formulaRightColumn: z.string().optional(),
    postFormulaColumnName: z.string().optional(),
    postFormulaLeftColumn: z.string().optional(),
    postFormulaOperator: formula.optional(),
    postFormulaRightColumn: z.string().optional(),
  })
  .strict()
const upstreamNodeIds = z.array(z.string().min(1)).max(32)
const node = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().min(1),
      kind: z.literal('source'),
      connectionInstanceId: z.string().min(1),
      selectionKey: z.string().min(1),
      columns: z.array(z.string()).max(256).optional(),
      casts: z
        .record(z.string(), z.enum(['string', 'number', 'date']))
        .optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.enum(['transform', 'filter', 'aggregate']),
      upstreamNodeIds,
      transformConfig: transform,
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal('join'),
      upstreamNodeIds,
      joinConfig: join,
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal('sql'),
      upstreamNodeIds,
      sqlConfig: z
        .object({
          sqlQuery: z.string().max(16000),
          templateId: z.string().optional(),
          snippetId: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal('output'),
      upstreamNodeIds,
    })
    .strict(),
])

export const analyticsLocalQuerySchema: z.ZodType<AnalyticsQueryInput> = z
  .object({
    workspaceId: z.string().min(1),
    nodes: z.array(node).min(1).max(64),
    targetNodeId: z.string().min(1),
    projection: z.array(z.string()).max(256).optional(),
    filters: z
      .array(
        z
          .object({
            column: z.string(),
            operator: filterOperator,
            value: z.string(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    search: z.string().max(1000).optional(),
    calculation: transform.optional(),
    rollup: z.boolean().optional(),
    groupBy: z.array(z.string()).max(8).optional(),
    measures: z
      .array(
        z
          .object({
            name: z.string().min(1),
            column: z.string().optional(),
            operator: aggregation,
          })
          .strict(),
      )
      .max(32)
      .optional(),
    pivot: z
      .object({
        rowColumn: z.string(),
        pivotColumn: z.string(),
        valueColumn: z.string().optional(),
        operator: aggregation,
      })
      .strict()
      .optional(),
    offset: z.number().int().min(0).max(1000000),
    limit: z.number().int().min(1).max(500),
    version: z.string().optional(),
  })
  .strict()

const column = z
  .object({
    name: z.string().min(1).max(256),
    label: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'date']),
    unit: z.enum(['hours', 'points', 'count', 'percent', 'none']).optional(),
    origin: z.enum(['native', 'custom', 'computed']).optional(),
    providerFieldId: z.string().optional(),
  })
  .strict()
const option = z.object({ value: z.string(), label: z.string() }).strict()

export const analyticsManifestSchema: z.ZodType<AnalyticsDatasetManifest> = z
  .object({
    id: z.string().min(1),
    canonicalEntity: z
      .enum([
        'time_entries',
        'issues',
        'issue_transitions',
        'sprints_versions',
        'member_capacity',
        'custom_report',
      ])
      .optional(),
    name: z.string(),
    description: z.string(),
    sourceFormat: z.enum(['csv', 'json']),
    endpoint: z.string(),
    selection: z
      .object({ dateRange: z.boolean(), project: z.boolean() })
      .strict()
      .optional(),
    columns: z.array(column).min(1).max(256),
    extraction: z
      .object({
        modes: z.array(z.enum(['snapshot', 'changes', 'aggregate'])),
        identity: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('scope') }).strict(),
          z
            .object({
              kind: z.literal('row'),
              columns: z.array(z.string()).min(1),
            })
            .strict(),
        ]),
        changes: z
          .object({
            deletions: z.enum(['none', 'explicit']),
          })
          .strict()
          .optional(),
        windowRescan: z
          .object({
            dateColumn: z.string().min(1),
          })
          .strict()
          .optional(),
        aggregation: z
          .object({
            groupByColumns: z.array(z.string()),
            operators: z.array(
              z.enum(['count', 'sum', 'average', 'minimum', 'maximum']),
            ),
            postProcessing: z.literal('projection-only'),
          })
          .strict()
          .optional(),
      })
      .strict(),
    supportedFilters: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            type: z.enum([
              'date_range',
              'select',
              'multi_select',
              'text',
              'number',
              'boolean',
            ]),
            description: z.string().optional(),
            required: z.boolean().optional(),
            defaultValue: z.union([z.string(), z.array(z.string())]).optional(),
            options: z.array(option).optional(),
            dynamicOptionsSource: z
              .enum([
                'projects',
                'members',
                'task_statuses',
                'task_priorities',
                'task_trackers',
                'activities',
                'sprints_versions',
              ])
              .optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const hasChangesMode = manifest.extraction.modes.includes('changes')
    const hasChangesConfig = manifest.extraction.changes !== undefined
    const isRowIdentity = manifest.extraction.identity.kind === 'row'

    if (hasChangesMode && (!isRowIdentity || !hasChangesConfig))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ANALYTICS_CHANGES_DESCRIPTOR_INVALID',
      })

    if (hasChangesConfig && (!hasChangesMode || !isRowIdentity))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ANALYTICS_CHANGES_DESCRIPTOR_INVALID',
      })

    const rescan = manifest.extraction.windowRescan

    if (rescan !== undefined) {
      const dateColumn = manifest.columns.find(
        (col) => col.name === rescan.dateColumn,
      )

      if (
        !isRowIdentity ||
        manifest.selection?.dateRange !== true ||
        dateColumn === undefined ||
        dateColumn.type !== 'date'
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ANALYTICS_WINDOW_RESCAN_DESCRIPTOR_INVALID',
        })
    }
  })
