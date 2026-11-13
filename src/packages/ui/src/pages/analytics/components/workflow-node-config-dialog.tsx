import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetManifest,
  AnalyticsDatasetRow,
  AnalyticsExecutionRequest,
  AnalyticsFilterDefinition,
  AnalyticsFilterOption,
  AnalyticsFilterValue,
} from '@mr-tick/application'
import {
  ArrowRight,
  Code2,
  Columns,
  Database,
  Filter,
  Loader2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import {
  isRemoteAggregateUnsupportedVisual,
  isRemoteAggregateUpstream,
} from '../lib/analytics-plan'
import { type EtlTablePayload, readCellAsString } from '../lib/analytics-table'
import type {
  AddNodeTypeOption,
  ConnectionDisplayOption,
} from '../lib/analytics-types'
import {
  type AnalyticsSpaceConfig,
  GENERIC_CHART_MODELS,
  type ReferenceLineMode,
  type SpaceWorkflowNodeConfig,
  type WidgetId,
  type WidgetSpan,
} from '../lib/analytics-types'
import { chartInputIssues, chartInputRequirements } from '../lib/chart-input'
import { AnalyticsError } from './analytics-error'
import {
  ChartModelExample,
  type ChartRealPreviewInput,
} from './chart-model-example'
import { SourceExecutionControl } from './source-execution-control'

export interface WorkflowNodeConfigDialogProps {
  queryExecution: AnalyticsExecutionRequest | undefined
  onQueryExecutionChange: (value: AnalyticsExecutionRequest | undefined) => void
  open: boolean
  embedded?: boolean
  editingNodeId: string | null
  activeSpace: AnalyticsSpaceConfig
  selectedAddNodeType: AddNodeTypeOption
  newNodeLabel: string
  newNodeSelectedConnectionId: string
  newNodeDatasetId: string
  nodeSourceDatasets: AnalyticsDatasetManifest[]
  filterOptionsFailures: { source: string; message: string }[]
  isLoadingNodeDatasets: boolean
  nodeSelectedColumns: string[]
  newNodeWidgetType: WidgetId
  newNodeSpan: WidgetSpan
  outputSourceNodeId: string
  outputCategoryColumn: string
  outputMetricColumn: string
  outputSecondaryMetricColumn: string
  outputHierarchyColumns: string[]
  onSetOutputHierarchyColumns: (columns: string[]) => void
  outputStackColumn: string
  outputReferenceLineMode: ReferenceLineMode
  outputReferenceLineTarget: number
  connectionDisplayOptions: ConnectionDisplayOption[]
  upstreamAvailableColumns: AnalyticsColumnSchema[]
  transformPreviewError: string | undefined
  transformPreviewDetails: Record<string, string[]> | undefined
  transformPreviewBeforePayload: EtlTablePayload
  transformPreviewAfterPayload: EtlTablePayload
  txUpstreamNodeId: string
  sqlQueryText: string
  nodeFilterValues: Record<string, AnalyticsFilterValue>
  dynamicFilterOptions: Record<string, AnalyticsFilterOption[]>
  globalStartDate?: string
  globalEndDate?: string
  nodeCustomDateRange: { from?: string; to?: string } | undefined
  onSetNodeCustomDateRange: (
    range: { from?: string; to?: string } | undefined,
  ) => void
  onSetNodeFilterValue: (filterId: string, val: AnalyticsFilterValue) => void
  onOpenChange: (open: boolean) => void
  onChangeNodeLabel: (val: string) => void
  onSelectConnectionId: (val: string) => void
  onSelectDatasetId: (val: string) => void
  onToggleSelectedColumn: (colName: string, checked: boolean) => void
  onSelectAllColumns: (allColNames: string[]) => void
  onClearAllColumns: () => void
  onSelectWidgetType: (val: WidgetId) => void
  onSelectSpan: (val: WidgetSpan) => void
  onSetOutputSourceNodeId: (val: string) => void
  onSetOutputCategoryColumn: (val: string) => void
  onSetOutputMetricColumn: (val: string) => void
  onSetOutputSecondaryMetricColumn: (val: string) => void
  onSetOutputStackColumn: (val: string) => void
  onSetOutputReferenceLineMode: (val: ReferenceLineMode) => void
  onSetOutputReferenceLineTarget: (val: number) => void
  onSetTxUpstreamNodeId: (val: string) => void
  onSetSqlQueryText: (val: string) => void
  onSaveEditedNode: () => void
  onAddWorkflowNode: () => void
  resolveRowsForWorkflowNode?: (
    node: SpaceWorkflowNodeConfig,
  ) => EtlTablePayload
}

function buildRealChartPreview(params: {
  payload: EtlTablePayload
  visual: WidgetId
  categoryColumn: string
  metricColumn: string
  secondaryMetricColumn: string
  stackColumn: string
  hierarchyColumns: string[]
}): ChartRealPreviewInput | undefined {
  const { payload, visual } = params
  if (payload.rows.length === 0) return undefined

  const metricKey = params.metricColumn
  let resolvedMetric = metricKey
  if (resolvedMetric === '') resolvedMetric = '__count'

  const series: string[] = [resolvedMetric]
  if (params.secondaryMetricColumn !== '')
    series.push(params.secondaryMetricColumn)

  const columns: AnalyticsColumnSchema[] = [...payload.columns]
  if (
    resolvedMetric === '__count' &&
    !columns.some((col) => col.name === '__count')
  )
    columns.push({ name: '__count', label: 'Registros', type: 'number' })

  if (params.categoryColumn === '') {
    return {
      data: {
        columns,
        rows: payload.rows.slice(0, 12),
      },
      category: '',
      metric: resolvedMetric,
      secondaryMetric: params.secondaryMetricColumn,
      series,
      stacked: params.stackColumn !== '',
      hierarchyColumns: params.hierarchyColumns,
      rowCount: payload.rows.length,
    }
  }

  const grouped = new Map<
    string,
    { categoryValue: string; primarySum: number; secondarySum: number }
  >()

  for (const row of payload.rows) {
    const rawCat = row[params.categoryColumn]
    let catLabel = 'Sem valor'

    if (rawCat !== null && rawCat !== undefined && String(rawCat).trim() !== '')
      catLabel = String(rawCat)

    let entry = grouped.get(catLabel)

    if (entry === undefined) {
      entry = { categoryValue: catLabel, primarySum: 0, secondarySum: 0 }
      grouped.set(catLabel, entry)
    }

    if (metricKey === '') {
      entry.primarySum += 1
    }

    if (metricKey !== '') {
      const val = Number(row[metricKey])
      if (Number.isFinite(val)) entry.primarySum += val
    }

    if (params.secondaryMetricColumn !== '') {
      const secVal = Number(row[params.secondaryMetricColumn])
      if (Number.isFinite(secVal)) entry.secondarySum += secVal
    }
  }

  const aggregatedRows: AnalyticsDatasetRow[] = []

  for (const entry of grouped.values()) {
    if (aggregatedRows.length >= 12) break

    const nextRow: AnalyticsDatasetRow = {
      [params.categoryColumn]: entry.categoryValue,
      [resolvedMetric]: entry.primarySum,
    }

    if (params.secondaryMetricColumn !== '')
      nextRow[params.secondaryMetricColumn] = entry.secondarySum

    aggregatedRows.push(nextRow)
  }

  if (visual === 'kpi_card') {
    let totalPrimary = 0

    for (const entry of grouped.values()) {
      totalPrimary += entry.primarySum
    }

    return {
      data: {
        columns,
        rows: [{ [resolvedMetric]: totalPrimary }],
      },
      category: params.categoryColumn,
      metric: resolvedMetric,
      secondaryMetric: params.secondaryMetricColumn,
      series,
      stacked: false,
      hierarchyColumns: params.hierarchyColumns,
      rowCount: payload.rows.length,
    }
  }

  return {
    data: {
      columns,
      rows: aggregatedRows,
    },
    category: params.categoryColumn,
    metric: resolvedMetric,
    secondaryMetric: params.secondaryMetricColumn,
    series,
    stacked: params.stackColumn !== '',
    hierarchyColumns: params.hierarchyColumns,
    rowCount: payload.rows.length,
  }
}

function resolveFilterOptions(
  filterDef: AnalyticsFilterDefinition,
  dynamicOptions: Record<string, AnalyticsFilterOption[]>,
): AnalyticsFilterOption[] {
  if (filterDef.options && filterDef.options.length > 0)
    return filterDef.options

  if (filterDef.dynamicOptionsSource) {
    const dynamicList = dynamicOptions[filterDef.dynamicOptionsSource]
    if (dynamicList) return dynamicList
  }

  return []
}

function resolveMultiSelectValues(
  val: AnalyticsFilterValue | undefined,
): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val === 'string') return [val]
  return []
}

function resolveStringFilterValue(
  val: AnalyticsFilterValue | undefined,
): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  return ''
}

function resolveDateRangeFilterValue(val: AnalyticsFilterValue | undefined): {
  from: string
  to: string
} {
  if (!val) return { from: '', to: '' }

  if (typeof val === 'object' && !Array.isArray(val)) {
    let from = ''
    let to = ''

    if ('from' in val && typeof val.from === 'string') from = val.from
    if ('to' in val && typeof val.to === 'string') to = val.to
    return { from, to }
  }

  return { from: '', to: '' }
}

function formatColumnTypeLabel(type?: string): string {
  if (type === 'number') return 'Número'
  if (type === 'date') return 'Data'
  if (type === 'boolean') return 'Booleano'
  return 'Texto'
}

interface DynamicFilterFieldProps {
  filterDef: AnalyticsFilterDefinition
  nodeFilterValues: Record<string, AnalyticsFilterValue>
  onSetNodeFilterValue: (filterId: string, val: AnalyticsFilterValue) => void
  dynamicFilterOptions: Record<string, AnalyticsFilterOption[]>
}

function DynamicFilterField({
  filterDef,
  nodeFilterValues,
  onSetNodeFilterValue,
  dynamicFilterOptions,
}: DynamicFilterFieldProps) {
  const options = resolveFilterOptions(filterDef, dynamicFilterOptions)

  if (filterDef.type === 'multi_select') {
    const currentValues = resolveMultiSelectValues(
      nodeFilterValues[filterDef.id],
    )

    const handleValuesChange = (nextValues: string[]) => {
      onSetNodeFilterValue(filterDef.id, nextValues)
    }

    let badgeSuffix = 'selecionados'
    if (currentValues.length === 1) badgeSuffix = 'selecionado'

    return (
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">{filterDef.label}</Label>
          {currentValues.length > 0 && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {currentValues.length} {badgeSuffix}
            </Badge>
          )}
        </div>

        {Boolean(filterDef.description) && (
          <span className="text-muted-foreground text-[10px]">
            {filterDef.description}
          </span>
        )}

        <MultiSelectCombobox
          options={options}
          selectedValues={currentValues}
          onSelectedValuesChange={handleValuesChange}
          placeholder={`Todos os registros (${filterDef.label.toLowerCase()} sem restrição)`}
          searchPlaceholder={`Buscar ${filterDef.label.toLowerCase()} ou digite ID...`}
          allowCustomValues={true}
        />
      </div>
    )
  }

  if (filterDef.type === 'select') {
    const rawVal = resolveStringFilterValue(nodeFilterValues[filterDef.id])
    let currentVal = rawVal

    if (!currentVal && filterDef.id === 'project_id') currentVal = 'all'

    let selectOptions = [...options]

    if (filterDef.id === 'project_id') {
      const hasAll = selectOptions.some((opt) => opt.value === 'all')

      if (!hasAll) {
        selectOptions = [
          { value: 'all', label: 'Todos os projetos' },
          ...selectOptions,
        ]
      }
    }

    let projectSummaryLabel = currentVal
    if (currentVal === 'all') projectSummaryLabel = 'Todos os projetos'

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">{filterDef.label}</Label>
          {filterDef.id === 'project_id' && (
            <span className="text-muted-foreground font-mono text-[11px]">
              {projectSummaryLabel}
            </span>
          )}
        </div>

        {Boolean(filterDef.description) && (
          <span className="text-muted-foreground text-[10px]">
            {filterDef.description}
          </span>
        )}

        <Select
          value={currentVal}
          onValueChange={(val) => {
            onSetNodeFilterValue(filterDef.id, val)
          }}
        >
          <SelectTrigger className="w-full text-xs">
            <SelectValue placeholder={`Selecione ${filterDef.label}...`} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {selectOptions.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  className="py-1.5 text-xs"
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (filterDef.type === 'date_range') {
    const rawVal = nodeFilterValues[filterDef.id]
    const range = resolveDateRangeFilterValue(rawVal)
    const hasFilter = range.from !== '' || range.to !== ''

    let statusText = 'Sem restrição'
    if (hasFilter) {
      let fromLabel = '...'
      if (range.from !== '') fromLabel = range.from
      let toLabel = '...'
      if (range.to !== '') toLabel = range.to
      statusText = `${fromLabel} .. ${toLabel}`
    }

    return (
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-semibold">{filterDef.label}</Label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-[11px]">
              {statusText}
            </span>
            {hasFilter && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() =>
                  onSetNodeFilterValue(filterDef.id, { from: '', to: '' })
                }
              >
                Limpar período
              </Button>
            )}
          </div>
        </div>

        {Boolean(filterDef.description) && (
          <span className="text-muted-foreground text-[10px]">
            {filterDef.description}
          </span>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-[10px]">De</Label>
            <Input
              type="date"
              aria-label={`${filterDef.label} - De`}
              value={range.from}
              onChange={(e) =>
                onSetNodeFilterValue(filterDef.id, {
                  from: e.target.value,
                  to: range.to,
                })
              }
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-[10px]">Até</Label>
            <Input
              type="date"
              aria-label={`${filterDef.label} - Até`}
              value={range.to}
              onChange={(e) =>
                onSetNodeFilterValue(filterDef.id, {
                  from: range.from,
                  to: e.target.value,
                })
              }
              className="h-8 font-mono text-xs"
            />
          </div>
        </div>
      </div>
    )
  }

  const textVal = resolveStringFilterValue(nodeFilterValues[filterDef.id])

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold">{filterDef.label}</Label>
      {Boolean(filterDef.description) && (
        <span className="text-muted-foreground text-[10px]">
          {filterDef.description}
        </span>
      )}
      <Input
        value={textVal}
        onChange={(e) => onSetNodeFilterValue(filterDef.id, e.target.value)}
        className="h-8 text-xs"
        placeholder={`Informe ${filterDef.label}...`}
      />
    </div>
  )
}

export function WorkflowNodeConfigDialog({
  queryExecution,
  onQueryExecutionChange,
  open,
  embedded = false,
  editingNodeId,
  activeSpace,
  selectedAddNodeType,
  newNodeLabel,
  newNodeSelectedConnectionId,
  newNodeDatasetId,
  nodeSourceDatasets,
  filterOptionsFailures,
  isLoadingNodeDatasets,
  nodeSelectedColumns,
  newNodeWidgetType,
  newNodeSpan,
  outputSourceNodeId,
  outputCategoryColumn,
  outputMetricColumn,
  outputSecondaryMetricColumn,
  outputHierarchyColumns,
  onSetOutputHierarchyColumns,
  outputStackColumn,
  outputReferenceLineMode,
  outputReferenceLineTarget,
  connectionDisplayOptions,
  upstreamAvailableColumns,
  transformPreviewError,
  transformPreviewDetails,
  transformPreviewBeforePayload,
  transformPreviewAfterPayload,
  txUpstreamNodeId,
  sqlQueryText,
  nodeFilterValues,
  dynamicFilterOptions,
  globalStartDate,
  globalEndDate,
  nodeCustomDateRange,
  onSetNodeCustomDateRange,
  onSetNodeFilterValue,
  onOpenChange,
  onChangeNodeLabel,
  onSelectConnectionId,
  onSelectDatasetId,
  onToggleSelectedColumn,
  onSelectAllColumns,
  onClearAllColumns,
  onSelectWidgetType,
  onSelectSpan,
  onSetOutputSourceNodeId,
  onSetOutputCategoryColumn,
  onSetOutputMetricColumn,
  onSetOutputSecondaryMetricColumn,
  onSetOutputStackColumn,
  onSetOutputReferenceLineMode,
  onSetOutputReferenceLineTarget,
  onSetTxUpstreamNodeId,
  onSetSqlQueryText,
  onSaveEditedNode,
  onAddWorkflowNode,
  resolveRowsForWorkflowNode,
}: WorkflowNodeConfigDialogProps) {
  let dialogTitle = `Adicionar Fonte (Extract) — “${activeSpace.title}”`
  let dialogDescription =
    'Configure a conexão, o dataset, as colunas e os filtros de extração.'

  if (selectedAddNodeType === 'transform') {
    dialogTitle = `Adicionar Transformação (SQL) — “${activeSpace.title}”`
    dialogDescription =
      'Selecione o node de entrada e escreva a consulta SQL no motor local (DuckDB).'
  }

  if (selectedAddNodeType === 'output') {
    dialogTitle = `Adicionar Visualização (Load) — “${activeSpace.title}”`
    dialogDescription =
      'Escolha a fonte de dados e configure o gráfico ou tabela na Grade Inteligente.'
  }

  if (editingNodeId) {
    let labelDisplay = 'Node ETL'
    if (newNodeLabel) labelDisplay = newNodeLabel
    dialogTitle = `Editar Consulta: "${labelDisplay}"`
    dialogDescription =
      'Modifique os parâmetros de extração (E), consulta SQL com preview Antes/Depois (T) ou visualização (L).'
  }

  let inputPlaceholder = 'Ex: Gráfico de Entregas por Colaborador'
  if (selectedAddNodeType === 'source')
    inputPlaceholder = 'Ex: Apontamentos Redmine Docker, Tarefas Jira'
  if (selectedAddNodeType === 'transform')
    inputPlaceholder = 'Ex: SQL Pivot Colaborador × Atividade'

  let connPlaceholder = 'Selecione uma conexão analítica...'
  if (connectionDisplayOptions.length === 0)
    connPlaceholder = 'Nenhuma conexão analítica disponível'

  let dsPlaceholder = 'Selecione o dataset...'
  if (connectionDisplayOptions.length === 0)
    dsPlaceholder = 'Nenhuma fonte disponível'
  if (connectionDisplayOptions.length > 0 && !newNodeSelectedConnectionId)
    dsPlaceholder = 'Selecione uma fonte primeiro'
  if (
    connectionDisplayOptions.length > 0 &&
    newNodeSelectedConnectionId &&
    nodeSourceDatasets.length === 0
  )
    dsPlaceholder = 'Nenhum dataset nesta fonte'

  const selectedDatasetManifest = nodeSourceDatasets.find(
    (d) => d.id === newNodeDatasetId,
  )
  let discoveredSchemaColumns: AnalyticsColumnSchema[] = []

  if (
    selectedDatasetManifest &&
    selectedDatasetManifest.columns &&
    selectedDatasetManifest.columns.length > 0
  )
    discoveredSchemaColumns = selectedDatasetManifest.columns

  const upstreamDataNodes = activeSpace.workflowNodes.filter(
    (n) => n.kind !== 'output' && n.id !== editingNodeId,
  )

  let isTransformRemoteAggregate = false

  if (selectedAddNodeType === 'transform' && txUpstreamNodeId === '__all__') {
    isTransformRemoteAggregate = upstreamDataNodes.some((node) =>
      isRemoteAggregateUpstream(activeSpace.workflowNodes, node.id),
    )
  }

  if (
    selectedAddNodeType === 'transform' &&
    txUpstreamNodeId !== '' &&
    txUpstreamNodeId !== '__all__'
  ) {
    isTransformRemoteAggregate = isRemoteAggregateUpstream(
      activeSpace.workflowNodes,
      txUpstreamNodeId,
    )
  }

  const isRemoteAggregateOutput =
    selectedAddNodeType === 'output' &&
    outputSourceNodeId !== '' &&
    isRemoteAggregateUpstream(activeSpace.workflowNodes, outputSourceNodeId)

  const isOutputRemotePostProcessingUnsupported =
    isRemoteAggregateOutput &&
    (isRemoteAggregateUnsupportedVisual(newNodeWidgetType) ||
      outputReferenceLineMode === 'average' ||
      outputReferenceLineMode === 'weighted_ratio' ||
      outputStackColumn !== '')

  const chartRequirements = chartInputRequirements(newNodeWidgetType)
  const requiresNumericMetric =
    isRemoteAggregateOutput || outputReferenceLineMode === 'average'
  const requiresSecondaryMetric =
    chartRequirements.secondary ||
    (chartRequirements.series && isRemoteAggregateOutput) ||
    outputReferenceLineMode === 'weighted_ratio'
  let inputSchema: AnalyticsColumnSchema[] | undefined
  if (upstreamAvailableColumns.length > 0)
    inputSchema = upstreamAvailableColumns
  const chartIssues = chartInputIssues(
    newNodeWidgetType,
    {
      categoryColumn: outputCategoryColumn,
      metricColumn: outputMetricColumn,
      secondaryMetricColumn: outputSecondaryMetricColumn,
      stackColumn: outputStackColumn,
      hierarchyColumns: outputHierarchyColumns,
      referenceLineMode: outputReferenceLineMode,
    },
    inputSchema,
    isRemoteAggregateOutput,
  )
  const numericColumns = upstreamAvailableColumns.filter(
    (column) => column.type === 'number',
  )
  let dialogSize = 'max-h-[88vh] max-w-4xl sm:max-w-4xl'
  if (selectedAddNodeType === 'output')
    dialogSize = 'max-h-[94vh] max-w-7xl sm:max-w-7xl'

  const selectedModelMeta = GENERIC_CHART_MODELS.find(
    (m) => m.id === newNodeWidgetType,
  )
  let selectedModelDesc = ''
  if (selectedModelMeta) selectedModelDesc = selectedModelMeta.description

  let submitLabel = 'Adicionar ao Workflow'
  if (editingNodeId) submitLabel = 'Salvar Alterações'

  const isSubmitDisabled =
    !newNodeLabel.trim() ||
    (selectedAddNodeType === 'source' &&
      (!newNodeSelectedConnectionId ||
        !newNodeDatasetId ||
        (queryExecution?.kind !== 'aggregate' &&
          nodeSelectedColumns.length === 0) ||
        (queryExecution?.kind === 'aggregate' &&
          queryExecution.measures.length === 0))) ||
    (selectedAddNodeType === 'transform' &&
      (txUpstreamNodeId === '' ||
        sqlQueryText.trim() === '' ||
        isTransformRemoteAggregate)) ||
    (selectedAddNodeType === 'output' &&
      (outputSourceNodeId === '' ||
        upstreamAvailableColumns.length === 0 ||
        chartIssues.length > 0 ||
        isOutputRemotePostProcessingUnsupported))

  const handlePrimaryAction = () => {
    if (isSubmitDisabled) return

    if (editingNodeId) {
      onSaveEditedNode()
      return
    }

    onAddWorkflowNode()
  }

  let catSelectValue = '__auto__'
  if (outputCategoryColumn) catSelectValue = outputCategoryColumn

  let metricSelectValue = '__auto__'
  if (outputMetricColumn) metricSelectValue = outputMetricColumn

  let secMetricSelectValue = '__none__'
  if (outputSecondaryMetricColumn)
    secMetricSelectValue = outputSecondaryMetricColumn

  let stackSelectValue = '__none__'
  if (outputStackColumn) stackSelectValue = outputStackColumn

  const supportsExtractionDateRange =
    selectedDatasetManifest?.selection?.dateRange === true

  let supportedFiltersList: AnalyticsFilterDefinition[] = []
  if (selectedDatasetManifest?.supportedFilters !== undefined)
    supportedFiltersList = selectedDatasetManifest.supportedFilters

  let filterItemCount = supportedFiltersList.length
  if (supportsExtractionDateRange) filterItemCount += 1

  let filterSuffix = 'filtros'
  if (filterItemCount === 1) filterSuffix = 'filtro'

  let globalFromLabel = '-'
  if (globalStartDate !== undefined && globalStartDate !== '')
    globalFromLabel = globalStartDate

  let globalToLabel = '-'
  if (globalEndDate !== undefined && globalEndDate !== '')
    globalToLabel = globalEndDate

  const isCustomExtractionDate = nodeCustomDateRange !== undefined
  let extractionDateModeValue = 'global'
  if (isCustomExtractionDate) extractionDateModeValue = 'custom'

  let customDateFromVal = ''
  if (nodeCustomDateRange?.from !== undefined)
    customDateFromVal = nodeCustomDateRange.from

  let customDateToVal = ''
  if (nodeCustomDateRange?.to !== undefined)
    customDateToVal = nodeCustomDateRange.to

  let beforeCols: AnalyticsColumnSchema[] = []
  let beforeRows: AnalyticsDatasetRow[] = []

  if (transformPreviewBeforePayload) {
    beforeCols = transformPreviewBeforePayload.columns.slice(0, 6)
    beforeRows = transformPreviewBeforePayload.rows.slice(0, 5)
  }

  let afterCols: AnalyticsColumnSchema[] = []
  let afterRows: AnalyticsDatasetRow[] = []

  if (transformPreviewAfterPayload) {
    afterCols = transformPreviewAfterPayload.columns.slice(0, 6)
    afterRows = transformPreviewAfterPayload.rows.slice(0, 5)
  }

  const form = (
    <div
      className={cn(!embedded && 'min-h-0 flex-1 overflow-y-auto px-6 py-4')}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold">
            Título do Node / Gráfico
          </Label>
          <Input
            value={newNodeLabel}
            onChange={(e) => onChangeNodeLabel(e.target.value)}
            placeholder={inputPlaceholder}
            className="text-xs"
          />
        </div>

        {selectedAddNodeType === 'source' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs font-semibold">Conexão analítica</Label>
              <Select
                value={newNodeSelectedConnectionId}
                onValueChange={(val) => {
                  onSelectConnectionId(val)
                  onSelectDatasetId('')
                }}
                disabled={connectionDisplayOptions.length === 0}
              >
                <SelectTrigger
                  aria-label="Conexão analítica"
                  className="w-full text-xs"
                >
                  <SelectValue placeholder={connPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {connectionDisplayOptions.map((opt) => (
                      <SelectItem
                        key={opt.id}
                        value={opt.id}
                        className="py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          {Boolean(opt.logoUrl) && (
                            <img
                              src={opt.logoUrl}
                              alt=""
                              className="size-4 shrink-0 rounded-xs object-contain"
                            />
                          )}
                          {!opt.logoUrl && (
                            <Database className="text-muted-foreground size-4 shrink-0" />
                          )}
                          <span className="text-foreground font-semibold">
                            {opt.addonName}
                          </span>
                          {Boolean(opt.identityName) && (
                            <span className="text-muted-foreground font-normal">
                              {opt.identityName}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs font-semibold">Dataset</Label>
              <Select
                value={newNodeDatasetId}
                onValueChange={onSelectDatasetId}
                disabled={
                  connectionDisplayOptions.length === 0 ||
                  !newNodeSelectedConnectionId ||
                  isLoadingNodeDatasets ||
                  nodeSourceDatasets.length === 0
                }
              >
                <SelectTrigger
                  aria-label="Dataset analítico"
                  className="h-auto min-h-[44px] w-full py-1.5 text-xs"
                >
                  {isLoadingNodeDatasets && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
                      <span className="text-muted-foreground">
                        Descobrindo datasets da fonte...
                      </span>
                    </div>
                  )}
                  {!isLoadingNodeDatasets && (
                    <SelectValue placeholder={dsPlaceholder} />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {nodeSourceDatasets.map((ds) => (
                      <SelectItem
                        key={ds.id}
                        value={ds.id}
                        className="py-1.5 text-xs"
                      >
                        <div className="flex flex-col gap-0.5 text-left">
                          <span className="text-foreground leading-tight font-semibold">
                            {ds.name}
                          </span>
                          <span className="text-muted-foreground font-mono text-[11px] leading-tight">
                            {ds.endpoint}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <SourceExecutionControl
              manifest={selectedDatasetManifest}
              value={queryExecution}
              onChange={onQueryExecutionChange}
            />

            {(supportsExtractionDateRange ||
              supportedFiltersList.length > 0) && (
              <div className="border-border/60 bg-muted/20 flex flex-col gap-3 rounded-lg border p-3 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Filter className="text-muted-foreground size-4" />
                    <Label className="text-foreground text-xs font-semibold">
                      Filtros
                    </Label>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {filterItemCount} {filterSuffix}
                  </Badge>
                </div>
                {filterOptionsFailures.map((failure) => (
                  <div key={failure.source} role="alert">
                    {failure.source}: {failure.message}
                  </div>
                ))}
                <span className="text-muted-foreground text-[11px]">
                  Defina os parâmetros para filtrar os registros diretamente na
                  consulta.
                </span>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {supportsExtractionDateRange && (
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">
                          Período da extração
                        </Label>
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {isCustomExtractionDate && 'Período personalizado'}
                          {!isCustomExtractionDate &&
                            `Painel: ${globalFromLabel} a ${globalToLabel}`}
                        </span>
                      </div>

                      <Select
                        value={extractionDateModeValue}
                        onValueChange={(nextMode) => {
                          if (nextMode === 'global') {
                            onSetNodeCustomDateRange(undefined)
                            return
                          }

                          let initFrom = ''
                          if (globalStartDate !== undefined)
                            initFrom = globalStartDate

                          let initTo = ''
                          if (globalEndDate !== undefined)
                            initTo = globalEndDate

                          onSetNodeCustomDateRange({
                            from: initFrom,
                            to: initTo,
                          })
                        }}
                      >
                        <SelectTrigger
                          aria-label="Período da extração"
                          className="w-full text-xs"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem
                              value="global"
                              className="py-1.5 text-xs"
                            >
                              Usar período do painel ({globalFromLabel} a{' '}
                              {globalToLabel})
                            </SelectItem>
                            <SelectItem
                              value="custom"
                              className="py-1.5 text-xs"
                            >
                              Personalizado (Definir datas específicas neste nó)
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>

                      {isCustomExtractionDate && (
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <Label className="text-muted-foreground text-[10px]">
                              Data inicial do nó
                            </Label>
                            <Input
                              type="date"
                              aria-label="Data inicial do nó"
                              value={customDateFromVal}
                              onChange={(e) =>
                                onSetNodeCustomDateRange({
                                  from: e.target.value,
                                  to: customDateToVal,
                                })
                              }
                              className="h-8 font-mono text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-muted-foreground text-[10px]">
                              Data final do nó
                            </Label>
                            <Input
                              type="date"
                              aria-label="Data final do nó"
                              value={customDateToVal}
                              onChange={(e) =>
                                onSetNodeCustomDateRange({
                                  from: customDateFromVal,
                                  to: e.target.value,
                                })
                              }
                              className="h-8 font-mono text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {supportedFiltersList.map((filterDef) => (
                    <DynamicFilterField
                      key={filterDef.id}
                      filterDef={filterDef}
                      nodeFilterValues={nodeFilterValues}
                      onSetNodeFilterValue={onSetNodeFilterValue}
                      dynamicFilterOptions={dynamicFilterOptions}
                    />
                  ))}
                </div>
              </div>
            )}

            {queryExecution?.kind !== 'aggregate' && (
              <div className="flex flex-col gap-2.5 sm:col-span-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5">
                    <Columns className="text-muted-foreground size-4" />
                    <Label className="text-foreground text-xs font-semibold">
                      Colunas da Tabela
                    </Label>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {nodeSelectedColumns.length} de{' '}
                      {discoveredSchemaColumns.length} colunas
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectAllColumns(
                          discoveredSchemaColumns.map((c) => c.name),
                        )
                      }
                      className="text-primary text-[11px] font-medium hover:underline"
                    >
                      Selecionar todas
                    </button>
                    <span className="text-border text-xs">•</span>
                    <button
                      type="button"
                      onClick={onClearAllColumns}
                      className="text-muted-foreground hover:text-foreground text-[11px]"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <span className="text-muted-foreground text-[11px]">
                  Selecione quais colunas deseja incluir neste nó. Os dados são
                  carregados conforme o formato original da fonte.
                </span>

                <div className="border-border/70 bg-card/40 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-2.5 sm:grid-cols-2">
                  {discoveredSchemaColumns.map((col) => {
                    const isColChecked = nodeSelectedColumns.includes(col.name)

                    return (
                      <div
                        key={col.name}
                        className="border-border/50 bg-background/60 hover:bg-muted/30 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 transition-colors"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Checkbox
                            id={`schema-col-${col.name}`}
                            checked={isColChecked}
                            onCheckedChange={(checked) =>
                              onToggleSelectedColumn(col.name, Boolean(checked))
                            }
                          />
                          <div className="min-w-0">
                            <Label
                              htmlFor={`schema-col-${col.name}`}
                              className="block cursor-pointer truncate text-xs font-medium"
                            >
                              {col.label}
                            </Label>
                            <span className="text-muted-foreground font-mono text-[10px]">
                              {col.name}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {col.origin === 'custom' && (
                            <Badge
                              variant="secondary"
                              className="h-4 px-1.5 text-[9px] font-normal"
                            >
                              Personalizado
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="text-muted-foreground h-4 px-1.5 font-mono text-[9px] font-normal"
                          >
                            {formatColumnTypeLabel(col.type)}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedAddNodeType === 'transform' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">
                Nó Anterior (Entrada Bruta / Upstream)
              </Label>
              <Select
                value={txUpstreamNodeId}
                onValueChange={onSetTxUpstreamNodeId}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o nó anterior..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {upstreamDataNodes.map((n) => (
                      <SelectItem key={n.id} value={n.id} className="text-xs">
                        {n.label} ({n.badge})
                      </SelectItem>
                    ))}
                    {upstreamDataNodes.length > 1 && (
                      <SelectItem value="__all__" className="text-xs">
                        Todos os nós anteriores ({upstreamDataNodes.length}{' '}
                        fontes p/ JOIN ou UNION)
                      </SelectItem>
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {upstreamAvailableColumns.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs">
                  Colunas disponíveis no nó anterior (clique para inserir no
                  SQL):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {upstreamAvailableColumns.map((col) => (
                    <Badge
                      key={col.name}
                      variant="secondary"
                      className="hover:bg-primary/15 cursor-pointer font-mono text-[11px]"
                      onClick={() =>
                        onSetSqlQueryText(`${sqlQueryText} ${col.name}`)
                      }
                    >
                      {col.name}{' '}
                      <span className="text-muted-foreground ml-0.5">
                        ({col.type})
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5 text-xs font-semibold">
                  <Code2 data-icon="inline-start" className="text-primary" />
                  Consulta SQL de Transformação
                </Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-[11px]">
                    Tabelas:
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    input
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    input_1, input_2
                  </Badge>
                </div>
              </div>
              <Textarea
                value={sqlQueryText}
                onChange={(e) => onSetSqlQueryText(e.target.value)}
                rows={5}
                placeholder="SELECT coluna, SUM(metrica) AS total FROM input GROUP BY coluna"
                className="min-h-24 resize-y font-mono text-xs leading-relaxed"
              />
              <p className="text-muted-foreground text-[11px]">
                Suporta <code>SELECT</code> com projeção explícita,{' '}
                <code>WHERE</code>, <code>CASE WHEN</code>,{' '}
                <code>GROUP BY</code>, <code>JOIN</code>, <code>FORMULA</code> e{' '}
                <code>ORDER BY</code>.
              </p>
            </div>

            {isTransformRemoteAggregate && (
              <AnalyticsError
                message="ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY"
                details={transformPreviewDetails}
              />
            )}

            {!isTransformRemoteAggregate &&
              transformPreviewError !== undefined && (
                <AnalyticsError
                  message={transformPreviewError}
                  details={transformPreviewDetails}
                />
              )}

            <Tabs defaultValue="after" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList className="h-8">
                  <TabsTrigger value="before" className="gap-1.5 text-xs">
                    Antes (Entrada)
                    <Badge
                      variant="outline"
                      className="ml-1 font-mono text-[10px]"
                    >
                      {transformPreviewBeforePayload.rows.length}×
                      {transformPreviewBeforePayload.columns.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="after" className="gap-1.5 text-xs">
                    <ArrowRight data-icon="inline-start" />
                    Depois (Resultado)
                    <Badge
                      variant="secondary"
                      className="ml-1 font-mono text-[10px]"
                    >
                      {transformPreviewAfterPayload.rows.length}×
                      {transformPreviewAfterPayload.columns.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="after"
                className="border-border/80 bg-card mt-0 overflow-hidden rounded-lg border"
              >
                <div className="max-h-52 overflow-auto">
                  {afterCols.length === 0 && (
                    <div className="text-muted-foreground p-6 text-center text-xs">
                      Sem colunas resultantes.
                    </div>
                  )}
                  {afterCols.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {afterCols.map((c) => (
                            <TableHead
                              key={c.name}
                              className="h-8 px-3 font-mono text-[11px] font-semibold"
                            >
                              {c.name}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {afterRows.map((r, rIdx) => (
                          <TableRow key={`aft-${rIdx}`}>
                            {afterCols.map((c) => (
                              <TableCell
                                key={c.name}
                                className="max-w-[180px] truncate px-3 py-1.5 font-mono text-[11px]"
                              >
                                {readCellAsString(r, c.name, '-')}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="before"
                className="border-border/80 bg-card mt-0 overflow-hidden rounded-lg border"
              >
                <div className="max-h-52 overflow-auto">
                  {beforeCols.length === 0 && (
                    <div className="text-muted-foreground p-6 text-center text-xs">
                      Nenhum dado no nó anterior ainda.
                    </div>
                  )}
                  {beforeCols.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {beforeCols.map((c) => (
                            <TableHead
                              key={c.name}
                              className="h-8 px-3 font-mono text-[11px]"
                            >
                              {c.name}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {beforeRows.map((r, rIdx) => (
                          <TableRow key={`bef-${rIdx}`}>
                            {beforeCols.map((c) => (
                              <TableCell
                                key={c.name}
                                className="max-w-[180px] truncate px-3 py-1.5 font-mono text-[11px]"
                              >
                                {readCellAsString(r, c.name, '-')}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {selectedAddNodeType === 'output' && (
          <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-xs font-semibold">Tipo de gráfico</Label>
                <Select
                  value={newNodeWidgetType}
                  onValueChange={(val) => {
                    const matched = GENERIC_CHART_MODELS.find(
                      (m) => m.id === val,
                    )
                    if (matched) onSelectWidgetType(matched.id)
                  }}
                >
                  <SelectTrigger
                    aria-label="Modelo visual da visualização"
                    className="w-full text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {GENERIC_CHART_MODELS.map((model) => (
                        <SelectItem
                          key={model.id}
                          value={model.id}
                          disabled={
                            isRemoteAggregateOutput &&
                            (isRemoteAggregateUnsupportedVisual(model.id) ||
                              ((model.id === 'bar_stacked' ||
                                model.id === 'area_stacked') &&
                                outputStackColumn !== ''))
                          }
                        >
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <div className="text-muted-foreground text-[11px]">
                  {selectedModelDesc}
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-xs font-semibold">
                  Largura na Grade Inteligente
                </Label>
                <Select
                  value={String(newNodeSpan)}
                  onValueChange={(val) => {
                    if (val === '1') onSelectSpan(1)
                    if (val === '2') onSelectSpan(2)
                    if (val === '3') onSelectSpan(3)
                  }}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="1">1 Coluna (1/3)</SelectItem>
                      <SelectItem value="2">2 Colunas (2/3)</SelectItem>
                      <SelectItem value="3">Largura Total (3/3)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">
                  Entrada do pipeline
                </Label>
                {upstreamDataNodes.length > 0 && (
                  <Select
                    value={outputSourceNodeId}
                    onValueChange={onSetOutputSourceNodeId}
                  >
                    <SelectTrigger
                      aria-label="Entrada da visualização"
                      className="w-full text-xs"
                    >
                      <SelectValue placeholder="Selecione o nó que alimenta este gráfico..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {upstreamDataNodes.map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.label} ({n.badge})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                {upstreamDataNodes.length === 0 && (
                  <div className="text-muted-foreground bg-muted/20 flex min-h-9 items-center rounded-md border p-2 text-[11px]">
                    Nenhum nó de dados upstream adicionado ainda
                  </div>
                )}
              </div>

              {newNodeWidgetType === 'tree_grid' && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Hierarquia (na ordem selecionada)</Label>
                  <MultiSelectCombobox
                    options={upstreamAvailableColumns.map((column) => ({
                      value: column.name,
                      label: column.label,
                    }))}
                    selectedValues={outputHierarchyColumns}
                    onSelectedValuesChange={onSetOutputHierarchyColumns}
                  />
                </div>
              )}
              <div className="border-border/70 bg-muted/15 grid grid-cols-1 gap-3 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold">
                    Mapeamento das colunas
                  </Label>
                </div>

                {chartRequirements.category && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label className="text-[11px]">
                      Eixo X / Categoria Principal
                    </Label>
                    <Select
                      value={catSelectValue}
                      onValueChange={(v) => {
                        if (v === '__auto__') {
                          onSetOutputCategoryColumn('')
                          return
                        }

                        onSetOutputCategoryColumn(v)
                      }}
                    >
                      <SelectTrigger
                        aria-label="Dimensão da visualização"
                        className="h-8 w-full text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__auto__">
                            Selecione a dimensão
                          </SelectItem>
                          {upstreamAvailableColumns.map((col) => (
                            <SelectItem key={col.name} value={col.name}>
                              {col.label} ({col.name})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label className="text-[11px]">
                    Eixo Y / Métrica Principal
                  </Label>
                  <Select
                    value={metricSelectValue}
                    onValueChange={(v) => {
                      if (v === '__auto__') {
                        onSetOutputMetricColumn('')
                        return
                      }

                      onSetOutputMetricColumn(v)
                    }}
                  >
                    <SelectTrigger
                      aria-label="Métrica da visualização"
                      className="h-8 w-full text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem
                          value="__auto__"
                          disabled={requiresNumericMetric}
                        >
                          Contar registros
                        </SelectItem>
                        {numericColumns.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.label} ({col.name})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label className="text-[11px]">Segunda métrica</Label>
                  <Select
                    value={secMetricSelectValue}
                    onValueChange={(v) => {
                      if (v === '__none__') {
                        onSetOutputSecondaryMetricColumn('')
                        return
                      }

                      onSetOutputSecondaryMetricColumn(v)
                    }}
                  >
                    <SelectTrigger
                      aria-label="Segunda métrica da visualização"
                      className="h-8 w-full text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {numericColumns.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.label} ({col.name})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {(chartRequirements.series || outputStackColumn !== '') && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label className="text-[11px]">
                      Empilhar / Pivotar por (Série)
                    </Label>
                    <Select
                      value={stackSelectValue}
                      onValueChange={(v) => {
                        if (v === '__none__') {
                          onSetOutputStackColumn('')
                          return
                        }

                        onSetOutputStackColumn(v)
                      }}
                      disabled={isRemoteAggregateOutput}
                    >
                      <SelectTrigger
                        aria-label="Empilhar ou pivotar visualização"
                        className="h-8 w-full text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__none__">
                            Sem empilhamento extra
                          </SelectItem>
                          {upstreamAvailableColumns.map((col) => (
                            <SelectItem key={col.name} value={col.name}>
                              {col.label} ({col.name})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label className="text-[11px]">
                    Linha de Referência / Meta
                  </Label>
                  <Select
                    value={outputReferenceLineMode}
                    onValueChange={(v) => {
                      if (
                        v === 'none' ||
                        v === 'average' ||
                        v === 'weighted_ratio' ||
                        v === 'fixed_target'
                      )
                        onSetOutputReferenceLineMode(v)
                    }}
                  >
                    <SelectTrigger
                      aria-label="Linha de referência da visualização"
                      className="h-8 w-full text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">Sem linha</SelectItem>
                        <SelectItem
                          value="average"
                          disabled={isRemoteAggregateOutput}
                        >
                          Média Simples (AVG)
                        </SelectItem>
                        <SelectItem
                          value="weighted_ratio"
                          disabled={isRemoteAggregateOutput}
                        >
                          Média Ponderada Σ(A) ÷ Σ(B)
                        </SelectItem>
                        <SelectItem value="fixed_target">
                          Meta Fixa (SLA / Valor)
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {outputReferenceLineMode === 'fixed_target' && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label className="text-[11px]">Valor da Meta Fixa</Label>
                    <Input
                      type="number"
                      value={String(outputReferenceLineTarget)}
                      onChange={(e) => {
                        const parsed = Number.parseFloat(e.target.value)
                        if (!Number.isNaN(parsed))
                          onSetOutputReferenceLineTarget(parsed)
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                )}

                {isOutputRemotePostProcessingUnsupported && (
                  <div className="sm:col-span-3">
                    <AnalyticsError
                      message="ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY"
                      details={{
                        execution: [
                          'Fontes remotas agregadas aceitam apenas projeção visual simples, filtros e meta fixa.',
                        ],
                      }}
                    />
                  </div>
                )}

                {isRemoteAggregateOutput &&
                  !isOutputRemotePostProcessingUnsupported && (
                    <p className="text-muted-foreground text-[11px] sm:col-span-3">
                      Fonte remota agregada: pós-processamentos locais (pivô,
                      rollup hierárquico, fórmula condicional, empilhamento e
                      média local) ficam desabilitados.
                    </p>
                  )}
              </div>
            </div>
            <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0">
              <section
                aria-label="Requisitos de dados"
                className="bg-card flex min-w-0 flex-col gap-3 rounded-lg border p-4"
              >
                <h3 className="text-sm font-semibold">
                  O que este gráfico precisa
                </h3>
                <dl className="grid gap-1.5 text-xs">
                  {chartRequirements.category && (
                    <div>
                      <dt className="inline font-medium">Dimensão</dt>
                      <dd className="text-muted-foreground ml-2 inline">
                        Coluna que define os grupos, como projeto ou período.
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline font-medium">Métrica</dt>
                    <dd className="text-muted-foreground ml-2 inline">
                      Coluna numérica
                      {!requiresNumericMetric && ' ou contagem de registros'}.
                    </dd>
                  </div>
                  {requiresSecondaryMetric && (
                    <div>
                      <dt className="inline font-medium">Segunda métrica</dt>
                      <dd className="text-muted-foreground ml-2 inline">
                        Coluna numérica para comparação.
                      </dd>
                    </div>
                  )}
                  {chartRequirements.series && !isRemoteAggregateOutput && (
                    <div>
                      <dt className="inline font-medium">Série</dt>
                      <dd className="text-muted-foreground ml-2 inline">
                        Coluna que divide os grupos em séries.
                      </dd>
                    </div>
                  )}
                  {chartRequirements.hierarchy && (
                    <div>
                      <dt className="inline font-medium">Hierarquia</dt>
                      <dd className="text-muted-foreground ml-2 inline">
                        Uma ou mais colunas, do nível mais amplo ao mais
                        detalhado.
                      </dd>
                    </div>
                  )}
                </dl>
                {outputSourceNodeId === '' && (
                  <p className="text-muted-foreground text-xs">
                    Escolha uma entrada do pipeline para mapear as colunas.
                  </p>
                )}
                {outputSourceNodeId !== '' &&
                  upstreamAvailableColumns.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                      A entrada precisa retornar um esquema de colunas antes da
                      publicação.
                    </p>
                  )}
                {outputSourceNodeId !== '' &&
                  upstreamAvailableColumns.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium">
                        Colunas da entrada ({upstreamAvailableColumns.length})
                      </summary>
                      <dl className="mt-2 grid max-h-36 gap-1 overflow-auto">
                        {upstreamAvailableColumns.map((column) => (
                          <div
                            key={column.name}
                            className="flex justify-between gap-3"
                          >
                            <dt className="break-all">
                              {column.label} ({column.name})
                            </dt>
                            <dd className="text-muted-foreground shrink-0">
                              {column.type}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                {outputSourceNodeId !== '' && chartIssues.length > 0 && (
                  <ul
                    aria-live="polite"
                    className="text-destructive grid list-disc gap-1 pl-4 text-xs"
                  >
                    {chartIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </section>
              {(() => {
                let realPreviewData: ChartRealPreviewInput | undefined
                let realEmptyMessage: string | undefined

                if (outputSourceNodeId === '')
                  realEmptyMessage =
                    'Escolha uma entrada do pipeline para visualizar os dados reais.'

                if (outputSourceNodeId !== '' && chartIssues.length > 0)
                  realEmptyMessage = chartIssues.join(' ')

                if (
                  outputSourceNodeId !== '' &&
                  chartIssues.length === 0 &&
                  resolveRowsForWorkflowNode !== undefined
                ) {
                  const sourceNode = activeSpace.workflowNodes.find(
                    (n) => n.id === outputSourceNodeId,
                  )

                  if (sourceNode !== undefined) {
                    const resolved = resolveRowsForWorkflowNode(sourceNode)
                    realPreviewData = buildRealChartPreview({
                      payload: resolved,
                      visual: newNodeWidgetType,
                      categoryColumn: outputCategoryColumn,
                      metricColumn: outputMetricColumn,
                      secondaryMetricColumn: outputSecondaryMetricColumn,
                      stackColumn: outputStackColumn,
                      hierarchyColumns: outputHierarchyColumns,
                    })

                    if (realPreviewData === undefined)
                      realEmptyMessage =
                        'A entrada selecionada ainda não possui linhas carregadas.'
                  }
                }

                return (
                  <ChartModelExample
                    visual={newNodeWidgetType}
                    referenceMode={outputReferenceLineMode}
                    target={outputReferenceLineTarget}
                    realData={realPreviewData}
                    realEmptyMessage={realEmptyMessage}
                  />
                )
              })()}
            </aside>
          </div>
        )}
      </div>
    </div>
  )

  const actions = (
    <>
      <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
        Cancelar
      </Button>
      <Button
        size="sm"
        onClick={handlePrimaryAction}
        disabled={isSubmitDisabled}
      >
        {submitLabel}
      </Button>
    </>
  )

  if (embedded)
    return (
      <>
        {form}
        <div className="flex justify-end gap-2 border-t py-3">{actions}</div>
      </>
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex w-[96vw] min-w-0 flex-col gap-0 overflow-hidden p-0',
          dialogSize,
        )}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-8">
          <DialogTitle className="text-base font-bold">
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        {form}
        <DialogFooter className="bg-muted/20 flex shrink-0 items-center justify-end gap-2 border-t px-6 py-3">
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
