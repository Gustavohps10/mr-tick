import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import { AnalyticsError } from './components/analytics-error'
import { AnalyticsTopBar } from './components/analytics-top-bar'
import { CreateSpaceDialog } from './components/create-space-dialog'
import { DrillDownDialog } from './components/drill-down-dialog'
import { GenericWidgetRenderer } from './components/generic-widget-renderer'
import { NodeInspectionDialog } from './components/node-inspection-dialog'
import { SmartGridView } from './components/smart-grid-view'
import { WorkflowBackgroundView } from './components/workflow-background-view'
import { WorkflowNodeConfigDialog } from './components/workflow-node-config-dialog'
import { useAnalyticsWorkspace } from './hooks/use-analytics-workspace'

export function Analytics() {
  const vm = useAnalyticsWorkspace()

  if (vm.hydrateError !== undefined)
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Analytics indisponível</h1>
          </CardTitle>
          <CardDescription>
            Os dados e as configurações deste workspace não puderam ser abertos.
            Resolva o erro abaixo para editar os espaços.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 break-words">
          <AnalyticsError
            message={vm.hydrateError}
            details={vm.hydrateErrorDetails}
          />
          {vm.resetError !== undefined && (
            <AnalyticsError
              message={vm.resetError}
              details={vm.resetErrorDetails}
            />
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={vm.isResettingStorage}
            onClick={vm.retryHydration}
          >
            Tentar abrir novamente
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                data-testid="analytics-reset-storage-btn"
                disabled={vm.isResettingStorage}
              >
                {vm.isResettingStorage && 'Resetando...'}
                {!vm.isResettingStorage && 'Resetar dados do Analytics'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid="analytics-reset-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Resetar dados locais do Analytics?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação remove permanentemente o banco local do Analytics
                  (.duckdb), os espaços salvos e os caches de consulta deste
                  workspace neste dispositivo. Seus dados na fonte remota não
                  serão alterados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  data-testid="analytics-cancel-reset-storage-btn"
                  disabled={vm.isResettingStorage}
                >
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  data-testid="analytics-confirm-reset-storage-btn"
                  className={buttonVariants({ variant: 'destructive' })}
                  disabled={vm.isResettingStorage}
                  onClick={() => void vm.resetAnalyticsStorage()}
                >
                  Confirmar reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    )

  if (!vm.isHydrated)
    return (
      <div
        role="status"
        aria-label="Carregando Analytics"
        className="flex flex-col gap-4"
      >
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )

  const nodeConfig = (
    <WorkflowNodeConfigDialog
      queryExecution={vm.queryExecution}
      onQueryExecutionChange={vm.setQueryExecution}
      open={vm.isAddNodeModalOpen}
      embedded={vm.inspectedNodeConfig !== undefined}
      editingNodeId={vm.editingNodeId}
      activeSpace={vm.activeSpace}
      selectedAddNodeType={vm.selectedAddNodeType}
      newNodeLabel={vm.newNodeLabel}
      newNodeSelectedConnectionId={vm.newNodeSelectedConnectionId}
      newNodeDatasetId={vm.newNodeDatasetId}
      nodeSourceDatasets={vm.nodeSourceDatasets}
      filterOptionsFailures={vm.filterOptionsFailures}
      isLoadingNodeDatasets={vm.isLoadingNodeDatasets}
      nodeSelectedColumns={vm.nodeSelectedColumns}
      newNodeWidgetType={vm.newNodeWidgetType}
      newNodeSpan={vm.newNodeSpan}
      outputSourceNodeId={vm.outputSourceNodeId}
      outputCategoryColumn={vm.outputCategoryColumn}
      outputMetricColumn={vm.outputMetricColumn}
      outputSecondaryMetricColumn={vm.outputSecondaryMetricColumn}
      outputHierarchyColumns={vm.outputHierarchyColumns}
      onSetOutputHierarchyColumns={vm.setOutputHierarchyColumns}
      outputStackColumn={vm.outputStackColumn}
      outputReferenceLineMode={vm.outputReferenceLineMode}
      outputReferenceLineTarget={vm.outputReferenceLineTarget}
      connectionDisplayOptions={vm.connectionDisplayOptions}
      upstreamAvailableColumns={vm.upstreamAvailableColumns}
      transformPreviewError={vm.previewError}
      transformPreviewDetails={vm.previewDetails}
      transformPreviewBeforePayload={vm.transformPreviewBeforePayload}
      transformPreviewAfterPayload={vm.transformPreviewAfterPayload}
      txUpstreamNodeId={vm.txUpstreamNodeId}
      sqlQueryText={vm.sqlQueryText}
      nodeFilterValues={vm.newNodeFilterValues}
      dynamicFilterOptions={vm.dynamicFilterOptions}
      globalStartDate={vm.startDate}
      globalEndDate={vm.endDate}
      nodeCustomDateRange={vm.newNodeCustomDateRange}
      onSetNodeCustomDateRange={vm.setNewNodeCustomDateRange}
      onSetNodeFilterValue={vm.handleSetNodeFilterValue}
      onOpenChange={(isOpen) => {
        vm.setIsAddNodeModalOpen(isOpen)

        if (!isOpen) vm.setEditingNodeId(null)
      }}
      onChangeNodeLabel={vm.setNewNodeLabel}
      onSelectConnectionId={vm.setNewNodeSelectedConnectionId}
      onSelectDatasetId={vm.handleSelectDatasetId}
      onToggleSelectedColumn={vm.handleToggleNodeSelectedColumn}
      onSelectAllColumns={vm.handleSelectAllNodeColumns}
      onClearAllColumns={vm.handleClearAllNodeColumns}
      onSelectWidgetType={vm.setNewNodeWidgetType}
      onSelectSpan={vm.setNewNodeSpan}
      onSetOutputSourceNodeId={vm.setOutputSourceNodeId}
      onSetOutputCategoryColumn={vm.setOutputCategoryColumn}
      onSetOutputMetricColumn={vm.setOutputMetricColumn}
      onSetOutputSecondaryMetricColumn={vm.setOutputSecondaryMetricColumn}
      onSetOutputStackColumn={vm.setOutputStackColumn}
      onSetOutputReferenceLineMode={vm.setOutputReferenceLineMode}
      onSetOutputReferenceLineTarget={vm.setOutputReferenceLineTarget}
      onSetTxUpstreamNodeId={vm.setTxUpstreamNodeId}
      onSetSqlQueryText={vm.setSqlQueryText}
      onSaveEditedNode={vm.handleSaveEditedNode}
      onAddWorkflowNode={vm.handleAddWorkflowNode}
      resolveRowsForWorkflowNode={vm.resolveRowsForWorkflowNode}
    />
  )

  function closeNodeEditor() {
    vm.setIsAddNodeModalOpen(false)
    vm.setEditingNodeId(null)
  }

  const inspectedWidget = vm.activeSpace.widgets.find(
    (widget) =>
      widget.outputNodeId === vm.inspectedNodeConfig?.id &&
      vm.inspectedNodeConfig?.kind === 'output',
  )

  let inspectedChart
  if (inspectedWidget !== undefined) {
    const inputError = vm.widgetInputErrors[inspectedWidget.id]
    if (inputError !== undefined)
      inspectedChart = (
        <AnalyticsError message={inputError} details={undefined} />
      )
    if (inputError === undefined)
      inspectedChart = (
        <GenericWidgetRenderer
          onUnauthorized={vm.clearConnectionPublications}
          warehousePlan={vm.warehousePlan}
          publicationVersion={vm.publicationVersion}
          widget={inspectedWidget}
          activeSpace={vm.activeSpace}
          upstreamStatus={
            vm.upstreamStatusByNodeId[inspectedWidget.sourceNodeId]
          }
          onRetrySource={() =>
            void vm.retrySourceNode(inspectedWidget.sourceNodeId)
          }
          resolveRowsForWorkflowNode={vm.resolveRowsForWorkflowNode}
          onGenericDrillDown={vm.handleGenericChartDrillDown}
          overloadTolerancePct={vm.overloadTolerancePct}
          onSetOverloadTolerancePct={vm.setOverloadTolerancePct}
          idleTolerancePct={vm.idleTolerancePct}
          onSetIdleTolerancePct={vm.setIdleTolerancePct}
          estimationTolerancePct={vm.estimationTolerancePct}
          onSetEstimationTolerancePct={vm.setEstimationTolerancePct}
        />
      )
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <AnalyticsTopBar
        spaces={vm.spaces}
        activeSpace={vm.activeSpace}
        layerMode={vm.layerMode}
        dateRange={vm.dateRange}
        isFetchingLive={vm.isFetchingLive}
        pollingIntervalMinutes={vm.pollingIntervalMinutes}
        syncStatusSummary={vm.syncStatusSummary}
        hasErrors={
          vm.settingsError !== undefined || vm.sourceFailures.length > 0
        }
        hasCoverageWarning={vm.hasUnverifiedCoverage}
        statusDetails={
          <>
            {vm.settingsError !== undefined && (
              <div className="border-destructive/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <AnalyticsError
                    message={vm.settingsError}
                    details={vm.settingsErrorDetails}
                  />
                  <p className="text-muted-foreground text-xs">
                    As alterações deste espaço ainda não foram salvas.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={vm.retrySaveWorkspaceState}
                >
                  Tentar salvar novamente
                </Button>
              </div>
            )}

            {vm.sourceFailures.map((failure) => {
              const hasCached =
                vm.upstreamStatusByNodeId[failure.nodeId]?.hasPublication ===
                true

              return (
                <div
                  key={failure.nodeId}
                  className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="space-y-1">
                    <AnalyticsError
                      message={`${failure.label}: ${failure.message}`}
                      details={failure.details}
                    />
                    {hasCached && (
                      <p className="text-muted-foreground text-xs">
                        Exibindo última versão disponível em cache enquanto a
                        atualização falhou.
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void vm.retrySourceNode(failure.nodeId)}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )
            })}

            {vm.recentReconciliations.map((item) => (
              <p key={item.nodeId} className="text-muted-foreground text-xs">
                {item.label} · {item.start} a {item.end} reconciliado em{' '}
                <time dateTime={item.at}>
                  {new Date(item.at).toLocaleString('pt-BR')}
                </time>
              </p>
            ))}
            {vm.overdueReconciliations.map((item) => (
              <p key={item.nodeId} className="text-muted-foreground text-xs">
                Reconciliação vencida · {item.label} · última em{' '}
                <time dateTime={item.lastReconcileAt}>
                  {new Date(item.lastReconcileAt).toLocaleString('pt-BR')}
                </time>
              </p>
            ))}
            {vm.executionDiagnostics.map((item) => {
              const parts: string[] = []
              if (item.requests !== undefined)
                parts.push(`${item.requests} req`)
              if (item.pages !== undefined) parts.push(`${item.pages} pág`)
              if (item.durationMs !== undefined)
                parts.push(`${item.durationMs} ms`)
              if (item.retries !== undefined && item.retries > 0)
                parts.push(`${item.retries} retries`)
              if (item.bytes !== undefined)
                parts.push(`${(item.bytes / 1024).toFixed(1)} KB`)

              return (
                <p key={item.nodeId} className="text-muted-foreground text-xs">
                  {item.label} · {parts.join(' · ')}
                </p>
              )
            })}
            {vm.hasUnverifiedCoverage && (
              <p className="text-sm">
                A cobertura desta consulta ainda não foi confirmada pela fonte.
                Os totais podem estar incompletos.
                {vm.syncStatusSummary.coverageReasons.length > 0 && (
                  <span className="text-muted-foreground block text-xs break-words">
                    {vm.syncStatusSummary.coverageReasons.join(', ')}
                  </span>
                )}
              </p>
            )}
          </>
        }
        onSelectSpace={vm.handleSelectSpace}
        onOpenNewSpaceModal={() => vm.setIsNewSpaceModalOpen(true)}
        onDateRangeChange={vm.handleDateRangeChange}
        onPollingIntervalChange={vm.setPollingIntervalMinutes}
        onSyncAllSources={vm.handleSyncAllSources}
        onSetLayerMode={vm.setLayerMode}
      />

      {vm.layerMode === 'front' && (
        <SmartGridView
          onUnauthorized={vm.clearConnectionPublications}
          warehousePlan={vm.warehousePlan}
          widgetInputErrors={vm.widgetInputErrors}
          publicationVersion={vm.publicationVersion}
          activeSpace={vm.activeSpace}
          upstreamStatusByNodeId={vm.upstreamStatusByNodeId}
          onRetrySourceNode={(nodeId) => void vm.retrySourceNode(nodeId)}
          resolveRowsForWorkflowNode={vm.resolveRowsForWorkflowNode}
          onGenericDrillDown={vm.handleGenericChartDrillDown}
          onSetLayerMode={vm.setLayerMode}
          onUpdateWidgetSpan={vm.updateWidgetSpan}
          onMoveWidgetOrder={vm.moveWidgetOrder}
          overloadTolerancePct={vm.overloadTolerancePct}
          onSetOverloadTolerancePct={vm.setOverloadTolerancePct}
          idleTolerancePct={vm.idleTolerancePct}
          onSetIdleTolerancePct={vm.setIdleTolerancePct}
          estimationTolerancePct={vm.estimationTolerancePct}
          onSetEstimationTolerancePct={vm.setEstimationTolerancePct}
        />
      )}

      {vm.layerMode === 'background' && (
        <WorkflowBackgroundView
          activeSpace={vm.activeSpace}
          pipelineNodes={vm.pipelineNodes}
          pipelineEdges={vm.pipelineEdges}
          selectedNodeId={vm.selectedPipelineNodeId}
          onPipelineNodesChange={vm.onPipelineNodesChange}
          onPipelineEdgesChange={vm.onPipelineEdgesChange}
          onOpenAddNode={vm.handleOpenAddNode}
          onRequestRemoveNode={vm.handleRequestRemoveNode}
          onSetLayerMode={vm.setLayerMode}
          onInspectNode={vm.setInspectedNodeId}
        />
      )}

      <NodeInspectionDialog
        batch={vm.inspectedBatch}
        canLoadNextBatch={vm.canLoadNextBatch}
        isLoadingBatch={vm.inspectedSourceLoading}
        sourceError={vm.inspectedSourceError}
        onSelectPage={vm.handleSelectInspectionPage}
        onChangePageSize={vm.handleChangeInspectionPageSize}
        inspectedNodeConfig={vm.inspectedNodeConfig}
        inspectedNodeLineageChain={vm.inspectedNodeLineageChain}
        inspectedNodeResolvedData={vm.inspectedNodeResolvedData}
        startDate={vm.startDate}
        endDate={vm.endDate}
        nodeModalSearch={vm.nodeModalSearch}
        onSearchChange={vm.setNodeModalSearch}
        onSelectNodeId={(nodeId) => {
          if (nodeId === vm.inspectedNodeConfig?.id) return
          closeNodeEditor()
          vm.setInspectedNodeId(nodeId)
        }}
        onEditNode={vm.handleOpenEditNode}
        onLeaveEditor={closeNodeEditor}
        isEditing={
          vm.editingNodeId !== null &&
          vm.editingNodeId === vm.inspectedNodeConfig?.id
        }
        editor={nodeConfig}
        chart={inspectedChart}
        resolveRowsForWorkflowNode={vm.resolveRowsForWorkflowNode}
      />

      <DrillDownDialog
        drillDown={vm.drillDown}
        onClose={() => vm.setDrillDown(null)}
      />

      <CreateSpaceDialog
        open={vm.isNewSpaceModalOpen}
        newSpaceTitle={vm.newSpaceTitle}
        newSpaceSubtitle={vm.newSpaceSubtitle}
        newSpaceWidgets={vm.newSpaceWidgets}
        onOpenChange={vm.setIsNewSpaceModalOpen}
        onChangeTitle={vm.setNewSpaceTitle}
        onChangeSubtitle={vm.setNewSpaceSubtitle}
        onToggleWidget={vm.handleToggleNewSpaceWidget}
        onCreateSpace={vm.handleCreateNewSpace}
      />

      <AlertDialog
        open={vm.pendingRemoveNode !== undefined}
        onOpenChange={(open) => {
          if (!open) vm.handleCancelRemoveNode()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover node &ldquo;{vm.pendingRemoveNode?.label}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {vm.pendingRemoveDependents.length > 0 && (
                <span>
                  Este node alimenta {vm.pendingRemoveDependents.length}{' '}
                  dependente(s) (
                  {vm.pendingRemoveDependents
                    .map((dep) => dep.label)
                    .join(', ')}
                  ). Ao removê-lo, eles serão desconectados e entrarão em modo
                  de alerta até receberem uma nova fonte.
                </span>
              )}
              {vm.pendingRemoveDependents.length === 0 && (
                <span>
                  O node será removido permanentemente do workflow de &ldquo;
                  {vm.activeSpace.title}&rdquo;.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={vm.handleCancelRemoveNode}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={vm.handleConfirmRemoveNode}
            >
              Remover node
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {vm.inspectedNodeConfig === undefined && nodeConfig}
    </div>
  )
}
