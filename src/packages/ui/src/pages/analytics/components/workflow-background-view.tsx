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
import {
  BarChart3,
  Code2,
  Database,
  Filter,
  LayoutGrid,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type {
  AddNodeTypeOption,
  AnalyticsSpaceConfig,
  CanvasLayerMode,
  PipelineNodeData,
} from '../lib/analytics-types'
import { PIPELINE_NODE_TYPES } from './pipeline-canvas-node'

type NodeKindFilter = 'all' | 'source' | 'transform' | 'output'

function collectLineageNodeIds(rootId: string, edges: Edge[]): Set<string> {
  const visited = new Set<string>([rootId])
  const queue = [rootId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break

    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        visited.add(edge.source)
        queue.push(edge.source)
      }

      if (edge.source === current && !visited.has(edge.target)) {
        visited.add(edge.target)
        queue.push(edge.target)
      }
    }
  }

  return visited
}

function computeLayeredPositions(
  nodes: Array<Node<PipelineNodeData>>,
  edges: Edge[],
): Map<string, { x: number; y: number }> {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()

  for (const node of nodes) {
    parents.set(node.id, [])
    children.set(node.id, [])
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    parents.get(edge.target)?.push(edge.source)
    children.get(edge.source)?.push(edge.target)
  }

  const depthById = new Map<string, number>()

  for (const node of nodes) depthById.set(node.id, 0)

  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false

    for (const node of nodes) {
      const nodeParents = parents.get(node.id)
      if (nodeParents === undefined || nodeParents.length === 0) continue

      let maxParentDepth = 0

      for (const parentId of nodeParents) {
        const parentDepth = depthById.get(parentId)
        if (parentDepth !== undefined && parentDepth + 1 > maxParentDepth)
          maxParentDepth = parentDepth + 1
      }

      const currentDepth = depthById.get(node.id)
      if (currentDepth !== undefined && maxParentDepth > currentDepth) {
        depthById.set(node.id, maxParentDepth)
        changed = true
      }
    }

    if (!changed) break
  }

  const columns = new Map<number, Array<Node<PipelineNodeData>>>()

  for (const node of nodes) {
    const depth = depthById.get(node.id)
    let columnIndex = 0
    if (depth !== undefined) columnIndex = depth
    const list = columns.get(columnIndex)

    if (list === undefined) {
      columns.set(columnIndex, [node])
      continue
    }

    list.push(node)
  }

  const positions = new Map<string, { x: number; y: number }>()

  for (const [colIdx, colNodes] of columns.entries()) {
    colNodes.sort((a, b) => a.position.y - b.position.y)

    for (const [rowIdx, node] of colNodes.entries()) {
      positions.set(node.id, {
        x: 60 + colIdx * 320,
        y: 60 + rowIdx * 135,
      })
    }
  }

  return positions
}

export interface WorkflowBackgroundViewProps {
  activeSpace: AnalyticsSpaceConfig
  pipelineNodes: Array<Node<PipelineNodeData>>
  pipelineEdges: Edge[]
  selectedNodeId: string | null
  onPipelineNodesChange: OnNodesChange<Node<PipelineNodeData>>
  onPipelineEdgesChange: OnEdgesChange<Edge>
  onPersistNodePosition?: (nodeId: string, x: number, y: number) => void
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
  onPersistNodePosition,
  onOpenAddNode,
  onRequestRemoveNode,
  onSetLayerMode,
  onInspectNode,
}: WorkflowBackgroundViewProps) {
  const [focusRootId, setFocusRootId] = useState<string>('all')
  const [kindFilter, setKindFilter] = useState<NodeKindFilter>('all')
  const [searchText, setSearchText] = useState<string>('')

  const outputNodes = useMemo(
    () => pipelineNodes.filter((node) => node.data.kind === 'output'),
    [pipelineNodes],
  )

  const filteredGraph = useMemo(() => {
    let allowedIds: Set<string> | undefined

    if (focusRootId !== 'all') {
      const exists = pipelineNodes.some((node) => node.id === focusRootId)
      if (exists) allowedIds = collectLineageNodeIds(focusRootId, pipelineEdges)
    }

    const query = searchText.trim().toLowerCase()
    const visibleNodes = pipelineNodes.filter((node) => {
      if (allowedIds !== undefined && !allowedIds.has(node.id)) return false

      if (kindFilter === 'source' && node.data.kind !== 'source') return false

      if (
        kindFilter === 'transform' &&
        node.data.kind !== 'transform' &&
        node.data.kind !== 'join' &&
        node.data.kind !== 'filter' &&
        node.data.kind !== 'aggregate' &&
        node.data.kind !== 'sql'
      )
        return false

      if (kindFilter === 'output' && node.data.kind !== 'output') return false

      if (query !== '') {
        const labelMatch = node.data.label.toLowerCase().includes(query)
        const subtitleMatch = node.data.subtitle.toLowerCase().includes(query)
        if (!labelMatch && !subtitleMatch) return false
      }

      return true
    })

    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
    const visibleEdges = pipelineEdges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
    )

    return { nodes: visibleNodes, edges: visibleEdges }
  }, [focusRootId, kindFilter, pipelineEdges, pipelineNodes, searchText])

  const handleAutoLayout = () => {
    const positions = computeLayeredPositions(
      filteredGraph.nodes,
      filteredGraph.edges,
    )
    const changes: Array<{
      id: string
      type: 'position'
      position: { x: number; y: number }
    }> = []

    for (const node of filteredGraph.nodes) {
      const next = positions.get(node.id)
      if (next === undefined) continue

      if (onPersistNodePosition !== undefined)
        onPersistNodePosition(node.id, next.x, next.y)

      changes.push({
        id: node.id,
        type: 'position',
        position: next,
      })
    }

    if (changes.length > 0) onPipelineNodesChange(changes)
  }

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
              Conecte dados de múltiplas fontes ({filteredGraph.nodes.length} de{' '}
              {pipelineNodes.length} nodes).
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Filtrar node..."
              aria-label="Filtrar node no canvas"
              className="h-8 w-36 text-xs"
            />
            <Select value={focusRootId} onValueChange={setFocusRootId}>
              <SelectTrigger
                aria-label="Focar fluxo do gráfico"
                className="h-8 w-52 text-xs"
              >
                <Filter className="text-muted-foreground mr-1.5 size-3.5 shrink-0" />
                <SelectValue placeholder="Todos os fluxos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Todos os fluxos ({pipelineNodes.length})
                </SelectItem>
                {outputNodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.data.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={kindFilter}
              onValueChange={(value) => {
                if (
                  value === 'all' ||
                  value === 'source' ||
                  value === 'transform' ||
                  value === 'output'
                )
                  setKindFilter(value)
              }}
            >
              <SelectTrigger
                aria-label="Filtrar por camada"
                className="h-8 w-36 text-xs"
              >
                <SelectValue placeholder="Todas camadas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas camadas</SelectItem>
                <SelectItem value="source">Fontes</SelectItem>
                <SelectItem value="transform">Transformações</SelectItem>
                <SelectItem value="output">Saídas</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={handleAutoLayout}
            >
              <Sparkles className="size-3.5" />
              Organizar
            </Button>
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
            nodes={filteredGraph.nodes}
            edges={filteredGraph.edges}
            onNodesChange={onPipelineNodesChange}
            onEdgesChange={onPipelineEdgesChange}
            onNodeDragStop={(_event, node) => {
              if (onPersistNodePosition !== undefined) {
                onPersistNodePosition(node.id, node.position.x, node.position.y)
              }
            }}
            nodeTypes={PIPELINE_NODE_TYPES}
            onNodeClick={(event, node) => {
              if (event && node.data && typeof node.data.nodeId === 'string')
                onInspectNode(node.data.nodeId)
            }}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls className="border-border overflow-hidden rounded-lg border shadow-sm [--xy-controls-button-background-color-hover:var(--accent)] [--xy-controls-button-background-color:var(--card)] [--xy-controls-button-border-color:var(--border)] [--xy-controls-button-color-hover:var(--accent-foreground)] [--xy-controls-button-color:var(--card-foreground)]" />
            <MiniMap
              zoomable
              pannable
              className="!bg-card/80 border-border overflow-hidden rounded-lg border"
            />
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  )
}
