import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetRow,
  AnalyticsPlanNode,
} from '@mr-tick/application'
import {
  ArrowLeft,
  ArrowRight,
  Columns2,
  Columns3,
  FolderOpen,
  Square,
  Workflow,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type {
  AnalyticsUpstreamSourceStatus,
  CanvasLayerMode,
} from '../lib/analytics-types'
import {
  type AnalyticsSpaceConfig,
  type SpaceWorkflowNodeConfig,
  type WidgetSpan,
} from '../lib/analytics-types'
import { GenericWidgetRenderer } from './generic-widget-renderer'

export interface SmartGridViewProps {
  onUnauthorized: (connectionIds: string[], message: string) => void
  widgetInputErrors: Record<string, string>
  warehousePlan: AnalyticsPlanNode[]
  publicationVersion: string
  activeSpace: AnalyticsSpaceConfig
  upstreamStatusByNodeId: Record<string, AnalyticsUpstreamSourceStatus>
  onRetrySourceNode: (nodeId: string) => void
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
  onSetLayerMode: (mode: CanvasLayerMode) => void
  onUpdateWidgetSpan: (widgetId: string, span: WidgetSpan) => void
  onMoveWidgetOrder: (widgetId: string, direction: -1 | 1) => void
  overloadTolerancePct: number
  onSetOverloadTolerancePct: (val: number) => void
  idleTolerancePct: number
  onSetIdleTolerancePct: (val: number) => void
  estimationTolerancePct: number
  onSetEstimationTolerancePct: (val: number) => void
}

export function SmartGridView({
  onUnauthorized,
  warehousePlan,
  widgetInputErrors,
  publicationVersion,
  activeSpace,
  upstreamStatusByNodeId,
  onRetrySourceNode,
  resolveRowsForWorkflowNode,
  onGenericDrillDown,
  onSetLayerMode,
  onUpdateWidgetSpan,
  onMoveWidgetOrder,
  overloadTolerancePct,
  onSetOverloadTolerancePct,
  idleTolerancePct,
  onSetIdleTolerancePct,
  estimationTolerancePct,
  onSetEstimationTolerancePct,
}: SmartGridViewProps) {
  const visibleWidgets = activeSpace.widgets.filter((w) => w.visible)

  if (visibleWidgets.length === 0) {
    return (
      <Card className="border-border/70 flex flex-col items-center justify-center p-12 text-center shadow-xs">
        <div className="bg-muted flex size-14 items-center justify-center rounded-full">
          <FolderOpen className="text-muted-foreground size-7" />
        </div>
        <h3 className="mt-4 text-base font-bold">
          Nenhum gráfico neste espaço ainda
        </h3>
        <p className="text-muted-foreground mt-1 max-w-md text-xs leading-relaxed">
          Este espaço está completamente em branco. Abra a aba Background para
          extrair (E), transformar (T) e publicar (L) os gráficos desejados.
        </p>
        <div className="mt-5 flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="gap-1.5 text-xs"
            onClick={() => onSetLayerMode('background')}
          >
            <Workflow className="size-3.5" />
            Abrir Background e Conectar Dados
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {visibleWidgets.map((widget, index, arr) => {
        let spanClass = 'lg:col-span-1'
        if (widget.span === 2) spanClass = 'lg:col-span-2'
        if (widget.span === 3) spanClass = 'lg:col-span-3'

        let span1Variant: 'secondary' | 'ghost' = 'ghost'
        let span2Variant: 'secondary' | 'ghost' = 'ghost'
        let span3Variant: 'secondary' | 'ghost' = 'ghost'
        if (widget.span === 1) span1Variant = 'secondary'
        if (widget.span === 2) span2Variant = 'secondary'
        if (widget.span === 3) span3Variant = 'secondary'

        const inputError = widgetInputErrors[widget.id]

        return (
          <Card
            key={widget.id}
            className={cn(
              'border-border/70 flex flex-col justify-between shadow-xs transition-all',
              spanClass,
            )}
          >
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-sm font-semibold">
                    {widget.title}
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs">
                    {widget.subtitle}
                  </CardDescription>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant={span1Variant}
                    className="size-6"
                    title="1 Coluna (1/3)"
                    onClick={() => onUpdateWidgetSpan(widget.id, 1)}
                  >
                    <Square className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant={span2Variant}
                    className="size-6"
                    title="2 Colunas (2/3)"
                    onClick={() => onUpdateWidgetSpan(widget.id, 2)}
                  >
                    <Columns2 className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant={span3Variant}
                    className="size-6"
                    title="Largura Total (3/3)"
                    onClick={() => onUpdateWidgetSpan(widget.id, 3)}
                  >
                    <Columns3 className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    disabled={index === 0}
                    onClick={() => onMoveWidgetOrder(widget.id, -1)}
                  >
                    <ArrowLeft className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    disabled={index === arr.length - 1}
                    onClick={() => onMoveWidgetOrder(widget.id, 1)}
                  >
                    <ArrowRight className="size-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {inputError !== undefined && (
                <p role="alert" className="text-destructive text-sm">
                  {inputError} Ajuste o gráfico no Background.
                </p>
              )}
              {inputError === undefined && (
                <GenericWidgetRenderer
                  onUnauthorized={onUnauthorized}
                  warehousePlan={warehousePlan}
                  publicationVersion={publicationVersion}
                  widget={widget}
                  activeSpace={activeSpace}
                  upstreamStatus={upstreamStatusByNodeId[widget.sourceNodeId]}
                  onRetrySource={() => onRetrySourceNode(widget.sourceNodeId)}
                  resolveRowsForWorkflowNode={resolveRowsForWorkflowNode}
                  onGenericDrillDown={onGenericDrillDown}
                  overloadTolerancePct={overloadTolerancePct}
                  onSetOverloadTolerancePct={onSetOverloadTolerancePct}
                  idleTolerancePct={idleTolerancePct}
                  onSetIdleTolerancePct={onSetIdleTolerancePct}
                  estimationTolerancePct={estimationTolerancePct}
                  onSetEstimationTolerancePct={onSetEstimationTolerancePct}
                />
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
