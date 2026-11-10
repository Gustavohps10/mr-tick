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
    label: 'Barras Verticais (Colunas)',
    description: 'Comparação de valores por categoria no eixo vertical',
    category: 'bar',
  },
  {
    id: 'bar_horizontal',
    label: 'Barras Horizontais (Ranking & %)',
    description: 'Ranking ordenado com total de horas e participação % no eixo',
    category: 'bar',
  },
  {
    id: 'bar_stacked',
    label: 'Barras Empilhadas (Toggles 8-em-1)',
    description: 'Composição por série com alternadores nativos (Horas/Qtd/%)',
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
    label: 'Combo Multi-Eixo (Barra + Linhas + Índices)',
    description:
      'Sobrepõe barras de capacidade, linhas de realizado/estimado e índices',
    category: 'bar',
  },
  {
    id: 'line',
    label: 'Linhas Contínuas (Série Temporal)',
    description: 'Evolução temporal comparativa (ex: Criadas × Concluídas)',
    category: 'line',
  },
  {
    id: 'line_reference',
    label: 'Gráfico com Linha de Referência / Ponderada',
    description: 'Exibe meta fixa (SLA) ou média ponderada dinâmica Σ(A)/Σ(B)',
    category: 'line',
  },
  {
    id: 'split_pane_chart',
    label: 'Split-Pane 70/30 (Gráfico + Tabela Lateral)',
    description:
      'Gráfico de barras (70%) acoplado à tabela atômica de motivos/tarefas (30%)',
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
    label: 'TreeGrid Hierárquico (3 Níveis + Rollup)',
    description:
      'Árvore expansível (ex: Projeto ▸ Versão ▸ Tarefa) com soma recursiva',
    category: 'table',
  },
  {
    id: 'conditional_table',
    label: 'DataTable Condicional (Sliders & Gradiente)',
    description:
      'Tabela auditável com 3 sliders de tolerância e destaque em gradiente CSS',
    category: 'table',
  },
  {
    id: 'kpi_card',
    label: 'Cartão Indicador / KPI & SLA',
    description:
      'Totalizador de impacto com média ponderada, meta de SLA e variação',
    category: 'other',
  },
  {
    id: 'area',
    label: 'Área Preenchida (Gradiente)',
    description: 'Volume e magnitude acumulada ao longo do eixo X',
    category: 'area',
  },
  {
    id: 'area_stacked',
    label: 'Área Empilhada (Composição)',
    description: 'Evolução de múltiplas camadas de volume somadas',
    category: 'area',
  },
  {
    id: 'pie_donut',
    label: 'Pizza / Rosca (Proporção & Alertas)',
    description: 'Visualização circular com percentuais e contagem central',
    category: 'pie',
  },
  {
    id: 'radar',
    label: 'Radar / Teia (Multidimensional)',
    description: 'Gráfico polar de teia comparando múltiplos atributos',
    category: 'other',
  },
]

export type ChartVisualType = WidgetId

export type ReferenceLineMode =
  'none' | 'average' | 'weighted_ratio' | 'fixed_target'

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
  templateId?: string
  snippetId?: string
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
  string | number | boolean | (() => void) | undefined
> {
  nodeId: string
  label: string
  subtitle: string
  badge: string
  kind: WorkflowNodeKind
  dataSourceName: string
  rowCount: number
  datasetId: string
  onEditNode?: () => void
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
