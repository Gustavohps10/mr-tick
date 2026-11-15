import type {
  AnalyticsDatasetRow,
  AnalyticsQueryResult,
} from '@mr-tick/application'
import type { ReactNode } from 'react'
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

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  formatMetricValue,
  humanizeColumnLabel,
  resolveDefaultTooltipFields,
  transformRowsToPercentage,
} from '../lib/analytics-chart-options'
import type {
  AnalyticsTooltipField,
  AnalyticsValueDisplayMode,
  WidgetId,
} from '../lib/analytics-types'
import { getPaletteColor } from '../lib/analytics-utils'
import { AnalyticsHierarchyTable } from './analytics-hierarchy-table'

interface AnalyticsChartContentProps {
  data: Pick<AnalyticsQueryResult, 'columns' | 'rows' | 'groupingColumn'>
  sideTableData?: Pick<AnalyticsQueryResult, 'columns' | 'rows'>
  sideTableFooter?: ReactNode
  visual: WidgetId
  category: string
  metric: string
  secondaryMetric: string
  series: string[]
  stacked: boolean
  showAllRows?: boolean
  categoryLabel?: string
  metricLabel?: string
  secondaryMetricLabel?: string
  metricColumnName?: string
  secondaryMetricColumnName?: string
  valueDisplayMode?: AnalyticsValueDisplayMode
  tooltipEnabled?: boolean
  tooltipFields?: AnalyticsTooltipField[]
  hierarchyColumns?: string[]
  reference?: number
  ratio: string
  overloadTolerancePct: number
  idleTolerancePct: number
  estimationTolerancePct: number
  clickRow?: (row: AnalyticsDatasetRow) => void
}

interface TooltipPayloadEntry {
  name?: string
  dataKey?: string | number
  value?: number | string
  color?: string
}

interface CustomTooltipContentProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string | number
  fields: AnalyticsTooltipField[]
  isPercentage: boolean
  isStacked: boolean
  primaryKey: string
  secondaryKey: string
  resolveLabel: (name: string) => string
  categoryLabelText: string
  grandTotal: number
}

function CustomChartTooltip({
  active,
  payload,
  label,
  fields,
  isPercentage,
  isStacked,
  primaryKey,
  secondaryKey,
  resolveLabel,
  categoryLabelText,
  grandTotal,
}: CustomTooltipContentProps) {
  if (!active || payload === undefined || payload.length === 0) return null

  const showCategory = fields.includes('category')
  const showSeries = fields.includes('series')
  const showPrimary = fields.includes('primary')
  const showSecondary = fields.includes('secondary')
  const showPercentage = fields.includes('percentage')
  const showTotal = fields.includes('total')

  let rowTotal = 0
  const numericEntries: { label: string; color: string; val: number }[] = []

  for (const item of payload) {
    const rawKey = String(item.dataKey)
    const numericVal = Number(item.value)
    if (!Number.isFinite(numericVal)) continue

    rowTotal += numericVal

    const shouldInclude =
      (isStacked && showSeries) ||
      (!isStacked && rawKey === primaryKey && showPrimary) ||
      (!isStacked && rawKey === secondaryKey && showSecondary) ||
      (!isStacked &&
        rawKey !== primaryKey &&
        rawKey !== secondaryKey &&
        showSeries)

    if (!shouldInclude) continue

    let entryColor = 'var(--chart-1)'
    if (item.color !== undefined && item.color !== '') entryColor = item.color

    let entryLabel = resolveLabel(rawKey)
    if (item.name !== undefined && item.name !== '' && item.name !== rawKey) {
      entryLabel = item.name
    }

    numericEntries.push({
      label: entryLabel,
      color: entryColor,
      val: numericVal,
    })
  }

  let displayCategory = ''
  if (label !== undefined && String(label) !== '') {
    displayCategory = String(label)
  }

  const firstPayloadItem = payload.find(() => true)
  if (displayCategory === '' && firstPayloadItem?.name !== undefined) {
    displayCategory = firstPayloadItem.name
  }

  return (
    <div className="border-border bg-popover text-popover-foreground min-w-[160px] rounded-md border px-2.5 py-2 text-xs shadow-md">
      {showCategory && displayCategory !== '' && (
        <div className="border-border/60 mb-1.5 border-b pb-1 font-semibold">
          {categoryLabelText !== '' && (
            <span className="text-muted-foreground mr-1 font-normal">
              {categoryLabelText}:
            </span>
          )}
          <span>{displayCategory}</span>
        </div>
      )}

      <div className="space-y-1">
        {numericEntries.map((entry, idx) => {
          let pctDenominator = grandTotal
          if (isStacked || numericEntries.length > 1) pctDenominator = rowTotal

          let pctText = ''
          if (showPercentage && pctDenominator > 0) {
            let pctValue = (entry.val / pctDenominator) * 100
            if (isPercentage) pctValue = entry.val
            pctText = ` (${formatMetricValue(pctValue, true)})`
          }

          return (
            <div
              key={`${entry.label}-${idx}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-xs"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground">{entry.label}</span>
              </div>
              <span className="font-mono font-medium">
                {formatMetricValue(entry.val, isPercentage)}
                {pctText}
              </span>
            </div>
          )
        })}
      </div>

      {showTotal && numericEntries.length > 1 && (
        <div className="border-border/60 mt-1.5 flex items-center justify-between gap-3 border-t pt-1 font-semibold">
          <span>Total</span>
          <span className="font-mono">
            {formatMetricValue(rowTotal, isPercentage)}
          </span>
        </div>
      )}
    </div>
  )
}

export function AnalyticsChartContent({
  data,
  sideTableData,
  sideTableFooter,
  visual,
  category,
  metric,
  secondaryMetric,
  series,
  stacked,
  showAllRows,
  categoryLabel,
  metricLabel,
  secondaryMetricLabel,
  metricColumnName,
  secondaryMetricColumnName,
  valueDisplayMode,
  tooltipEnabled,
  tooltipFields,
  hierarchyColumns,
  reference,
  ratio,
  overloadTolerancePct,
  idleTolerancePct,
  estimationTolerancePct,
  clickRow,
}: AnalyticsChartContentProps) {
  let stackId: string | undefined
  if (stacked) stackId = 'stack'

  const isPercentageMode = valueDisplayMode === 'percentage'
  const isTooltipActive = tooltipEnabled !== false
  const hasSecondary =
    secondaryMetric !== '' && series.includes(secondaryMetric)
  let effectiveTooltipFields = resolveDefaultTooltipFields(
    visual,
    hasSecondary,
    stacked,
  )
  if (tooltipFields !== undefined) effectiveTooltipFields = tooltipFields

  const resolveSeriesLabel = (name: string) => {
    if (name === metric) {
      if (metricLabel !== undefined && metricLabel !== '') return metricLabel
      if (metricColumnName !== undefined && metricColumnName !== '')
        return humanizeColumnLabel(metricColumnName)
      return 'Métrica'
    }

    if (name === secondaryMetric) {
      if (secondaryMetricLabel !== undefined && secondaryMetricLabel !== '')
        return secondaryMetricLabel
      if (
        secondaryMetricColumnName !== undefined &&
        secondaryMetricColumnName !== ''
      )
        return humanizeColumnLabel(secondaryMetricColumnName)
      return '2ª Métrica'
    }

    const columnMeta = data.columns.find((col) => col.name === name)
    if (columnMeta !== undefined && columnMeta.label !== '')
      return columnMeta.label

    return humanizeColumnLabel(name)
  }

  let chartRows = data.rows
  if (isPercentageMode) {
    chartRows = transformRowsToPercentage(
      data.rows,
      series,
      stacked || visual === 'pie_donut',
    )
  }

  let grandTotal = 0
  for (const row of chartRows) {
    for (const s of series) {
      const val = row[s]
      if (typeof val === 'number' && Number.isFinite(val)) {
        grandTotal += Math.abs(val)
      }
    }
  }

  const rowStyle = (row: AnalyticsDatasetRow) => {
    if (visual !== 'conditional_table') return undefined
    const value = row[ratio]
    if (typeof value !== 'number') return undefined
    if (value > 100 + overloadTolerancePct)
      return {
        backgroundColor: 'color-mix(in srgb, var(--chart-5) 15%, transparent)',
      }
    if (value < 100 - idleTolerancePct)
      return {
        backgroundColor: 'color-mix(in srgb, var(--chart-4) 15%, transparent)',
      }
    if (Math.abs(value - 100) <= estimationTolerancePct)
      return {
        backgroundColor: 'color-mix(in srgb, var(--chart-3) 12%, transparent)',
      }
    return undefined
  }

  let tableData = data
  if (sideTableData !== undefined) tableData = sideTableData

  const table = (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {tableData.columns.map((column) => {
              let headLabel = column.label
              if (
                column.name === category &&
                categoryLabel !== undefined &&
                categoryLabel !== ''
              ) {
                headLabel = categoryLabel
              }
              if (
                column.name === metric &&
                metricLabel !== undefined &&
                metricLabel !== ''
              ) {
                headLabel = metricLabel
              }
              if (
                column.name === secondaryMetric &&
                secondaryMetricLabel !== undefined &&
                secondaryMetricLabel !== ''
              ) {
                headLabel = secondaryMetricLabel
              }

              return <TableHead key={column.name}>{headLabel}</TableHead>
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableData.rows.map((row, index) => (
            <TableRow
              key={index}
              style={rowStyle(row)}
              onClick={clickRow && (() => clickRow(row))}
            >
              {tableData.columns.map((column) => (
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
  let catLabelText = ''
  if (categoryLabel !== undefined && categoryLabel !== '') {
    catLabelText = categoryLabel
  }

  let tooltipNode: ReactNode = undefined
  if (isTooltipActive) {
    tooltipNode = (
      <Tooltip
        content={(tooltipProps) => {
          const entries: TooltipPayloadEntry[] = []
          if (Array.isArray(tooltipProps.payload)) {
            for (const rawItem of tooltipProps.payload) {
              entries.push({
                name:
                  rawItem.name !== undefined ? String(rawItem.name) : undefined,
                dataKey: rawItem.dataKey,
                value:
                  typeof rawItem.value === 'number' ||
                  typeof rawItem.value === 'string'
                    ? rawItem.value
                    : undefined,
                color: rawItem.color,
              })
            }
          }

          return (
            <CustomChartTooltip
              active={tooltipProps.active}
              payload={entries}
              label={tooltipProps.label}
              fields={effectiveTooltipFields}
              isPercentage={isPercentageMode}
              isStacked={stacked}
              primaryKey={metric}
              secondaryKey={secondaryMetric}
              resolveLabel={resolveSeriesLabel}
              categoryLabelText={catLabelText}
              grandTotal={grandTotal}
            />
          )
        }}
      />
    )
  }

  const formatAxisTick = (val: number | string) => {
    const num = Number(val)
    if (!Number.isFinite(num)) return String(val)
    return formatMetricValue(num, isPercentageMode)
  }

  let axisTickFormatter: ((val: number | string) => string) | undefined =
    undefined
  if (isPercentageMode) axisTickFormatter = formatAxisTick

  const isTable =
    visual === 'pivot_matrix' ||
    visual === 'tree_grid' ||
    visual === 'conditional_table'
  const isHorizontalBar =
    visual === 'bar_horizontal' || visual === 'bar_horizontal_stacked'
  const isVerticallyScrollable =
    (showAllRows === true || chartRows.length > 10) &&
    isHorizontalBar &&
    chartRows.length > 8
  const isHorizontallyScrollable =
    (showAllRows === true || chartRows.length > 10) &&
    !isHorizontalBar &&
    !isTable &&
    visual !== 'pie_donut' &&
    visual !== 'radar' &&
    visual !== 'kpi_card' &&
    chartRows.length > 10

  const measureKeys =
    visual === 'combo_multiaxis' ? [metric, secondaryMetric] : series

  let maxMeasureValue = 0
  for (const row of chartRows) {
    let stackedRowTotal = 0
    for (const key of measureKeys) {
      const numVal = Number(row[key])
      if (!Number.isFinite(numVal)) continue
      if (stacked && visual !== 'combo_multiaxis') {
        stackedRowTotal += Math.max(0, numVal)
      }
      if (!stacked || visual === 'combo_multiaxis') {
        if (numVal > maxMeasureValue) maxMeasureValue = numVal
      }
    }
    if (stacked && visual !== 'combo_multiaxis') {
      if (stackedRowTotal > maxMeasureValue) maxMeasureValue = stackedRowTotal
    }
  }
  if (reference !== undefined && reference > maxMeasureValue) {
    maxMeasureValue = reference
  }
  let measureDomainMax = 1
  if (maxMeasureValue > 0) measureDomainMax = Math.ceil(maxMeasureValue)

  let scrollableDomain: [number, number] | undefined = undefined
  if (isHorizontallyScrollable || isVerticallyScrollable) {
    scrollableDomain = [0, measureDomainMax]
  }

  let xAxisLabelConfig:
    { value: string; position: 'insideBottom'; offset: number } | undefined =
    undefined
  if (categoryLabel !== undefined && categoryLabel !== '') {
    xAxisLabelConfig = {
      value: categoryLabel,
      position: 'insideBottom',
      offset: -4,
    }
  }

  const shouldRotateXAxis = chartRows.length > 5
  let xAxisAngle = 0
  let xAxisTextAnchor: 'end' | 'middle' = 'middle'
  let xAxisHeight = 32
  if (shouldRotateXAxis) {
    xAxisAngle = -35
    xAxisTextAnchor = 'end'
    xAxisHeight = 88
  }
  const verticalChartMargin = { top: 8, right: 16, left: 16, bottom: 8 }
  const horizontalChartMargin = { top: 4, right: 16, left: 8, bottom: 4 }

  const axes: ReactNode[] = [
    <CartesianGrid key="cartesian-grid" strokeDasharray="3 3" />,
    <XAxis
      key="cartesian-xaxis"
      dataKey={category}
      interval={0}
      angle={xAxisAngle}
      textAnchor={xAxisTextAnchor}
      height={xAxisHeight}
      tick={{ fontSize: 11 }}
      label={xAxisLabelConfig}
    />,
    <YAxis
      key="cartesian-yaxis"
      hide={isHorizontallyScrollable}
      domain={scrollableDomain}
      tickFormatter={axisTickFormatter}
    />,
  ]
  if (tooltipNode !== null) {
    axes.push(
      <Tooltip
        key="cartesian-tooltip"
        content={(tooltipProps) => {
          const entries: Array<{
            dataKey?: string | number
            name?: string
            value?: number | string
            color?: string
          }> = []
          if (tooltipProps.payload !== undefined) {
            for (const rawItem of tooltipProps.payload) {
              entries.push({
                dataKey: rawItem.dataKey,
                name:
                  typeof rawItem.name === 'string' ? rawItem.name : undefined,
                value:
                  typeof rawItem.value === 'number' ||
                  typeof rawItem.value === 'string'
                    ? rawItem.value
                    : undefined,
                color: rawItem.color,
              })
            }
          }

          return (
            <CustomChartTooltip
              active={tooltipProps.active}
              payload={entries}
              label={tooltipProps.label}
              fields={effectiveTooltipFields}
              isPercentage={isPercentageMode}
              isStacked={stacked}
              primaryKey={metric}
              secondaryKey={secondaryMetric}
              resolveLabel={resolveSeriesLabel}
              categoryLabelText={catLabelText}
              grandTotal={grandTotal}
            />
          )
        }}
      />,
    )
  }
  if (!isHorizontallyScrollable) {
    axes.push(<Legend key="cartesian-legend" />)
  }
  if (reference !== undefined) {
    axes.push(
      <ReferenceLine
        key="cartesian-reference"
        y={reference}
        stroke="var(--destructive)"
      />,
    )
  }
  let chart = (
    <BarChart data={chartRows} margin={verticalChartMargin}>
      {axes}
      {series.map((name, index) => (
        <Bar
          key={name}
          dataKey={name}
          name={resolveSeriesLabel(name)}
          fill={getPaletteColor(index)}
          stackId={stackId}
          isAnimationActive={false}
        >
          {chartRows.map((row, rowIndex) => (
            <Cell
              key={rowIndex}
              fill={getPaletteColor(index)}
              onClick={clickRow && (() => clickRow(row))}
            />
          ))}
        </Bar>
      ))}
    </BarChart>
  )
  if (visual === 'bar_horizontal' || visual === 'bar_horizontal_stacked')
    chart = (
      <BarChart
        data={chartRows}
        layout="vertical"
        margin={horizontalChartMargin}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          hide={isVerticallyScrollable}
          domain={scrollableDomain}
          tickFormatter={axisTickFormatter}
        />
        <YAxis
          type="category"
          dataKey={category}
          width={170}
          interval={0}
          tick={{ fontSize: 11 }}
        />
        {tooltipNode}
        {!isVerticallyScrollable && <Legend />}
        {reference !== undefined && (
          <ReferenceLine x={reference} stroke="var(--destructive)" />
        )}
        {series.map((name, index) => (
          <Bar
            key={name}
            dataKey={name}
            name={resolveSeriesLabel(name)}
            fill={getPaletteColor(index)}
            stackId={stackId}
            isAnimationActive={false}
          >
            {chartRows.map((row, rowIndex) => (
              <Cell
                key={rowIndex}
                fill={getPaletteColor(index)}
                onClick={clickRow && (() => clickRow(row))}
              />
            ))}
          </Bar>
        ))}
      </BarChart>
    )
  if (visual === 'line' || visual === 'line_reference')
    chart = (
      <LineChart data={chartRows} margin={verticalChartMargin}>
        {axes}
        {series.map((name, index) => (
          <Line
            key={name}
            dataKey={name}
            name={resolveSeriesLabel(name)}
            stroke={getPaletteColor(index)}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    )
  if (visual === 'area' || visual === 'area_stacked')
    chart = (
      <AreaChart data={chartRows} margin={verticalChartMargin}>
        {axes}
        {series.map((name, index) => (
          <Area
            key={name}
            dataKey={name}
            name={resolveSeriesLabel(name)}
            stroke={getPaletteColor(index)}
            fill={getPaletteColor(index)}
            stackId={visual === 'area_stacked' ? 'stack' : undefined}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    )
  if (visual === 'combo_multiaxis')
    chart = (
      <ComposedChart data={chartRows} margin={verticalChartMargin}>
        {axes}
        <Bar
          dataKey={metric}
          name={resolveSeriesLabel(metric)}
          fill={getPaletteColor(0)}
          isAnimationActive={false}
        />
        <Line
          dataKey={secondaryMetric}
          name={resolveSeriesLabel(secondaryMetric)}
          stroke={getPaletteColor(1)}
          isAnimationActive={false}
        />
      </ComposedChart>
    )
  if (visual === 'pie_donut')
    chart = (
      <PieChart>
        {tooltipNode}
        <Legend />
        <Pie
          data={chartRows}
          dataKey={metric}
          nameKey={category}
          innerRadius="45%"
          outerRadius="80%"
          paddingAngle={2}
          stroke="transparent"
          isAnimationActive={false}
        >
          {chartRows.map((row, rowIndex) => (
            <Cell
              key={rowIndex}
              fill={getPaletteColor(rowIndex)}
              stroke="transparent"
              onClick={clickRow && (() => clickRow(row))}
            />
          ))}
        </Pie>
      </PieChart>
    )
  if (visual === 'radar')
    chart = (
      <RadarChart data={chartRows}>
        <PolarGrid />
        <PolarAngleAxis dataKey={category} />
        {tooltipNode}
        {series.map((name, index) => (
          <Radar
            key={name}
            dataKey={name}
            name={resolveSeriesLabel(name)}
            stroke={getPaletteColor(index)}
            fill={getPaletteColor(index)}
            fillOpacity={0.2}
            isAnimationActive={false}
          />
        ))}
      </RadarChart>
    )
  let fixedLegendItems = series.map((name, index) => ({
    key: name,
    label: resolveSeriesLabel(name),
    color: getPaletteColor(index),
  }))
  if (visual === 'combo_multiaxis') {
    fixedLegendItems = [
      {
        key: metric,
        label: resolveSeriesLabel(metric),
        color: getPaletteColor(0),
      },
      {
        key: secondaryMetric,
        label: resolveSeriesLabel(secondaryMetric),
        color: getPaletteColor(1),
      },
    ]
  }

  const fixedLegend = (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-xs">
      {fixedLegendItems.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.label}</span>
        </span>
      ))}
    </div>
  )

  let content = (
    <div className="h-72 min-w-0">
      <ResponsiveContainer width="100%" height="100%" debounce={120}>
        {chart}
      </ResponsiveContainer>
    </div>
  )

  if (isVerticallyScrollable) {
    const dynamicHeight = Math.max(288, chartRows.length * 32)
    content = (
      <div className="flex min-w-0 flex-col">
        <div className="max-h-[380px] min-w-0 overflow-y-auto pr-1">
          <div style={{ height: dynamicHeight, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%" debounce={120}>
              {chart}
            </ResponsiveContainer>
          </div>
        </div>
        <div className="h-7 min-w-0 pr-2">
          <ResponsiveContainer width="100%" height="100%" debounce={120}>
            <BarChart
              data={chartRows}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
            >
              <XAxis
                type="number"
                domain={[0, measureDomainMax]}
                tickFormatter={axisTickFormatter}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey={category}
                width={170}
                tick={false}
                axisLine={false}
                tickLine={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {fixedLegend}
      </div>
    )
  }

  if (isHorizontallyScrollable) {
    const dynamicWidth = Math.max(560, chartRows.length * 56)
    content = (
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-start">
          <div className="h-72 w-14 shrink-0">
            <ResponsiveContainer width="100%" height="100%" debounce={120}>
              <BarChart
                data={chartRows}
                margin={{ top: 8, right: 0, left: 0, bottom: 8 }}
              >
                <XAxis
                  dataKey={category}
                  height={xAxisHeight}
                  tick={false}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={52}
                  domain={[0, measureDomainMax]}
                  tickFormatter={axisTickFormatter}
                  tick={{ fontSize: 11 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="min-w-0 flex-1 overflow-x-auto pb-1">
            <div style={{ width: dynamicWidth, height: 288 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={120}>
                {chart}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        {fixedLegend}
      </div>
    )
  }
  if (isTable) content = table
  if (
    visual === 'tree_grid' &&
    hierarchyColumns !== undefined &&
    data.groupingColumn !== undefined
  )
    content = (
      <AnalyticsHierarchyTable data={data} hierarchy={hierarchyColumns} />
    )
  if (visual === 'split_pane_chart')
    content = (
      <div className="grid min-w-0 gap-3 lg:grid-cols-[7fr_3fr]">
        {content}
        <div className="flex min-w-0 flex-col gap-2">
          {table}
          {sideTableFooter}
        </div>
      </div>
    )
  if (visual === 'kpi_card')
    content = (
      <div className="p-6 text-3xl font-semibold tabular-nums">
        {data.rows.map((row, index) => {
          const rawValue = row[metric]
          let formatted = String(rawValue)
          if (typeof rawValue === 'number' && Number.isFinite(rawValue))
            formatted = new Intl.NumberFormat('pt-BR', {
              maximumFractionDigits: 2,
            }).format(rawValue)
          return (
            <div key={index} className="truncate">
              {formatted}
            </div>
          )
        })}
        {reference !== undefined && (
          <p className="text-muted-foreground text-sm">
            Referência:{' '}
            {new Intl.NumberFormat('pt-BR', {
              maximumFractionDigits: 2,
            }).format(reference)}
          </p>
        )}
      </div>
    )

  return (
    <div className="[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border min-w-0 [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden">
      {content}
    </div>
  )
}
