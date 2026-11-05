import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridgeMocks = vi.hoisted(() => ({
  minimizeWindow: vi.fn(),
  maximizeWindow: vi.fn(),
  unmaximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
  isMaximized: vi.fn().mockResolvedValue(false),
  eventsOn: vi.fn().mockReturnValue(vi.fn()),
}))

const mockHostBridge = {
  system: {
    minimizeWindow: bridgeMocks.minimizeWindow,
    maximizeWindow: bridgeMocks.maximizeWindow,
    unmaximizeWindow: bridgeMocks.unmaximizeWindow,
    closeWindow: bridgeMocks.closeWindow,
    isMaximized: bridgeMocks.isMaximized,
  },
  events: {
    on: bridgeMocks.eventsOn,
  },
}

let mockPlatform = 'win32'

vi.mock('@/hooks', () => ({
  useHostBridge: () => mockHostBridge,
}))

vi.mock('@/hooks/use-environment', () => ({
  useEnvironment: () => ({ platform: mockPlatform }),
}))

vi.mock('@/components/notifications/notifications-popover', () => ({
  NotificationsPopover: () => <div data-testid="notifications-popover" />,
}))

vi.mock(
  '@/components/settings/system-diagnostics/runtime-status-indicator',
  () => ({
    RuntimeStatusIndicator: () => (
      <div data-testid="runtime-status-indicator" />
    ),
  }),
)

import { TitleBar } from '@/components/title-bar'

describe('TitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPlatform = 'win32'
  })

  it('renders header with z-[100], brightness-[0.97], dark:brightness-90, and border-b styling', () => {
    render(<TitleBar title="Mr. Tick App" />)

    const header = screen.getByRole('banner')
    expect(header).toBeInTheDocument()
    expect(header.className).toContain('z-[100]')
    expect(header.className).toContain('brightness-[0.97]')
    expect(header.className).toContain('dark:brightness-90')
    expect(header.className).toContain('border-b')
    expect(header.className).toContain('bg-background')
  })

  it('renders provided title in center area', () => {
    render(<TitleBar title="Custom Window Title" />)

    expect(screen.getByText('Custom Window Title')).toBeInTheDocument()
  })

  it('renders children in center area when title is not provided', () => {
    render(
      <TitleBar>
        <span data-testid="child-element">Active Header Content</span>
      </TitleBar>,
    )

    expect(screen.getByTestId('child-element')).toBeInTheDocument()
  })

  it('handles window minimize, maximize toggle, and close on Windows/Linux', async () => {
    render(<TitleBar title="Window Controls Test" />)

    const minimizeBtn = screen.getByRole('button', { name: 'Minimizar' })
    const maximizeBtn = screen.getByRole('button', { name: 'Maximizar' })
    const closeBtn = screen.getByRole('button', { name: 'Fechar' })

    fireEvent.click(minimizeBtn)
    expect(bridgeMocks.minimizeWindow).toHaveBeenCalledWith('main')

    fireEvent.click(maximizeBtn)
    expect(bridgeMocks.maximizeWindow).toHaveBeenCalledWith('main')

    fireEvent.click(closeBtn)
    expect(bridgeMocks.closeWindow).toHaveBeenCalledWith('main')
  })
})
