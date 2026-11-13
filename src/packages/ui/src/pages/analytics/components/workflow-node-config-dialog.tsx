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
  BarChart3,
  ChevronDown,
  Code2,
  Columns,
  Database,
  Filter,
  LineChart,
  Link2,
  Loader2,
  PieChart,
  SlidersHorizontal,
  Table2,
} from 'lucide-react'
import { useState } from 'react'

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

import {
  getSupportedTooltipFields,
  resolveDefaultTooltipFields,
} from '../lib/analytics-chart-options'
import {
  getBindingCacheKey,
  sanitizeSqlAlias,
} from '../lib/analytics-cross-source'
import {
  isRemoteAggregateUnsupportedVisual,
  isRemoteAggregateUpstream,
} from '../lib/analytics-plan'
import { type EtlTablePayload, readCellAsString } from '../lib/analytics-table'
import type {
  AddNodeTypeOption,
  AnalyticsTooltipField,
  AnalyticsValueDisplayMode,
  ConnectionDisplayOption,
} from '../lib/analytics-types'
import {
  type AnalyticsSpaceConfig,
  GENERIC_CHART_MODELS,
  type ReferenceLineMode,
  type SourceFilterBinding,
  type SpaceWorkflowNodeConfig,
  type TransformInputBinding,
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
  outputSubtitle?: string
  outputCategoryLabel?: string
  outputMetricLabel?: string
  outputSecondaryMetricLabel?: string
  outputShowAllRows?: boolean
  outputMaxRows?: number
  outputValueDisplayMode?: AnalyticsValueDisplayMode
  outputTooltipEnabled?: boolean
  outputTooltipFields?: AnalyticsTooltipField[]
  connectionDisplayOptions: ConnectionDisplayOption[]
  upstreamAvailableColumns: AnalyticsColumnSchema[]
  transformPreviewError: string | undefined
  transformPreviewDetails: Record<string, string[]> | undefined
  transformPreviewBeforePayload: EtlTablePayload
  transformPreviewAfterPayload: EtlTablePayload
  transformInputSources?: Array<{
    nodeId: string
    alias: string
    label: string
    columns: AnalyticsColumnSchema[]
    rows: AnalyticsDatasetRow[]
  }>
  txUpstreamNodeId: string
  txTransformInputs?: TransformInputBinding[]
  sqlQueryText: string
  nodeFilterValues: Record<string, AnalyticsFilterValue>
  nodeFilterBindings?: SourceFilterBinding[]
  resolvedCrossSourceValues?: Record<string, string[]>
  dynamicFilterOptions: Record<string, AnalyticsFilterOption[]>
  globalStartDate?: string
  globalEndDate?: string
  nodeCustomDateRange: { from?: string; to?: string } | undefined
  onSetNodeCustomDateRange: (
    range: { from?: string; to?: string } | undefined,
  ) => void
  onSetNodeFilterValue: (filterId: string, val: AnalyticsFilterValue) => void
  onSetNodeFilterBindings?: (bindings: SourceFilterBinding[]) => void
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
  onSetOutputSubtitle?: (val: string) => void
  onSetOutputCategoryLabel?: (val: string) => void
  onSetOutputMetricLabel?: (val: string) => void
  onSetOutputSecondaryMetricLabel?: (val: string) => void
  onSetOutputShowAllRows?: (val: boolean) => void
  onSetOutputMaxRows?: (val: number) => void
  onSetOutputValueDisplayMode?: (val: AnalyticsValueDisplayMode) => void
  onSetOutputTooltipEnabled?: (val: boolean) => void
  onSetOutputTooltipFields?: (val: AnalyticsTooltipField[]) => void
  onSetTxUpstreamNodeId: (val: string) => void
  onSetTxTransformInputs?: (inputs: TransformInputBinding[]) => void
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
  outputSubtitle = '',
  outputCategoryLabel = '',
  outputMetricLabel = '',
  outputSecondaryMetricLabel = '',
  outputShowAllRows = false,
  outputMaxRows = 100,
  outputValueDisplayMode = 'absolute',
  outputTooltipEnabled = true,
  outputTooltipFields,
  connectionDisplayOptions,
  upstreamAvailableColumns,
  transformPreviewError,
  transformPreviewDetails,
  transformPreviewBeforePayload,
  transformPreviewAfterPayload,
  transformInputSources = [],
  txUpstreamNodeId,
  txTransformInputs = [],
  sqlQueryText,
  nodeFilterValues,
  nodeFilterBindings = [],
  resolvedCrossSourceValues = {},
  dynamicFilterOptions,
  globalStartDate,
  globalEndDate,
  nodeCustomDateRange,
  onSetNodeCustomDateRange,
  onSetNodeFilterValue,
  onSetNodeFilterBindings,
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
  onSetOutputSubtitle,
  onSetOutputCategoryLabel,
  onSetOutputMetricLabel,
  onSetOutputSecondaryMetricLabel,
  onSetOutputShowAllRows,
  onSetOutputMaxRows,
  onSetOutputValueDisplayMode,
  onSetOutputTooltipEnabled,
  onSetOutputTooltipFields,
  onSetTxUpstreamNodeId,
  onSetTxTransformInputs,
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
  const validAliasPattern = /^[a-z][a-z0-9_]*$/u
  const transformAliasSet = new Set(txTransformInputs.map((i) => i.alias))
  const hasLegacyTransformUpstream =
    txTransformInputs.length === 0 && txUpstreamNodeId !== ''
  const hasInvalidTransformInputs =
    selectedAddNodeType === 'transform' &&
    !hasLegacyTransformUpstream &&
    (txTransformInputs.length === 0 ||
      transformAliasSet.size !== txTransformInputs.length ||
      txTransformInputs.some((i) => !validAliasPattern.test(i.alias)))

  if (selectedAddNodeType === 'transform' && txTransformInputs.length > 0) {
    isTransformRemoteAggregate = txTransformInputs.some((input) =>
      isRemoteAggregateUpstream(activeSpace.workflowNodes, input.nodeId),
    )
  }

  if (
    selectedAddNodeType === 'transform' &&
    txTransformInputs.length === 0 &&
    txUpstreamNodeId === '__all__'
  ) {
    isTransformRemoteAggregate = upstreamDataNodes.some((node) =>
      isRemoteAggregateUpstream(activeSpace.workflowNodes, node.id),
    )
  }

  if (
    selectedAddNodeType === 'transform' &&
    txTransformInputs.length === 0 &&
    txUpstreamNodeId !== '' &&
    txUpstreamNodeId !== '__all__'
  ) {
    isTransformRemoteAggregate = isRemoteAggregateUpstream(
      activeSpace.workflowNodes,
      txUpstreamNodeId,
    )
  }

  const [selectedBeforeInputNodeId, setSelectedBeforeInputNodeId] =
    useState<string>('')

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
      (hasInvalidTransformInputs ||
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
                  className="h-12 w-full py-1.5 text-xs"
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
                  className="h-12 w-full py-1.5 text-xs"
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

                  {supportedFiltersList.map((filterDef) => {
                    const activeBinding = nodeFilterBindings.find(
                      (b) => b.targetFilterId === filterDef.id,
                    )
                    const hasUpstreamChoices =
                      upstreamDataNodes.length > 0 &&
                      onSetNodeFilterBindings !== undefined
                    const selectedUpstreamNode = activeBinding
                      ? upstreamDataNodes.find(
                          (n) => n.id === activeBinding.upstreamNodeId,
                        )
                      : undefined
                    let upstreamCols =
                      selectedUpstreamNode !== undefined &&
                      resolveRowsForWorkflowNode !== undefined
                        ? resolveRowsForWorkflowNode(selectedUpstreamNode)
                            .columns
                        : []

                    if (
                      upstreamCols.length === 0 &&
                      selectedUpstreamNode !== undefined &&
                      selectedUpstreamNode.datasetId !== undefined
                    ) {
                      const fallbackManifest = nodeSourceDatasets.find(
                        (ds) => ds.id === selectedUpstreamNode.datasetId,
                      )

                      if (fallbackManifest !== undefined) {
                        upstreamCols = fallbackManifest.columns
                      }
                    }
                    const resolvedValues = activeBinding
                      ? resolvedCrossSourceValues[
                          getBindingCacheKey(
                            activeBinding.upstreamNodeId,
                            activeBinding.sourceColumn,
                          )
                        ]
                      : undefined

                    return (
                      <div key={filterDef.id} className="flex flex-col gap-2">
                        {hasUpstreamChoices && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium">
                              <Link2 className="size-3" />
                              Origem do filtro: {filterDef.label}
                            </span>
                            <div className="bg-muted inline-flex rounded-md p-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSetNodeFilterBindings === undefined)
                                    return
                                  onSetNodeFilterBindings(
                                    nodeFilterBindings.filter(
                                      (b) => b.targetFilterId !== filterDef.id,
                                    ),
                                  )
                                }}
                                className={cn(
                                  'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                                  activeBinding === undefined &&
                                    'bg-background text-foreground shadow-xs',
                                  activeBinding !== undefined &&
                                    'text-muted-foreground hover:text-foreground',
                                )}
                              >
                                Fixo
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSetNodeFilterBindings === undefined)
                                    return
                                  if (activeBinding !== undefined) return
                                  const firstUp = upstreamDataNodes.find(
                                    () => true,
                                  )
                                  if (firstUp === undefined) return
                                  const firstCol =
                                    resolveRowsForWorkflowNode !== undefined
                                      ? resolveRowsForWorkflowNode(
                                          firstUp,
                                        ).columns.find(() => true)?.name
                                      : undefined
                                  let defaultCol = ''
                                  if (firstCol !== undefined)
                                    defaultCol = firstCol

                                  onSetNodeFilterBindings([
                                    ...nodeFilterBindings,
                                    {
                                      targetFilterId: filterDef.id,
                                      upstreamNodeId: firstUp.id,
                                      sourceColumn: defaultCol,
                                      onEmptyUpstream: 'skip_empty',
                                    },
                                  ])
                                }}
                                className={cn(
                                  'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                                  activeBinding !== undefined &&
                                    'bg-background text-foreground shadow-xs',
                                  activeBinding === undefined &&
                                    'text-muted-foreground hover:text-foreground',
                                )}
                              >
                                De outra fonte
                              </button>
                            </div>
                          </div>
                        )}

                        {activeBinding === undefined && (
                          <DynamicFilterField
                            filterDef={filterDef}
                            nodeFilterValues={nodeFilterValues}
                            onSetNodeFilterValue={onSetNodeFilterValue}
                            dynamicFilterOptions={dynamicFilterOptions}
                          />
                        )}

                        {activeBinding !== undefined &&
                          onSetNodeFilterBindings !== undefined && (
                            <div className="border-border/70 bg-muted/20 flex flex-col gap-2 rounded-md border p-2.5">
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <div className="flex flex-col gap-1">
                                  <Label className="text-[11px]">
                                    Fonte anterior
                                  </Label>
                                  <Select
                                    value={activeBinding.upstreamNodeId}
                                    onValueChange={(nextUpId) => {
                                      const nextNode = upstreamDataNodes.find(
                                        (n) => n.id === nextUpId,
                                      )
                                      let nextCol = activeBinding.sourceColumn
                                      if (nextNode !== undefined) {
                                        let cols =
                                          resolveRowsForWorkflowNode !==
                                          undefined
                                            ? resolveRowsForWorkflowNode(
                                                nextNode,
                                              ).columns
                                            : []

                                        if (
                                          cols.length === 0 &&
                                          nextNode.datasetId !== undefined
                                        ) {
                                          const fallbackManifest =
                                            nodeSourceDatasets.find(
                                              (ds) =>
                                                ds.id === nextNode.datasetId,
                                            )

                                          if (fallbackManifest !== undefined) {
                                            cols = fallbackManifest.columns
                                          }
                                        }

                                        if (
                                          !cols.some((c) => c.name === nextCol)
                                        ) {
                                          const firstC = cols.find(() => true)
                                          nextCol =
                                            firstC !== undefined
                                              ? firstC.name
                                              : ''
                                        }
                                      }
                                      onSetNodeFilterBindings(
                                        nodeFilterBindings.map((b) =>
                                          b.targetFilterId === filterDef.id
                                            ? {
                                                ...b,
                                                upstreamNodeId: nextUpId,
                                                sourceColumn: nextCol,
                                              }
                                            : b,
                                        ),
                                      )
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-full text-xs">
                                      <SelectValue placeholder="Escolha a fonte..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        {upstreamDataNodes.map((n) => (
                                          <SelectItem
                                            key={n.id}
                                            value={n.id}
                                            className="text-xs"
                                          >
                                            {n.label}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                  {upstreamCols.length === 0 && (
                                    <span className="text-muted-foreground text-[10px]">
                                      Execute a fonte anterior para listar
                                      colunas.
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-col gap-1">
                                  <Label className="text-[11px]">
                                    Coluna de origem
                                  </Label>
                                  <Select
                                    value={activeBinding.sourceColumn}
                                    onValueChange={(nextCol) => {
                                      onSetNodeFilterBindings(
                                        nodeFilterBindings.map((b) =>
                                          b.targetFilterId === filterDef.id
                                            ? { ...b, sourceColumn: nextCol }
                                            : b,
                                        ),
                                      )
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-full text-xs">
                                      <SelectValue placeholder="Coluna..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        {upstreamCols.map((col) => (
                                          <SelectItem
                                            key={col.name}
                                            value={col.name}
                                            className="font-mono text-xs"
                                          >
                                            {col.name}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                  {upstreamCols.length === 0 && (
                                    <span className="text-muted-foreground text-[10px]">
                                      Execute a fonte anterior para listar
                                      colunas.
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-col gap-1">
                                  <Label className="text-[11px]">
                                    Se retornar vazio
                                  </Label>
                                  <Select
                                    value={activeBinding.onEmptyUpstream}
                                    onValueChange={(nextBehavior) => {
                                      const onEmpty: 'skip_empty' | 'fail' =
                                        nextBehavior === 'fail'
                                          ? 'fail'
                                          : 'skip_empty'
                                      onSetNodeFilterBindings(
                                        nodeFilterBindings.map((b) =>
                                          b.targetFilterId === filterDef.id
                                            ? { ...b, onEmptyUpstream: onEmpty }
                                            : b,
                                        ),
                                      )
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-full text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        <SelectItem
                                          value="skip_empty"
                                          className="text-xs"
                                        >
                                          Ignorar (0 regs)
                                        </SelectItem>
                                        <SelectItem
                                          value="fail"
                                          className="text-xs"
                                        >
                                          Falhar nó
                                        </SelectItem>
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                  {upstreamCols.length === 0 && (
                                    <span className="text-muted-foreground text-[10px]">
                                      Execute a fonte anterior para listar
                                      colunas.
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-muted-foreground text-[11px]">
                                  Valores resolvidos:
                                </span>
                                {resolvedValues === undefined && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    Aguardando execução da fonte anterior
                                  </Badge>
                                )}
                                {resolvedValues !== undefined &&
                                  resolvedValues.length === 0 && (
                                    <Badge
                                      variant="destructive"
                                      className="font-mono text-[10px]"
                                    >
                                      0 valores (verifique coluna ou filtros)
                                    </Badge>
                                  )}
                                {resolvedValues !== undefined &&
                                  resolvedValues.length > 0 && (
                                    <Badge
                                      variant="secondary"
                                      className="font-mono text-[10px]"
                                    >
                                      {resolvedValues.length} valores
                                    </Badge>
                                  )}
                                {resolvedValues !== undefined &&
                                  resolvedValues.slice(0, 4).map((val) => (
                                    <Badge
                                      key={val}
                                      variant="outline"
                                      className="font-mono text-[10px]"
                                    >
                                      {val}
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          )}
                      </div>
                    )
                  })}
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold">
                  Fontes de Entrada e Aliases SQL
                </Label>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {txTransformInputs.length} selecionada(s)
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {upstreamDataNodes.map((n, idx) => {
                  const matchedInput = txTransformInputs.find(
                    (i) => i.nodeId === n.id,
                  )
                  const isSelected = matchedInput !== undefined
                  const aliasInvalid =
                    isSelected && !validAliasPattern.test(matchedInput.alias)

                  return (
                    <div
                      key={n.id}
                      className={cn(
                        'border-border/80 flex items-center justify-between gap-2 rounded-md border p-2',
                        isSelected && 'border-primary/50 bg-primary/5',
                      )}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (onSetTxTransformInputs === undefined) return
                            if (checked === true) {
                              const nextAlias = sanitizeSqlAlias(
                                n.label,
                                idx + 1,
                              )
                              onSetTxTransformInputs([
                                ...txTransformInputs,
                                { nodeId: n.id, alias: nextAlias },
                              ])
                              return
                            }
                            onSetTxTransformInputs(
                              txTransformInputs.filter(
                                (i) => i.nodeId !== n.id,
                              ),
                            )
                          }}
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-xs font-medium">
                            {n.label}
                          </span>
                          <span className="text-muted-foreground truncate text-[10px]">
                            {n.badge}
                          </span>
                        </div>
                      </label>

                      {isSelected && (
                        <Input
                          value={matchedInput.alias}
                          onChange={(e) => {
                            if (onSetTxTransformInputs === undefined) return
                            const nextAlias = e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9_]/gu, '')
                            onSetTxTransformInputs(
                              txTransformInputs.map((item) =>
                                item.nodeId === n.id
                                  ? { ...item, alias: nextAlias }
                                  : item,
                              ),
                            )
                          }}
                          aria-label={`Alias SQL para ${n.label}`}
                          className={cn(
                            'h-7 w-52 shrink-0 font-mono text-xs',
                            aliasInvalid && 'border-destructive',
                          )}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              {hasInvalidTransformInputs && txTransformInputs.length > 0 && (
                <p className="text-destructive text-[11px]">
                  Cada fonte selecionada deve ter um alias único em snake_case
                  (ex: redmine_horas).
                </p>
              )}
            </div>

            {transformInputSources.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-xs">
                  Colunas disponíveis por fonte (clique para inserir no SQL):
                </span>
                <div className="flex flex-col gap-1.5">
                  {transformInputSources.map((src) => (
                    <div
                      key={src.nodeId}
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {src.alias}
                      </Badge>
                      {src.columns.map((col) => (
                        <Badge
                          key={`${src.alias}.${col.name}`}
                          variant="secondary"
                          className="hover:bg-primary/15 cursor-pointer font-mono text-[11px]"
                          onClick={() =>
                            onSetSqlQueryText(
                              `${sqlQueryText} ${src.alias}.${col.name}`,
                            )
                          }
                        >
                          {src.alias}.{col.name}{' '}
                          <span className="text-muted-foreground ml-0.5">
                            ({col.type})
                          </span>
                        </Badge>
                      ))}
                    </div>
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
                  {transformInputSources.length >= 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        const firstSrc = transformInputSources.find(() => true)
                        if (firstSrc === undefined) return
                        const firstCols = firstSrc.columns
                          .slice(0, 3)
                          .map((c) => `${firstSrc.alias}.${c.name}`)
                          .join(', ')
                        onSetSqlQueryText(
                          `SELECT ${firstCols} FROM ${firstSrc.alias}`,
                        )
                      }}
                    >
                      SELECT básico
                    </Button>
                  )}
                  {transformInputSources.length >= 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        const [firstSrc, secondSrc] = transformInputSources
                        if (firstSrc === undefined || secondSrc === undefined)
                          return
                        const colA =
                          firstSrc.columns.find(() => true)?.name ?? 'id'
                        const colB =
                          secondSrc.columns.find(() => true)?.name ?? 'id'
                        onSetSqlQueryText(
                          `SELECT ${firstSrc.alias}.${colA}, ${secondSrc.alias}.${colB}\nFROM ${firstSrc.alias}\nJOIN ${secondSrc.alias} ON ${firstSrc.alias}.${colA} = ${secondSrc.alias}.${colB}`,
                        )
                      }}
                    >
                      JOIN
                    </Button>
                  )}
                  {transformInputSources.length >= 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        const firstSrc = transformInputSources.find(() => true)
                        if (firstSrc === undefined) return
                        const dimCol =
                          firstSrc.columns.find((c) => c.type === 'string')
                            ?.name ?? 'id'
                        onSetSqlQueryText(
                          `SELECT ${dimCol}, COUNT(*) AS total\nFROM ${firstSrc.alias}\nGROUP BY ${dimCol}`,
                        )
                      }}
                    >
                      GROUP BY
                    </Button>
                  )}
                  {transformInputSources.length >= 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        const [firstSrc, secondSrc] = transformInputSources
                        if (firstSrc === undefined || secondSrc === undefined)
                          return
                        const colA =
                          firstSrc.columns.find(() => true)?.name ?? 'id'
                        const colB =
                          secondSrc.columns.find(() => true)?.name ?? 'id'
                        onSetSqlQueryText(
                          `SELECT ${colA} AS chave FROM ${firstSrc.alias}\nUNION ALL\nSELECT ${colB} AS chave FROM ${secondSrc.alias}`,
                        )
                      }}
                    >
                      UNION ALL
                    </Button>
                  )}
                </div>
              </div>
              <Textarea
                value={sqlQueryText}
                onChange={(e) => onSetSqlQueryText(e.target.value)}
                rows={5}
                placeholder="SELECT alias.coluna, COUNT(*) AS total FROM alias GROUP BY alias.coluna"
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
                {transformInputSources.length > 1 && (
                  <div className="border-border/60 bg-muted/20 flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
                    <span className="text-muted-foreground text-[11px]">
                      Entrada:
                    </span>
                    {transformInputSources.map((src, idx) => {
                      const isActive =
                        selectedBeforeInputNodeId !== ''
                          ? selectedBeforeInputNodeId === src.nodeId
                          : idx === 0

                      return (
                        <button
                          key={src.nodeId}
                          type="button"
                          onClick={() =>
                            setSelectedBeforeInputNodeId(src.nodeId)
                          }
                          className={cn(
                            'rounded px-2 py-0.5 font-mono text-[11px] transition-colors',
                            isActive && 'bg-primary text-primary-foreground',
                            !isActive &&
                              'bg-muted text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {src.alias} ({src.rows.length}×{src.columns.length})
                        </button>
                      )
                    })}
                  </div>
                )}
                {(() => {
                  const matchedInput = transformInputSources.find(
                    (src) => src.nodeId === selectedBeforeInputNodeId,
                  )
                  const fallbackInput = transformInputSources.find(() => true)
                  const activeSource = matchedInput ?? fallbackInput
                  const activeCols =
                    activeSource !== undefined
                      ? activeSource.columns
                      : beforeCols
                  const activeRows =
                    activeSource !== undefined ? activeSource.rows : beforeRows

                  return (
                    <div className="max-h-52 overflow-auto">
                      {activeCols.length === 0 && (
                        <div className="text-muted-foreground p-6 text-center text-xs">
                          Nenhum dado no nó anterior ainda.
                        </div>
                      )}
                      {activeCols.length > 0 && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {activeCols.map((c) => (
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
                            {activeRows.map((r, rIdx) => (
                              <TableRow key={`bef-${rIdx}`}>
                                {activeCols.map((c) => (
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
                  )
                })()}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {selectedAddNodeType === 'output' && (
          <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-xs font-semibold">Tipo de gráfico</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Modelo visual da visualização"
                      className="h-9 w-full justify-between px-3 text-xs font-normal"
                    >
                      <span className="truncate">
                        {(() => {
                          const activeModel = GENERIC_CHART_MODELS.find(
                            (m) => m.id === newNodeWidgetType,
                          )

                          if (activeModel !== undefined) {
                            return activeModel.label
                          }

                          return newNodeWidgetType
                        })()}
                      </span>
                      <ChevronDown
                        data-icon="inline-end"
                        className="opacity-60"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64" align="start">
                    <DropdownMenuLabel className="text-xs">
                      Escolha a visualização
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-xs">
                          <BarChart3 data-icon="inline-start" />
                          <span>Barras</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-64">
                          {[
                            'bar_vertical',
                            'bar_horizontal',
                            'bar_stacked',
                            'bar_horizontal_stacked',
                            'bar_grouped',
                            'split_pane_chart',
                          ].map((id) => {
                            const model = GENERIC_CHART_MODELS.find(
                              (m) => m.id === id,
                            )

                            if (model === undefined) return null

                            const isDisabled =
                              isRemoteAggregateOutput &&
                              (isRemoteAggregateUnsupportedVisual(model.id) ||
                                ((model.id === 'bar_stacked' ||
                                  model.id === 'bar_horizontal_stacked') &&
                                  outputStackColumn !== ''))

                            return (
                              <DropdownMenuItem
                                key={model.id}
                                disabled={isDisabled}
                                onSelect={() => onSelectWidgetType(model.id)}
                                className="flex flex-col items-start gap-0.5 text-xs"
                              >
                                <span className="font-medium">
                                  {model.label}
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  {model.description}
                                </span>
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-xs">
                          <LineChart data-icon="inline-start" />
                          <span>Linhas & Áreas</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-64">
                          {[
                            'line',
                            'line_reference',
                            'area',
                            'area_stacked',
                            'combo_multiaxis',
                          ].map((id) => {
                            const model = GENERIC_CHART_MODELS.find(
                              (m) => m.id === id,
                            )

                            if (model === undefined) return null

                            const isDisabled =
                              isRemoteAggregateOutput &&
                              (isRemoteAggregateUnsupportedVisual(model.id) ||
                                (model.id === 'area_stacked' &&
                                  outputStackColumn !== ''))

                            return (
                              <DropdownMenuItem
                                key={model.id}
                                disabled={isDisabled}
                                onSelect={() => onSelectWidgetType(model.id)}
                                className="flex flex-col items-start gap-0.5 text-xs"
                              >
                                <span className="font-medium">
                                  {model.label}
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  {model.description}
                                </span>
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-xs">
                          <PieChart data-icon="inline-start" />
                          <span>Proporção & Radar</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-60">
                          {['pie_donut', 'radar'].map((id) => {
                            const model = GENERIC_CHART_MODELS.find(
                              (m) => m.id === id,
                            )

                            if (model === undefined) return null

                            const isDisabled =
                              isRemoteAggregateOutput &&
                              isRemoteAggregateUnsupportedVisual(model.id)

                            return (
                              <DropdownMenuItem
                                key={model.id}
                                disabled={isDisabled}
                                onSelect={() => onSelectWidgetType(model.id)}
                                className="flex flex-col items-start gap-0.5 text-xs"
                              >
                                <span className="font-medium">
                                  {model.label}
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  {model.description}
                                </span>
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-xs">
                          <Table2 data-icon="inline-start" />
                          <span>Tabelas & KPI</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-64">
                          {[
                            'pivot_matrix',
                            'tree_grid',
                            'conditional_table',
                            'kpi_card',
                          ].map((id) => {
                            const model = GENERIC_CHART_MODELS.find(
                              (m) => m.id === id,
                            )

                            if (model === undefined) return null

                            const isDisabled =
                              isRemoteAggregateOutput &&
                              isRemoteAggregateUnsupportedVisual(model.id)

                            return (
                              <DropdownMenuItem
                                key={model.id}
                                disabled={isDisabled}
                                onSelect={() => onSelectWidgetType(model.id)}
                                className="flex flex-col items-start gap-0.5 text-xs"
                              >
                                <span className="font-medium">
                                  {model.label}
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  {model.description}
                                </span>
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="text-muted-foreground text-[11px]">
                  {selectedModelDesc}
                </div>

                {(newNodeWidgetType === 'bar_vertical' ||
                  newNodeWidgetType === 'bar_horizontal' ||
                  newNodeWidgetType === 'bar_stacked' ||
                  newNodeWidgetType === 'bar_horizontal_stacked') && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <ToggleGroup
                      type="single"
                      size="sm"
                      variant="outline"
                      value={
                        newNodeWidgetType === 'bar_horizontal' ||
                        newNodeWidgetType === 'bar_horizontal_stacked'
                          ? 'horizontal'
                          : 'vertical'
                      }
                      onValueChange={(nextOrientation) => {
                        if (nextOrientation === '') return
                        const isStacked =
                          newNodeWidgetType === 'bar_stacked' ||
                          newNodeWidgetType === 'bar_horizontal_stacked'

                        if (nextOrientation === 'horizontal') {
                          if (isStacked) {
                            onSelectWidgetType('bar_horizontal_stacked')
                            return
                          }

                          onSelectWidgetType('bar_horizontal')
                          return
                        }

                        if (isStacked) {
                          onSelectWidgetType('bar_stacked')
                          return
                        }

                        onSelectWidgetType('bar_vertical')
                      }}
                    >
                      <ToggleGroupItem value="vertical" className="text-[11px]">
                        Em pé
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="horizontal"
                        className="text-[11px]"
                      >
                        Deitado
                      </ToggleGroupItem>
                    </ToggleGroup>

                    <ToggleGroup
                      type="single"
                      size="sm"
                      variant="outline"
                      value={
                        newNodeWidgetType === 'bar_stacked' ||
                        newNodeWidgetType === 'bar_horizontal_stacked'
                          ? 'stacked'
                          : 'normal'
                      }
                      onValueChange={(nextStack) => {
                        if (nextStack === '') return
                        const isHorizontal =
                          newNodeWidgetType === 'bar_horizontal' ||
                          newNodeWidgetType === 'bar_horizontal_stacked'

                        if (nextStack === 'stacked') {
                          if (isHorizontal) {
                            onSelectWidgetType('bar_horizontal_stacked')
                            return
                          }

                          onSelectWidgetType('bar_stacked')
                          return
                        }

                        if (isHorizontal) {
                          onSelectWidgetType('bar_horizontal')
                          return
                        }

                        onSelectWidgetType('bar_vertical')
                      }}
                    >
                      <ToggleGroupItem value="normal" className="text-[11px]">
                        Normal
                      </ToggleGroupItem>
                      <ToggleGroupItem value="stacked" className="text-[11px]">
                        Empilhado
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                )}
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
                <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                  <Label className="text-xs font-semibold">
                    Mapeamento das colunas
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-[11px]"
                      >
                        <SlidersHorizontal data-icon="inline-start" />
                        Personalizar exibição &amp; limite
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold">
                            Rótulos, descrição e densidade
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            Ajuste textos exibidos e escolha entre Top-N ou
                            listar todos os registros com scroll.
                          </span>
                        </div>

                        <div className="flex flex-col gap-1">
                          <Label className="text-[11px]">
                            Descrição / Subtítulo do gráfico
                          </Label>
                          <Input
                            value={outputSubtitle}
                            onChange={(e) =>
                              onSetOutputSubtitle?.(e.target.value)
                            }
                            placeholder={selectedModelDesc}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px]">
                              Rótulo da Categoria
                            </Label>
                            <Input
                              value={outputCategoryLabel}
                              onChange={(e) =>
                                onSetOutputCategoryLabel?.(e.target.value)
                              }
                              placeholder="Ex: Membro"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px]">
                              Rótulo da Métrica
                            </Label>
                            <Input
                              value={outputMetricLabel}
                              onChange={(e) =>
                                onSetOutputMetricLabel?.(e.target.value)
                              }
                              placeholder="Ex: Total"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <Label className="text-[11px]">
                            Rótulo da 2ª Métrica (opcional)
                          </Label>
                          <Input
                            value={outputSecondaryMetricLabel}
                            onChange={(e) =>
                              onSetOutputSecondaryMetricLabel?.(e.target.value)
                            }
                            placeholder="Ex: Meta / Previsto"
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="border-border/60 flex items-center justify-between gap-3 rounded-md border p-2.5">
                          <div className="flex flex-col gap-0.5">
                            <Label className="text-xs font-medium">
                              Mostrar todos (com scroll)
                            </Label>
                            <span className="text-muted-foreground text-[10px]">
                              Evita cortar listas grandes (ex.: 150 membros)
                            </span>
                          </div>
                          <Switch
                            checked={outputShowAllRows}
                            onCheckedChange={(checked) =>
                              onSetOutputShowAllRows?.(checked)
                            }
                            aria-label="Mostrar todos os registros com scroll"
                          />
                        </div>

                        {!outputShowAllRows && (
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px]">
                              Limite máximo de grupos exibidos
                            </Label>
                            <Select
                              value={String(outputMaxRows)}
                              onValueChange={(v) => {
                                const parsed = Number.parseInt(v, 10)
                                if (!Number.isNaN(parsed) && parsed > 0) {
                                  onSetOutputMaxRows?.(parsed)
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="25">25 grupos</SelectItem>
                                  <SelectItem value="50">50 grupos</SelectItem>
                                  <SelectItem value="100">
                                    100 grupos (padrão)
                                  </SelectItem>
                                  <SelectItem value="250">
                                    250 grupos
                                  </SelectItem>
                                  <SelectItem value="500">
                                    500 grupos
                                  </SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <div className="flex flex-col gap-1">
                          <Label className="text-[11px]">
                            Exibição de Valores
                          </Label>
                          <Select
                            value={outputValueDisplayMode}
                            onValueChange={(v) => {
                              if (v === 'absolute' || v === 'percentage') {
                                onSetOutputValueDisplayMode?.(v)
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="absolute">
                                  Valores absolutos
                                </SelectItem>
                                <SelectItem value="percentage">
                                  Percentual (%)
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="border-border/60 flex items-center justify-between gap-3 rounded-md border p-2.5">
                          <div className="flex flex-col gap-0.5">
                            <Label className="text-xs font-medium">
                              Popover ao passar o mouse
                            </Label>
                            <span className="text-muted-foreground text-[10px]">
                              Exibe tooltip interativo sobre barras/pontos
                            </span>
                          </div>
                          <Switch
                            checked={outputTooltipEnabled}
                            onCheckedChange={(checked) =>
                              onSetOutputTooltipEnabled?.(checked)
                            }
                            aria-label="Ativar popover de hover no gráfico"
                          />
                        </div>

                        {outputTooltipEnabled &&
                          (() => {
                            const hasSec =
                              outputSecondaryMetricColumn.trim() !== ''
                            const hasStk = outputStackColumn.trim() !== ''
                            const supportedFields = getSupportedTooltipFields(
                              newNodeWidgetType,
                              hasSec,
                              hasStk,
                            )
                            let activeFields = resolveDefaultTooltipFields(
                              newNodeWidgetType,
                              hasSec,
                              hasStk,
                            )
                            if (outputTooltipFields !== undefined) {
                              activeFields = outputTooltipFields
                            }

                            return (
                              <div className="border-border/60 flex flex-col gap-2 rounded-md border p-2.5">
                                <span className="text-foreground text-[11px] font-semibold">
                                  Campos do Popover (Hover)
                                </span>
                                <div className="space-y-1.5">
                                  {supportedFields.map((fieldOpt) => {
                                    const isChecked = activeFields.includes(
                                      fieldOpt.id,
                                    )
                                    return (
                                      <label
                                        key={fieldOpt.id}
                                        className="flex cursor-pointer items-start gap-2 text-xs"
                                      >
                                        <Checkbox
                                          checked={isChecked}
                                          onCheckedChange={(checked) => {
                                            let next = activeFields.filter(
                                              (id) => id !== fieldOpt.id,
                                            )
                                            if (checked === true) {
                                              next = Array.from(
                                                new Set([
                                                  ...activeFields,
                                                  fieldOpt.id,
                                                ]),
                                              )
                                            }
                                            onSetOutputTooltipFields?.(next)
                                          }}
                                        />
                                        <div className="flex flex-col">
                                          <span className="text-[11px] leading-tight font-medium">
                                            {fieldOpt.label}
                                          </span>
                                          <span className="text-muted-foreground text-[10px] leading-tight">
                                            {fieldOpt.description}
                                          </span>
                                        </div>
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {chartRequirements.category && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label className="text-[11px]">
                      {(() => {
                        if (
                          newNodeWidgetType === 'bar_horizontal' ||
                          newNodeWidgetType === 'bar_horizontal_stacked'
                        ) {
                          return 'Eixo Y (Categoria / Rótulo)'
                        }

                        if (
                          newNodeWidgetType === 'pie_donut' ||
                          newNodeWidgetType === 'radar'
                        ) {
                          return 'Fatia / Categoria'
                        }

                        return 'Eixo X / Categoria Principal'
                      })()}
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
                    {(() => {
                      if (
                        newNodeWidgetType === 'bar_horizontal' ||
                        newNodeWidgetType === 'bar_horizontal_stacked'
                      ) {
                        return 'Eixo X (Valor / Métrica)'
                      }

                      if (
                        newNodeWidgetType === 'pie_donut' ||
                        newNodeWidgetType === 'radar'
                      ) {
                        return 'Valor / Medida'
                      }

                      if (newNodeWidgetType === 'kpi_card') {
                        return 'Valor Principal (KPI)'
                      }

                      return 'Eixo Y / Métrica Principal'
                    })()}
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
