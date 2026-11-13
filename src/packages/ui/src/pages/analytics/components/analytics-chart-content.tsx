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

import type { WidgetId } from '../lib/analytics-types'
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
  hierarchyColumns?: string[]
  reference?: number
  ratio: string
  overloadTolerancePct: number
  idleTolerancePct: number
  estimationTolerancePct: number
  clickRow?: (row: AnalyticsDatasetRow) => void
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

  let tableData = data
  if (sideTableData !== undefined) tableData = sideTableData

  const table = (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {tableData.columns.map((column) => (
              <TableHead key={column.name}>{column.label}</TableHead>
            ))}
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
          stackId={stackId}
        >
          {data.rows.map((row, rowIndex) => (
            <Cell key={rowIndex} onClick={clickRow && (() => clickRow(row))} />
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

  return content
}
