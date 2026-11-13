import type { AnalyticsColumnSchema } from '@mr-tick/application'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { collectWorkflowLineage } from '../lib/analytics-plan'
import type { SpaceWorkflowNodeConfig } from '../lib/analytics-types'
import { NodeInspectionDialog } from './node-inspection-dialog'

const columns: AnalyticsColumnSchema[] = [
  { name: 'id', label: 'ID', type: 'number' },
  { name: 'subject', label: 'Assunto', type: 'string' },
]

function buildNode(
  overrides: Partial<SpaceWorkflowNodeConfig>,
): SpaceWorkflowNodeConfig {
  return {
    id: 'src-1',
    positionX: 80,
    positionY: 80,
    label: 'teste',
    subtitle: 'Redmine • Apontamentos',
    badge: 'E • EXTRACT',
    kind: 'source',
    connectionId: 'conn-1',
    dataSourceName: 'Redmine',
    datasetId: 'time_entries',
    ruleSummary: 'Nó Extract (E): Redmine.',
    sqlPreview: 'SELECT id, subject FROM time_entries',
    upstreamNodeIds: [],
    ...overrides,
  }
}

describe('NodeInspectionDialog', () => {
  it('preserves all connected stages when inspecting a source, transform or chart', () => {
    const extract = buildNode({ id: 'extract' })
    const secondExtract = buildNode({ id: 'second-extract' })
    const transform = buildNode({
      id: 'transform',
      kind: 'join',
      upstreamNodeIds: [extract.id, secondExtract.id],
    })
    const chart = buildNode({
      id: 'chart',
      kind: 'output',
      upstreamNodeIds: [transform.id],
    })
    const unrelated = buildNode({ id: 'unrelated' })
    const nodes = [chart, extract, unrelated, transform, secondExtract]

    for (const selected of [extract, secondExtract, transform, chart])
      expect(collectWorkflowLineage(nodes, selected.id)).toEqual([
        extract,
        secondExtract,
        transform,
        chart,
      ])
  })

  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 360,
    })
    HTMLElement.prototype.getBoundingClientRect = () =>
      ({
        height: 360,
        width: 800,
        top: 0,
        left: 0,
        right: 800,
        bottom: 360,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect
  })

  function renderDialog(
    overrides?: Partial<ComponentProps<typeof NodeInspectionDialog>>,
  ) {
    const sourceNode = buildNode({ id: 'src-1', label: 'teste' })
    const transformNode = buildNode({
      id: 'tx-1',
      label: 'filtro_bug',
      kind: 'sql',
      badge: 'T • TRANSFORM',
      upstreamNodeIds: ['src-1'],
    })

    const onSelectPage = vi.fn()
    const onChangePageSize = vi.fn()
    const onSelectNodeId = vi.fn()
    const onSearchChange = vi.fn()
    const onEditNode = vi.fn()

    const pageRows = Array.from({ length: 100 }, (_, idx) => ({
      id: idx + 1,
      subject: `Item ${idx + 1}`,
    }))

    const defaults: ComponentProps<typeof NodeInspectionDialog> = {
      batch: {
        index: 0,
        offset: 0,
        limit: 100,
        finished: false,
        totalRows: 450,
      },
      canLoadNextBatch: true,
      isLoadingBatch: false,
      sourceError: undefined,
      onSelectPage,
      onChangePageSize,
      inspectedNodeConfig: transformNode,
      inspectedNodeLineageChain: [sourceNode, transformNode],
      inspectedNodeResolvedData: {
        columns,
        rows: pageRows,
        totalRows: 450,
        stageTotalRows: 450,
      },
      startDate: '2026-08-01',
      endDate: '2026-10-31',
      nodeModalSearch: '',
      onSearchChange,
      onSelectNodeId,
      onEditNode,
      onLeaveEditor: vi.fn(),
      isEditing: false,
      editor: undefined,
      chart: undefined,
      resolveRowsForWorkflowNode: (node) => {
        if (node.id === 'src-1')
          return {
            columns,
            rows: pageRows,
            totalRows: 1200,
            stageTotalRows: 1200,
          }

        return {
          columns,
          rows: pageRows,
          totalRows: 450,
          stageTotalRows: 450,
        }
      },
    }

    render(<NodeInspectionDialog {...defaults} {...overrides} />)

    return {
      onSelectPage,
      onChangePageSize,
      onSelectNodeId,
      onSearchChange,
      onEditNode,
    }
  }

  it('displays real stage totals across top badge, lineage chips and Dados tab', () => {
    renderDialog()

    expect(
      screen.getByText(
        /450 registros no estágio • Janela \[2026-08-01 \.\. 2026-10-31\]/,
      ),
    ).toBeInTheDocument()

    const lineageSourceBtn = screen.getByRole('button', { name: /teste/i })
    expect(within(lineageSourceBtn).getByText('1200')).toBeInTheDocument()

    const lineageTransformBtn = screen.getByRole('button', {
      name: /filtro_bug/i,
    })
    expect(within(lineageTransformBtn).getByText('450')).toBeInTheDocument()

    expect(screen.getByRole('tab', { name: 'Dados (450)' })).toBeInTheDocument()
  })

  it('places pagination controls below the table instead of DialogFooter and supports page navigation', () => {
    const { onSelectPage } = renderDialog({
      batch: {
        index: 1,
        offset: 100,
        limit: 100,
        finished: false,
        totalRows: 450,
      },
    })

    const dialog = screen.getByRole('dialog')
    const tablePanel = screen.getByRole('tabpanel')
    expect(within(tablePanel).getByRole('status')).toHaveTextContent(
      'Mostrando 101–200 de 450 registros. Os gráficos consultam o conjunto publicado completo.',
    )
    expect(within(tablePanel).getByText('Página 2 de 5')).toBeInTheDocument()
    expect(
      within(tablePanel).getByText('Linhas por página'),
    ).toBeInTheDocument()

    const footer = dialog.querySelector<HTMLElement>(
      '[data-slot="dialog-footer"]',
    )
    expect(footer).not.toBeNull()
    if (footer !== null) {
      expect(within(footer).getAllByRole('button')).toHaveLength(1)
      expect(
        within(footer).getByRole('button', { name: 'Fechar Inspeção' }),
      ).toBeInTheDocument()
    }

    fireEvent.click(
      within(tablePanel).getByRole('button', {
        name: 'Ir para a primeira página',
      }),
    )
    expect(onSelectPage).toHaveBeenCalledWith('tx-1', 0)

    fireEvent.click(
      within(tablePanel).getByRole('button', {
        name: 'Ir para a página anterior',
      }),
    )
    expect(onSelectPage).toHaveBeenCalledWith('tx-1', 0)

    fireEvent.click(
      within(tablePanel).getByRole('button', {
        name: 'Ir para a próxima página',
      }),
    )
    expect(onSelectPage).toHaveBeenCalledWith('tx-1', 2)

    fireEvent.click(
      within(tablePanel).getByRole('button', {
        name: 'Ir para a última página',
      }),
    )
    expect(onSelectPage).toHaveBeenCalledWith('tx-1', 4)

    expect(within(tablePanel).getByText('101')).toBeInTheDocument()
  })

  it('preserves stage total in header while showing filtered total on Dados tab during search', () => {
    renderDialog({
      nodeModalSearch: 'bug',
      batch: {
        index: 0,
        offset: 0,
        limit: 100,
        finished: true,
        totalRows: 12,
      },
      canLoadNextBatch: false,
      inspectedNodeResolvedData: {
        columns,
        rows: [{ id: 1, subject: 'Fix bug' }],
        totalRows: 12,
        stageTotalRows: 450,
      },
      resolveRowsForWorkflowNode: () => ({
        columns,
        rows: [{ id: 1, subject: 'Fix bug' }],
        totalRows: 12,
        stageTotalRows: 450,
      }),
    })

    expect(screen.getByText(/450 registros no estágio/)).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Dados (12 de 450)' }),
    ).toBeInTheDocument()
  })
})
