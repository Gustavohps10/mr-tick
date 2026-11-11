import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetRow,
} from '@mr-tick/application'
import {
  ArrowRight,
  Database,
  FileSpreadsheet,
  GitMerge,
  Search,
  Settings2,
  ShieldCheck,
  Table as TableIcon,
} from 'lucide-react'
import type * as React from 'react'

import { PaginationBar } from '@/components/data-table/data-table-pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { SpaceWorkflowNodeConfig } from '../lib/analytics-types'
import { VirtualizedNodeTable } from './virtualized-node-table'

interface NodeRowMetrics {
  rows: AnalyticsDatasetRow[]
  totalRows?: number
  stageTotalRows?: number
}

function resolveNodeStageTotal(
  data: NodeRowMetrics,
  batchTotalRows?: number,
): number {
  if (data.stageTotalRows !== undefined) return data.stageTotalRows
  if (data.totalRows !== undefined) return data.totalRows
  if (batchTotalRows !== undefined) return batchTotalRows
  return data.rows.length
}

function resolveNodeQueryTotal(
  data: NodeRowMetrics,
  batchTotalRows?: number,
): number {
  if (batchTotalRows !== undefined) return batchTotalRows
  if (data.totalRows !== undefined) return data.totalRows
  return data.rows.length
}

export interface NodeInspectionDialogProps {
  batch:
    | {
        index: number
        offset: number
        limit: number
        finished: boolean
        totalRows?: number
      }
    | undefined
  canLoadNextBatch: boolean
  isLoadingBatch: boolean
  sourceError: string | undefined
  onSelectPage: (nodeId: string, pageIndex: number) => void
  onChangePageSize: (nodeId: string, pageSize: number) => void
  inspectedNodeConfig: SpaceWorkflowNodeConfig | null
  inspectedNodeLineageChain: SpaceWorkflowNodeConfig[]
  inspectedNodeResolvedData: {
    columns: AnalyticsColumnSchema[]
    rows: AnalyticsDatasetRow[]
    totalRows?: number
    stageTotalRows?: number
    rawCsvSample?: string
  }
  startDate: string
  endDate: string
  nodeModalSearch: string
  onSearchChange: (val: string) => void
  onSelectNodeId: (nodeId: string | null) => void
  onEditNode: (nodeId: string) => void
  resolveRowsForWorkflowNode: (node: SpaceWorkflowNodeConfig) => {
    columns: AnalyticsColumnSchema[]
    rows: AnalyticsDatasetRow[]
    totalRows?: number
    stageTotalRows?: number
    rawCsvSample?: string
  }
}

export function NodeInspectionDialog({
  batch,
  canLoadNextBatch,
  isLoadingBatch,
  sourceError,
  onSelectPage,
  onChangePageSize,
  inspectedNodeConfig,
  inspectedNodeLineageChain,
  inspectedNodeResolvedData,
  startDate,
  endDate,
  nodeModalSearch,
  onSearchChange,
  onSelectNodeId,
  onEditNode,
  resolveRowsForWorkflowNode,
}: NodeInspectionDialogProps) {
  let badgeLabel = 'NODE'
  let titleLabel = 'Inspeção de Fluxo'
  let descriptionLabel =
    'Inspeção de linhagem completa, regras e tabela virtualizada.'
  let dsName = '-'
  let sqlPreview = ''

  if (inspectedNodeConfig) {
    badgeLabel = inspectedNodeConfig.badge
    titleLabel = inspectedNodeConfig.label
    descriptionLabel = inspectedNodeConfig.ruleSummary
    dsName = inspectedNodeConfig.dataSourceName
    sqlPreview = inspectedNodeConfig.sqlPreview
  }

  let sampleCsv = 'Dataset estruturado em memória / JSON normalizado.'

  if (inspectedNodeResolvedData.rawCsvSample)
    sampleCsv = inspectedNodeResolvedData.rawCsvSample

  const stageTotalRows = resolveNodeStageTotal(
    inspectedNodeResolvedData,
    batch?.totalRows,
  )
  const queryTotalRows = resolveNodeQueryTotal(
    inspectedNodeResolvedData,
    batch?.totalRows,
  )
  const hasActiveSearch = nodeModalSearch.trim() !== ''

  let dadosTabLabel = `Dados (${queryTotalRows})`
  if (hasActiveSearch && queryTotalRows !== stageTotalRows)
    dadosTabLabel = `Dados (${queryTotalRows} de ${stageTotalRows})`

  let tableOffset = 0
  if (batch !== undefined) tableOffset = batch.offset

  let paginationContent: React.ReactNode = null

  if (batch !== undefined && inspectedNodeConfig !== null) {
    const pageCount = Math.max(1, Math.ceil(queryTotalRows / batch.limit))
    const canPreviousPage = batch.index > 0 && !isLoadingBatch
    const canNextPage =
      (canLoadNextBatch || batch.index + 1 < pageCount) && !isLoadingBatch

    let paginationSummary = 'Nenhum registro encontrado neste estágio.'

    if (queryTotalRows > 0 && inspectedNodeResolvedData.rows.length > 0) {
      const startRow = batch.offset + 1
      const endRow = batch.offset + inspectedNodeResolvedData.rows.length
      paginationSummary = `Mostrando ${startRow}–${endRow} de ${queryTotalRows} registros. Os gráficos consultam o conjunto publicado completo.`
    }

    if (queryTotalRows > 0 && inspectedNodeResolvedData.rows.length === 0)
      paginationSummary = `Página ${batch.index + 1} de ${pageCount} (${queryTotalRows} registros). Os gráficos consultam o conjunto publicado completo.`

    const currentNodeId = inspectedNodeConfig.id

    paginationContent = (
      <PaginationBar
        pageIndex={batch.index}
        pageCount={pageCount}
        pageSize={batch.limit}
        pageSizeOptions={[50, 100, 250, 500]}
        canPreviousPage={canPreviousPage}
        canNextPage={canNextPage}
        disabled={isLoadingBatch}
        className="bg-background border-border/70 sticky bottom-0 z-10 rounded-lg border px-3 py-2"
        summary={<span role="status">{paginationSummary}</span>}
        onPageIndexChange={(nextPageIndex) =>
          onSelectPage(currentNodeId, nextPageIndex)
        }
        onPageSizeChange={(nextPageSize) =>
          onChangePageSize(currentNodeId, nextPageSize)
        }
      />
    )
  }

  return (
    <Dialog
      open={Boolean(inspectedNodeConfig)}
      onOpenChange={(isOpen) => {
        if (!isOpen) onSelectNodeId(null)
      }}
    >
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-6xl min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                {badgeLabel}
              </Badge>
              <DialogTitle className="text-base font-bold">
                {titleLabel}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              {inspectedNodeConfig && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border/80 h-7 gap-1.5 text-xs"
                  onClick={() => onEditNode(inspectedNodeConfig.id)}
                >
                  <Settings2 className="size-3.5" />
                  Editar Consulta
                </Button>
              )}
              <Badge variant="secondary" className="font-mono text-[11px]">
                {stageTotalRows} registros no estágio • Janela [{startDate} ..{' '}
                {endDate}]
              </Badge>
            </div>
          </div>
          <DialogDescription className="text-xs">
            {descriptionLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-4">
            <div className="bg-muted/30 border-border/70 flex flex-col gap-2 rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold uppercase">
                <GitMerge className="text-primary size-3.5" />
                Linhagem Completa do Fluxo até este Node (Clique em qualquer
                etapa para inspecionar):
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {inspectedNodeLineageChain.map((stepNode, idx) => {
                  let stepVariant: 'default' | 'outline' = 'outline'

                  if (
                    inspectedNodeConfig &&
                    stepNode.id === inspectedNodeConfig.id
                  )
                    stepVariant = 'default'

                  const stepData = resolveRowsForWorkflowNode(stepNode)
                  let stepBatchTotal: number | undefined
                  if (
                    inspectedNodeConfig &&
                    stepNode.id === inspectedNodeConfig.id
                  )
                    stepBatchTotal = batch?.totalRows

                  const stepStageTotal = resolveNodeStageTotal(
                    stepData,
                    stepBatchTotal,
                  )

                  return (
                    <div key={stepNode.id} className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={stepVariant}
                        className="h-8 gap-2 text-xs"
                        onClick={() => onSelectNodeId(stepNode.id)}
                      >
                        <Database className="size-3" />
                        <span>{stepNode.label}</span>
                        <Badge
                          variant="secondary"
                          className="font-mono text-[10px]"
                        >
                          {stepStageTotal}
                        </Badge>
                      </Button>
                      {idx < inspectedNodeLineageChain.length - 1 && (
                        <ArrowRight className="text-muted-foreground size-4" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {sourceError !== undefined && (
              <div
                role="alert"
                className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-xs"
              >
                {sourceError}
              </div>
            )}

            <Tabs defaultValue="table" className="w-full">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="table" className="gap-1.5 text-xs">
                    <TableIcon className="size-3.5" />
                    {dadosTabLabel}
                  </TabsTrigger>
                  <TabsTrigger value="sql" className="gap-1.5 text-xs">
                    <ShieldCheck className="size-3.5" />
                    SQL
                  </TabsTrigger>
                  <TabsTrigger value="schema" className="gap-1.5 text-xs">
                    <FileSpreadsheet className="size-3.5" />
                    Esquema
                  </TabsTrigger>
                </TabsList>

                <div className="relative w-64">
                  <Search className="text-muted-foreground absolute top-2 left-2.5 size-3.5" />
                  <Input
                    value={nodeModalSearch}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Filtrar linhas neste estágio..."
                    className="h-7 pl-8 text-xs"
                  />
                </div>
              </div>

              <TabsContent value="table" className="mt-3 flex flex-col gap-3">
                <VirtualizedNodeTable
                  columns={inspectedNodeResolvedData.columns}
                  rows={inspectedNodeResolvedData.rows}
                  offset={tableOffset}
                />
                {paginationContent}
              </TabsContent>

              <TabsContent value="sql" className="mt-3">
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="bg-muted/30 rounded-lg border p-3">
                      <div className="text-muted-foreground text-[11px]">
                        DataSource de Origem
                      </div>
                      <div className="mt-0.5 text-sm font-semibold">
                        {dsName}
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg border p-3">
                      <div className="text-muted-foreground text-[11px]">
                        Limitadores Globais de Data
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-emerald-500">
                        {startDate} → {endDate}
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg border p-3">
                      <div className="text-muted-foreground text-[11px]">
                        Auditoria White-Box DataSource
                      </div>
                      <div className="mt-0.5 text-xs font-medium">
                        Extração posicional determinística • Zero N+1
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/40 rounded-lg border p-3">
                    <div className="text-muted-foreground mb-1.5 text-xs font-semibold">
                      Consulta / Transformação Executada neste Node:
                    </div>
                    <pre className="overflow-x-auto font-mono text-xs leading-relaxed">
                      {sqlPreview}
                    </pre>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="schema" className="mt-3">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="border-border/70 rounded-lg border p-3">
                    <div className="mb-2 text-xs font-semibold">
                      Colunas Tipadas (
                      {inspectedNodeResolvedData.columns.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {inspectedNodeResolvedData.columns.map((col) => (
                        <Badge
                          key={col.name}
                          variant="outline"
                          className="font-mono text-[11px]"
                        >
                          {col.name}: {col.type}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="border-border/70 rounded-lg border p-3">
                    <div className="mb-2 text-xs font-semibold">
                      Amostra Bruta RFC-4180 CSV
                    </div>
                    <pre className="bg-muted/40 max-h-[200px] overflow-auto rounded-md p-2 font-mono text-[10px]">
                      {sampleCsv}
                    </pre>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="bg-muted/20 flex shrink-0 items-center justify-end gap-2 border-t px-6 py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectNodeId(null)}
          >
            Fechar Inspeção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
