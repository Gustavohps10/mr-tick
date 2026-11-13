import type { AnalyticsDatasetManifest } from '@mr-tick/application'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { createDefaultBlankSpace } from '../lib/analytics-types'
import { WorkflowNodeConfigDialog } from './workflow-node-config-dialog'

describe('WorkflowNodeConfigDialog - MultiSelect Filters', () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  const mockDatasets: AnalyticsDatasetManifest[] = [
    {
      id: 'redmine_time_entries_csv',
      name: 'Apontamentos de Horas',
      description: 'Apontamentos detalhados de horas por membro e atividade',
      extraction: { modes: ['snapshot'], identity: { kind: 'scope' } },
      sourceFormat: 'csv',
      endpoint: '/time_entries.csv',
      columns: [
        { name: 'id', label: 'ID', type: 'string' },
        { name: 'hours', label: 'Horas', type: 'number' },
      ],
      supportedFilters: [
        {
          id: 'user_id',
          label: 'Usuários',
          type: 'multi_select',
          dynamicOptionsSource: 'members',
        },
        {
          id: 'activity_id',
          label: 'Atividades',
          type: 'multi_select',
          dynamicOptionsSource: 'activities',
        },
      ],
    },
  ]

  it('renders multi_select comboboxes with connection metadata options when available', () => {
    const onSetNodeFilterValue = vi.fn()

    render(
      <WorkflowNodeConfigDialog
        transformPreviewError={undefined}
        transformPreviewDetails={undefined}
        outputHierarchyColumns={[]}
        onSetOutputHierarchyColumns={vi.fn()}
        queryExecution={undefined}
        onQueryExecutionChange={vi.fn()}
        open={true}
        editingNodeId={null}
        activeSpace={createDefaultBlankSpace()}
        selectedAddNodeType="source"
        newNodeLabel="Apontamentos"
        newNodeSelectedConnectionId="conn-redmine"
        newNodeDatasetId="redmine_time_entries_csv"
        nodeSourceDatasets={mockDatasets}
        filterOptionsFailures={[]}
        isLoadingNodeDatasets={false}
        nodeSelectedColumns={['id', 'hours']}
        newNodeWidgetType="bar_vertical"
        newNodeSpan={2}
        outputSourceNodeId=""
        outputCategoryColumn=""
        outputMetricColumn=""
        outputSecondaryMetricColumn=""
        outputStackColumn=""
        outputReferenceLineMode="none"
        outputReferenceLineTarget={0}
        connectionDisplayOptions={[
          {
            id: 'conn-redmine',
            addonName: 'Redmine',
            identityName: 'Redmine Produção',
            logoUrl: '',
          },
        ]}
        upstreamAvailableColumns={[]}
        transformPreviewBeforePayload={{ columns: [], rows: [] }}
        transformPreviewAfterPayload={{ columns: [], rows: [] }}
        txUpstreamNodeId=""
        sqlQueryText=""
        nodeFilterValues={{}}
        dynamicFilterOptions={{
          members: [
            { value: '1', label: 'Carlos Silva' },
            { value: '2', label: 'Ana Souza' },
          ],
          activities: [
            { value: '9', label: 'Desenvolvimento' },
            { value: '10', label: 'Reunião' },
          ],
        }}
        nodeCustomDateRange={undefined}
        onSetNodeCustomDateRange={vi.fn()}
        onSetNodeFilterValue={onSetNodeFilterValue}
        onOpenChange={vi.fn()}
        onChangeNodeLabel={vi.fn()}
        onSelectConnectionId={vi.fn()}
        onSelectDatasetId={vi.fn()}
        onToggleSelectedColumn={vi.fn()}
        onSelectAllColumns={vi.fn()}
        onClearAllColumns={vi.fn()}
        onSelectWidgetType={vi.fn()}
        onSelectSpan={vi.fn()}
        onSetOutputSourceNodeId={vi.fn()}
        onSetOutputCategoryColumn={vi.fn()}
        onSetOutputMetricColumn={vi.fn()}
        onSetOutputSecondaryMetricColumn={vi.fn()}
        onSetOutputStackColumn={vi.fn()}
        onSetOutputReferenceLineMode={vi.fn()}
        onSetOutputReferenceLineTarget={vi.fn()}
        onSetTxUpstreamNodeId={vi.fn()}
        onSetSqlQueryText={vi.fn()}
        onSaveEditedNode={vi.fn()}
        onAddWorkflowNode={vi.fn()}
      />,
    )

    expect(screen.getByText('Usuários')).toBeInTheDocument()
    expect(screen.getByText('Atividades')).toBeInTheDocument()

    // Abrir combobox de usuários
    const userCombobox = screen.getByText(
      'Todos os registros (usuários sem restrição)',
    )
    fireEvent.click(userCombobox)

    expect(screen.getByText('Carlos Silva')).toBeInTheDocument()
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()

    // Selecionar Carlos Silva
    const carlosOption = screen.getByText('Carlos Silva')
    fireEvent.click(carlosOption)

    expect(onSetNodeFilterValue).toHaveBeenCalledWith('user_id', ['1'])
  })
})

describe('WorkflowNodeConfigDialog - Remote Aggregate Constraints', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
    window.HTMLElement.prototype.releasePointerCapture = vi.fn()
  })

  function renderDialog(
    overrides: Partial<ComponentProps<typeof WorkflowNodeConfigDialog>> = {},
  ) {
    const space = createDefaultBlankSpace()
    space.workflowNodes = [
      {
        id: 'remote-source',
        kind: 'source',
        positionX: 0,
        positionY: 0,
        label: 'Remote Totals',
        subtitle: 'Redmine • Apontamentos',
        badge: 'E • EXTRACT',
        connectionId: 'conn-redmine',
        dataSourceName: 'Redmine',
        datasetId: 'redmine_time_entries_csv',
        upstreamNodeIds: [],
        ruleSummary: '',
        sqlPreview: '',
        queryExecution: {
          kind: 'aggregate',
          groupBy: ['project'],
          measures: [
            { name: 'remote_hours', operator: 'sum', column: 'hours' },
          ],
        },
      },
    ]

    return render(
      <WorkflowNodeConfigDialog
        transformPreviewError={undefined}
        transformPreviewDetails={undefined}
        outputHierarchyColumns={[]}
        onSetOutputHierarchyColumns={vi.fn()}
        queryExecution={undefined}
        onQueryExecutionChange={vi.fn()}
        open={true}
        editingNodeId={null}
        activeSpace={space}
        selectedAddNodeType="output"
        newNodeLabel="Gráfico Remoto"
        newNodeSelectedConnectionId="conn-redmine"
        newNodeDatasetId="redmine_time_entries_csv"
        nodeSourceDatasets={[]}
        filterOptionsFailures={[]}
        isLoadingNodeDatasets={false}
        nodeSelectedColumns={[]}
        newNodeWidgetType="bar_vertical"
        newNodeSpan={2}
        outputSourceNodeId="remote-source"
        outputCategoryColumn="project"
        outputMetricColumn="remote_hours"
        outputSecondaryMetricColumn=""
        outputStackColumn=""
        outputReferenceLineMode="none"
        outputReferenceLineTarget={10}
        connectionDisplayOptions={[]}
        upstreamAvailableColumns={[
          { name: 'project', label: 'Projeto', type: 'string' },
          { name: 'remote_hours', label: 'Horas', type: 'number' },
        ]}
        transformPreviewBeforePayload={{ columns: [], rows: [] }}
        transformPreviewAfterPayload={{ columns: [], rows: [] }}
        txUpstreamNodeId=""
        sqlQueryText=""
        nodeFilterValues={{}}
        dynamicFilterOptions={{
          projects: [],
          members: [],
          activities: [],
          task_statuses: [],
          task_trackers: [],
          task_priorities: [],
          sprints_versions: [],
        }}
        nodeCustomDateRange={undefined}
        onSetNodeCustomDateRange={vi.fn()}
        onSetNodeFilterValue={vi.fn()}
        onOpenChange={vi.fn()}
        onChangeNodeLabel={vi.fn()}
        onSelectConnectionId={vi.fn()}
        onSelectDatasetId={vi.fn()}
        onToggleSelectedColumn={vi.fn()}
        onSelectAllColumns={vi.fn()}
        onClearAllColumns={vi.fn()}
        onSelectWidgetType={vi.fn()}
        onSelectSpan={vi.fn()}
        onSetOutputSourceNodeId={vi.fn()}
        onSetOutputCategoryColumn={vi.fn()}
        onSetOutputMetricColumn={vi.fn()}
        onSetOutputSecondaryMetricColumn={vi.fn()}
        onSetOutputStackColumn={vi.fn()}
        onSetOutputReferenceLineMode={vi.fn()}
        onSetOutputReferenceLineTarget={vi.fn()}
        onSetTxUpstreamNodeId={vi.fn()}
        onSetSqlQueryText={vi.fn()}
        onSaveEditedNode={vi.fn()}
        onAddWorkflowNode={vi.fn()}
        {...overrides}
      />,
    )
  }

  it('disables unsupported reference modes, visual models, and stack selection for remote aggregate outputs', () => {
    renderDialog()

    const refTrigger = screen.getByText('Sem linha').closest('button')
    expect(refTrigger).not.toBeNull()
    if (refTrigger !== null) fireEvent.keyDown(refTrigger, { key: 'ArrowDown' })

    expect(
      screen.getByRole('option', { name: 'Média Simples (AVG)' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('option', { name: 'Média Ponderada Σ(A) ÷ Σ(B)' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('option', { name: 'Meta Fixa (SLA / Valor)' }),
    ).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(document.body, { key: 'Escape' })

    const visualTrigger = screen
      .getByText('Barras Verticais (Colunas)')
      .closest('button')
    expect(visualTrigger).not.toBeNull()
    if (visualTrigger !== null)
      fireEvent.keyDown(visualTrigger, { key: 'ArrowDown' })

    expect(
      screen.getByRole('option', { name: 'Tabela Matriz Dinâmica (Pivô 2D)' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('option', {
        name: 'TreeGrid Hierárquico (3 Níveis + Rollup)',
      }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('option', {
        name: 'DataTable Condicional (Sliders & Gradiente)',
      }),
    ).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(
      screen.queryByRole('combobox', {
        name: 'Empilhar ou pivotar visualização',
      }),
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: 'Adicionar ao Workflow' }),
    ).toBeEnabled()
  })

  const unsupportedCases: Array<{
    name: string
    override: Partial<ComponentProps<typeof WorkflowNodeConfigDialog>>
  }> = [
    {
      name: 'average reference',
      override: { outputReferenceLineMode: 'average' },
    },
    {
      name: 'weighted_ratio reference',
      override: { outputReferenceLineMode: 'weighted_ratio' },
    },
    {
      name: 'pivot_matrix visual',
      override: { newNodeWidgetType: 'pivot_matrix' },
    },
    {
      name: 'tree_grid visual',
      override: { newNodeWidgetType: 'tree_grid' },
    },
    {
      name: 'conditional_table visual',
      override: { newNodeWidgetType: 'conditional_table' },
    },
    {
      name: 'stack column',
      override: { outputStackColumn: 'project' },
    },
  ]

  it('shows the example and the missing numeric comparison required by a combo chart', () => {
    renderDialog({ newNodeWidgetType: 'combo_multiaxis' })

    expect(
      screen.getByRole('region', { name: 'Prévia da visualização' }),
    ).toHaveTextContent('Dados fictícios')
    expect(
      screen.getByRole('region', { name: 'Requisitos de dados' }),
    ).toHaveTextContent('Segunda métrica: selecione uma coluna.')
    expect(
      screen.getByRole('button', { name: 'Adicionar ao Workflow' }),
    ).toBeDisabled()
  })

  it.each(unsupportedCases)(
    'explicitly refuses remote post-processing for $name and blocks submission',
    ({ override }) => {
      renderDialog(override)

      expect(screen.getByRole('alert')).toHaveTextContent(
        'ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY',
      )
      expect(
        screen.getByRole('button', { name: 'Adicionar ao Workflow' }),
      ).toBeDisabled()
    },
  )

  it('explicitly refuses SQL transform nodes fed by a remote aggregate source', () => {
    renderDialog({
      selectedAddNodeType: 'transform',
      txUpstreamNodeId: 'remote-source',
      sqlQueryText: 'SELECT project FROM input',
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ANALYTICS_REMOTE_AGGREGATE_PROJECTION_ONLY',
    )
    expect(
      screen.getByRole('button', { name: 'Adicionar ao Workflow' }),
    ).toBeDisabled()
  })
})

describe('WorkflowNodeConfigDialog - Extraction Date vs Secondary Date Filter', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
    window.HTMLElement.prototype.releasePointerCapture = vi.fn()
  })

  const manifestWithDates: AnalyticsDatasetManifest = {
    id: 'issues_dataset',
    name: 'Issues Analytics',
    description:
      'Dataset com janela de extração e filtro secundário de fechamento',
    extraction: {
      modes: ['snapshot', 'changes'],
      identity: { kind: 'row', columns: ['id'] },
    },
    selection: { dateRange: true, project: true },
    sourceFormat: 'json',
    endpoint: '/issues.json',
    columns: [
      { name: 'id', label: 'ID', type: 'number' },
      { name: 'subject', label: 'Assunto', type: 'string' },
    ],
    supportedFilters: [
      {
        id: 'closed_date_range',
        label: 'Data de fechamento',
        type: 'date_range',
      },
    ],
  }

  function renderSourceDialog(
    overrides: Partial<ComponentProps<typeof WorkflowNodeConfigDialog>> = {},
  ) {
    return render(
      <WorkflowNodeConfigDialog
        transformPreviewError={undefined}
        transformPreviewDetails={undefined}
        outputHierarchyColumns={[]}
        onSetOutputHierarchyColumns={vi.fn()}
        queryExecution={undefined}
        onQueryExecutionChange={vi.fn()}
        open={true}
        editingNodeId={null}
        activeSpace={createDefaultBlankSpace()}
        selectedAddNodeType="source"
        newNodeLabel="Issues Filtradas"
        newNodeSelectedConnectionId="conn-redmine"
        newNodeDatasetId="issues_dataset"
        nodeSourceDatasets={[manifestWithDates]}
        filterOptionsFailures={[]}
        isLoadingNodeDatasets={false}
        nodeSelectedColumns={['id', 'subject']}
        newNodeWidgetType="bar_vertical"
        newNodeSpan={2}
        outputSourceNodeId=""
        outputCategoryColumn=""
        outputMetricColumn=""
        outputSecondaryMetricColumn=""
        outputStackColumn=""
        outputReferenceLineMode="none"
        outputReferenceLineTarget={0}
        connectionDisplayOptions={[
          {
            id: 'conn-redmine',
            addonName: 'Redmine',
            identityName: 'Prod',
            logoUrl: '',
          },
        ]}
        upstreamAvailableColumns={[]}
        transformPreviewBeforePayload={{ columns: [], rows: [] }}
        transformPreviewAfterPayload={{ columns: [], rows: [] }}
        txUpstreamNodeId=""
        sqlQueryText=""
        nodeFilterValues={{}}
        dynamicFilterOptions={{}}
        globalStartDate="2026-08-01"
        globalEndDate="2026-10-31"
        nodeCustomDateRange={undefined}
        onSetNodeCustomDateRange={vi.fn()}
        onSetNodeFilterValue={vi.fn()}
        onOpenChange={vi.fn()}
        onChangeNodeLabel={vi.fn()}
        onSelectConnectionId={vi.fn()}
        onSelectDatasetId={vi.fn()}
        onToggleSelectedColumn={vi.fn()}
        onSelectAllColumns={vi.fn()}
        onClearAllColumns={vi.fn()}
        onSelectWidgetType={vi.fn()}
        onSelectSpan={vi.fn()}
        onSetOutputSourceNodeId={vi.fn()}
        onSetOutputCategoryColumn={vi.fn()}
        onSetOutputMetricColumn={vi.fn()}
        onSetOutputSecondaryMetricColumn={vi.fn()}
        onSetOutputStackColumn={vi.fn()}
        onSetOutputReferenceLineMode={vi.fn()}
        onSetOutputReferenceLineTarget={vi.fn()}
        onSetTxUpstreamNodeId={vi.fn()}
        onSetSqlQueryText={vi.fn()}
        onSaveEditedNode={vi.fn()}
        onAddWorkflowNode={vi.fn()}
        {...overrides}
      />,
    )
  }

  it('keeps canonical node extraction period separated from secondary date_range filters', () => {
    const onSetNodeCustomDateRange = vi.fn()
    const onSetNodeFilterValue = vi.fn()

    renderSourceDialog({
      onSetNodeCustomDateRange,
      onSetNodeFilterValue,
    })

    expect(screen.getByText('Período da extração')).toBeInTheDocument()
    expect(
      screen.getByText('Painel: 2026-08-01 a 2026-10-31'),
    ).toBeInTheDocument()
    expect(screen.getByText('Data de fechamento')).toBeInTheDocument()
    expect(screen.getByText('Sem restrição')).toBeInTheDocument()

    const extractionSelect = screen.getByRole('combobox', {
      name: 'Período da extração',
    })
    fireEvent.keyDown(extractionSelect, { key: 'ArrowDown' })
    fireEvent.click(
      screen.getByRole('option', {
        name: 'Personalizado (Definir datas específicas neste nó)',
      }),
    )

    expect(onSetNodeCustomDateRange).toHaveBeenCalledWith({
      from: '2026-08-01',
      to: '2026-10-31',
    })
    expect(onSetNodeFilterValue).not.toHaveBeenCalled()

    const secondaryFromInput = screen.getByLabelText('Data de fechamento - De')
    expect(secondaryFromInput).toHaveValue('')
    fireEvent.change(secondaryFromInput, { target: { value: '2026-03-01' } })

    expect(onSetNodeFilterValue).toHaveBeenCalledWith('closed_date_range', {
      from: '2026-03-01',
      to: '',
    })
  })

  it('renders custom extraction date inputs and clears secondary date_range independently', () => {
    const onSetNodeCustomDateRange = vi.fn()
    const onSetNodeFilterValue = vi.fn()

    renderSourceDialog({
      nodeCustomDateRange: { from: '2026-01-01', to: '2026-01-31' },
      nodeFilterValues: {
        closed_date_range: { from: '2026-04-01', to: '2026-04-15' },
      },
      onSetNodeCustomDateRange,
      onSetNodeFilterValue,
    })

    expect(screen.getByText('Período personalizado')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Data inicial do nó'), {
      target: { value: '2026-02-01' },
    })
    expect(onSetNodeCustomDateRange).toHaveBeenCalledWith({
      from: '2026-02-01',
      to: '2026-01-31',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Limpar período' }))
    expect(onSetNodeFilterValue).toHaveBeenCalledWith('closed_date_range', {
      from: '',
      to: '',
    })
  })
})
