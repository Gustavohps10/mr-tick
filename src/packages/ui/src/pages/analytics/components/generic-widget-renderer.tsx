import type {
  AnalyticsAggregationOperator,
  AnalyticsColumnSchema,
  AnalyticsDatasetRow,
  AnalyticsPlanNode,
  AnalyticsQueryInput,
} from '@mr-tick/application'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'

import { useAnalyticsQuery } from '../hooks/use-analytics-query'
import type {
  AnalyticsLoadProgressEvent,
  AnalyticsSpaceConfig,
  AnalyticsUpstreamSourceStatus,
  SpaceWidgetConfig,
  SpaceWorkflowNodeConfig,
} from '../lib/analytics-types'
import { AnalyticsChartContent } from './analytics-chart-content'
import { AnalyticsError } from './analytics-error'

function formatBatchProgressLabel(
  progress: AnalyticsLoadProgressEvent | undefined,
): string {
  if (progress === undefined) return 'Carregando base analítica...'

  if (progress.phase === 'publishing')
    return `Publicando base analítica (${progress.fetchedRows} registros)...`

  if (progress.totalRows !== undefined)
    return `Carregando lote ${progress.batchIndex + 1} • ${progress.fetchedRows} de ${progress.totalRows} registros`

  return `Carregando lote ${progress.batchIndex + 1} • ${progress.fetchedRows} registros carregados`
}

function WidgetFeedback({
  loadingLabel,
  warnings,
}: {
  loadingLabel?: string
  warnings?: ReactNode
}) {
  return (
    <div className="relative flex h-8 min-w-0 items-center justify-between gap-2">
      <div role="status" className="text-muted-foreground min-w-0 text-xs">
        {loadingLabel !== undefined && (
          <span className="flex items-center gap-1.5">
            <LoaderCircle
              aria-hidden
              className="text-primary size-3.5 shrink-0 motion-safe:animate-spin"
            />
            <span className="truncate" title={loadingLabel}>
              {loadingLabel}
            </span>
          </span>
        )}
      </div>
      {loadingLabel !== undefined && (
        <div
          aria-hidden
          className="bg-primary/60 pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-full motion-safe:animate-pulse"
        />
      )}
      {warnings !== undefined && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive size-7 shrink-0"
              aria-label="Ver avisos do gráfico"
              title="Ver avisos do gráfico"
            >
              <CircleAlert />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            aria-label="Avisos do gráfico"
            className="flex max-h-[min(60vh,24rem)] w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto"
          >
            {warnings}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

function WidgetUnavailable({
  message,
  details,
  retry,
}: {
  message: string
  details: Record<string, string[]> | undefined
  retry: () => void
}) {
  return (
    <div>
      <WidgetFeedback />
      <div className="min-h-64 py-2">
        <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-2 rounded-md border p-2.5 break-words">
          <AnalyticsError message={message} details={details} />
          <Button variant="outline" size="sm" onClick={retry}>
            Tentar novamente
          </Button>
        </div>
      </div>
    </div>
  )
}

function WidgetLoading({ label }: { label: string }) {
  return (
    <div>
      <WidgetFeedback loadingLabel={label} />
      <Skeleton aria-hidden className="h-64 w-full rounded-md" />
    </div>
  )
}

export interface GenericWidgetRendererProps {
  onUnauthorized: (connectionIds: string[], message: string) => void
  warehousePlan: AnalyticsPlanNode[]
  publicationVersion: string
  widget: SpaceWidgetConfig
  activeSpace: AnalyticsSpaceConfig
  upstreamStatus?: AnalyticsUpstreamSourceStatus
  onRetrySource?: () => void
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
  upstreamStatus,
  onRetrySource,
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
  const sourceReadyInPlan =
    node !== undefined && warehousePlan.some((item) => item.id === node.id)
  const canQuerySource =
    workspaceId !== undefined &&
    node !== undefined &&
    sourceReadyInPlan &&
    (upstreamStatus === undefined || upstreamStatus.hasPublication)

  let baseInput: AnalyticsQueryInput | undefined
  if (canQuerySource && workspaceId !== undefined && node !== undefined)
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
  let visual = widget.widgetType
  if (widget.chartVisualType !== undefined) visual = widget.chartVisualType

  const isTable =
    visual === 'pivot_matrix' ||
    visual === 'tree_grid' ||
    visual === 'conditional_table'
  const hasSideTable = visual === 'split_pane_chart'

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
  let sideTableInput: AnalyticsQueryInput | undefined
  if (input !== undefined && page.signature === signature && page.offset > 0) {
    const pagedInput = { ...input, offset: page.offset, version: page.version }
    if (isTable) input = pagedInput
    if (hasSideTable) sideTableInput = pagedInput
  }

  const result = useAnalyticsQuery(input, publicationVersion, onUnauthorized)
  const sideTable = useAnalyticsQuery(
    sideTableInput,
    publicationVersion,
    onUnauthorized,
  )
  const summary = useAnalyticsQuery(
    summaryInput,
    publicationVersion,
    onUnauthorized,
  )

  let retrySourceAction = base.retry
  if (onRetrySource !== undefined) retrySourceAction = onRetrySource

  if (upstreamStatus !== undefined && !upstreamStatus.hasPublication) {
    if (upstreamStatus.isInitialLoading)
      return (
        <WidgetLoading
          label={formatBatchProgressLabel(upstreamStatus.progress)}
        />
      )

    if (upstreamStatus.error !== undefined)
      return (
        <WidgetUnavailable
          message={upstreamStatus.error}
          details={upstreamStatus.errorDetails}
          retry={retrySourceAction}
        />
      )

    if (!sourceReadyInPlan)
      return (
        <WidgetLoading
          label={formatBatchProgressLabel(upstreamStatus.progress)}
        />
      )
  }

  if (base.loading || result.loading)
    return <WidgetLoading label="Carregando gráfico…" />

  if (base.error !== undefined && base.data === undefined)
    return (
      <WidgetUnavailable
        message={base.error}
        details={base.details}
        retry={base.retry}
      />
    )

  if (result.error !== undefined && result.data === undefined)
    return (
      <WidgetUnavailable
        message={result.error}
        details={result.details}
        retry={result.retry}
      />
    )

  if (node === undefined || result.data === undefined)
    return <p>Selecione a fonte, a dimensão e a métrica da visualização.</p>

  const data = result.data

  let refreshErrorMessage: string | undefined
  let refreshErrorDetails: Record<string, string[]> | undefined
  let refreshRetryAction = result.retry

  if (upstreamStatus?.error !== undefined) {
    refreshErrorMessage = upstreamStatus.error
    refreshErrorDetails = upstreamStatus.errorDetails
    refreshRetryAction = retrySourceAction
  }

  if (refreshErrorMessage === undefined && result.error !== undefined) {
    refreshErrorMessage = result.error
    refreshErrorDetails = result.details
    refreshRetryAction = result.retry
  }

  if (refreshErrorMessage === undefined && base.error !== undefined) {
    refreshErrorMessage = base.error
    refreshErrorDetails = base.details
    refreshRetryAction = base.retry
  }

  let loadingLabel: string | undefined
  if (summaryInput !== undefined && (summary.loading || summary.isRefreshing))
    loadingLabel = 'Calculando referência…'
  if (upstreamStatus?.isRefreshing || base.isRefreshing || result.isRefreshing)
    loadingLabel = 'Atualizando em segundo plano...'
  if (upstreamStatus?.isRefreshing && upstreamStatus.progress !== undefined)
    loadingLabel = formatBatchProgressLabel(upstreamStatus.progress)

  let warnings: ReactNode = undefined
  if (refreshErrorMessage !== undefined || summary.error !== undefined)
    warnings = (
      <>
        {refreshErrorMessage !== undefined && (
          <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-2 rounded-md border p-2.5 break-words">
            <AnalyticsError
              message={refreshErrorMessage}
              details={refreshErrorDetails}
            />
            <p className="text-muted-foreground text-xs">
              Exibindo última versão disponível em cache.
            </p>
            <Button variant="outline" size="sm" onClick={refreshRetryAction}>
              Tentar novamente
            </Button>
          </div>
        )}
        {summary.error !== undefined && (
          <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-2 rounded-md border p-2.5 break-words">
            <AnalyticsError message={summary.error} details={summary.details} />
            <Button variant="outline" size="sm" onClick={summary.retry}>
              Tentar referência novamente
            </Button>
          </div>
        )}
      </>
    )

  const feedback = (
    <WidgetFeedback loadingLabel={loadingLabel} warnings={warnings} />
  )

  if (data.rows.length === 0)
    return (
      <div>
        {feedback}
        <p className="min-h-64 py-2">Nenhum registro para esta seleção.</p>
      </div>
    )

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

  let tablePage = data
  if (sideTable.data !== undefined) tablePage = sideTable.data

  const pagination = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={tablePage.offset === 0 && sideTableInput === undefined}
        onClick={() => setPage({ signature, offset: 0 })}
      >
        Início
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={
          !tablePage.hasMore ||
          sideTable.loading ||
          sideTable.error !== undefined
        }
        onClick={() =>
          setPage({
            signature,
            offset: tablePage.offset + tablePage.limit,
            version: tablePage.version,
          })
        }
      >
        Próxima página
      </Button>
    </div>
  )

  let sideTableFooter: ReactNode = undefined
  if (hasSideTable)
    sideTableFooter = (
      <>
        {sideTable.loading && (
          <p role="status" className="text-xs">
            Carregando página da tabela…
          </p>
        )}
        {sideTable.error !== undefined && (
          <div className="flex flex-col items-start gap-2">
            <AnalyticsError
              message={sideTable.error}
              details={sideTable.details}
            />
            <Button variant="outline" size="sm" onClick={sideTable.retry}>
              Tentar página novamente
            </Button>
          </div>
        )}
        {pagination}
      </>
    )

  return (
    <div className="space-y-3">
      {feedback}

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
      <AnalyticsChartContent
        data={data}
        sideTableData={sideTable.data}
        sideTableFooter={sideTableFooter}
        visual={visual}
        category={category}
        metric={metric}
        secondaryMetric={secondaryMetric}
        series={series}
        stacked={visual === 'bar_stacked' || input?.pivot !== undefined}
        hierarchyColumns={widget.hierarchyColumns}
        reference={reference}
        ratio={ratio}
        overloadTolerancePct={overloadTolerancePct}
        idleTolerancePct={idleTolerancePct}
        estimationTolerancePct={estimationTolerancePct}
        clickRow={clickRow}
      />
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span>
          {!isTable && data.hasMore && (
            <>Gráfico exibe os primeiros {data.rows.length} de </>
          )}
          {data.totalRows} grupos · {data.coverage} · {data.loadedAt}
        </span>
        {isTable && pagination}
      </div>
    </div>
  )
}
