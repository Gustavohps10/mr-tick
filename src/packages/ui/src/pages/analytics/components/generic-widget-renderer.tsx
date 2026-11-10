import type {
  AnalyticsAggregationOperator,
  AnalyticsColumnSchema,
  AnalyticsDatasetRow,
  AnalyticsPlanNode,
  AnalyticsQueryInput,
} from '@mr-tick/application'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { useAnalyticsQuery } from '../hooks/use-analytics-query'
import type {
  AnalyticsSpaceConfig,
  SpaceWidgetConfig,
  SpaceWorkflowNodeConfig,
} from '../lib/analytics-types'
import { getPaletteColor } from '../lib/analytics-utils'
import { AnalyticsError } from './analytics-error'
import { AnalyticsHierarchyTable } from './analytics-hierarchy-table'

export interface GenericWidgetRendererProps {
  onUnauthorized: (connectionIds: string[], message: string) => void
  warehousePlan: AnalyticsPlanNode[]
  publicationVersion: string
  widget: SpaceWidgetConfig
  activeSpace: AnalyticsSpaceConfig
  resolveRowsForWorkflowNode: (node: SpaceWorkflowNodeConfig) => {
    columns: AnalyticsColumnSchema[]
    rows: AnalyticsDatasetRow[]
    rawCsvSample?: string
  }
  onGenericDrillDown: (
    sourceNode: SpaceWorkflowNodeConfig | undefined,
    categoryKey: string,
    categoryValue: string,
  ) => void
  overloadTolerancePct: number
  onSetOverloadTolerancePct: (val: number) => void
  idleTolerancePct: number
  onSetIdleTolerancePct: (val: number) => void
  estimationTolerancePct: number
  onSetEstimationTolerancePct: (val: number) => void
}

/** Rendering consumes server aggregates. It never groups the preview rows. */

export function GenericWidgetRenderer({
  onUnauthorized,
  widget,
  activeSpace,
  warehousePlan,
  publicationVersion,
  onGenericDrillDown,
  overloadTolerancePct,
  onSetOverloadTolerancePct,
  idleTolerancePct,
  onSetIdleTolerancePct,
  estimationTolerancePct,
  onSetEstimationTolerancePct,
}: GenericWidgetRendererProps) {
  const operators: AnalyticsAggregationOperator[] = [
    'sum',
    'count',
    'count_distinct',
    'avg',
  ]
  const [operator, setOperator] = useState<AnalyticsAggregationOperator>('sum')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [page, setPage] = useState<{
    signature: string
    offset: number
    version?: string
  }>({ signature: '', offset: 0 })
  const node = activeSpace.workflowNodes.find(
    (item) => item.id === widget.sourceNodeId,
  )
  let baseInput: AnalyticsQueryInput | undefined
  if (workspaceId !== undefined && node !== undefined)
    baseInput = {
      workspaceId,
      nodes: warehousePlan,
      targetNodeId: node.id,
      offset: 0,
      limit: 1,
    }
  const base = useAnalyticsQuery(baseInput, publicationVersion, onUnauthorized)
  const groups: string[] = []
  if (widget.categoryColumn !== undefined && widget.categoryColumn !== '')
    groups.push(widget.categoryColumn)
  const primary = 'analytics_metric_primary',
    secondary = 'analytics_metric_secondary',
    ratio = 'analytics_reference_ratio'
  const measures: NonNullable<AnalyticsQueryInput['measures']> = []
  if (widget.metricColumn !== undefined && widget.metricColumn !== '')
    measures.push({
      name: primary,
      column: widget.metricColumn,
      operator,
    })
  if (
    widget.secondaryMetricColumn !== undefined &&
    widget.secondaryMetricColumn !== ''
  )
    measures.push({
      name: secondary,
      column: widget.secondaryMetricColumn,
      operator,
    })
  if (widget.metricColumn === '')
    measures.push({ name: primary, operator: 'count' })
  let input: AnalyticsQueryInput | undefined
  let summaryInput: AnalyticsQueryInput | undefined
  const visual = widget.chartVisualType

  if (baseInput !== undefined && base.data !== undefined) {
    input = { ...baseInput, offset: 0, limit: 100 }

    if (!base.data.remoteAggregate) {
      if (visual === 'kpi_card') input = { ...input, groupBy: [], measures }
      if (visual !== 'kpi_card') input = { ...input, groupBy: groups, measures }
    }

    const hasStackColumn =
      widget.stackColumn !== undefined && widget.stackColumn !== ''

    if (
      ((visual === 'pivot_matrix' ||
        visual === 'bar_stacked' ||
        visual === 'area_stacked') &&
        widget.categoryColumn !== undefined &&
        hasStackColumn &&
        widget.metricColumn !== undefined) ||
      (base.data.remoteAggregate && visual === 'pivot_matrix')
    ) {
      let pivotOperator = operator
      let valueColumn: string | undefined = widget.metricColumn

      if (valueColumn === '') {
        pivotOperator = 'count'
        valueColumn = undefined
      }

      let rowColumn = ''
      if (widget.categoryColumn !== undefined) rowColumn = widget.categoryColumn
      let pivotColumn = ''
      if (widget.stackColumn !== undefined) pivotColumn = widget.stackColumn

      input = {
        ...input,
        groupBy: undefined,
        measures: undefined,
        pivot: {
          rowColumn,
          pivotColumn,
          valueColumn,
          operator: pivotOperator,
        },
      }
    }

    if (
      visual === 'tree_grid' &&
      (widget.hierarchyColumns !== undefined || base.data.remoteAggregate)
    ) {
      let hierarchy: string[] = []
      if (widget.hierarchyColumns !== undefined)
        hierarchy = widget.hierarchyColumns
      let rollupMeasures = measures
      if (rollupMeasures.length === 0)
        rollupMeasures = [{ name: primary, operator: 'count' }]
      input = {
        ...input,
        groupBy: hierarchy,
        measures: rollupMeasures,
        rollup: true,
      }
    }

    if (
      visual === 'conditional_table' &&
      ((widget.secondaryMetricColumn !== undefined &&
        widget.secondaryMetricColumn !== '') ||
        base.data.remoteAggregate)
    )
      input = {
        ...input,
        calculation: {
          formulaColumnName: ratio,
          formulaLeftColumn: primary,
          formulaOperator: 'percent_of',
          formulaRightColumn: secondary,
        },
      }

    if (widget.referenceLineMode === 'average') {
      let column = widget.metricColumn
      if (column === '') column = undefined
      summaryInput = {
        ...baseInput,
        groupBy: [],
        measures: [{ name: primary, column, operator: 'avg' }],
        offset: 0,
        limit: 1,
      }
    }

    if (widget.referenceLineMode === 'weighted_ratio') {
      const totals: NonNullable<AnalyticsQueryInput['measures']> = []
      if (widget.metricColumn === '')
        totals.push({ name: primary, operator: 'count' })
      if (widget.metricColumn !== '')
        totals.push({
          name: primary,
          column: widget.metricColumn,
          operator: 'sum',
        })
      totals.push({
        name: secondary,
        column: widget.secondaryMetricColumn,
        operator: 'sum',
      })
      summaryInput = {
        ...baseInput,
        groupBy: [],
        measures: totals,
        calculation: {
          formulaColumnName: ratio,
          formulaLeftColumn: primary,
          formulaOperator: 'divide',
          formulaRightColumn: secondary,
        },
        offset: 0,
        limit: 1,
      }
    }
  }

  const signature = JSON.stringify([input, publicationVersion])
  if (input !== undefined && page.signature === signature)
    input = { ...input, offset: page.offset, version: page.version }
  const result = useAnalyticsQuery(input, publicationVersion, onUnauthorized)
  const summary = useAnalyticsQuery(
    summaryInput,
    publicationVersion,
    onUnauthorized,
  )
  if (base.loading || result.loading)
    return <Skeleton className="h-64 w-full rounded-md" />
  if (base.error !== undefined)
    return (
      <div>
        <AnalyticsError message={base.error} details={base.details} />
        <Button variant="outline" onClick={base.retry}>
          Tentar novamente
        </Button>
      </div>
    )
  if (result.error !== undefined)
    return (
      <div>
        <AnalyticsError message={result.error} details={result.details} />
        <Button variant="outline" onClick={result.retry}>
          Tentar novamente
        </Button>
      </div>
    )
  if (node === undefined || result.data === undefined)
    return <p>Selecione a fonte, a dimensão e a métrica da visualização.</p>
  const data = result.data
  if (data.rows.length === 0) return <p>Nenhum registro para esta seleção.</p>
  let category = widget.categoryColumn
  if (category === undefined) category = ''
  let metric = primary
  let secondaryMetric = secondary
  if (data.remoteAggregate && widget.metricColumn !== undefined)
    metric = widget.metricColumn
  if (data.remoteAggregate && widget.secondaryMetricColumn !== undefined)
    secondaryMetric = widget.secondaryMetricColumn
  let series = [metric]
  if (
    widget.secondaryMetricColumn !== undefined &&
    widget.secondaryMetricColumn !== ''
  )
    series.push(secondaryMetric)
  if (input?.pivot !== undefined)
    series = data.columns
      .filter(
        (column) =>
          column.type === 'number' &&
          column.name !== category &&
          column.name !== 'total',
      )
      .map((column) => column.name)
  let reference: number | undefined
  if (widget.referenceLineMode === 'fixed_target')
    reference = widget.referenceLineTarget

  if (widget.referenceLineMode === 'average') {
    const mean = summary.data?.rows.find(() => true)?.[primary]
    if (typeof mean === 'number') reference = mean
  }

  if (widget.referenceLineMode === 'weighted_ratio') {
    const total = summary.data?.rows.find(() => true)?.[ratio]
    if (typeof total === 'number') reference = total
  }

  const clickRow = (row: AnalyticsDatasetRow) => {
    const value = row[category]
    if (value !== null && value !== undefined)
      onGenericDrillDown(node, category, String(value))
  }

  const rowStyle = (row: AnalyticsDatasetRow) => {
    if (visual !== 'conditional_table') return undefined
    const value = row[ratio]
    if (typeof value !== 'number') return undefined
    if (value > 100 + overloadTolerancePct)
      return { backgroundColor: 'color-mix(in srgb, #ef4444 15%, transparent)' }
    if (value < 100 - idleTolerancePct)
      return { backgroundColor: 'color-mix(in srgb, #f59e0b 15%, transparent)' }
    if (Math.abs(value - 100) <= estimationTolerancePct)
      return { backgroundColor: 'color-mix(in srgb, #10b981 12%, transparent)' }
    return undefined
  }

  const table = (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {data.columns.map((column) => (
              <TableHead key={column.name}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row, index) => (
            <TableRow
              key={index}
              style={rowStyle(row)}
              onClick={() => clickRow(row)}
            >
              {data.columns.map((column) => (
                <TableCell key={column.name}>
                  {String(row[column.name])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey={category} />
      <YAxis />
      <Tooltip />
      <Legend />
      {reference !== undefined && (
        <ReferenceLine y={reference} stroke="#ef4444" />
      )}
    </>
  )
  let chart = (
    <BarChart data={data.rows}>
      {axes}
      {series.map((name, index) => (
        <Bar
          key={name}
          dataKey={name}
          fill={getPaletteColor(index)}
          stackId={input?.pivot !== undefined ? 'stack' : undefined}
        >
          {data.rows.map((row, rowIndex) => (
            <Cell key={rowIndex} onClick={() => clickRow(row)} />
          ))}
        </Bar>
      ))}
    </BarChart>
  )
  if (visual === 'bar_horizontal')
    chart = (
      <BarChart data={data.rows} layout="vertical">
        <CartesianGrid />
        <XAxis type="number" />
        <YAxis type="category" dataKey={category} />
        <Tooltip />
        {series.map((name, index) => (
          <Bar key={name} dataKey={name} fill={getPaletteColor(index)} />
        ))}
      </BarChart>
    )
  if (visual === 'line' || visual === 'line_reference')
    chart = (
      <LineChart data={data.rows}>
        {axes}
        {series.map((name, index) => (
          <Line
            key={name}
            dataKey={name}
            stroke={getPaletteColor(index)}
            dot={false}
          />
        ))}
      </LineChart>
    )
  if (visual === 'area' || visual === 'area_stacked')
    chart = (
      <AreaChart data={data.rows}>
        {axes}
        {series.map((name, index) => (
          <Area
            key={name}
            dataKey={name}
            stroke={getPaletteColor(index)}
            fill={getPaletteColor(index)}
            stackId={visual === 'area_stacked' ? 'stack' : undefined}
          />
        ))}
      </AreaChart>
    )
  if (visual === 'combo_multiaxis')
    chart = (
      <ComposedChart data={data.rows}>
        {axes}
        <Bar dataKey={metric} fill={getPaletteColor(0)} />
        <Line dataKey={secondaryMetric} stroke={getPaletteColor(1)} />
      </ComposedChart>
    )
  if (visual === 'pie_donut')
    chart = (
      <PieChart>
        <Tooltip />
        <Legend />
        <Pie
          data={data.rows}
          dataKey={metric}
          nameKey={category}
          innerRadius="45%"
          outerRadius="80%"
          fill={getPaletteColor(0)}
        />
      </PieChart>
    )
  if (visual === 'radar')
    chart = (
      <RadarChart data={data.rows}>
        <PolarGrid />
        <PolarAngleAxis dataKey={category} />
        <Tooltip />
        {series.map((name, index) => (
          <Radar
            key={name}
            dataKey={name}
            stroke={getPaletteColor(index)}
            fill={getPaletteColor(index)}
            fillOpacity={0.2}
          />
        ))}
      </RadarChart>
    )
  const isTable =
    visual === 'pivot_matrix' ||
    visual === 'tree_grid' ||
    visual === 'conditional_table'
  let content = (
    <div className="h-72 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </div>
  )
  if (isTable) content = table
  if (
    visual === 'tree_grid' &&
    widget.hierarchyColumns !== undefined &&
    data.groupingColumn !== undefined
  )
    content = (
      <AnalyticsHierarchyTable
        data={data}
        hierarchy={widget.hierarchyColumns}
      />
    )
  if (visual === 'split_pane_chart')
    content = (
      <div className="grid min-w-0 gap-3 lg:grid-cols-[7fr_3fr]">
        {content}
        {table}
      </div>
    )
  if (visual === 'kpi_card')
    content = (
      <div className="p-6 text-3xl font-semibold">
        {data.rows.map((row, index) => (
          <div key={index}>{String(row[metric])}</div>
        ))}
        {reference !== undefined && (
          <p className="text-muted-foreground text-sm">
            Referência: {reference}
          </p>
        )}
      </div>
    )

  return (
    <div className="space-y-3">
      {!data.remoteAggregate && widget.metricColumn !== '' && (
        <Select
          value={operator}
          onValueChange={(next) => {
            const selected = operators.find((item) => item === next)
            if (selected !== undefined) setOperator(selected)
          }}
        >
          <SelectTrigger
            aria-label="Agregação da visualização"
            className="w-40"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {visual === 'conditional_table' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Sobrecarga: {overloadTolerancePct}%</Label>
            <Slider
              value={[overloadTolerancePct]}
              max={100}
              onValueChange={(values) => {
                const selected = values.find((value) => Number.isFinite(value))
                if (selected !== undefined) onSetOverloadTolerancePct(selected)
              }}
            />
          </div>
          <div>
            <Label>Ociosidade: {idleTolerancePct}%</Label>
            <Slider
              value={[idleTolerancePct]}
              max={100}
              onValueChange={(values) => {
                const selected = values.find((value) => Number.isFinite(value))
                if (selected !== undefined) onSetIdleTolerancePct(selected)
              }}
            />
          </div>
          <div>
            <Label>Tolerância: {estimationTolerancePct}%</Label>
            <Slider
              value={[estimationTolerancePct]}
              max={100}
              onValueChange={(values) => {
                const selected = values.find((value) => Number.isFinite(value))
                if (selected !== undefined)
                  onSetEstimationTolerancePct(selected)
              }}
            />
          </div>
        </div>
      )}
      {content}
      {summaryInput !== undefined && summary.loading && (
        <p role="status" className="text-muted-foreground text-xs">
          Calculando referência…
        </p>
      )}
      {summary.error !== undefined && (
        <div className="space-y-2">
          <AnalyticsError message={summary.error} details={summary.details} />
          <Button variant="outline" size="sm" onClick={summary.retry}>
            Tentar referência novamente
          </Button>
        </div>
      )}
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span>
          {data.totalRows} grupos · {data.coverage} · {data.loadedAt}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={data.offset === 0}
            onClick={() => setPage({ signature, offset: 0 })}
          >
            Início
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!data.hasMore}
            onClick={() =>
              setPage({
                signature,
                offset: data.offset + data.limit,
                version: data.version,
              })
            }
          >
            Próxima página
          </Button>
        </div>
      </div>
    </div>
  )
}
