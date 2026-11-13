import type { AnalyticsColumnSchema } from '@mr-tick/application'

import { isRemoteAggregateUnsupportedVisual } from './analytics-plan'
import type { SpaceWidgetConfig, WidgetId } from './analytics-types'

type ChartMapping = Pick<
  SpaceWidgetConfig,
  | 'categoryColumn'
  | 'metricColumn'
  | 'secondaryMetricColumn'
  | 'stackColumn'
  | 'hierarchyColumns'
  | 'referenceLineMode'
  | 'referenceLineTarget'
>

export function chartInputRequirements(visual: WidgetId) {
  return {
    category: visual !== 'kpi_card' && visual !== 'tree_grid',
    secondary:
      visual === 'combo_multiaxis' ||
      visual === 'bar_grouped' ||
      visual === 'conditional_table',
    series:
      visual === 'pivot_matrix' ||
      visual === 'bar_stacked' ||
      visual === 'area_stacked',
    hierarchy: visual === 'tree_grid',
  }
}

export function chartInputIssues(
  visual: WidgetId,
  mapping: ChartMapping,
  columns: AnalyticsColumnSchema[] | undefined,
  remote: boolean,
): string[] {
  const requirements = chartInputRequirements(visual)
  const issues: string[] = []

  if (
    remote &&
    (isRemoteAggregateUnsupportedVisual(visual) ||
      mapping.stackColumn ||
      mapping.referenceLineMode === 'average' ||
      mapping.referenceLineMode === 'weighted_ratio')
  )
    issues.push(
      'A entrada já vem agregada. Use uma visualização compatível com projeção simples.',
    )

  function check(
    label: string,
    name: string | undefined,
    required: boolean,
    numeric = false,
  ) {
    if (!name) {
      if (required) issues.push(`${label}: selecione uma coluna.`)
      return
    }

    if (columns === undefined) return
    const column = columns.find((item) => item.name === name)
    if (column === undefined) {
      issues.push(`${label}: a coluna “${name}” não existe na entrada.`)
      return
    }

    if (numeric && column.type !== 'number')
      issues.push(`${label}: “${column.label}” precisa ser numérica.`)
  }

  if (requirements.category) check('Dimensão', mapping.categoryColumn, true)
  check(
    'Métrica',
    mapping.metricColumn,
    mapping.metricColumn === undefined ||
      remote ||
      mapping.referenceLineMode === 'average',
    true,
  )
  check(
    'Segunda métrica',
    mapping.secondaryMetricColumn,
    requirements.secondary ||
      (requirements.series && remote) ||
      mapping.referenceLineMode === 'weighted_ratio',
    true,
  )
  check('Série', mapping.stackColumn, requirements.series && !remote)
  if (
    requirements.series &&
    mapping.stackColumn &&
    mapping.stackColumn === mapping.categoryColumn
  )
    issues.push('Dimensão e série precisam usar colunas diferentes.')

  if (requirements.hierarchy) {
    if (!mapping.hierarchyColumns?.length)
      issues.push('Hierarquia: selecione pelo menos uma coluna.')
    if (mapping.hierarchyColumns !== undefined)
      for (const name of mapping.hierarchyColumns)
        check('Hierarquia', name, true)
  }

  return issues
}
