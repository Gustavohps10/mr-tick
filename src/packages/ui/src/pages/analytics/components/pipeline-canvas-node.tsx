import { Handle, type Node, type NodeProps, Position } from '@xyflow/react'
import { AlertTriangle, Eye, Trash2 } from 'lucide-react'
import { memo } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { PipelineNodeData } from '../lib/analytics-types'
import { pipelineNodeIcons } from './pipeline-node-icons'

export const PipelineCanvasNode = memo(function PipelineCanvasNode({
  data,
  selected,
}: NodeProps<Node<PipelineNodeData>>) {
  let borderClass = 'border-border/80 bg-card'
  let badgeClass = 'bg-primary/10 text-primary border-primary/30'
  const NodeIcon = pipelineNodeIcons[data.kind]
  let kindBadge = 'FONTE'

  if (data.kind === 'source') {
    borderClass = 'border-blue-500/50 bg-blue-500/[0.03]'
    badgeClass = 'bg-blue-500/15 text-blue-500 border-blue-500/30'
    kindBadge = 'E • EXTRACT (FONTE)'
  }

  if (data.kind === 'filter' || data.kind === 'transform') {
    borderClass = 'border-amber-500/50 bg-amber-500/[0.03]'
    badgeClass = 'bg-amber-500/15 text-amber-500 border-amber-500/30'
    kindBadge = 'T • TRANSFORM (VISUAL)'
  }

  if (data.kind === 'join') {
    borderClass = 'border-purple-500/50 bg-purple-500/[0.03]'
    badgeClass = 'bg-purple-500/15 text-purple-500 border-purple-500/30'
    kindBadge = 'T • TRANSFORM (JOIN)'
  }

  if (data.kind === 'aggregate') {
    borderClass = 'border-cyan-500/50 bg-cyan-500/[0.03]'
    badgeClass = 'bg-cyan-500/15 text-cyan-500 border-cyan-500/30'
    kindBadge = 'T • TRANSFORM (PIVOT)'
  }

  if (data.kind === 'sql') {
    borderClass = 'border-indigo-500/50 bg-indigo-500/[0.03]'
    badgeClass = 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30'
    kindBadge = 'T • TRANSFORM (SQL)'
  }

  if (data.kind === 'output') {
    borderClass = 'border-emerald-500/50 bg-emerald-500/[0.03]'
    badgeClass = 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
    kindBadge = 'L • LOAD (VISUALIZAÇÃO)'
  }

  if (
    data.disconnectedAlert !== undefined &&
    data.chartInputError === undefined
  ) {
    borderClass = 'border-amber-500/70 bg-amber-500/[0.06]'
    badgeClass = 'border-amber-500/40 bg-amber-500/15 text-amber-500'
  }

  if (data.chartInputError !== undefined) {
    borderClass = 'border-destructive bg-destructive/5'
    badgeClass = 'border-destructive/40 text-destructive'
  }

  return (
    <div
      className={cn(
        'min-w-[275px] cursor-pointer rounded-lg border p-3.5 shadow-md transition-all hover:shadow-lg',
        borderClass,
        selected && 'ring-primary ring-2',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !size-2.5"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="bg-muted flex size-6 items-center justify-center rounded-md">
            <NodeIcon className="text-foreground size-3.5" />
          </div>
          <Badge
            variant="outline"
            className={cn('font-mono text-[10px] font-semibold', badgeClass)}
          >
            {kindBadge}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground font-mono text-[10px]">
            {data.rowCount} reg.
          </span>
          {data.onRequestRemove !== undefined && (
            <button
              type="button"
              aria-label={`Remover node ${data.label}`}
              title="Remover node"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex size-6 items-center justify-center rounded-md transition-colors"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                data.onRequestRemove?.(data.nodeId)
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 text-xs font-semibold">{data.label}</div>
      <div className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
        {data.subtitle}
      </div>
      {data.disconnectedAlert !== undefined &&
        data.chartInputError === undefined && (
          <p className="mt-2 flex max-w-64 items-start gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{data.disconnectedAlert}</span>
          </p>
        )}
      {data.chartInputError !== undefined && (
        <p className="text-destructive mt-2 max-w-64 text-xs">
          Entrada incompatível. {data.chartInputError}
        </p>
      )}
      <div className="border-border/60 mt-2.5 flex items-center justify-between border-t pt-2 text-[10px]">
        <span className="text-muted-foreground font-mono">
          {data.dataSourceName}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-primary flex items-center gap-1 font-medium">
            <Eye className="size-3" />
            Inspecionar
          </span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !size-2.5"
      />
    </div>
  )
})

export const PIPELINE_NODE_TYPES = {
  pipelineNode: PipelineCanvasNode,
}
