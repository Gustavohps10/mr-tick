import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalyticsSpaceConfig } from '../lib/analytics-types'
import { AnalyticsTopBar } from './analytics-top-bar'

const SPACES: AnalyticsSpaceConfig[] = [
  {
    id: 'space-1',
    title: 'Atak • Diário & Execução',
    subtitle: 'Dashboard Diário',
    badge: 'DIÁRIO',
    widgets: [],
    workflowNodes: [],
    workflowEdges: [],
  },
  {
    id: 'space-2',
    title: 'Atak • Homologações & Sprint',
    subtitle: 'Sprints',
    badge: 'SPRINT',
    widgets: [],
    workflowNodes: [],
    workflowEdges: [],
  },
]

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

describe('AnalyticsTopBar', () => {
  it('renders a single-line toolbar with a searchable space combobox', () => {
    const onSelectSpace = vi.fn()
    const onOpenNewSpaceModal = vi.fn()

    const { container } = render(
      <AnalyticsTopBar
        spaces={SPACES}
        activeSpace={SPACES[0]}
        layerMode="front"
        dateRange={undefined}
        isFetchingLive={false}
        pollingIntervalMinutes={5}
        syncStatusSummary={{
          isManualSyncing: false,
          isBackgroundSyncing: false,
          hasRollingWindow: false,
          hasIncrementalChanges: false,
          activeProgress: [],
        }}
        hasErrors={false}
        hasCoverageWarning={false}
        statusDetails={null}
        onSelectSpace={onSelectSpace}
        onOpenNewSpaceModal={onOpenNewSpaceModal}
        onDateRangeChange={vi.fn()}
        onPollingIntervalChange={vi.fn()}
        onSyncAllSources={vi.fn()}
        onSetLayerMode={vi.fn()}
      />,
    )

    const toolbar = container.firstElementChild
    expect(toolbar).toHaveClass('flex-nowrap')

    const combobox = screen.getByRole('combobox', {
      name: 'Selecionar espaço analítico',
    })
    expect(combobox).toHaveTextContent('Atak • Diário & Execução')
    expect(
      screen.queryByRole('button', { name: 'Atak • Homologações & Sprint' }),
    ).not.toBeInTheDocument()

    fireEvent.click(combobox)

    const secondSpaceOption = screen.getByText('Atak • Homologações & Sprint')
    fireEvent.click(secondSpaceOption)
    expect(onSelectSpace).toHaveBeenCalledWith('space-2')

    fireEvent.click(screen.getByRole('button', { name: 'Novo Espaço' }))
    expect(onOpenNewSpaceModal).toHaveBeenCalledTimes(1)
  })
})
