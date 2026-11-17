import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetRow,
  AnalyticsPlanNode,
} from '@mr-tick/application'
import {
  Columns2,
  Columns3,
  FolderOpen,
  GripVertical,
  SlidersHorizontal,
  Square,
  Workflow,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import type {
  AnalyticsUpstreamSourceStatus,
  CanvasLayerMode,
  SpaceWidgetConfig,
} from '../lib/analytics-types'
import {
  type AnalyticsSpaceConfig,
  type SpaceWorkflowNodeConfig,
  type WidgetColSpan,
  type WidgetRowSpan,
} from '../lib/analytics-types'
import { GenericWidgetRenderer } from './generic-widget-renderer'

const COL_SPAN_CLASSES: Record<WidgetColSpan, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12',
}

const ROW_SPAN_CLASSES: Record<WidgetRowSpan, string> = {
  1: 'lg:row-span-1',
  2: 'lg:row-span-2',
  3: 'lg:row-span-3',
  4: 'lg:row-span-4',
  5: 'lg:row-span-5',
  6: 'lg:row-span-6',
}

const ALL_COL_SPANS: WidgetColSpan[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const ALL_ROW_SPANS: WidgetRowSpan[] = [1, 2, 3, 4, 5, 6]

function moveWidgetId(
  ids: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  const next = [...ids]
  const [item] = next.splice(fromIndex, 1)
  if (item === undefined) return ids

  next.splice(toIndex, 0, item)
  return next
}

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
  onUpdateWidgetLayout: (
    widgetId: string,
    layout: { colSpan?: WidgetColSpan; rowSpan?: WidgetRowSpan },
  ) => void
  onReorderWidgets: (orderedVisibleIds: string[]) => void
  overloadTolerancePct: number
  onSetOverloadTolerancePct: (val: number) => void
  idleTolerancePct: number
  onSetIdleTolerancePct: (val: number) => void
  estimationTolerancePct: number
  onSetEstimationTolerancePct: (val: number) => void
}

interface SortableGridCardProps {
  widget: SpaceWidgetConfig
  inputError: string | undefined
  isAnyDragging: boolean
  onUnauthorized: (connectionIds: string[], message: string) => void
  warehousePlan: AnalyticsPlanNode[]
  publicationVersion: string
  activeSpace: AnalyticsSpaceConfig
  upstreamStatus: AnalyticsUpstreamSourceStatus | undefined
  onRetrySourceNode: (nodeId: string) => void
  resolveRowsForWorkflowNode: SmartGridViewProps['resolveRowsForWorkflowNode']
  onGenericDrillDown: SmartGridViewProps['onGenericDrillDown']
  onUpdateWidgetLayout: SmartGridViewProps['onUpdateWidgetLayout']
  overloadTolerancePct: number
  onSetOverloadTolerancePct: (val: number) => void
  idleTolerancePct: number
  onSetIdleTolerancePct: (val: number) => void
  estimationTolerancePct: number
  onSetEstimationTolerancePct: (val: number) => void
}

const SortableGridCard = memo(function SortableGridCard({
  widget,
  inputError,
  isAnyDragging,
  onUnauthorized,
  warehousePlan,
  publicationVersion,
  activeSpace,
  upstreamStatus,
  onRetrySourceNode,
  resolveRowsForWorkflowNode,
  onGenericDrillDown,
  onUpdateWidgetLayout,
  overloadTolerancePct,
  onSetOverloadTolerancePct,
  idleTolerancePct,
  onSetIdleTolerancePct,
  estimationTolerancePct,
  onSetEstimationTolerancePct,
}: SortableGridCardProps) {
  const handleRetrySource = useCallback(
    () => onRetrySourceNode(widget.sourceNodeId),
    [onRetrySourceNode, widget.sourceNodeId],
  )

  const cardRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLDivElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggedOver, setIsDraggedOver] = useState(false)

  useEffect(() => {
    const cardEl = cardRef.current
    const handleEl = handleRef.current
    if (cardEl === null || handleEl === null) return

    return combine(
      draggable({
        element: cardEl,
        dragHandle: handleEl,
        getInitialData: () => ({ widgetId: widget.id }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: cardEl,
        canDrop: ({ source }) =>
          typeof source.data.widgetId === 'string' &&
          source.data.widgetId !== widget.id,
        getData: () => ({ widgetId: widget.id }),
        onDragEnter: () => setIsDraggedOver(true),
        onDragLeave: () => setIsDraggedOver(false),
        onDrop: () => setIsDraggedOver(false),
      }),
    )
  }, [widget.id])

  const colSpanClass = COL_SPAN_CLASSES[widget.colSpan]
  const rowSpanClass = ROW_SPAN_CLASSES[widget.rowSpan]

  let span4Variant: 'secondary' | 'ghost' = 'ghost'
  let span8Variant: 'secondary' | 'ghost' = 'ghost'
  let span12Variant: 'secondary' | 'ghost' = 'ghost'
  if (widget.colSpan === 4) span4Variant = 'secondary'
  if (widget.colSpan === 8) span8Variant = 'secondary'
  if (widget.colSpan === 12) span12Variant = 'secondary'

  let draggingStateAttr: '' | undefined = undefined
  if (isDragging) draggingStateAttr = ''

  let dragOverAttr: '' | undefined = undefined
  if (isDraggedOver) dragOverAttr = ''

  return (
    <Card
      ref={cardRef}
      data-slot="sortable-item"
      data-dragging={draggingStateAttr}
      data-drag-over={dragOverAttr}
      className={cn(
        'border-border/70 relative flex h-full min-h-0 flex-col justify-start gap-2 overflow-hidden p-4 shadow-xs transition-[border-color,background-color,box-shadow,opacity]',
        colSpanClass,
        rowSpanClass,
        isAnyDragging && !isDragging && !isDraggedOver && 'border-border/90',
        isDragging && 'border-muted-foreground/50 border-dashed opacity-40',
        isDraggedOver &&
          'border-primary bg-primary/10 ring-primary/40 border-2 border-dashed shadow-md ring-2',
      )}
    >
      {isDraggedOver && (
        <div className="bg-primary/5 pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-3 backdrop-blur-[1px]">
          <span className="border-primary bg-background/95 text-primary max-w-full truncate rounded-md border border-dashed px-3 py-1.5 text-xs font-semibold shadow-sm">
            Soltar aqui ({widget.colSpan}/12 · {widget.rowSpan}L)
          </span>
        </div>
      )}

      <CardHeader className="shrink-0 p-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm font-semibold">
              {widget.title}
            </CardTitle>
            <CardDescription className="mt-0.5 truncate text-xs">
              {widget.subtitle}
            </CardDescription>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon"
              variant={span4Variant}
              className="size-6"
              title="4 Colunas (4/12)"
              aria-label="4 Colunas (4/12)"
              onClick={() => onUpdateWidgetLayout(widget.id, { colSpan: 4 })}
            >
              <Square className="size-3" />
            </Button>
            <Button
              size="icon"
              variant={span8Variant}
              className="size-6"
              title="8 Colunas (8/12)"
              aria-label="8 Colunas (8/12)"
              onClick={() => onUpdateWidgetLayout(widget.id, { colSpan: 8 })}
            >
              <Columns2 className="size-3" />
            </Button>
            <Button
              size="icon"
              variant={span12Variant}
              className="size-6"
              title="Largura Total (12/12)"
              aria-label="Largura Total (12/12)"
              onClick={() => onUpdateWidgetLayout(widget.id, { colSpan: 12 })}
            >
              <Columns3 className="size-3" />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-1.5 text-[10px] font-medium"
                  title="Ajustar largura (1-12) e altura (1-6)"
                  aria-label={`Ajustar dimensões (${widget.colSpan}/12 × ${widget.rowSpan}L)`}
                >
                  <SlidersHorizontal className="size-2.5" />
                  <span>
                    {widget.colSpan}/12 · {widget.rowSpan}L
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-3 p-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span>Largura (Colunas)</span>
                    <span className="text-muted-foreground">
                      {widget.colSpan}/12
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {ALL_COL_SPANS.map((col) => {
                      let colVariant: 'default' | 'outline' = 'outline'
                      if (widget.colSpan === col) colVariant = 'default'

                      return (
                        <Button
                          key={col}
                          size="sm"
                          variant={colVariant}
                          className="h-6 px-0 text-[11px]"
                          onClick={() =>
                            onUpdateWidgetLayout(widget.id, { colSpan: col })
                          }
                        >
                          {col}
                        </Button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span>Altura (Linhas · 160px/L)</span>
                    <span className="text-muted-foreground">
                      {widget.rowSpan}L
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {ALL_ROW_SPANS.map((row) => {
                      let rowVariant: 'default' | 'outline' = 'outline'
                      if (widget.rowSpan === row) rowVariant = 'default'

                      return (
                        <Button
                          key={row}
                          size="sm"
                          variant={rowVariant}
                          className="h-6 px-0 text-[11px]"
                          onClick={() =>
                            onUpdateWidgetLayout(widget.id, { rowSpan: row })
                          }
                        >
                          {row}L
                        </Button>
                      )
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div
              ref={handleRef}
              role="button"
              tabIndex={0}
              data-slot="sortable-item-handle"
              className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md select-none active:cursor-grabbing"
              title="Arrastar para reordenar"
              aria-label={`Arrastar ${widget.title}`}
            >
              <GripVertical className="size-3.5" />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent
        className={cn(
          'flex min-h-0 flex-1 flex-col p-0',
          isAnyDragging && 'pointer-events-none',
        )}
      >
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
            upstreamStatus={upstreamStatus}
            onRetrySource={handleRetrySource}
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
})

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
  onUpdateWidgetLayout,
  onReorderWidgets,
  overloadTolerancePct,
  onSetOverloadTolerancePct,
  idleTolerancePct,
  onSetIdleTolerancePct,
  estimationTolerancePct,
  onSetEstimationTolerancePct,
}: SmartGridViewProps) {
  const visibleWidgets = useMemo(
    () => activeSpace.widgets.filter((w) => w.visible),
    [activeSpace.widgets],
  )

  const [isAnyDragging, setIsAnyDragging] = useState(false)

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => typeof source.data.widgetId === 'string',
      onDragStart: () => setIsAnyDragging(true),
      onDrop: ({ source, location }) => {
        setIsAnyDragging(false)

        const sourceId = source.data.widgetId
        if (typeof sourceId !== 'string') return

        const targetRecord = location.current.dropTargets.find(
          (target) => typeof target.data.widgetId === 'string',
        )
        if (targetRecord === undefined) return

        const targetId = targetRecord.data.widgetId
        if (typeof targetId !== 'string' || sourceId === targetId) return

        const visibleIds = visibleWidgets.map((w) => w.id)
        const oldIndex = visibleIds.indexOf(sourceId)
        const newIndex = visibleIds.indexOf(targetId)
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return

        onReorderWidgets(moveWidgetId(visibleIds, oldIndex, newIndex))
      },
    })
  }, [onReorderWidgets, visibleWidgets])

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
    <div className="grid w-full min-w-0 grid-flow-dense grid-cols-1 gap-3 lg:auto-rows-[160px] lg:grid-cols-12">
      {visibleWidgets.map((widget) => (
        <SortableGridCard
          key={widget.id}
          widget={widget}
          inputError={widgetInputErrors[widget.id]}
          isAnyDragging={isAnyDragging}
          onUnauthorized={onUnauthorized}
          warehousePlan={warehousePlan}
          publicationVersion={publicationVersion}
          activeSpace={activeSpace}
          upstreamStatus={upstreamStatusByNodeId[widget.sourceNodeId]}
          onRetrySourceNode={onRetrySourceNode}
          resolveRowsForWorkflowNode={resolveRowsForWorkflowNode}
          onGenericDrillDown={onGenericDrillDown}
          onUpdateWidgetLayout={onUpdateWidgetLayout}
          overloadTolerancePct={overloadTolerancePct}
          onSetOverloadTolerancePct={onSetOverloadTolerancePct}
          idleTolerancePct={idleTolerancePct}
          onSetIdleTolerancePct={onSetIdleTolerancePct}
          estimationTolerancePct={estimationTolerancePct}
          onSetEstimationTolerancePct={onSetEstimationTolerancePct}
        />
      ))}
    </div>
  )
}
