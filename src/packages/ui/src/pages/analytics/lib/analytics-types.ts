import type {
  AnalyticsExecutionRequest,
  AnalyticsFilterDefinition,
  AnalyticsFilterOption,
  AnalyticsFilterType,
  AnalyticsFilterValue,
  AnalyticsQueryResult,
  AnalyticsSyncState,
  AnalyticsSyncStrategy,
} from '@mr-tick/application'
import type { AnalyticsLoadProgressEvent } from '@mr-tick/shared/transport'

export type {
  AnalyticsFilterDefinition,
  AnalyticsFilterOption,
  AnalyticsFilterType,
  AnalyticsFilterValue,
  AnalyticsLoadProgressEvent,
  AnalyticsSyncState,
  AnalyticsSyncStrategy,
}

export type CanvasLayerMode = 'front' | 'background'

export type WidgetSpan = 1 | 2 | 3

export type WidgetId =
  | 'bar_vertical'
  | 'bar_horizontal'
  | 'bar_stacked'
  | 'bar_horizontal_stacked'
  | 'bar_grouped'
  | 'combo_multiaxis'
  | 'line'
  | 'line_reference'
  | 'split_pane_chart'
  | 'area'
  | 'area_stacked'
  | 'pie_donut'
  | 'radar'
  | 'pivot_matrix'
  | 'tree_grid'
  | 'conditional_table'
  | 'kpi_card'

export interface GenericChartModelOption {
  id: WidgetId
  label: string
  description: string
  category: 'bar' | 'line' | 'area' | 'pie' | 'table' | 'other'
}

export const GENERIC_CHART_MODELS: GenericChartModelOption[] = [
  {
    id: 'bar_vertical',
    label: 'Barras Verticais (Em pé)',
    description: 'Compara valores por categoria em colunas verticais',
    category: 'bar',
  },
  {
    id: 'bar_horizontal',
    label: 'Barras Horizontais (Deitado)',
    description:
      'Ranking em barras horizontais, ideal para rótulos longos ou extensos',
    category: 'bar',
  },
  {
    id: 'bar_stacked',
    label: 'Barras Verticais Empilhadas (Em pé)',
    description: 'Composição de séries empilhadas sobre cada categoria',
    category: 'bar',
  },
  {
    id: 'bar_horizontal_stacked',
    label: 'Barras Horizontais Empilhadas (Deitado)',
    description: 'Composição de séries empilhadas em barras horizontais',
    category: 'bar',
  },
  {
    id: 'bar_grouped',
    label: 'Barras Agrupadas (Multi-Métrica)',
    description: 'Comparação lado a lado de 2 ou mais métricas por categoria',
    category: 'bar',
  },
  {
    id: 'combo_multiaxis',
    label: 'Combo Multi-Eixo (Barra + Linha)',
    description:
      'Sobrepõe barras na métrica principal com linha na métrica secundária',
    category: 'bar',
  },
  {
    id: 'line',
    label: 'Linhas Contínuas',
    description: 'Evolução contínua de séries ao longo de categorias ou datas',
    category: 'line',
  },
  {
    id: 'line_reference',
    label: 'Linha com Meta / Referência',
    description: 'Série contínua com linha horizontal de meta ou média',
    category: 'line',
  },
  {
    id: 'split_pane_chart',
    label: 'Split-Pane 70/30 (Gráfico + Tabela Lateral)',
    description:
      'Gráfico de barras (70%) acoplado à tabela detalhada de registros (30%)',
    category: 'bar',
  },
  {
    id: 'pivot_matrix',
    label: 'Tabela Matriz Dinâmica (Pivô 2D)',
    description:
      'Cruzamento Linha × Coluna dinâmica com coluna Total e rodapé somado',
    category: 'table',
  },
  {
    id: 'tree_grid',
    label: 'TreeGrid Hierárquico (Níveis + Rollup)',
    description:
      'Árvore expansível em múltiplos níveis com soma recursiva dos grupos',
    category: 'table',
  },
  {
    id: 'conditional_table',
    label: 'DataTable Condicional (Sliders & Gradiente)',
    description:
      'Tabela auditável com faixas de tolerância e destaque em gradiente',
    category: 'table',
  },
  {
    id: 'kpi_card',
    label: 'Cartão Indicador / KPI & Meta',
    description:
      'Totalizador numérico em destaque com referência ou meta opcional',
    category: 'other',
  },
  {
    id: 'area',
    label: 'Área Preenchida',
    description: 'Volume e tendência acumulada ao longo do eixo principal',
    category: 'area',
  },
  {
    id: 'area_stacked',
    label: 'Área Empilhada (Composição)',
    description: 'Evolução de múltiplas séries empilhadas em camadas',
    category: 'area',
  },
  {
    id: 'pie_donut',
    label: 'Pizza / Rosca (Proporção)',
    description: 'Visualização circular com distribuição proporcional',
    category: 'pie',
  },
  {
    id: 'radar',
    label: 'Radar / Teia (Multidimensional)',
    description: 'Gráfico polar comparando múltiplos atributos',
    category: 'other',
  },
]

export type ChartVisualType = WidgetId

export type ReferenceLineMode =
  'none' | 'average' | 'weighted_ratio' | 'fixed_target'

export type AnalyticsValueDisplayMode = 'absolute' | 'percentage'

export type AnalyticsTooltipField =
  'category' | 'primary' | 'secondary' | 'series' | 'percentage' | 'total'

export interface SpaceWidgetConfig {
  id: string
  widgetType: WidgetId
  title: string
  subtitle: string
  datasetBadge: string
  sourceNodeId: string
  outputNodeId?: string
  chartVisualType: ChartVisualType
  span: WidgetSpan
  visible: boolean
  categoryColumn?: string
  metricColumn?: string
  secondaryMetricColumn?: string
  stackColumn?: string
  categoryLabel?: string
  metricLabel?: string
  secondaryMetricLabel?: string
  showAllRows?: boolean
  maxRows?: number
  valueDisplayMode?: AnalyticsValueDisplayMode
  tooltipEnabled?: boolean
  tooltipFields?: AnalyticsTooltipField[]
  referenceLineMode?: ReferenceLineMode
  referenceLineTarget?: number
  hierarchyColumns?: string[]
}

export type WorkflowNodeKind =
  'source' | 'transform' | 'filter' | 'join' | 'aggregate' | 'sql' | 'output'

export type FilterOperator =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_empty'

export type AggregationOperator = 'sum' | 'count' | 'count_distinct' | 'avg'

export type FormulaOperator =
  'divide' | 'multiply' | 'subtract' | 'add' | 'percent_of'

export interface CaseWhenRuleConfig {
  whenColumn: string
  operator: FilterOperator
  whenValue: string
  thenMode: 'column' | 'literal'
  thenValue: string
}

export interface NodeTransformConfig {
  filterColumn?: string
  filterOperator?: FilterOperator
  filterValue?: string
  additionalFilters?: Array<{
    filterColumn: string
    filterOperator: FilterOperator
    filterValue: string
  }>
  caseColumnName?: string
  caseWhenColumn?: string
  caseWhenValue?: string
  caseThenValue?: string
  caseRules?: CaseWhenRuleConfig[]
  caseElseMode?: 'column' | 'literal'
  caseElseValue?: string
  groupByColumn?: string
  pivotColumn?: string
  valueColumn?: string
  aggregation?: AggregationOperator
  formulaColumnName?: string
  formulaLeftColumn?: string
  formulaOperator?: FormulaOperator
  formulaRightColumn?: string
}

export type JoinOperationType = 'inner' | 'left' | 'full' | 'union'

export interface NodeJoinConfig {
  joinType: JoinOperationType
  leftNodeId?: string
  rightNodeId?: string
  leftKey: string
  rightKey: string
  formulaColumnName?: string
  formulaLeftColumn?: string
  formulaOperator?: FormulaOperator
  formulaRightColumn?: string
  postFormulaColumnName?: string
  postFormulaLeftColumn?: string
  postFormulaOperator?: FormulaOperator
  postFormulaRightColumn?: string
}

export interface NodeSqlConfig {
  sqlQuery: string
  inputAliases?: string[]
  templateId?: string
  snippetId?: string
}

export interface SourceFilterBinding {
  targetFilterId: string
  upstreamNodeId: string
  sourceColumn: string
  onEmptyUpstream: 'skip_empty' | 'fail'
}

export interface TransformInputBinding {
  nodeId: string
  alias: string
}

export type EtlTransformSubMode = 'visual' | 'join' | 'sql'

export interface SpaceWorkflowNodeConfig {
  id: string
  positionX: number
  positionY: number
  label: string
  subtitle: string
  badge: string
  kind: WorkflowNodeKind
  connectionId?: string
  dataSourceName: string
  datasetId: string
  selectedProject?: string
  selectedColumns?: string[]
  customFieldTypes?: Record<string, 'string' | 'number' | 'date'>
  customDateRange?: { from?: string; to?: string }
  queryExecution?: AnalyticsExecutionRequest
  filterValues?: Record<string, AnalyticsFilterValue>
  filterBindings?: SourceFilterBinding[]
  transformInputs?: TransformInputBinding[]
  transformConfig?: NodeTransformConfig
  joinConfig?: NodeJoinConfig
  sqlConfig?: NodeSqlConfig
  ruleSummary: string
  sqlPreview: string
  upstreamNodeIds: string[]
}

export interface SpaceWorkflowEdgeConfig {
  id: string
  source: string
  target: string
  label?: string
}

export interface AnalyticsSpaceConfig {
  id: string
  title: string
  subtitle: string
  badge: string
  widgets: SpaceWidgetConfig[]
  workflowNodes: SpaceWorkflowNodeConfig[]
  workflowEdges: SpaceWorkflowEdgeConfig[]
}

export function createDefaultBlankSpace(
  id = 'meu-espaco',
  title = 'Meu Espaço Analítico',
): AnalyticsSpaceConfig {
  return {
    id,
    title,
    subtitle:
      'Espaço pronto para extrair datasets de qualquer fonte, transformar no motor analítico local (SQL) e publicar na Grade Inteligente.',
    badge: '0 Gráficos • Em Branco',
    widgets: [],
    workflowNodes: [],
    workflowEdges: [],
  }
}

export interface DrillDownItem {
  issueId: string
  title: string
  tracker: string
  project: string
  hours: number
}

export interface DrillDownGroup {
  groupName: string
  totalHours: number
  percentage: number
  items: DrillDownItem[]
}

export interface DrillDownSelection {
  title: string
  subtitle: string
  data: AnalyticsQueryResult
}

export interface PipelineNodeData extends Record<
  string,
  string | number | boolean | ((nodeId: string) => void) | undefined
> {
  nodeId: string
  label: string
  subtitle: string
  badge: string
  kind: WorkflowNodeKind
  dataSourceName: string
  rowCount: number
  datasetId: string
  chartInputError?: string
  nodeError?: string
  disconnectedAlert?: string
  onRequestRemove?: (nodeId: string) => void
}

export interface AvailableProjectOption {
  id: string
  name: string
  description?: string
}

export interface ConnectionDisplayOption {
  id: string
  addonName: string
  identityName: string
  logoUrl: string
}

export type AddNodeTypeOption = 'source' | 'transform' | 'output'

export interface AnalyticsSourceFailureItem {
  nodeId: string
  label: string
  message: string
  details?: Record<string, string[]>
}

export interface AnalyticsUpstreamSourceStatus {
  hasPublication: boolean
  isInitialLoading: boolean
  isRefreshing: boolean
  progress?: AnalyticsLoadProgressEvent
  error?: string
  errorDetails?: Record<string, string[]>
}

export interface AnalyticsSyncStatusSummary {
  isBackgroundSyncing: boolean
  isManualSyncing: boolean
  activeProgress: AnalyticsLoadProgressEvent[]
  lastFastSyncAt?: string
  lastFullReconcileAt?: string
  strategies: AnalyticsSyncStrategy[]
  hasRollingWindow: boolean
  hasIncrementalChanges: boolean
  coverageReasons: string[]
}

export function buildNewSpaceWidgetOptions(
  models: typeof GENERIC_CHART_MODELS,
): Array<{ id: WidgetId; label: string }> {
  return models.map((item) => ({
    id: item.id,
    label: item.label,
  }))
}
