import {
  BarChart3,
  Code2,
  Database,
  GitMerge,
  Sigma,
  SlidersHorizontal,
} from 'lucide-react'

import type { WorkflowNodeKind } from '../lib/analytics-types'

export const pipelineNodeIcons = {
  source: Database,
  filter: SlidersHorizontal,
  transform: SlidersHorizontal,
  join: GitMerge,
  aggregate: Sigma,
  sql: Code2,
  output: BarChart3,
}

export const pipelineNodeKindLabels: Record<WorkflowNodeKind, string> = {
  source: 'Extract',
  transform: 'Transformação visual',
  filter: 'Filtro',
  join: 'Junção',
  aggregate: 'Agregação',
  sql: 'Transformação SQL',
  output: 'Visualização',
}
