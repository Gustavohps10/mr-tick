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
  Check,
  Code2,
  Columns,
  Database,
  Filter,
  Loader2,
  SlidersHorizontal,
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
  type WidgetId,
  type WidgetSpan,
} from '../lib/analytics-types'
import { AnalyticsError } from './analytics-error'
import { SourceExecutionControl } from './source-execution-control'

export interface WorkflowNodeConfigDialogProps {
  queryExecution: AnalyticsExecutionRequest | undefined
  onQueryExecutionChange: (value: AnalyticsExecutionRequest | undefined) => void
  open: boolean
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
  onSetNodeFilterValue: (filterId: string, val: AnalyticsFilterValue) => void
  onOpenChange: (open: boolean) => void
  onSelectAddNodeType: (type: AddNodeTypeOption) => void
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
}

const ETL_PRIMARY_CARDS: Array<{
  id: AddNodeTypeOption
  title: string
  description: string
  badge: string
  Icon: typeof Database
}> = [
  {
    id: 'source',
    title: 'Extrair dados',
    description:
      'Conecta a uma fonte de dados (Redmine, Jira, Linear) para consulta direta e extração.',
    badge: 'EXTRACT',
    Icon: Database,
  },
  {
    id: 'transform',
    title: 'Transformar dados (DuckDB SQL)',
    description:
      'Escreva SQL livremente sobre o nó anterior com comparação ao vivo: Antes (Entrada) vs Depois (Resultado).',
    badge: 'TRANSFORM',
    Icon: SlidersHorizontal,
  },
  {
    id: 'output',
    title: 'Publicar Visualização (Gráfico ou Tabela)',
    description:
      'Renderiza 1-para-1 gráfico ou tabela na Grade mapeando Eixo X, Métrica e Linha de Meta.',
    badge: 'LOAD',
    Icon: BarChart3,
  },
]

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
  globalStartDate?: string
  globalEndDate?: string
}

function DynamicFilterField({
  filterDef,
  nodeFilterValues,
  onSetNodeFilterValue,
  dynamicFilterOptions,
  globalStartDate,
  globalEndDate,
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

    let isCustomMode = false

    if (range.from || range.to) {
      if (globalStartDate && range.from && range.from !== globalStartDate)
        isCustomMode = true
      if (globalEndDate && range.to && range.to !== globalEndDate)
        isCustomMode = true
    }

    let effectiveFrom = ''
    if (globalStartDate !== undefined) effectiveFrom = globalStartDate
    if (isCustomMode) effectiveFrom = range.from

    let effectiveTo = ''
    if (globalEndDate !== undefined) effectiveTo = globalEndDate
    if (isCustomMode) effectiveTo = range.to

    let globalFromLabel = '-'
    if (globalStartDate !== undefined && globalStartDate !== '')
      globalFromLabel = globalStartDate

    let globalToLabel = '-'
    if (globalEndDate !== undefined && globalEndDate !== '')
      globalToLabel = globalEndDate

    let effectiveFromLabel = '-'
    if (effectiveFrom !== '') effectiveFromLabel = effectiveFrom

    let effectiveToLabel = '-'
    if (effectiveTo !== '') effectiveToLabel = effectiveTo

    let modeStatusText = `Painel: ${effectiveFromLabel} a ${effectiveToLabel}`
    if (isCustomMode) modeStatusText = 'Período personalizado'

    let selectModeValue = 'global'
    if (isCustomMode) selectModeValue = 'custom'

    const handleModeChange = (nextMode: string) => {
      if (nextMode === 'global') {
        onSetNodeFilterValue(filterDef.id, {
          from: '',
          to: '',
        })
        return
      }

      onSetNodeFilterValue(filterDef.id, {
        from: effectiveFrom,
        to: effectiveTo,
      })
    }

    return (
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">{filterDef.label}</Label>
          <span className="text-muted-foreground font-mono text-[11px]">
            {modeStatusText}
          </span>
        </div>

        {Boolean(filterDef.description) && (
          <span className="text-muted-foreground text-[10px]">
            {filterDef.description}
          </span>
        )}

        <Select value={selectModeValue} onValueChange={handleModeChange}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="global" className="py-1.5 text-xs">
                Usar período do painel ({globalFromLabel} a {globalToLabel})
              </SelectItem>
              <SelectItem value="custom" className="py-1.5 text-xs">
                Personalizado (Definir datas específicas neste nó)
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        {isCustomMode && (
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={range.from}
              onChange={(e) =>
                onSetNodeFilterValue(filterDef.id, {
                  from: e.target.value,
                  to: range.to,
                })
              }
              className="h-8 font-mono text-xs"
              placeholder="De"
            />
            <Input
              type="date"
              value={range.to}
              onChange={(e) =>
                onSetNodeFilterValue(filterDef.id, {
                  from: range.from,
                  to: e.target.value,
                })
              }
              className="h-8 font-mono text-xs"
              placeholder="Até"
            />
          </div>
        )}
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
  onSetNodeFilterValue,
  onOpenChange,
  onSelectAddNodeType,
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
}: WorkflowNodeConfigDialogProps) {
  let dialogTitle = `Adicionar Elemento ao Workflow de “${activeSpace.title}”`
  let dialogDescription =
    'Escolha a etapa do pipeline: Extrair, Transformar ou Publicar Visualização.'

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
        (newNodeWidgetType !== 'kpi_card' && outputCategoryColumn === '') ||
        isOutputRemotePostProcessingUnsupported))

  const handlePrimaryAction = () => {
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

  let filterSuffix = 'filtros'
  if (selectedDatasetManifest?.supportedFilters?.length === 1)
    filterSuffix = 'filtro'

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[96vw] max-w-4xl min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-8">
          <DialogTitle className="text-base font-bold">
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-4">
            {!editingNodeId && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {ETL_PRIMARY_CARDS.map((card) => {
                    const isSelected = selectedAddNodeType === card.id
                    const CardIcon = card.Icon

                    let cardBorderClass =
                      'border-border/60 hover:border-border hover:bg-muted/30'
                    let iconBgClass = 'bg-muted text-muted-foreground'
                    let checkCircleClass = 'border-border/80'

                    if (isSelected) {
                      cardBorderClass =
                        'border-primary bg-primary/5 ring-primary shadow-xs ring-1'
                      iconBgClass = 'bg-primary text-primary-foreground'
                      checkCircleClass =
                        'border-primary bg-primary text-primary-foreground'
                    }

                    return (
                      <div
                        key={card.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectAddNodeType(card.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ')
                            onSelectAddNodeType(card.id)
                        }}
                        className={cn(
                          'relative flex cursor-pointer flex-col justify-between rounded-lg border-2 p-3 text-left transition-all',
                          cardBorderClass,
                        )}
                      >
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <div className={cn('rounded-md p-2', iconBgClass)}>
                              <CardIcon className="size-4" />
                            </div>
                            <div
                              className={cn(
                                'flex size-5 items-center justify-center rounded-full border transition-colors',
                                checkCircleClass,
                              )}
                            >
                              {isSelected && <Check className="size-3" />}
                            </div>
                          </div>
                          <div className="text-foreground text-xs font-semibold">
                            {card.title}
                          </div>
                          <div className="text-muted-foreground mt-1 text-[11px] leading-snug">
                            {card.description}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="mt-3 w-fit font-mono text-[10px] font-medium"
                        >
                          {card.badge}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
                  <Label className="text-xs font-semibold">
                    Conexão analítica
                  </Label>
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
                {Boolean(
                  selectedDatasetManifest?.supportedFilters &&
                  selectedDatasetManifest.supportedFilters.length > 0,
                ) && (
                  <div className="border-border/60 bg-muted/20 flex flex-col gap-3 rounded-lg border p-3 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Filter className="text-muted-foreground size-4" />
                        <Label className="text-foreground text-xs font-semibold">
                          Filtros
                        </Label>
                      </div>
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {selectedDatasetManifest?.supportedFilters?.length}{' '}
                        {filterSuffix}
                      </Badge>
                    </div>
                    {filterOptionsFailures.map((failure) => (
                      <div key={failure.source} role="alert">
                        {failure.source}: {failure.message}
                      </div>
                    ))}
                    <span className="text-muted-foreground text-[11px]">
                      Defina os parâmetros para filtrar os registros diretamente
                      na consulta.
                    </span>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {selectedDatasetManifest?.supportedFilters?.map(
                        (filterDef) => (
                          <DynamicFilterField
                            key={filterDef.id}
                            filterDef={filterDef}
                            nodeFilterValues={nodeFilterValues}
                            onSetNodeFilterValue={onSetNodeFilterValue}
                            dynamicFilterOptions={dynamicFilterOptions}
                            globalStartDate={globalStartDate}
                            globalEndDate={globalEndDate}
                          />
                        ),
                      )}
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
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
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
                      Selecione quais colunas deseja incluir neste nó. Os dados
                      são carregados conforme o formato original da fonte.
                    </span>

                    <div className="border-border/70 bg-card/40 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-2.5 sm:grid-cols-2">
                      {discoveredSchemaColumns.map((col) => {
                        const isColChecked = nodeSelectedColumns.includes(
                          col.name,
                        )

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
                                  onToggleSelectedColumn(
                                    col.name,
                                    Boolean(checked),
                                  )
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
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione o nó anterior..." />
                    </SelectTrigger>
                    <SelectContent>
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
                    </SelectContent>
                  </Select>
                </div>

                {upstreamAvailableColumns.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-[11px]">
                      Colunas disponíveis no nó anterior (clique para inserir no
                      SQL):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {upstreamAvailableColumns.map((col) => (
                        <Badge
                          key={col.name}
                          variant="secondary"
                          className="hover:bg-primary/15 cursor-pointer font-mono text-[10px]"
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

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold">
                      <Code2 className="text-primary size-3.5" />
                      Consulta SQL de Transformação (Livre sobre{' '}
                      <code>
                        {'input; input_1, input_2 para múltiplas entradas'}
                      </code>
                      )
                    </Label>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      SELECT com projeção explícita, WHERE, CASE WHEN, GROUP BY
                      e JOIN. FORMULA e ORDER BY
                    </span>
                  </div>
                  <textarea
                    value={sqlQueryText}
                    onChange={(e) => onSetSqlQueryText(e.target.value)}
                    rows={4}
                    placeholder="SELECT coluna, SUM(metrica) AS total FROM input GROUP BY coluna"
                    className="border-input bg-background focus:ring-primary w-full rounded-md border p-2.5 font-mono text-xs focus:ring-1 focus:outline-none"
                  />
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
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="border-border/70 bg-muted/10 flex flex-col overflow-hidden rounded-lg border">
                    <div className="bg-muted/40 flex items-center justify-between border-b px-3 py-1.5">
                      <span className="text-xs font-semibold">
                        Antes (Entrada Bruta / Nó Anterior)
                      </span>
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {transformPreviewBeforePayload.rows.length} linhas •{' '}
                        {transformPreviewBeforePayload.columns.length} cols
                      </Badge>
                    </div>
                    <div className="max-h-44 overflow-auto">
                      {beforeCols.length === 0 && (
                        <div className="text-muted-foreground p-4 text-center text-xs">
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
                                  className="h-7 px-2 font-mono text-[10px]"
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
                                    className="max-w-[110px] truncate px-2 py-1 font-mono text-[10px]"
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
                  </div>

                  <div className="border-primary/40 bg-primary/5 flex flex-col overflow-hidden rounded-lg border">
                    <div className="bg-primary/10 flex items-center justify-between border-b px-3 py-1.5">
                      <span className="text-primary flex items-center gap-1 text-xs font-semibold">
                        <ArrowRight className="size-3.5" />
                        Depois (Resultado Transformado pelo SQL)
                      </span>
                      <Badge
                        variant="default"
                        className="font-mono text-[10px]"
                      >
                        {transformPreviewAfterPayload.rows.length} linhas •{' '}
                        {transformPreviewAfterPayload.columns.length} cols
                      </Badge>
                    </div>
                    <div className="max-h-44 overflow-auto">
                      {afterCols.length === 0 && (
                        <div className="text-muted-foreground p-4 text-center text-xs">
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
                                  className="h-7 px-2 font-mono text-[10px] font-bold"
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
                                    className="max-w-[110px] truncate px-2 py-1 font-mono text-[10px]"
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
                  </div>
                </div>
              </div>
            )}

            {selectedAddNodeType === 'output' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label className="text-xs font-semibold">
                    Modelo Visual do Gráfico (Canônico Shadcn Charts)
                  </Label>
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
                    Nó de Dados Upstream (Origem do Gráfico)
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
                <div className="border-border/70 bg-muted/15 grid grid-cols-1 gap-3 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <Label className="text-xs font-semibold">
                      Mapeamento Explícito de Colunas &amp; Linha de Referência
                    </Label>
                  </div>

                  <div className="flex flex-col gap-1">
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
                        className="h-8 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">
                          Selecione a dimensão
                        </SelectItem>
                        {upstreamAvailableColumns.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.label} ({col.name})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
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
                        className="h-8 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">
                          Contar registros
                        </SelectItem>
                        {upstreamAvailableColumns.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.label} ({col.name})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px]">
                      Métrica Secundária / Alternador
                    </Label>
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
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {upstreamAvailableColumns.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.label} ({col.name})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
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
                        className="h-8 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          Sem empilhamento extra
                        </SelectItem>
                        {upstreamAvailableColumns.map((col) => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.label} ({col.name})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
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
                        className="h-8 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                      </SelectContent>
                    </Select>
                  </div>

                  {outputReferenceLineMode === 'fixed_target' && (
                    <div className="flex flex-col gap-1">
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
            )}
          </div>
        </div>

        <DialogFooter className="bg-muted/20 flex shrink-0 items-center justify-end gap-2 border-t px-6 py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handlePrimaryAction}
            disabled={isSubmitDisabled}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
