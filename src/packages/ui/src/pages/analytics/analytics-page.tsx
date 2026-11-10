import { Badge } from '@/components/ui/badge'

import { AnalyticsError } from './components/analytics-error'
import { AnalyticsTopBar } from './components/analytics-top-bar'
import { CreateSpaceDialog } from './components/create-space-dialog'
import { DrillDownDialog } from './components/drill-down-dialog'
import { NodeInspectionDialog } from './components/node-inspection-dialog'
import { SmartGridView } from './components/smart-grid-view'
import { WorkflowBackgroundView } from './components/workflow-background-view'
import { WorkflowNodeConfigDialog } from './components/workflow-node-config-dialog'
import { useAnalyticsWorkspace } from './hooks/use-analytics-workspace'

export function Analytics() {
  const vm = useAnalyticsWorkspace()

  return (
    <div className="flex flex-col gap-4 pb-8">
      <AnalyticsTopBar
        spaces={vm.spaces}
        activeSpace={vm.activeSpace}
        layerMode={vm.layerMode}
        dateRange={vm.dateRange}
        isFetchingLive={vm.isFetchingLive}
        onSelectSpace={vm.handleSelectSpace}
        onOpenNewSpaceModal={() => vm.setIsNewSpaceModalOpen(true)}
        onDateRangeChange={vm.handleDateRangeChange}
        onSyncAllSources={vm.handleSyncAllSources}
        onSetLayerMode={vm.setLayerMode}
      />

      {vm.sourceFailures.map((failure) => (
        <AnalyticsError
          key={failure.nodeId}
          message={`${failure.label}: ${failure.message}`}
          details={failure.details}
        />
      ))}
      {vm.hasUnverifiedCoverage && (
        <Badge variant="outline" role="status">
          A cobertura desta consulta ainda não foi confirmada pela fonte. Os
          totais podem estar incompletos.
        </Badge>
      )}

      {vm.layerMode === 'front' && (
        <SmartGridView
          onUnauthorized={vm.clearConnectionPublications}
          warehousePlan={vm.warehousePlan}
          publicationVersion={vm.publicationVersion}
          activeSpace={vm.activeSpace}
          resolveRowsForWorkflowNode={vm.resolveRowsForWorkflowNode}
          onGenericDrillDown={vm.handleGenericChartDrillDown}
          onSetLayerMode={vm.setLayerMode}
          onUpdateWidgetSpan={vm.updateWidgetSpan}
          onUpdateWidgetVisualType={vm.updateWidgetVisualType}
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
          onPipelineNodesChange={vm.onPipelineNodesChange}
          onPipelineEdgesChange={vm.onPipelineEdgesChange}
          onOpenAddNode={vm.handleOpenAddNode}
          onSetLayerMode={vm.setLayerMode}
          onInspectNode={(nodeId) => {
            vm.setNodeModalSearch('')
            vm.setInspectedNodeId(nodeId)
          }}
        />
      )}

      <NodeInspectionDialog
        batch={vm.inspectedBatch}
        canLoadNextBatch={vm.canLoadNextBatch}
        isLoadingBatch={vm.inspectedSourceLoading}
        sourceError={vm.inspectedSourceError}
        onLoadNextBatch={vm.handleLoadNextSourceBatch}
        inspectedNodeConfig={vm.inspectedNodeConfig}
        inspectedNodeLineageChain={vm.inspectedNodeLineageChain}
        inspectedNodeResolvedData={vm.inspectedNodeResolvedData}
        startDate={vm.startDate}
        endDate={vm.endDate}
        nodeModalSearch={vm.nodeModalSearch}
        onSearchChange={vm.setNodeModalSearch}
        onSelectNodeId={vm.setInspectedNodeId}
        onEditNode={vm.handleOpenEditNode}
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

      <WorkflowNodeConfigDialog
        queryExecution={vm.queryExecution}
        onQueryExecutionChange={vm.setQueryExecution}
        open={vm.isAddNodeModalOpen}
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
        onSetNodeFilterValue={vm.handleSetNodeFilterValue}
        onOpenChange={(isOpen) => {
          vm.setIsAddNodeModalOpen(isOpen)

          if (!isOpen) vm.setEditingNodeId(null)
        }}
        onSelectAddNodeType={vm.setSelectedAddNodeType}
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
      />
    </div>
  )
}
