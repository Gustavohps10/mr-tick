import type { AnalyticsQueryResult } from '@mr-tick/application'

import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { ReferenceLineMode, WidgetId } from '../lib/analytics-types'
import { chartInputRequirements } from '../lib/chart-input'
import { AnalyticsChartContent } from './analytics-chart-content'

export interface ChartRealPreviewInput {
  data: Pick<AnalyticsQueryResult, 'columns' | 'rows' | 'groupingColumn'>
  category: string
  metric: string
  secondaryMetric: string
  series: string[]
  stacked: boolean
  hierarchyColumns?: string[]
  rowCount: number
}

export function ChartModelExample({
  visual,
  referenceMode,
  target,
  realData,
  realEmptyMessage,
}: {
  visual: WidgetId
  referenceMode: ReferenceLineMode
  target: number
  realData?: ChartRealPreviewInput
  realEmptyMessage?: string
}) {
  const requirements = chartInputRequirements(visual)
  const data: Pick<
    AnalyticsQueryResult,
    'columns' | 'rows' | 'groupingColumn'
  > = {
    columns: [
      { name: 'category', label: 'Período', type: 'string' },
      { name: 'value', label: 'Realizado', type: 'number' },
    ],
    rows: [
      { category: 'Jan', value: 24 },
      { category: 'Fev', value: 37 },
      { category: 'Mar', value: 29 },
      { category: 'Abr', value: 43 },
    ],
  }
  const series = ['value']
  if (requirements.secondary || requirements.series) {
    data.columns.push({
      name: 'comparison',
      label: 'Planejado',
      type: 'number',
    })
    data.rows = data.rows.map((row, index) => ({
      ...row,
      comparison: 30 + index * 2,
    }))
    series.push('comparison')
  }

  if (visual === 'kpi_card') data.rows = [{ value: 133 }]
  if (visual === 'conditional_table') {
    data.columns.push({ name: 'ratio', label: '% da meta', type: 'number' })
    data.rows = data.rows.map((row, index) => ({
      ...row,
      ratio: Math.round((Number(row.value) / (30 + index * 2)) * 100),
    }))
  }

  if (visual === 'pivot_matrix') {
    data.columns.push({ name: 'total', label: 'Total', type: 'number' })
    data.rows = data.rows.map((row) => ({
      ...row,
      total: Number(row.value) + Number(row.comparison),
    }))
  }

  if (requirements.hierarchy) {
    data.groupingColumn = 'grouping'
    data.rows = [
      { category: 'Projeto A', value: 61, grouping: 0 },
      { category: 'Projeto B', value: 72, grouping: 0 },
      { category: null, value: 133, grouping: 1 },
    ]
  }

  let reference: number | undefined
  if (referenceMode === 'fixed_target') reference = target
  if (referenceMode === 'average') reference = 33.25
  if (referenceMode === 'weighted_ratio') reference = 1.01
  if (visual === 'line_reference' && reference === undefined) reference = 35

  let emptyText =
    'Selecione uma entrada com dados carregados e mapeie as colunas para visualizar com dados reais.'

  if (realEmptyMessage !== undefined) emptyText = realEmptyMessage

  return (
    <section
      aria-label="Prévia da visualização"
      className="bg-card flex min-w-0 flex-col gap-3 rounded-lg border p-4"
    >
      <Tabs defaultValue="fake" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Prévia da visualização</h3>
          <TabsList className="h-8">
            <TabsTrigger value="fake" className="text-xs">
              Dados fictícios
            </TabsTrigger>
            <TabsTrigger value="real" className="gap-1.5 text-xs">
              Dados reais
              {realData !== undefined && (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {realData.rowCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fake" className="mt-0">
          <AnalyticsChartContent
            data={data}
            visual={visual}
            category="category"
            metric="value"
            secondaryMetric="comparison"
            series={series}
            stacked={requirements.series}
            hierarchyColumns={['category']}
            reference={reference}
            ratio="ratio"
            overloadTolerancePct={15}
            idleTolerancePct={15}
            estimationTolerancePct={10}
          />
        </TabsContent>

        <TabsContent value="real" className="mt-0">
          {realData === undefined && (
            <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-xs">
              {emptyText}
            </div>
          )}
          {realData !== undefined && (
            <AnalyticsChartContent
              data={realData.data}
              visual={visual}
              category={realData.category}
              metric={realData.metric}
              secondaryMetric={realData.secondaryMetric}
              series={realData.series}
              stacked={realData.stacked}
              hierarchyColumns={realData.hierarchyColumns}
              reference={reference}
              ratio="ratio"
              overloadTolerancePct={15}
              idleTolerancePct={15}
              estimationTolerancePct={10}
            />
          )}
        </TabsContent>
      </Tabs>
    </section>
  )
}
