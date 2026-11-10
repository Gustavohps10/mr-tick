import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  ReactFlow,
} from '@xyflow/react'
import { LayoutGrid, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type {
  AnalyticsSpaceConfig,
  CanvasLayerMode,
  PipelineNodeData,
} from '../lib/analytics-types'
import { PIPELINE_NODE_TYPES } from './pipeline-canvas-node'

export interface WorkflowBackgroundViewProps {
  activeSpace: AnalyticsSpaceConfig
  pipelineNodes: Array<Node<PipelineNodeData>>
  pipelineEdges: Edge[]
  onPipelineNodesChange: OnNodesChange<Node<PipelineNodeData>>
  onPipelineEdgesChange: OnEdgesChange<Edge>
  onOpenAddNode: () => void
  onSetLayerMode: (mode: CanvasLayerMode) => void
  onInspectNode: (nodeId: string) => void
}

export function WorkflowBackgroundView({
  activeSpace,
  pipelineNodes,
  pipelineEdges,
  onPipelineNodesChange,
  onPipelineEdgesChange,
  onOpenAddNode,
  onSetLayerMode,
  onInspectNode,
}: WorkflowBackgroundViewProps) {
  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="border-border/60 border-b p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">
                Workflow de Dados de &ldquo;
                {activeSpace.title}&rdquo;
              </CardTitle>
            </div>
            <CardDescription className="mt-0.5 text-xs">
              Conecte dados de múltiplas fontes.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => onSetLayerMode('front')}
            >
              <LayoutGrid className="size-3.5" />
              Grade Inteligente
            </Button>
            <Button
              size="sm"
              variant="default"
              className="h-8 gap-1.5 text-xs"
              onClick={onOpenAddNode}
            >
              <Plus className="size-3.5" />
              Adicionar
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="h-[520px] w-full">
          <ReactFlow
            nodes={pipelineNodes}
            edges={pipelineEdges}
            onNodesChange={onPipelineNodesChange}
            onEdgesChange={onPipelineEdgesChange}
            nodeTypes={PIPELINE_NODE_TYPES}
            onNodeClick={(event, node) => {
              if (event && node.data && typeof node.data.nodeId === 'string')
                onInspectNode(node.data.nodeId)
            }}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls />
            <MiniMap zoomable pannable className="!bg-card/80" />
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  )
}
