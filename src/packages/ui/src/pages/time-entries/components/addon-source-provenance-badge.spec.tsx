import type { AddonSourceInfo } from '@mr-tick/application'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import { AddonSourceProvenanceBadge } from './addon-source-provenance-badge'

describe('AddonSourceProvenanceBadge', () => {
  beforeEach(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  })
  it('returns null when source is null or undefined', () => {
    const { container } = render(
      <TooltipProvider>
        <AddonSourceProvenanceBadge source={null} />
      </TooltipProvider>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders generic provenance with addon name and icon', () => {
    const source: AddonSourceInfo = {
      pluginId: 'addon-activity-tracker',
      name: 'Activity Tracker',
      imageUrl: 'https://example.com/icon.png',
    }

    render(
      <TooltipProvider>
        <AddonSourceProvenanceBadge source={source} />
      </TooltipProvider>,
    )

    const badge = screen.getByTestId('suggestion-source-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute(
      'aria-label',
      'Origem da sugestão: Activity Tracker',
    )
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/icon.png')
  })

  it('renders generic metadata key-values dynamically without hardcoded vendor keys', async () => {
    const source: AddonSourceInfo = {
      pluginId: 'addon-observer',
      name: 'Observer Addon',
      metadata: {
        segmentId: 'seg-987',
        ruleId: 'rule-456',
        revision: 3,
        customFlag: true,
      },
    }

    render(
      <TooltipProvider>
        <AddonSourceProvenanceBadge source={source} open={true} />
      </TooltipProvider>,
    )

    expect(
      await screen.findByTestId('addon-source-metadata-container'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('addon-metadata-segmentId')).toHaveTextContent(
      'segmentId:seg-987',
    )
    expect(screen.getByTestId('addon-metadata-ruleId')).toHaveTextContent(
      'ruleId:rule-456',
    )
    expect(screen.getByTestId('addon-metadata-revision')).toHaveTextContent(
      'revision:3',
    )
    expect(screen.getByTestId('addon-metadata-customFlag')).toHaveTextContent(
      'customFlag:true',
    )
  })
})
