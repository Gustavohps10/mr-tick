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
import { BarChart3, Code2, Database, LayoutGrid, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type {
  AddNodeTypeOption,
  AnalyticsSpaceConfig,
  CanvasLayerMode,
  PipelineNodeData,
} from '../lib/analytics-types'
import { PIPELINE_NODE_TYPES } from './pipeline-canvas-node'

export interface WorkflowBackgroundViewProps {
  activeSpace: AnalyticsSpaceConfig
  pipelineNodes: Array<Node<PipelineNodeData>>
  pipelineEdges: Edge[]
  selectedNodeId: string | null
  onPipelineNodesChange: OnNodesChange<Node<PipelineNodeData>>
  onPipelineEdgesChange: OnEdgesChange<Edge>
  onOpenAddNode: (nodeType?: AddNodeTypeOption) => void
  onRequestRemoveNode: (nodeId: string) => void
  onSetLayerMode: (mode: CanvasLayerMode) => void
  onInspectNode: (nodeId: string) => void
}

export function WorkflowBackgroundView({
  activeSpace,
  pipelineNodes,
  pipelineEdges,
  selectedNodeId,
  onPipelineNodesChange,
  onPipelineEdgesChange,
  onOpenAddNode,
  onRequestRemoveNode,
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
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="relative h-[520px] w-full">
          <aside
            aria-label="Ferramentas do workflow"
            className="border-border/80 bg-card/90 absolute top-3 left-3 z-10 flex flex-col items-center gap-1 rounded-lg border p-1.5 shadow-md backdrop-blur-md"
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 rounded-md text-blue-500 hover:bg-blue-500/10 hover:text-blue-400"
              aria-label="Adicionar Fonte (Extract)"
              title="Adicionar Fonte (Extract)"
              onClick={() => onOpenAddNode('source')}
            >
              <Database className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 rounded-md text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-400"
              aria-label="Adicionar Transformação (SQL)"
              title="Adicionar Transformação (SQL)"
              onClick={() => onOpenAddNode('transform')}
            >
              <Code2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 rounded-md text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
              aria-label="Adicionar Visualização (Load)"
              title="Adicionar Visualização (Load)"
              onClick={() => onOpenAddNode('output')}
            >
              <BarChart3 className="size-4" />
            </Button>

            <div className="bg-border/60 my-0.5 h-px w-5" />

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive size-8 rounded-md"
              aria-label="Remover node selecionado"
              title="Remover node selecionado"
              disabled={selectedNodeId === null}
              onClick={() => {
                if (selectedNodeId !== null) onRequestRemoveNode(selectedNodeId)
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </aside>

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
