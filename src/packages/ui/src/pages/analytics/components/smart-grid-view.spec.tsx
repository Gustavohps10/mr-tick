import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { AnalyticsSpaceConfig } from '../lib/analytics-types'
import { SmartGridView } from './smart-grid-view'

beforeAll(() => {
  if (typeof globalThis.DataTransfer === 'undefined') {
    class PolyfillDataTransfer {
      dropEffect = 'none'
      effectAllowed = 'all'
      readonly types: string[] = []
      setData() {}
      getData() {
        return ''
      }
      clearData() {}
      setDragImage() {}
    }

    Object.defineProperty(globalThis, 'DataTransfer', {
      value: PolyfillDataTransfer,
      configurable: true,
    })
  }

  if (typeof globalThis.DragEvent === 'undefined') {
    class PolyfillDragEvent extends MouseEvent {
      readonly dataTransfer: DataTransfer

      constructor(type: string, eventInitDict?: DragEventInit) {
        super(type, eventInitDict)
        let transfer = new DataTransfer()
        if (
          eventInitDict !== undefined &&
          eventInitDict.dataTransfer !== undefined &&
          eventInitDict.dataTransfer !== null
        ) {
          transfer = eventInitDict.dataTransfer
        }
        this.dataTransfer = transfer
      }
    }

    Object.defineProperty(globalThis, 'DragEvent', {
      value: PolyfillDragEvent,
      configurable: true,
    })
  }
})

vi.mock('./generic-widget-renderer', () => ({
  GenericWidgetRenderer: () => <div>MockWidget</div>,
}))

function createSpace(): AnalyticsSpaceConfig {
  return {
    id: 'space-1',
    title: 'Espaço Teste',
    subtitle: 'Subtítulo',
    badge: 'TESTE',
    workflowNodes: [],
    workflowEdges: [],
    widgets: [
      {
        id: 'widget-1',
        widgetType: 'kpi_card',
        title: 'KPI Principal',
        subtitle: 'Resumo',
        datasetBadge: 'redmine',
        sourceNodeId: 'src-1',
        outputNodeId: 'out-1',
        chartVisualType: 'kpi_card',
        colSpan: 8,
        rowSpan: 4,
        visible: true,
        categoryColumn: '',
        metricColumn: 'total',
        secondaryMetricColumn: '',
        stackColumn: '',
        referenceLineMode: 'none',
        referenceLineTarget: 0,
      },
    ],
  }
}

describe('SmartGridView', () => {
  it('renders 12-column dense grid with colSpan and rowSpan classes', () => {
    const { container } = render(
      <SmartGridView
        onUnauthorized={vi.fn()}
        widgetInputErrors={{}}
        warehousePlan={[]}
        publicationVersion="1"
        activeSpace={createSpace()}
        upstreamStatusByNodeId={{}}
        onRetrySourceNode={vi.fn()}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        onSetLayerMode={vi.fn()}
        onUpdateWidgetLayout={vi.fn()}
        onReorderWidgets={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={15}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={15}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    const grid = container.firstElementChild
    expect(grid?.className).toContain('lg:grid-cols-12')
    expect(grid?.className).toContain('grid-flow-dense')
    expect(grid?.className).toContain('lg:auto-rows-[160px]')

    const card = grid?.firstElementChild
    expect(card?.className).toContain('lg:col-span-8')
    expect(card?.className).toContain('lg:row-span-4')

    const dragHandle = screen.getByLabelText('Arrastar KPI Principal')
    expect(dragHandle.className).toContain('cursor-grab')
    expect(dragHandle.className).toContain('touch-none')
    expect(dragHandle.getAttribute('data-slot')).toBe('sortable-item-handle')
    expect(card?.getAttribute('draggable')).toBe('true')
    expect(screen.queryByLabelText('Mover para trás')).toBeNull()
    expect(screen.queryByLabelText('Mover para frente')).toBeNull()
  })

  it('calls onUpdateWidgetLayout from quick buttons and custom layout popover', () => {
    const onUpdateWidgetLayout = vi.fn()

    render(
      <SmartGridView
        onUnauthorized={vi.fn()}
        widgetInputErrors={{}}
        warehousePlan={[]}
        publicationVersion="1"
        activeSpace={createSpace()}
        upstreamStatusByNodeId={{}}
        onRetrySourceNode={vi.fn()}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        onSetLayerMode={vi.fn()}
        onUpdateWidgetLayout={onUpdateWidgetLayout}
        onReorderWidgets={vi.fn()}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={15}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={15}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('4 Colunas (4/12)'))
    expect(onUpdateWidgetLayout).toHaveBeenCalledWith('widget-1', {
      colSpan: 4,
    })

    fireEvent.click(screen.getByLabelText('Largura Total (12/12)'))
    expect(onUpdateWidgetLayout).toHaveBeenCalledWith('widget-1', {
      colSpan: 12,
    })

    fireEvent.click(screen.getByLabelText('Ajustar dimensões (8/12 × 4L)'))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(onUpdateWidgetLayout).toHaveBeenCalledWith('widget-1', {
      colSpan: 3,
    })

    fireEvent.click(screen.getByRole('button', { name: '5L' }))
    expect(onUpdateWidgetLayout).toHaveBeenCalledWith('widget-1', {
      rowSpan: 5,
    })
  })

  it('shows drop silhouette on target card and calls onReorderWidgets on drop', async () => {
    const onReorderWidgets = vi.fn()
    const baseSpace = createSpace()
    const [firstWidget] = baseSpace.widgets
    if (firstWidget === undefined) throw new Error('Expected first widget')

    const twoWidgetSpace: AnalyticsSpaceConfig = {
      ...baseSpace,
      widgets: [
        firstWidget,
        {
          ...firstWidget,
          id: 'widget-2',
          title: 'Gráfico Secundário',
          colSpan: 4,
          rowSpan: 2,
        },
      ],
    }

    const { container } = render(
      <SmartGridView
        onUnauthorized={vi.fn()}
        widgetInputErrors={{}}
        warehousePlan={[]}
        publicationVersion="1"
        activeSpace={twoWidgetSpace}
        upstreamStatusByNodeId={{}}
        onRetrySourceNode={vi.fn()}
        resolveRowsForWorkflowNode={() => ({ columns: [], rows: [] })}
        onGenericDrillDown={vi.fn()}
        onSetLayerMode={vi.fn()}
        onUpdateWidgetLayout={vi.fn()}
        onReorderWidgets={onReorderWidgets}
        overloadTolerancePct={10}
        onSetOverloadTolerancePct={vi.fn()}
        idleTolerancePct={15}
        onSetIdleTolerancePct={vi.fn()}
        estimationTolerancePct={15}
        onSetEstimationTolerancePct={vi.fn()}
      />,
    )

    const cards = container.querySelectorAll('[data-slot="sortable-item"]')
    const card1 = cards.item(0)
    const card2 = cards.item(1)
    const handle1 = screen.getByLabelText('Arrastar KPI Principal')

    const originalElementsFromPoint = document.elementsFromPoint
    document.elementsFromPoint = () => [handle1]

    try {
      const dataTransfer = new DataTransfer()
      fireEvent(
        card1,
        new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, 30))

      document.elementsFromPoint = () => [card2]

      fireEvent(
        card2,
        new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      )
      fireEvent(
        card2,
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      )

      expect(screen.getByText('Soltar aqui (4/12 · 2L)')).toBeTruthy()

      fireEvent(
        card2,
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      )

      expect(onReorderWidgets).toHaveBeenCalledWith(['widget-2', 'widget-1'])
    } finally {
      document.elementsFromPoint = originalElementsFromPoint
    }
  })
})
